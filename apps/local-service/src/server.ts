import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SqliteLocalPersistence } from '../../../packages/storage/src/sqliteLocalPersistence.ts';
import type { LocalStoreSnapshot } from '../../../packages/storage/src/localStore.ts';
import {
  alignWordsWithWhisperX,
  extractAudioWithFfmpeg,
  nodeCommandRunner,
  transcribeWithFasterWhisper,
  type CommandRunner,
  type LocalAsrTranscriptionResult,
} from '../../../packages/local-transcription/src/index.ts';

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
  payloadSummary?: unknown;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
  message?: string;
}>;

export type LocalServiceRuntime = Readonly<{
  commandRunner?: CommandRunner;
  scriptRoot?: string;
  pythonPath?: string;
  ffmpegPath?: string;
  defaultLanguage?: string;
  defaultModelName?: string;
  defaultDevice?: string;
  defaultComputeType?: string;
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

function publicJob(job: LocalJob): unknown {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.message !== undefined ? { message: job.message } : {}),
    ...(job.payloadSummary !== undefined ? { payloadSummary: job.payloadSummary } : {}),
    ...(job.result !== undefined ? { result: job.result } : {}),
  };
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

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${key} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalStringField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${key} must be a string when provided.`);
  }
  return value.trim();
}

function optionalBooleanField(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') {
    throw new TypeError(`${key} must be a boolean when provided.`);
  }
  return value;
}

function absolutePathField(path: string, label: string): string {
  if (!isAbsolute(path)) {
    throw new TypeError(`${label} must be an absolute local path.`);
  }
  return resolve(path);
}

function defaultScriptRoot(runtime: LocalServiceRuntime): string {
  return runtime.scriptRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function redactLocalPaths(message: string, paths: readonly string[]): string {
  let redacted = message;
  for (const path of paths) {
    if (path) redacted = redacted.split(path).join('[local-path]');
  }
  return redacted;
}

type LocalTranscriptionPayload = Readonly<{
  mediaPath: string;
  language: string;
  modelName: string;
  alignWords: boolean;
  pythonPath: string;
  ffmpegPath: string;
  device: string;
  computeType: string;
}>;

function localTranscriptionPayload(value: unknown, runtime: LocalServiceRuntime): LocalTranscriptionPayload {
  const body = asObject(value, 'local transcription payload');
  return {
    mediaPath: absolutePathField(requiredStringField(body, 'mediaPath'), 'mediaPath'),
    language: optionalStringField(body, 'language', runtime.defaultLanguage ?? 'pl'),
    modelName: optionalStringField(body, 'modelName', runtime.defaultModelName ?? 'tiny'),
    alignWords: optionalBooleanField(body, 'alignWords', true),
    pythonPath: optionalStringField(body, 'pythonPath', runtime.pythonPath ?? 'python3'),
    ffmpegPath: optionalStringField(body, 'ffmpegPath', runtime.ffmpegPath ?? 'ffmpeg'),
    device: optionalStringField(body, 'device', runtime.defaultDevice ?? 'cpu'),
    computeType: optionalStringField(body, 'computeType', runtime.defaultComputeType ?? 'int8'),
  };
}

function payloadSummary(kind: LocalJobKind, payload: unknown): unknown {
  if (kind !== 'local-transcription') return undefined;
  const record = asObject(payload, 'local transcription payload');
  return {
    language: typeof record.language === 'string' ? record.language : 'pl',
    modelName: typeof record.modelName === 'string' ? record.modelName : 'tiny',
    alignWords: record.alignWords !== false,
    mediaPath: '[local-media-path]',
  };
}

function mediaPathFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const mediaPath = (payload as Record<string, unknown>).mediaPath;
  return typeof mediaPath === 'string' && mediaPath.length > 0 ? resolve(mediaPath) : undefined;
}

async function runLocalTranscription(payloadValue: unknown, config: LocalServiceConfig, runtime: LocalServiceRuntime, jobId: string): Promise<LocalAsrTranscriptionResult> {
  const payload = localTranscriptionPayload(payloadValue, runtime);
  const jobScratchDir = join(config.scratchDir, 'jobs', jobId);
  await mkdir(jobScratchDir, { recursive: true });
  const audioPath = join(jobScratchDir, 'audio.wav');
  const fasterWhisperTranscriptPath = join(jobScratchDir, 'faster-whisper-transcript.json');
  const scriptRoot = defaultScriptRoot(runtime);
  const runner = runtime.commandRunner ?? nodeCommandRunner;

  await extractAudioWithFfmpeg({
    ffmpegPath: payload.ffmpegPath,
    inputPath: payload.mediaPath,
    outputPath: audioPath,
  }, runner);
  const transcript = await transcribeWithFasterWhisper({
    pythonPath: payload.pythonPath,
    scriptPath: join(scriptRoot, 'scripts', 'faster_whisper_transcribe.py'),
    audioPath,
    language: payload.language,
    modelName: payload.modelName,
    device: payload.device,
    computeType: payload.computeType,
  }, runner);
  if (!payload.alignWords) return transcript;

  await writeFile(fasterWhisperTranscriptPath, JSON.stringify(transcript), 'utf-8');
  return alignWordsWithWhisperX({
    pythonPath: payload.pythonPath,
    scriptPath: join(scriptRoot, 'scripts', 'whisperx_align.py'),
    audioPath,
    transcriptJsonPath: fasterWhisperTranscriptPath,
    language: transcript.language,
    device: payload.device,
  }, runner);
}

export async function startLingotorteLocalService(config: LocalServiceConfig, runtime: LocalServiceRuntime = {}): Promise<RunningLingotorteLocalService> {
  assertLoopbackConfig(config);
  await mkdir(dirname(config.databasePath), { recursive: true });
  await mkdir(config.scratchDir, { recursive: true });
  await mkdir(config.modelCacheDir, { recursive: true });

  const persistence = SqliteLocalPersistence.open(config.databasePath);
  const jobs = new Map<string, LocalJob>();

  const finishLocalTranscriptionJob = (jobId: string): void => {
    void (async () => {
      const queued = jobs.get(jobId);
      if (!queued || queued.status === 'cancelled') return;
      jobs.set(jobId, updateJob(queued, { status: 'running', message: 'Running local transcription.' }));
      try {
        const transcript = await runLocalTranscription(queued.payload, config, runtime, jobId);
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'completed',
          message: 'Local transcription completed.',
          result: { transcript },
        }));
      } catch (error) {
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        const rawMessage = error instanceof Error ? error.message : String(error);
        const mediaPath = mediaPathFromPayload(current.payload);
        const mediaDir = mediaPath !== undefined ? dirname(mediaPath) : undefined;
        jobs.set(jobId, updateJob(current, {
          status: 'failed',
          message: redactLocalPaths(rawMessage, [
            config.scratchDir,
            config.modelCacheDir,
            config.databasePath,
            ...(mediaPath !== undefined ? [mediaPath] : []),
            ...(mediaDir !== undefined ? [mediaDir] : []),
          ]),
        }));
      }
    })();
  };

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
        const payload = body.payload ?? {};
        const job: LocalJob = {
          id: randomUUID(),
          kind,
          status,
          payload,
          ...(payloadSummary(kind, payload) !== undefined ? { payloadSummary: payloadSummary(kind, payload) } : {}),
          createdAt: now,
          updatedAt: now,
          ...(kind === 'noop' ? { message: 'No-op local job completed.' } : {}),
        };
        jobs.set(job.id, job);
        if (kind === 'local-transcription') finishLocalTranscriptionJob(job.id);
        sendJson(response, 201, { ok: true, job: publicJob(job) });
        return;
      }

      const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(cancel))?$/.exec(path);
      if (jobMatch && request.method === 'GET' && !jobMatch[2]) {
        const job = jobs.get(jobMatch[1]!);
        if (!job) {
          sendError(response, 404, 'Local job not found.');
          return;
        }
        sendJson(response, 200, { ok: true, job: publicJob(job) });
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
        sendJson(response, 200, { ok: true, job: publicJob(cancelled) });
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
