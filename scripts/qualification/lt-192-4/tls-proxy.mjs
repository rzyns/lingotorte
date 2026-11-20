// lt-192.4 HTTPS-origin proof helper: a minimal stdlib TLS-terminating reverse proxy (node:https -> node:http) that
// stands in for an operator TLS front end in a disposable `--network none` container. Test-only: it is never imported
// by the application. It forwards method, path, raw headers (Host preserved, duplicates intact), bodies and streamed
// responses unchanged (Range/206/HEAD/Set-Cookie included), and, like real front ends, adds forwarding/identity headers.
// The added values are deliberately WRONG (http scheme, another host, a fake tailnet identity) so the proof shows the
// application derives nothing from them. It holds no secrets and logs nothing.
import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';

/** Header names a TLS front end may add (Tailscale Serve adds X-Forwarded-* and Tailscale-User-*); values are spoofed. */
export const SPOOFED_PROXY_HEADERS = Object.freeze({
  'x-forwarded-proto': 'http',
  'x-forwarded-host': 'spoofed.invalid',
  'x-forwarded-for': '192.0.2.10',
  forwarded: 'for=192.0.2.10;proto=http;host=spoofed.invalid',
  'tailscale-user-login': 'synthetic-proxy@example.invalid',
  'tailscale-user-name': 'Synthetic Proxy',
});

/**
 * Start on the first bindable port of `ports` (e.g. 443, then a fallback) on 127.0.0.1, proxying to upstreamPort.
 * @returns {Promise<{ port: number, stats(): { requests: number, upstreamErrors: number }, close(): Promise<void> }>}
 */
export async function startTlsProxy({ cert, key, ports, upstreamPort }) {
  const stats = { requests: 0, upstreamErrors: 0 };
  const sockets = new Set();
  const server = createServer({ cert, key, ALPNProtocols: ['http/1.1'] }, (req, res) => {
    stats.requests++;
    const headers = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers.push(req.rawHeaders[i], req.rawHeaders[i + 1]);
    for (const [name, value] of Object.entries(SPOOFED_PROXY_HEADERS)) headers.push(name, value);
    const upstream = httpRequest({ hostname: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers, setHost: false }, (up) => {
      const out = [];
      for (let i = 0; i < up.rawHeaders.length; i += 2) out.push(up.rawHeaders[i], up.rawHeaders[i + 1]);
      res.writeHead(up.statusCode ?? 502, up.statusMessage, out);
      up.pipe(res);
      up.on('error', () => res.destroy());
    });
    upstream.on('error', () => { stats.upstreamErrors++; if (!res.headersSent) { res.writeHead(502); res.end(); } else res.destroy(); });
    // A browser aborting a media request (seek, eviction) must abort the upstream stream too, freeing its server slot.
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  let port;
  for (const candidate of ports) {
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(candidate, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
      port = candidate; break;
    } catch { /* try the next candidate (e.g. 443 not bindable unprivileged) */ }
  }
  if (port === undefined) throw new Error('TLS proxy could not bind any candidate port.');
  return {
    port,
    stats: () => ({ ...stats }),
    close: () => new Promise((resolve) => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }),
  };
}
