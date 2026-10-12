import { open, lstat, readFile, readdir, chmod, unlink } from 'node:fs/promises';
import { createServer, createConnection, type Socket } from 'node:net';
import { isatty } from 'node:tty';
import { timingSafeEqual } from 'node:crypto';

export const PAIRING_DIRECTORY = '/run/lingotorte-pairing';
export const PAIRING_SOCKET = `${PAIRING_DIRECTORY}/receiver.sock`;
export type PrivateDelivery = { receiveCapability(value: string): Promise<void>; deliveryReady(): Promise<boolean>; close(): Promise<void> };
const failure = () => new TypeError('Private capability delivery is unavailable.');

export async function privateTerminal() {
  if (process.platform !== 'linux' || process.getuid?.() === undefined) throw failure();
  const terminal = await open('/dev/tty', 'r+');
  try {
    // /dev/tty itself is the root-owned 0666 multiplexor, NOT the private
    // terminal's owner/mode. Resolve this process's kernel controlling tty
    // device number and verify the corresponding devpts character device.
    const processStat = await readFile('/proc/self/stat', 'utf8');
    const ttyDevice = Number(processStat.slice(processStat.lastIndexOf(')') + 2).split(' ')[4]) >>> 0;
    if (!isatty(terminal.fd) || !ttyDevice) throw failure();
    let privateOwner = false;
    for (const name of await readdir('/dev/pts')) {
      if (!/^\d+$/.test(name)) continue;
      const stat = await lstat(`/dev/pts/${name}`);
      if (stat.rdev === ttyDevice && stat.isCharacterDevice() && !stat.isSymbolicLink() && stat.uid === process.getuid!() && (stat.mode & 0o044) === 0) privateOwner = true;
    }
    if (!privateOwner) throw failure();
    return terminal;
  } catch { await terminal.close(); throw failure(); }
}
export async function nativeTerminalDelivery(): Promise<PrivateDelivery> {
  const terminal = await privateTerminal();
  let closed = false;
  return {
    async receiveCapability(value) { if (closed || !isatty(terminal.fd)) throw failure(); await terminal.write(`\nLingotorte session capability (private terminal only):\n${value}\n`); },
    async deliveryReady() {
      if (closed || !isatty(terminal.fd)) return false;
      try { const probe = await privateTerminal(); await probe.close(); return !closed && isatty(terminal.fd); } catch { return false; }
    },
    async close() { if (!closed) { closed = true; await terminal.close(); } },
  };
}
async function validateDirectory() {
  if (process.platform !== 'linux' || process.getuid?.() === undefined || process.getuid() === 0) throw failure();
  const stat = await lstat(PAIRING_DIRECTORY);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid!() || (stat.mode & 0o777) !== 0o700) throw failure();
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).trim().split('\n');
  if (!mounts.some(line => { const [before, after] = line.split(' - '); return before?.split(' ')[4] === PAIRING_DIRECTORY && after?.split(' ')[0] === 'tmpfs'; })) throw failure();
}
export async function retrieveCapability(): Promise<string> {
  await validateDirectory();
  const stat = await lstat(PAIRING_SOCKET);
  if (!stat.isSocket() || stat.isSymbolicLink() || stat.uid !== process.getuid!() || (stat.mode & 0o777) !== 0o600) throw failure();
  return await new Promise<string>((resolve, reject) => {
    const socket = createConnection(PAIRING_SOCKET);
    let data = '';
    const fail = () => { socket.destroy(); reject(failure()); };
    socket.setTimeout(1000, fail);
    socket.on('error', fail);
    socket.on('connect', () => socket.write('PAIR\n'));
    socket.on('data', chunk => { data += chunk.toString('ascii'); if (data.length > 44) fail(); });
    socket.on('end', () => { socket.destroy(); if (/^[A-Za-z0-9_-]{43}\n$/.test(data)) resolve(data.slice(0, -1)); else fail(); });
  });
}
export async function socketDelivery(): Promise<PrivateDelivery> {
  await validateDirectory();
  try { await lstat(PAIRING_SOCKET); throw failure(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure(); }
  let capability: string | undefined;
  let closed = false;
  const clients = new Set<Socket>();
  const server = createServer(socket => {
    if (closed || clients.size >= 16) { socket.destroy(); return; }
    clients.add(socket);
    socket.once('close', () => clients.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(1000, () => socket.destroy());
    let request = '';
    socket.on('data', chunk => {
      request += chunk.toString('ascii');
      if (request.length > 5 || !'PAIR\n'.startsWith(request)) { socket.destroy(); return; }
      if (request === 'PAIR\n') { if (!capability) socket.destroy(); else socket.end(`${capability}\n`); }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(PAIRING_SOCKET, () => { server.off('error', reject); resolve(); }); });
  server.on('error', () => { closed = true; for (const client of clients) client.destroy(); });
  try { await chmod(PAIRING_SOCKET, 0o600); } catch { await new Promise<void>(resolve => server.close(() => resolve())); throw failure(); }
  const owned = await lstat(PAIRING_SOCKET);
  const close = async () => {
    closed = true; capability = undefined;
    for (const client of clients) client.destroy();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    try { const current = await lstat(PAIRING_SOCKET); if (current.ino === owned.ino && current.dev === owned.dev) await unlink(PAIRING_SOCKET); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  };
  return {
    async receiveCapability(value) { if (closed) throw failure(); capability = value; },
    async deliveryReady() {
      if (closed || !server.listening || !capability) return false;
      try { const stat = await lstat(PAIRING_SOCKET); if (stat.ino !== owned.ino || stat.dev !== owned.dev) return false; const received = await retrieveCapability(); return timingSafeEqual(Buffer.from(received), Buffer.from(capability)); } catch { return false; }
    },
    close,
  };
}
