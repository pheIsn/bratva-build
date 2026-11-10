// gen-icon.mjs — рендерит иконку «Братвы» без внешних зависимостей:
// PNG-энкодер на node:zlib, формы — SDF + суперсэмплинг 2x2.
// Запуск: node gen-icon.mjs  →  bratva-icon.png (1024x1024 RGBA)

import zlib from 'node:zlib';
import fs from 'node:fs';

const OUT = 1024;
const SS = 2; // субсэмплов на ось на пиксель

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- SDF-примитивы (координаты в поле 1024x1024) ----------
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r;
}

function sdCapsule(x, y, ax, ay, bx, by, r) {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- палитра ----------
const BG_TOP = [40, 40, 49];
const BG_BOT = [16, 16, 21];
const BAR_TOP = [255, 152, 82];
const BAR_BOT = [243, 80, 0];
const GOLD_TOP = [255, 227, 124];
const GOLD_BOT = [222, 150, 0];

// ---------- облако из кругов + плоское дно ----------
const CLOUD = [
  [335, 605, 160],
  [495, 560, 192],
  [648, 592, 148],
  [772, 640, 102],
];
const FLAT = { x0: 252, x1: 842, y0: 598, y1: 745 };

function cloudMask(x, y) {
  for (const [cx, cy, r] of CLOUD) if (Math.hypot(x - cx, y - cy) < r) return true;
  return x >= FLAT.x0 && x <= FLAT.x1 && y >= FLAT.y0 && y <= FLAT.y1;
}

// ---------- полосы-эквалайзер по силуэту облака ----------
const PITCH = 42;
const BAR_W = 27;
const bars = [];
for (let x = FLAT.x0 + BAR_W / 2 + 6; x + BAR_W / 2 <= FLAT.x1 + 1e-9; x += PITCH) {
  let top = null;
  for (let y = 340; y <= FLAT.y1; y += 2) {
    if (cloudMask(x, y)) {
      top = y;
      break;
    }
  }
  if (top === null) continue;
  const r = BAR_W / 2;
  const bottom = FLAT.y1;
  const ay = Math.min(top + r, bottom - r);
  bars.push([x, ay, x, bottom - r, r]);
}

// ---------- корона ----------
const CROWN_PTS = [
  [378, 382],
  [438, 258],
  [494, 352],
  [550, 236],
  [606, 352],
  [662, 258],
  [722, 382],
];
const CROWN_BASE = { x0: 366, x1: 734, y0: 382, y1: 418 };
const CROWN_TIPS = [
  [438, 258],
  [550, 236],
  [662, 258],
];

function crownAt(x, y) {
  if (inPoly(x, y, CROWN_PTS)) return true;
  if (x >= CROWN_BASE.x0 && x <= CROWN_BASE.x1 && y >= CROWN_BASE.y0 && y <= CROWN_BASE.y1)
    return true;
  for (const [cx, cy] of CROWN_TIPS) if (Math.hypot(x - cx, y - cy) < 20) return true;
  return false;
}

// ---------- сцена ----------
function sample(x, y) {
  const bgCov = clamp(-sdRoundRect(x, y, 512, 512, 512, 512, 176), 0, 1);
  if (bgCov <= 0) return [0, 0, 0, 0];

  let col = lerp(BG_TOP, BG_BOT, clamp(y / 1024, 0, 1));

  // тёплое свечение за облаком
  const gd = Math.hypot(x - 550, y - 570);
  const glow = clamp((340 - gd) / 340, 0, 1) * 0.16;
  col = [col[0] + 255 * glow, col[1] + 85 * glow, col[2] + 0];

  // корона поверх фона
  if (crownAt(x, y)) col = lerp(GOLD_TOP, GOLD_BOT, clamp((y - 230) / 190, 0, 1));

  // полосы облака поверх всего
  let barCov = 0;
  for (const [ax, ay, bx, by, r] of bars) {
    const c = clamp(-sdCapsule(x, y, ax, ay, bx, by, r), 0, 1);
    if (c > barCov) barCov = c;
  }
  if (barCov > 0) {
    const bc = lerp(BAR_TOP, BAR_BOT, clamp((y - 350) / 400, 0, 1));
    col = [
      col[0] + (bc[0] - col[0]) * barCov,
      col[1] + (bc[1] - col[1]) * barCov,
      col[2] + (bc[2] - col[2]) * barCov,
    ];
  }

  return [col[0], col[1], col[2], bgCov];
}

// ---------- PNG-энкодер ----------
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // фильтр None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- рендер ----------
const buf = Buffer.alloc(OUT * OUT * 4);
const n = SS * SS;
for (let Y = 0; Y < OUT; Y++) {
  for (let X = 0; X < OUT; X++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let j = 0; j < SS; j++) {
      for (let i = 0; i < SS; i++) {
        const x = X + (i + 0.5) / SS;
        const y = Y + (j + 0.5) / SS;
        const s = sample(x, y);
        r += s[0] * s[3];
        g += s[1] * s[3];
        b += s[2] * s[3];
        a += s[3];
      }
    }
    const idx = (Y * OUT + X) * 4;
    if (a > 0) {
      buf[idx] = clamp(Math.round(r / a), 0, 255);
      buf[idx + 1] = clamp(Math.round(g / a), 0, 255);
      buf[idx + 2] = clamp(Math.round(b / a), 0, 255);
      buf[idx + 3] = clamp(Math.round((a / n) * 255), 0, 255);
    }
  }
}

fs.writeFileSync(new URL('./bratva-icon.png', import.meta.url), encodePng(OUT, OUT, buf));
console.log(`bratva-icon.png ${OUT}x${OUT} готова, полос: ${bars.length}`);
