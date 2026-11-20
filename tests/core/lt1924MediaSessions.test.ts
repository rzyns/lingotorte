// lt-192.4 S2: the in-memory media cookie set (pure). Cap 64, oldest-by-mint eviction, exact-one-pair parsing.
import { describe, expect, it } from 'vitest';
import { createMediaSessions, mediaSessionCookie, MEDIA_SESSION_CAP } from '../../apps/local-service/src/mediaSessions.ts';

const cookie = (value: string, extra = '') => `${extra}lt_media=${value}`;

describe('lt-192.4 media sessions', () => {
  it('mints 32-byte base64url values that are independent and checked exactly', () => {
    const sessions = createMediaSessions();
    const a = sessions.mint(); const b = sessions.mint();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b); expect(sessions.size()).toBe(2);
    expect(sessions.check(cookie(a))).toBe('valid');
    expect(sessions.check(cookie(b, 'other=1; '))).toBe('valid');
    expect(sessions.check(`theme=dark; ${cookie(a)}; z=9`)).toBe('valid');
  });
  it('classifies absent, unknown, malformed and two-pair cookies', () => {
    const sessions = createMediaSessions();
    const a = sessions.mint(); const b = sessions.mint();
    expect(sessions.check(undefined)).toBe('absent');
    expect(sessions.check('')).toBe('absent');
    expect(sessions.check('other=x')).toBe('absent');
    expect(sessions.check(cookie(createMediaSessions().mint()))).toBe('invalid');
    for (const bad of ['', 'short', `${a}x`, `${a.slice(0, 42)}!`, 'A'.repeat(43), `"${a}"`]) expect(sessions.check(cookie(bad))).toBe('invalid');
    expect(sessions.check('lt_media')).toBe('invalid');
    expect(sessions.check(`${cookie(a)}; ${cookie(b)}`)).toBe('invalid');
    expect(sessions.check(`${cookie(a)}; ${cookie(a)}`)).toBe('invalid');
    expect(sessions.check(`LT_MEDIA=${a}`)).toBe('absent');
  });
  it('revokes only the single presented value and ignores malformed, unknown or duplicate pairs', () => {
    const sessions = createMediaSessions();
    const a = sessions.mint(); const b = sessions.mint();
    sessions.revoke(undefined); sessions.revoke(cookie('bad')); sessions.revoke(`${cookie(a)}; ${cookie(b)}`); sessions.revoke(cookie(createMediaSessions().mint()));
    expect(sessions.size()).toBe(2);
    sessions.revoke(cookie(a));
    expect(sessions.check(cookie(a))).toBe('invalid'); expect(sessions.check(cookie(b))).toBe('valid'); expect(sessions.size()).toBe(1);
    sessions.revoke(cookie(a)); expect(sessions.size()).toBe(1);
  });
  it('caps at 64 with oldest-by-mint eviction; checks never touch or reorder', () => {
    expect(MEDIA_SESSION_CAP).toBe(64);
    const sessions = createMediaSessions();
    const first = sessions.mint(); const second = sessions.mint();
    for (let i = 0; i < 62; i++) sessions.mint();
    expect(sessions.size()).toBe(64);
    expect(sessions.check(cookie(first))).toBe('valid');
    sessions.mint();
    expect(sessions.size()).toBe(64);
    expect(sessions.check(cookie(first))).toBe('invalid');
    expect(sessions.check(cookie(second))).toBe('valid');
    sessions.mint();
    expect(sessions.check(cookie(second))).toBe('invalid');
  });
  it('builds HttpOnly SameSite=Strict Path=/api/media/ cookies; Secure only under https; no Domain or Max-Age except expiry', () => {
    const value = createMediaSessions().mint();
    expect(mediaSessionCookie(value, false)).toBe(`lt_media=${value}; Path=/api/media/; HttpOnly; SameSite=Strict`);
    expect(mediaSessionCookie(value, true)).toBe(`lt_media=${value}; Path=/api/media/; HttpOnly; SameSite=Strict; Secure`);
    expect(mediaSessionCookie(null, false)).toBe('lt_media=; Path=/api/media/; Max-Age=0; HttpOnly; SameSite=Strict');
    expect(mediaSessionCookie(null, true)).toBe('lt_media=; Path=/api/media/; Max-Age=0; HttpOnly; SameSite=Strict; Secure');
    expect(mediaSessionCookie(value, false)).not.toMatch(/Domain|Max-Age|Expires/i);
    expect(() => mediaSessionCookie('not-a-value', false)).toThrow(TypeError);
  });
});
