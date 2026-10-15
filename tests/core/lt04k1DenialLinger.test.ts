// lt-04k.1: denial linger — denials sent before the body is read must reach the client (no RST),
// and the discard of the unread remainder must stay bounded by time and bytes.
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { admit, deny, freezePolicy, lingerUsesDestroySoon, type DenialLinger } from '../../apps/local-service/src/requestAdmission.ts';

const capability = randomBytes(32);
const token = capability.toString('base64url');
let server: Server | undefined;
afterEach(async () => { server?.closeAllConnections(); await new Promise<void>(r => server ? server.close(() => r()) : r()); server = undefined; });

async function start(linger: DenialLinger): Promise<number> {
  server = createServer();
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const policy = freezePolicy([`http://127.0.0.1:${port}`], [`http://127.0.0.1:${port}`]);
  server.on('request', (request, response) => {
    void admit(request, response, policy, capability, async () => true)
      .then(() => { response.writeHead(204); response.end(); })
      .catch(error => { if (!response.headersSent) deny(response, error, linger); else response.destroy(); });
  });
  return port;
}
type Outcome = { response: string; error: string | undefined; closedAt: number; sent: number };
/** Raw client (allowHalfOpen keeps our side writable after the server's FIN, like a slow uploader): writes headers, then calls `feed` to push body bytes; resolves on socket close. */
function raw(port: number, head: string, feed: (socket: Socket, sent: (n: number) => void) => void, allowHalfOpen = false): Promise<Outcome> {
  return new Promise(resolve => {
    const socket = connect({ port, host: '127.0.0.1', allowHalfOpen }); let response = ''; let error: string | undefined; let sent = 0;
    socket.on('data', d => { response += d.toString('latin1'); });
    socket.on('error', e => { error = (e as NodeJS.ErrnoException).code ?? String(e); });
    socket.on('close', () => resolve({ response, error, closedAt: Date.now(), sent }));
    socket.write(head, () => feed(socket, n => { sent += n; }));
  });
}
const headers = (port: number, extra: string) => `POST /api/jobs HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\n${extra}\r\n`;
const blast = (bytes: number) => (socket: Socket, sent: (n: number) => void) => {
  const chunk = Buffer.alloc(256 * 1024, 0x61); let left = bytes;
  const pump = () => {
    while (left > 0 && !socket.destroyed) {
      const n = Math.min(left, chunk.length); left -= n; sent(n);
      if (!socket.write(chunk.subarray(0, n))) { socket.once('drain', pump); return; }
    }
    if (!socket.destroyed) socket.end();
  };
  pump();
};
const LINGER: DenialLinger = { ms: 2_000, bytes: 64 * 1024 * 1024, headerStageBytes: 8 * 1024 * 1024 };
const status = (o: Outcome) => /^HTTP\/1\.1 (\d{3})/.exec(o.response)?.[1];

describe('lt-04k.1 denial linger', () => {
  it('Node still exposes destroySoon (the override target); fails safe if it ever disappears', () => {
    expect(lingerUsesDestroySoon()).toBe(true);
  });

  it('(a) oversized content-length body: client receives 413, not ECONNRESET', async () => {
    const port = await start(LINGER);
    const o = await raw(port, headers(port, `Authorization: Bearer ${token}\r\nContent-Length: ${6 * 1024 * 1024}\r\n`), blast(6 * 1024 * 1024));
    expect(status(o)).toBe('413');
    expect(o.response).toContain('Request rejected.');
  }, 10_000);

  it('(a) oversized chunked body: client receives 413, not ECONNRESET', async () => {
    const port = await start(LINGER);
    const o = await raw(port, headers(port, `Authorization: Bearer ${token}\r\nTransfer-Encoding: chunked\r\n`), (socket, sent) => {
      const piece = Buffer.alloc(512 * 1024, 0x61); let n = 0;
      const pump = () => {
        while (n < 16 && !socket.destroyed) {
          n += 1; sent(piece.length);
          if (!socket.write(Buffer.concat([Buffer.from(`${piece.length.toString(16)}\r\n`), piece, Buffer.from('\r\n')]))) { socket.once('drain', pump); return; }
        }
        if (!socket.destroyed) socket.end('0\r\n\r\n');
      };
      pump();
    });
    expect(status(o)).toBe('413');
  }, 10_000);

  it('(b) slow trickle after a denial: server closes the socket within the wall-clock bound', async () => {
    const port = await start({ ...LINGER, ms: 500 });
    const started = Date.now(); let timer: NodeJS.Timeout | undefined;
    const o = await raw(port, headers(port, `Authorization: Bearer wrong\r\nContent-Length: 1000000\r\n`), socket => {
      timer = setInterval(() => { if (!socket.destroyed) socket.write('a'); }, 50);
    });
    clearInterval(timer);
    expect(status(o)).toBe('401');
    expect(o.closedAt - started).toBeLessThan(500 + 1_000);
  }, 10_000);

  it('(c) body beyond the byte cap: socket destroyed before everything is sent', async () => {
    const port = await start({ ...LINGER, bytes: 1024 * 1024, headerStageBytes: 1024 * 1024 });
    const total = 64 * 1024 * 1024;
    const o = await raw(port, headers(port, `Authorization: Bearer ${token}\r\nContent-Length: ${total}\r\n`), blast(total));
    expect(o.sent).toBeLessThan(total);
    // The 413 is delivered before the cap is hit (best effort once the cap forces RST, so not asserted strictly).
  }, 10_000);

  it('(d) denial with no body closes promptly', async () => {
    const port = await start(LINGER);
    const started = Date.now();
    const o = await raw(port, `GET /api/nope HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`, () => {});
    expect(status(o)).toBe('404');
    expect(o.error).toBeUndefined();
    expect(o.closedAt - started).toBeLessThan(1_000);
  }, 10_000);

  it('lingering sockets are tracked and can be destroyed promptly at shutdown', async () => {
    const sockets = new Set<Socket>();
    const port = await start({ ...LINGER, ms: 5_000, sockets });
    const started = Date.now(); let client: Socket | undefined;
    const pending = raw(port, headers(port, `Authorization: Bearer wrong\r\nContent-Length: 1000000\r\n`), socket => { client = socket; socket.write('a'); }, true);
    while (sockets.size === 0 && Date.now() - started < 2_000) await new Promise(r => setTimeout(r, 10));
    expect(sockets.size).toBe(1);
    const [lingering] = [...sockets];
    const serverClosed = new Promise<number>(r => lingering!.once('close', () => r(Date.now())));
    lingering!.destroy();
    expect(await serverClosed - started).toBeLessThan(2_000); // well under the 5s linger bound
    expect(sockets.size).toBe(0);
    client!.destroy(); // half-open client side: the server already sent FIN; release our end
    expect(status(await pending)).toBe('401');
  }, 10_000);
});
