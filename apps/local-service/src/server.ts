import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SqliteLocalPersistence } from '../../../packages/storage/src/sqliteLocalPersistence.ts';
import type { LocalStoreSnapshot } from '../../../packages/storage/src/localStore.ts';

const SERVICE_NAME = 'lingotorte-local-service';
const SERVICE_VERSION = '0.1.0';
const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;

export type LocalServiceConfig = Readonly<{
  host: string;
  port: number;
  databasePath: string;
  scratchDir: string;
  modelCacheDir: string;
  allowOnlineProviders: boolean;
}>;

type LocalJobStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
type LocalJobKind = 'waiting' | 'noop' | 'local-transcription' | 'elevenlabs-scribe' | 'youtube-caption';

type LocalJob = Readonly<{
  id: string;
  kind: LocalJobKind;
  status: LocalJobStatus;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  message?: string;
}>;

export type RunningLingotorteLocalService = Readonly<{
  origin: string;
  config: LocalServiceConfig;
  close(): Promise<void>;
}>;

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function assertLoopbackConfig(config: LocalServiceConfig): void {
  if (!isLoopbackHost(config.host)) {
    throw new TypeError(`Lingotorte local service must bind to a loopback host; refused ${config.host}`);
  }
  for (const [label, path] of [
    ['databasePath', config.databasePath],
    ['scratchDir', config.scratchDir],
    ['modelCacheDir', config.modelCacheDir],
  ] as const) {
    if (!isAbsolute(path)) {
      throw new TypeError(`${label} must be an absolute local path.`);
    }
  }
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  response.end(body);
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, { ok: false, error: message });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      throw new TypeError('JSON body is too large.');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

function objectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object body.');
  }
  return value as Record<string, unknown>;
}

function jobKind(value: unknown): LocalJobKind {
  if (
    value === 'waiting' ||
    value === 'noop' ||
    value === 'local-transcription' ||
    value === 'elevenlabs-scribe' ||
    value === 'youtube-caption'
  ) {
    return value;
  }
  throw new TypeError('Unsupported local job kind.');
}

function publicStatus(config: LocalServiceConfig, persistence: SqliteLocalPersistence): unknown {
  return {
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    config: {
      host: config.host,
      port: config.port,
      databasePath: '[local-sqlite]',
      scratchDir: '[local-scratch]',
      modelCacheDir: '[local-model-cache]',
      allowOnlineProviders: config.allowOnlineProviders,
    },
    persistence: persistence.status(),
  };
}

