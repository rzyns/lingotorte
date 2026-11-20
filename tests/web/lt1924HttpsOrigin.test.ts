// lt-192.4 HTTPS-origin prerequisite, browser transport side (docs/dev/lt-192.4-https-qualification.md): an exact
// canonical https: service origin may be paired; M1/M2 keep `credentials: 'same-origin'` only for the exact page
// origin, so a cookie is never minted across schemes. Unit evidence only (stubbed location/fetch), not browser or TLS
// evidence.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exactServiceOrigin, pairTransport } from '../../apps/web/src/pairedTransport.ts';
import { SYNTHETIC_CAPABILITY } from './pairingFixture.ts';
import { createAppModel, setLocalServiceBaseUrl, setView } from '../../apps/web/src/model.ts';
import { rerenderApp } from '../../apps/web/src/app';
import { installDom } from './lt1924ClientFixture.ts';

afterEach(() => vi.unstubAllGlobals());
const HTTPS = 'https://ts.test';

describe('lt-192.4 exact https service origins', () => {
  it.each([
    ['https://ts.test', 'http://ts.test', 'HTTP sends capability and learner data unencrypted', 'HTTPS encrypts only'],
    ['http://ts.test', 'https://ts.test', 'HTTPS encrypts only up to', 'HTTP sends capability'],
  ])('updates the transport disclosure immediately when editing %s to %s, before Connect', (from: string, to: string, expected: string, stale: string) => {
    const dom = installDom('https://ts.test/');
    try {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const model = createAppModel();
      setLocalServiceBaseUrl(model, from);
      setView(model, 'settings');
      rerenderApp(model);
      const input = document.querySelector<HTMLInputElement>('#local-service-url')!;
      input.value = to;
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      const warning = [...document.querySelectorAll('.local-service-panel p')].find(p => p.textContent?.startsWith('Pair only with'))!;
      expect(warning.textContent).toContain(expected);
      expect(warning.textContent).not.toContain(stale);
      expect(model.localService.baseUrl).toBe(to);
      expect(fetcher).not.toHaveBeenCalled();
    } finally { dom.window.close(); }
  });
  it('accepts canonical https origins (default and explicit port, IPv6) and the captured https page origin', () => {
    for (const [value, expected] of [[HTTPS, HTTPS], [`${HTTPS}/`, HTTPS], ['https://ts8443.test:8443', 'https://ts8443.test:8443'], ['https://[::1]:8443', 'https://[::1]:8443']] as const) {
      expect(exactServiceOrigin(value)).toBe(expected);
    }
    expect(exactServiceOrigin('/', HTTPS)).toBe(HTTPS);
    vi.stubGlobal('location', { origin: HTTPS });
    expect(pairTransport({}, '/', SYNTHETIC_CAPABILITY).origin).toBe(HTTPS);
  });
  it.each(['https://ts.test:443', 'HTTPS://ts.test', 'https://TS.test', 'https://user@ts.test', 'https://ts.test/path', 'https://ts.test?x=1', 'https://ts.test#x', 'https://*.test',
    'https://ts.test.', 'https://127.1:8443', 'https://0x7f000001', 'https://127.0.0.1:08443', 'wss://ts.test', 'https:ts.test', ' https://ts.test'])('rejects noncanonical or non-HTTP(S) %s before pairing or egress', bad => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(() => pairTransport({}, bad, SYNTHETIC_CAPABILITY)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('M1/M2 use same-origin credentials only when the https transport origin is exactly the page origin; a scheme mismatch is refused before egress', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('location', { origin: HTTPS });
    const https = pairTransport({}, HTTPS, SYNTHETIC_CAPABILITY);
    await https.request('/api/media/session', { method: 'POST', body: '{}' }, fetcher);
    await https.request('/api/media/session', { method: 'DELETE' }, fetcher);
    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.credentials])).toEqual([[`${HTTPS}/api/media/session`, 'same-origin'], [`${HTTPS}/api/media/session`, 'same-origin']]);
    let refused = 0;
    for (const [page, service] of [['http://ts.test', HTTPS], [HTTPS, 'http://ts.test'], ['https://ts.test:8443', HTTPS], [HTTPS, 'https://ts8443.test:8443']] as const) {
      vi.stubGlobal('location', { origin: page });
      const transport = pairTransport({}, service, SYNTHETIC_CAPABILITY);
      const before = fetcher.mock.calls.length;
      await expect(transport.request('/api/media/session', { method: 'POST', body: '{}' }, fetcher)).rejects.toThrow('same-origin');
      await expect(transport.request('/api/media/session', { method: 'DELETE' }, fetcher)).rejects.toThrow('same-origin');
      expect(fetcher.mock.calls.length).toBe(before);
      refused++;
    }
    expect(refused).toBe(4);
  });
});
