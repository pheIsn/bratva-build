// gen-icons.mjs — весь набор иконок «Братвы» из одного рендера.
// PNG 16..1024 + icon.ico (PNG-entries) + icon.icns + Square-логотипы Store.
// Запуск: node gen-icons.mjs

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const ICONS_DIR = 'C:/Users/Admin/bratva/desktop/src-tauri/icons';
const FIELD = 1024; // логическое поле сцены

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- SDF-примитивы ----------
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

// ---------- полосы-эквалайзер ----------
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
function sample(fx, fy) {
  const bgCov = clamp(-sdRoundRect(fx, fy, 512, 512, 512, 512, 176), 0, 1);
  if (bgCov <= 0) return [0, 0, 0, 0];

  let col = lerp(BG_TOP, BG_BOT, clamp(fy / 1024, 0, 1));

  const gd = Math.hypot(fx - 550, fy - 570);
  const glow = clamp((340 - gd) / 340, 0, 1) * 0.16;
  col = [col[0] + 255 * glow, col[1] + 85 * glow, col[2] + 0];

  if (crownAt(fx, fy)) col = lerp(GOLD_TOP, GOLD_BOT, clamp((fy - 230) / 190, 0, 1));

  let barCov = 0;
  for (const [ax, ay, bx, by, r] of bars) {
    const c = clamp(-sdCapsule(fx, fy, ax, ay, bx, by, r), 0, 1);
    if (c > barCov) barCov = c;
  }
  if (barCov > 0) {
    const bc = lerp(BAR_TOP, BAR_BOT, clamp((fy - 350) / 400, 0, 1));
    col = [
      col[0] + (bc[0] - col[0]) * barCov,
      col[1] + (bc[1] - col[1]) * barCov,
      col[2] + (bc[2] - col[2]) * barCov,
    ];
  }

  return [col[0], col[1], col[2], bgCov];
}

// ---------- рендер в RGBA ----------
function render(size) {
  const scale = FIELD / size;
  // субсэмплы: на маленьких размерах плотнее — детали краёв важнее
  const ss = size <= 64 ? 4 : size <= 256 ? 3 : 2;
  const buf = Buffer.alloc(size * size * 4);
  const n = ss * ss;
  for (let Y = 0; Y < size; Y++) {
    for (let X = 0; X < size; X++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const fx = (X + (i + 0.5) / ss) * scale;
          const fy = (Y + (j + 0.5) / ss) * scale;
          const s = sample(fx, fy);
          r += s[0] * s[3];
          g += s[1] * s[3];
          b += s[2] * s[3];
          a += s[3];
        }
      }
      const idx = (Y * size + X) * 4;
      if (a > 0) {
        buf[idx] = clamp(Math.round(r / a), 0, 255);
        buf[idx + 1] = clamp(Math.round(g / a), 0, 255);
        buf[idx + 2] = clamp(Math.round(b / a), 0, 255);
        buf[idx + 3] = clamp(Math.round((a / n) * 255), 0, 255);
      }
    }
  }
  return buf;
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

// ---------- ICO (PNG-entries, как у `tauri icon`) ----------
function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + 16 * count;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 0 = 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; // colors
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bit count
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
    blobs.push(png);
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

// ---------- ICNS ----------
function buildIcns(entries) {
  // entries: [[type, png]]
  const parts = [];
  let total = 8;
  for (const [type, png] of entries) {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    parts.push(head, png);
    total += 8 + png.length;
  }
  const out = Buffer.alloc(8);
  out.write('icns', 0, 'ascii');
  out.writeUInt32BE(total, 4);
  return Buffer.concat([out, ...parts]);
}

// ---------- выпуск ----------
const pngCache = new Map();
function pngOf(size) {
  if (!pngCache.has(size)) pngCache.set(size, encodePng(size, size, render(size)));
  return pngCache.get(size);
}

fs.writeFileSync('C:/Users/Admin/bratva/bratva-icon.png', pngOf(1024));

const pngTargets = [
  '32x32.png:32',
  '64x64.png:64',
  '128x128.png:128',
  '128x128@2x.png:256',
  'icon.png:512',
  'StoreLogo.png:50',
  'Square30x30Logo.png:30',
  'Square44x44Logo.png:44',
  'Square71x71Logo.png:71',
  'Square89x89Logo.png:89',
  'Square107x107Logo.png:107',
  'Square142x142Logo.png:142',
  'Square150x150Logo.png:150',
  'Square284x284Logo.png:284',
  'Square310x310Logo.png:310',
];
for (const t of pngTargets) {
  const [name, size] = t.split(':');
  fs.writeFileSync(path.join(ICONS_DIR, name), pngOf(Number(size)));
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), buildIco(icoSizes.map((s) => ({ size: s, png: pngOf(s) }))));

const icnsEntries = [
  ['ic07', pngOf(128)], // 128
  ['ic08', pngOf(256)], // 256
  ['ic09', pngOf(512)], // 512
  ['ic10', pngOf(1024)], // 1024 (retina 512)
  ['ic11', pngOf(32)], // 16@2x
  ['ic12', pngOf(64)], // 32@2x
  ['ic13', pngOf(256)], // 128@2x
  ['ic14', pngOf(512)], // 256@2x
];
fs.writeFileSync(path.join(ICONS_DIR, 'icon.icns'), buildIcns(icnsEntries));

console.log(`иконки Братвы записаны в ${ICONS_DIR} (${pngTargets.length} PNG + ICO + ICNS), полос: ${bars.length}`);
