import { it, expect, vi } from 'vitest';
import { createServer, request } from 'node:http';
import { createServer as createViteServer } from 'vite';

it('actual Vite ingress rejects raw duplicate and wrong public Host before proxy; preserves exact Host and Origin and strips forwarding, including Expect', async () => {
  let upstreamCalls = 0;
  const upstream = createServer((req, res) => { upstreamCalls++; res.end(JSON.stringify({ host: req.headers.host, origin: req.headers.origin, forwarded: req.headers.forwarded, xForwardedHost: req.headers['x-forwarded-host'], authorizationPresent: !!req.headers.authorization })); });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address() as { port: number };
  vi.stubEnv('LINGOTORTE_API_PROXY_TARGET', `http://127.0.0.1:${address.port}`);
  vi.stubEnv('LINGOTORTE_PUBLIC_ORIGINS', 'http://public.test:56123');
  vi.stubEnv('LINGOTORTE_WEB_ALLOWED_HOSTS', 'public.test');
  const vite = await createViteServer({ configFile: 'vite.config.ts', optimizeDeps: { noDiscovery: true, include: [] }, server: { port: 0, strictPort: false } });
  await vite.listen();
  const port = (vite.httpServer!.address() as { port: number }).port;
  const send = (headers: string[]) => new Promise<{ status: number; body: string; continues: number }>((resolve, reject) => {
    let continues = 0;
    const req = request(`http://127.0.0.1:${port}`, { path: '/api/health', headers }, res => { let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, body, continues })); });
    req.on('continue', () => continues++); req.on('error', reject); req.end();
  });
  try {
    const good = await send(['Host', 'public.test:56123', 'Origin', 'http://public.test:56123', 'Authorization', 'Bearer synthetic-nonsecret', 'Forwarded', 'host=evil.invalid', 'X-Forwarded-Host', 'evil.invalid']);
    expect(good.status).toBe(200); expect(JSON.parse(good.body)).toEqual({ host: 'public.test:56123', origin: 'http://public.test:56123', authorizationPresent: true });
    const baseline = upstreamCalls;
    for (const extra of [[], ['Expect', '100-continue']]) {
      expect((await send(['Host', 'evil.invalid:56123', ...extra])).status).toBe(403);
      for (const name of ['Host', 'Origin', 'Authorization', 'Content-Type']) {
        const headers = ['Host', 'public.test:56123', name, name === 'Host' ? 'public.test:56123' : 'first', ...extra];
        if (name !== 'Host') headers.push(name, 'second');
        const result = await send(headers); expect(result.status).toBe(400); expect(result.continues).toBe(0);
      }
    }
    expect(upstreamCalls).toBe(baseline);
    console.info(JSON.stringify({ actualViteIngressDenials: 10, hostPreserved: true, forwardingStripped: true, checkContinueDenials: 5 }));
  } finally { await vite.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); vi.unstubAllEnvs(); }
}, 15_000);
