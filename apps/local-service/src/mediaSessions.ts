import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * lt-192.4 (DECISIONS.md §14b, contract §3 "Media content cookie"): the in-memory `lt_media` value set.
 * Values are 32 bytes of OS randomness (base64url, 43 chars), independent of the bearer, never written to disk,
 * logs, status or exports. Bounded: minting beyond the cap evicts the oldest value. No TTL and no touch-on-use
 * (M4 must have no effects).
 */
export const MEDIA_SESSION_CAP = 64;
export const MEDIA_COOKIE_NAME = 'lt_media';
export const MEDIA_COOKIE_PATH = '/api/media/';

export type MediaCookieCheck = 'absent' | 'valid' | 'invalid';
export type MediaSessions = Readonly<{
  /** A fresh value; the oldest stored value is evicted beyond the cap. */
  mint(): string;
  /** Removes the single presented `lt_media` value, if any. Malformed, unknown or duplicate pairs remove nothing. */
  revoke(cookieHeader: string | undefined): void;
  check(cookieHeader: string | undefined): MediaCookieCheck;
  /** observeState seam only. */
  size(): number;
}>;

const VALUE = /^[A-Za-z0-9_-]{43}$/;

/** The `lt_media` pair values in one Cookie field; other cookies are ignored. */
function mediaPairs(cookieHeader: string | undefined): string[] {
  if (cookieHeader === undefined) return [];
  const values: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    const name = (index < 0 ? part : part.slice(0, index)).trim();
    if (name === MEDIA_COOKIE_NAME) values.push(index < 0 ? '' : part.slice(index + 1).trim());
  }
  return values;
}

function decode(value: string): Buffer | undefined {
  if (!VALUE.test(value)) return undefined;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value ? bytes : undefined;
}

export function createMediaSessions(cap = MEDIA_SESSION_CAP): MediaSessions {
  if (!Number.isInteger(cap) || cap < 1) throw new TypeError('Invalid media session cap.');
  const values: Buffer[] = [];
  /** Constant-time comparison against every stored entry; no hash lookup and no early exit. */
  const indexOf = (bytes: Buffer): number => {
    let found = -1;
    for (let index = 0; index < values.length; index++) if (timingSafeEqual(values[index]!, bytes) && found < 0) found = index;
    return found;
  };
  const presented = (cookieHeader: string | undefined): Buffer | 'absent' | 'invalid' => {
    const pairs = mediaPairs(cookieHeader);
    if (pairs.length === 0) return 'absent';
    if (pairs.length > 1) return 'invalid';
    return decode(pairs[0]!) ?? 'invalid';
  };
  return Object.freeze({
    mint() {
      const bytes = randomBytes(32);
      values.push(bytes);
      while (values.length > cap) values.shift();
      return bytes.toString('base64url');
    },
    revoke(cookieHeader: string | undefined) {
      const bytes = presented(cookieHeader);
      if (!Buffer.isBuffer(bytes)) return;
      const index = indexOf(bytes);
      if (index >= 0) values.splice(index, 1);
    },
    check(cookieHeader: string | undefined): MediaCookieCheck {
      const bytes = presented(cookieHeader);
      if (!Buffer.isBuffer(bytes)) return bytes;
      return indexOf(bytes) >= 0 ? 'valid' : 'invalid';
    },
    size: () => values.length,
  });
}

/** `Set-Cookie` for M1 (value) and M2 (null: an expiring cookie). No Domain; no Max-Age except on expiry. */
export function mediaSessionCookie(value: string | null, secure: boolean): string {
  if (value !== null && decode(value) === undefined) throw new TypeError('Invalid media session value.');
  return `${MEDIA_COOKIE_NAME}=${value ?? ''}; Path=${MEDIA_COOKIE_PATH}${value === null ? '; Max-Age=0' : ''}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}