function updateJob(job: LocalJob, patch: Partial<Omit<LocalJob, 'id' | 'kind' | 'createdAt'>>): LocalJob {
  return {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function pathInside(parent: string, candidate: string): boolean {
  const root = resolve(parent);
  const target = resolve(candidate);
  return target === root || target.startsWith(`${root}/`);
}

async function cleanupScratchDirectory(scratchDir: string): Promise<number> {
  const root = resolve(scratchDir);
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  let deletedFiles = 0;
  for (const entry of entries) {
    const target = join(root, entry.name);
    if (!pathInside(root, target)) continue;
    if (entry.isDirectory()) {
      deletedFiles += await cleanupScratchDirectory(target);
      await rm(target, { recursive: true, force: true });
    } else {
      deletedFiles += 1;
      await rm(target, { force: true });
    }
  }
  return deletedFiles;
}

export async function startLingotorteLocalService(config: LocalServiceConfig): Promise<RunningLingotorteLocalService> {
  assertLoopbackConfig(config);
  await mkdir(dirname(config.databasePath), { recursive: true });
  await mkdir(config.scratchDir, { recursive: true });
  await mkdir(config.modelCacheDir, { recursive: true });

  const persistence = SqliteLocalPersistence.open(config.databasePath);
  const jobs = new Map<string, LocalJob>();

  const server: Server = createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {});
        return;
      }
      const requestUrl = new URL(request.url ?? '/', `http://${config.host}`);
      const path = requestUrl.pathname;

      if (request.method === 'GET' && path === '/api/health') {
        const serverAddress = server.address();
        const port = serverAddress && typeof serverAddress === 'object' ? serverAddress.port : config.port;
        sendJson(response, 200, {
          ok: true,
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          host: config.host,
          port,
        });
        return;
      }

      if (request.method === 'GET' && path === '/api/status') {
        sendJson(response, 200, publicStatus(config, persistence));
        return;
      }

      if (request.method === 'GET' && path === '/api/state') {
        sendJson(response, 200, { ok: true, snapshot: persistence.loadSnapshot() });
        return;
      }

      if (request.method === 'PUT' && path === '/api/state') {
        const body = objectBody(await readJsonBody(request));
        persistence.saveSnapshot(body.snapshot as LocalStoreSnapshot);
        sendJson(response, 200, { ok: true, persistence: persistence.status() });
        return;
      }

      if (request.method === 'POST' && path === '/api/jobs') {
        const body = objectBody(await readJsonBody(request));
        const kind = jobKind(body.kind);
        const now = new Date().toISOString();
        const status: LocalJobStatus = kind === 'noop' ? 'completed' : 'queued';
        const job: LocalJob = {
          id: randomUUID(),
          kind,
          status,
          payload: body.payload ?? {},
          createdAt: now,
          updatedAt: now,
          ...(kind === 'noop' ? { message: 'No-op local job completed.' } : {}),
        };
        jobs.set(job.id, job);
        sendJson(response, 201, { ok: true, job });
        return;
      }

      const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(cancel))?$/.exec(path);
      if (jobMatch && request.method === 'GET' && !jobMatch[2]) {
        const job = jobs.get(jobMatch[1]!);
        if (!job) {
          sendError(response, 404, 'Local job not found.');
          return;
        }
        sendJson(response, 200, { ok: true, job });
        return;
      }
      if (jobMatch && request.method === 'POST' && jobMatch[2] === 'cancel') {
        const job = jobs.get(jobMatch[1]!);
        if (!job) {
          sendError(response, 404, 'Local job not found.');
          return;
        }
        const cancelled = job.status === 'completed' ? job : updateJob(job, { status: 'cancelled', message: 'Cancelled by local operator.' });
        jobs.set(cancelled.id, cancelled);
        sendJson(response, 200, { ok: true, job: cancelled });
        return;
      }

      if (request.method === 'POST' && path === '/api/artifacts/cleanup') {
        const deletedFiles = await cleanupScratchDirectory(config.scratchDir);
        sendJson(response, 200, { ok: true, deletedFiles });
        return;
      }

      sendError(response, 404, 'Route not found.');
    } catch (error) {
      sendError(response, 400, error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      rejectPromise(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.port, config.host);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new TypeError('Unable to resolve local service address.');
  }
  const origin = `http://${config.host}:${address.port}`;
  const runtimeConfig: LocalServiceConfig = { ...config, port: address.port };

  return {
    origin,
    config: runtimeConfig,
    async close() {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) rejectPromise(error);
          else resolvePromise();
        });
      });
      persistence.close();
    },
  };
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): LocalServiceConfig {
  const home = env.HOME ?? process.cwd();
  const dataRoot = env.LINGOTORTE_DATA_DIR ?? join(home, '.local', 'share', 'lingotorte');
  return {
    host: env.LINGOTORTE_HOST ?? '127.0.0.1',
    port: Number.parseInt(env.LINGOTORTE_PORT ?? '5174', 10),
    databasePath: env.LINGOTORTE_DB_PATH ?? join(dataRoot, 'state.db'),
    scratchDir: env.LINGOTORTE_SCRATCH_DIR ?? join(dataRoot, 'scratch'),
    modelCacheDir: env.LINGOTORTE_MODEL_CACHE_DIR ?? join(dataRoot, 'models'),
    allowOnlineProviders: env.LINGOTORTE_ALLOW_ONLINE_PROVIDERS === 'true',
  };
}

export async function startFromCli(): Promise<void> {
  const service = await startLingotorteLocalService(configFromEnv());
  console.log(JSON.stringify({
    ok: true,
    service: SERVICE_NAME,
    origin: service.origin,
    config: {
      host: service.config.host,
      port: service.config.port,
      databasePath: '[local-sqlite]',
      scratchDir: '[local-scratch]',
      modelCacheDir: '[local-model-cache]',
      allowOnlineProviders: service.config.allowOnlineProviders,
    },
  }));
  const close = async () => {
    await service.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startFromCli().catch((error: unknown) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    process.exit(1);
  });
}
