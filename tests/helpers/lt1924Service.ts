// lt-192.4 test helpers: a raw-socket HTTP client (so HEAD bodies and duplicate fields are observed on the wire, not
// through Node's client parser) and a synthetic same-origin service starter with a managed library. Test-only.
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, readlink } from 'node:fs/promises';
import { createServer as createNetServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLingotorteLocalService, type LocalServiceConfig, type LocalServiceRuntime } from '../../apps/local-service/src/server.ts';
import { nodeBlobFs, type BlobFs } from '../../apps/local-service/src/managedMedia.ts';
import { makeLibrary } from './managedMediaFixture.ts';

export type WireResponse = Readonly<{ status: number; head: string; headers: Record<string, string[]>; body: Buffer; raw: Buffer }>;

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = (server.address() as { port: number }).port; server.close(() => resolve(port)); });
  });
}

/** One request on its own connection; reads until the server closes it. `headers` are sent verbatim, duplicates included. */
export function wire(port: number, method: string, path: string, headers: readonly [string, string][], body?: string | Buffer, timeoutMs = 4000): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(port, '127.0.0.1', () => {
      const lines = [`${method} ${path} HTTP/1.1`, ...headers.map(([name, value]) => `${name}: ${value}`), 'Connection: close'];
      if (body !== undefined) lines.push(`Content-Length: ${Buffer.byteLength(body)}`);
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (body !== undefined) socket.write(body);
    });
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`raw socket timeout: ${method} ${path}`)));
    socket.on('data', (bytes: Buffer) => chunks.push(bytes));
    socket.on('error', reject);
    socket.on('close', () => {
      const raw = Buffer.concat(chunks);
      const split = raw.indexOf('\r\n\r\n');
      if (split < 0) { reject(new Error(`no response head: ${method} ${path}`)); return; }
      const head = raw.subarray(0, split).toString('latin1');
      const [statusLine, ...fieldLines] = head.split('\r\n');
      const headers: Record<string, string[]> = {};
      for (const line of fieldLines) { const at = line.indexOf(':'); const name = line.slice(0, at).trim().toLowerCase(); (headers[name] ??= []).push(line.slice(at + 1).trim()); }
      resolve({ status: Number(/^HTTP\/1\.1 (\d{3})/.exec(statusLine!)![1]), head, headers, body: raw.subarray(split + 4), raw });
    });
  });
}

/** Decode a chunked body (Node streams 200/206 with Content-Length, but JSON errors may be chunked). */
export function dechunk(response: WireResponse): Buffer {
  if (response.headers['transfer-encoding']?.[0] !== 'chunked') return response.body;
  const out: Buffer[] = []; let at = 0; const body = response.body;
  while (at < body.length) {
    const end = body.indexOf('\r\n', at); const size = parseInt(body.subarray(at, end).toString(), 16);
    if (!size) break; out.push(body.subarray(end + 2, end + 2 + size)); at = end + 2 + size + 2;
  }
  return Buffer.concat(out);
}

