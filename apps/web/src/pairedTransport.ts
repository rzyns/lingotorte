// Pairing authority is process memory only, never part of the serializable app model.
export const PAIR_AGAIN = 'Local service pairing required. Pair again explicitly; browser work was kept.';
export class StaleTransportError extends Error {
  constructor() { super('Local service operation superseded; browser work was kept.'); }
}
export class PairingRequiredError extends Error { constructor() { super(PAIR_AGAIN); } }
export type PairedTransport = Readonly<{
  origin: string;
  assertCurrent(): void;
  request(path: string, init?: RequestInit, fetchImpl?: typeof fetch): Promise<Response>;
  onInvalidate(callback: () => void): () => void;
}>;
type Pair = { transport: PairedTransport; clear(): void };
const pairs = new WeakMap<object, Pair>();

export function exactServiceOrigin(value: string, pageOrigin?: string): string {
  const selected = value === '/' ? pageOrigin ?? globalThis.location?.origin ?? globalThis.window?.location.origin : value;
  if (!selected || selected.trim() !== selected || /[\\\s?#]/.test(selected)) throw new TypeError('Select one exact HTTP service origin.');
  let url: URL;
  try { url = new URL(selected); } catch { throw new TypeError('Select one exact HTTP service origin.'); }
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new TypeError('Select one exact HTTP service origin (no credentials, path, query or fragment).');
  if (selected !== url.origin && selected !== `${url.origin}/`) throw new TypeError('Service origin must use canonical spelling.');
  const host = url.hostname;
  if (host.endsWith('.') || host.includes('*') || (!host.startsWith('[') && !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host))) throw new TypeError('Service hostname is invalid.');
  // URL canonicalization must not enroll numeric IPv4 aliases (127.1, octal, hex).
  return url.origin;
}
export function clearPairing(owner: object): void { const old = pairs.get(owner); pairs.delete(owner); old?.clear(); }
export function pairTransport(owner: object, selected: string, capability: string, onUnauthorized: () => void = () => {}, pageOrigin?: string): PairedTransport {
  const origin = exactServiceOrigin(selected, pageOrigin);
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(capability)) throw new PairingRequiredError();
  clearPairing(owner);
  let secret: string | null = capability;
  const invalidations = new Set<() => void>();
  const assertCurrent = () => { if (!secret || pairs.get(owner)?.transport !== transport) throw new StaleTransportError(); };
  const transport: PairedTransport = Object.freeze({
    origin,
    assertCurrent,
    onInvalidate(callback: () => void) { assertCurrent(); invalidations.add(callback); return () => invalidations.delete(callback); },
    async request(path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch) {
      assertCurrent();
      if (!/^\/api\/(?:status|state|restore\/(?:preview|commit)|jobs(?:\/[A-Za-z0-9_-]+(?:\/cancel)?)?|snippets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|artifacts\/cleanup)$/.test(path)) throw new TypeError('Invalid local service API path.');
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${secret}`);
      if (init.body !== undefined && init.body !== null) headers.set('content-type', 'application/json');
      let response: Response;
      try { response = await fetchImpl(`${origin}${path}`, { ...init, headers, credentials: 'omit', redirect: 'error', mode: 'cors' }); }
      catch { assertCurrent(); throw new Error('Local service unreachable. Request failed.'); }
      assertCurrent();
      if (response.status === 401) { clearPairing(owner); onUnauthorized(); throw new PairingRequiredError(); }
      if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error('Local service redirect refused.');
      return response;
    },
  });
  pairs.set(owner, { transport, clear() { secret = null; for (const callback of invalidations) callback(); invalidations.clear(); } });
  return transport;
}
export function capturedTransport(owner: object, selected?: string): PairedTransport {
  const pair = pairs.get(owner);
  if (!pair) throw new PairingRequiredError();
  pair.transport.assertCurrent();
  if (selected !== undefined && exactServiceOrigin(selected) !== pair.transport.origin) throw new PairingRequiredError();
  return pair.transport;
}
