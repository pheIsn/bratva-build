import { fetchWithAuthFallback } from './api-client';

export type LinkMode = 'pull' | 'push';
export type LinkState = 'idle' | 'creating' | 'pending' | 'claimed' | 'failed' | 'expired';

export interface CreateLinkResponse {
  linkRequestId: string;
  claimToken: string;
  expiresAt: number;
  sealed: boolean;
}

export interface LinkStatusResponse {
  status: LinkState;
  mode: LinkMode;
  sessionId?: string | null;
  error?: string | null;
}

export interface ClaimLinkResponse {
  sessionId: string;
  mode: LinkMode;
}

interface PlainLink {
  linkRequestId: string;
  claimToken: string;
  expiresAt: string;
}

export async function createLinkRequest(
  mode: LinkMode,
): Promise<CreateLinkResponse> {
  const created = await fetchWithAuthFallback<PlainLink>('/auth/link/create', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  return {
    linkRequestId: created.linkRequestId,
    claimToken: created.claimToken,
    expiresAt: Date.parse(withUtcOffset(created.expiresAt)),
    sealed: false,
  };
}

function withUtcOffset(timestamp: string): string {
  return /(Z|[+-]\d\d:?\d\d)$/i.test(timestamp) ? timestamp : `${timestamp}Z`;
}

export async function claimLinkRequest(
  claimToken: string,
  mode: LinkMode,
): Promise<ClaimLinkResponse> {
  return fetchWithAuthFallback<ClaimLinkResponse>('/auth/link/claim', {
    method: 'POST',
    body: JSON.stringify({ claimToken, mode }),
  });
}

export async function getLinkStatus(
  link: Pick<CreateLinkResponse, 'linkRequestId'>,
): Promise<LinkStatusResponse | null> {
  return fetchWithAuthFallback<LinkStatusResponse>(
    `/auth/link/status?id=${encodeURIComponent(link.linkRequestId)}`,
  );
}

export function encodeQrPayload(claimToken: string, mode: LinkMode): string {
  const params = new URLSearchParams({ token: claimToken, mode });
  return `scd://link?${params.toString()}`;
}