/** Recursive manifest (type, mode, size, sha256 or link target) of a tree; never follows links. */
export async function treeManifest(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name); const info = await lstat(path); const key = path.slice(root.length);
      if (entry.isSymbolicLink()) result[key] = `link:${await readlink(path)}`;
      else if (entry.isDirectory()) { result[key] = `dir:${(info.mode & 0o7777).toString(8)}`; await visit(path); }
      else if (entry.isFile()) result[key] = `file:${(info.mode & 0o7777).toString(8)}:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
      else result[key] = `special:${info.mode.toString(8)}`;
    }
  };
  try { await visit(root); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return result;
}

export type MediaService = Awaited<ReturnType<typeof startMediaService>>;
export type Observed = { mediaSessions: number; activeMediaSlots: number; pendingMediaOpens: number; liveMediaStreams: number; state: { revision: string } };

/** A synthetic Docker-like same-origin service (fixed port; public origin == UI origin) on a fresh temp root. */
export async function startMediaService(options: { root?: string; library?: string | null; fs?: BlobFs; maxSlots?: number; sessionCap?: number; port?: number; nativeUiOrigins?: string[]; config?: Partial<LocalServiceConfig>; runtime?: LocalServiceRuntime } = {}) {
  const root = options.root ?? await mkdtemp(join(process.env.LINGOTORTE_SCRATCH_DIR ?? tmpdir(), 'lt-192-4-'));
  const libraryDir = options.library === null ? undefined : options.library ?? await makeLibrary(root);
  const port = options.port ?? await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let capability = '';
  let read: (() => unknown) | undefined;
  const config: LocalServiceConfig = { host: '127.0.0.1', port, ...(options.nativeUiOrigins ? { uiOrigins: options.nativeUiOrigins } : { publicOrigins: [origin], uiOrigins: [origin] }), databasePath: join(root, 'state', 'state.db'),
    scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false, ...(libraryDir ? { libraryDir } : {}), ...options.config };
  const service = await startLingotorteLocalService(config, { ...options.runtime, receiveCapability: value => { capability = value; }, observeState: reader => { read = reader; },
    managedMedia: { ...(options.fs ? { fs: options.fs } : {}), ...(options.maxSlots ? { maxSlots: options.maxSlots } : {}), ...(options.sessionCap ? { sessionCap: options.sessionCap } : {}) } });
  const host: [string, string] = ['Host', new URL(config.publicOrigins?.[0] ?? origin).host];
  return {
    root, libraryDir, port, origin, config, service, host,
    capability: () => capability,
    bearer: (): [string, string] => ['Authorization', `Bearer ${capability}`],
    observe: () => read!() as Observed,
    request: (method: string, path: string, headers: readonly [string, string][] = [], body?: string | Buffer, timeoutMs?: number) => wire(port, method, path, [host, ...headers], body, timeoutMs),
    /** M1 through the bearer; returns the minted value read from Set-Cookie (test process memory only). */
    async mint(): Promise<string> {
      const response = await wire(port, 'POST', '/api/media/session', [host, ['Authorization', `Bearer ${capability}`], ['Content-Type', 'application/json']], '{}');
      if (response.status !== 204) throw new Error(`mint failed: ${response.status}`);
      return /^lt_media=([A-Za-z0-9_-]{43});/.exec(response.headers['set-cookie']![0]!)![1]!;
    },
  };
}

/**
 * Close accounting per successful open (fd numbers are reused by the kernel, so counts are keyed by open index).
 * `perOpen[i]` is how often the descriptor of open i was closed; a close of a descriptor that is not currently
 * open (a double close) is counted in `strayCloses`.
 */
export type FdEvents = { opens: number; perOpen: number[]; strayCloses: number; streams: number; fds: number[] };

/** nodeBlobFs plus per-fd close accounting and optional async gates before open/fstat/close resolve. */
export function countingFs(gates: { open?: () => Promise<void>; fstat?: () => Promise<void>; close?: (fd: number) => Promise<void>; failOpen?: boolean; failFstat?: boolean; failClose?: boolean } = {}) {
  const events: FdEvents = { opens: 0, perOpen: [], strayCloses: 0, streams: 0, fds: [] };
  const live = new Map<number, number>();
  const countClose = (fd: number) => {
    const index = live.get(fd);
    if (index === undefined) { events.strayCloses++; return; }
    live.delete(fd); events.perOpen[index]!++;
  };
  const fs: BlobFs = {
    async open(path, flags) {
      events.opens++;
      await gates.open?.();
      if (gates.failOpen) throw Object.assign(new Error('injected open failure'), { code: 'EIO' });
      const fd = await nodeBlobFs.open(path, flags);
      live.set(fd, events.fds.length); events.fds.push(fd); events.perOpen.push(0);
      return fd;
    },
    async fstat(fd) { await gates.fstat?.(); if (gates.failFstat) throw Object.assign(new Error('injected fstat failure'), { code: 'EIO' }); return nodeBlobFs.fstat(fd); },
    async close(fd) {
      countClose(fd);
      await gates.close?.(fd);
      await nodeBlobFs.close(fd);
      if (gates.failClose) throw Object.assign(new Error('injected close failure'), { code: 'EIO' });
    },
    stream(fd, start, end) {
      events.streams++;
      const stream = nodeBlobFs.stream(fd, start, end);
      stream.once('close', () => countClose(fd));
      return stream;
    },
  };
  return { fs, events };
}

/** A gate that holds every waiter until release(); reset() arms a fresh gate (entered count restarts). */
export function barrier() {
  let open!: () => void; let entered = 0;
  let gate = new Promise<void>(resolve => { open = resolve; });
  return {
    wait: async () => { entered++; await gate; },
    release: () => open(),
    entered: () => entered,
    reset: () => { entered = 0; gate = new Promise<void>(resolve => { open = resolve; }); },
  };
}

export async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 3000, label = 'condition'): Promise<void> {
  const start = Date.now();
  while (!await predicate()) { if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`); await new Promise(resolve => setTimeout(resolve, 10)); }
}
