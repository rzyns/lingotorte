import { randomUUID, randomBytes } from 'node:crypto';
import { socketDelivery, nativeTerminalDelivery } from './privateDelivery.ts';
import { admit, deny, canonicalOrigin, freezePolicy, DENIAL_LINGER_MS, DENIAL_LINGER_BYTES, DENIAL_LINGER_HEADER_STAGE_BYTES, type AdmissionPolicy } from './requestAdmission.ts';
import type { Socket } from 'node:net';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, mkdtemp, lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { nativePathPolicy } from '../../../packages/domain/src/nativePaths.ts';
import { hostNativePath, pathInside, resolvedNativePath, assertReadableNativeFile, nativeExecutable } from '../../../packages/domain/src/nativePathsNode.ts';
import { mutablePathsFromEnv, assertMutablePaths, assertMediaOutsideScratch, glossDbPathFromEnv } from './nativeConfig.ts';
import { ANKI_EXPORT_ROUTE, AnkiValidationError, buildApkg, validateAnkiExportRequest } from './ankiPackage.ts';
import { makeGlossService, validateGlossRequest, GlossValidationError, GLOSS_ROUTE, type GlossRuntimeOptions, type GlossService } from './gloss.ts';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SqliteLocalPersistence, SnapshotRevisionConflictError } from '../../../packages/storage/src/sqliteLocalPersistence.ts';
import type { LocalStoreSnapshot } from '../../../packages/storage/src/localStore.ts';
import {
  alignWordsWithWhisperX,
  extractAudioWithFfmpeg,
  extractSourceAudioSnippet,
  extractEmbeddedSubtitleTrack,
  listEmbeddedSubtitleTracks,
  nodeCommandRunner,
  selectPythonExecutable,
  transcribeWithElevenLabsScribe,
  transcribeWithFasterWhisper,
  type CommandRunner,
  type ElevenLabsHttpClient,
  type FfmpegSubtitleExtractionResult,
  type FfprobeSubtitleListingResult,
  type LocalAsrTranscriptionResult,
} from '../../../packages/local-transcription/src/index.ts';
import { importSubtitle } from '../../../packages/subtitles/src/import.ts';
import { makeMorphologyService, validateMorphologyRequest, MorphologyValidationError, MORPHOLOGY_ROUTE, type MorphologyRuntimeOptions, type MorphologyService } from './morphology.ts';

const SERVICE_NAME = 'lingotorte-local-service';
const SERVICE_VERSION = '0.1.0';
export const ALLOWED_ASR_MODEL_NAMES = ['tiny', 'base', 'small', 'medium', 'large-v3'] as const;
export type AsrModelName = typeof ALLOWED_ASR_MODEL_NAMES[number];
const DEFAULT_ASR_MODEL_NAME: AsrModelName = 'base';
const ASR_MODEL_VALIDATION_MESSAGE = `modelName must be one of: ${ALLOWED_ASR_MODEL_NAMES.join(', ')}.`;

export type LocalServiceConfig = Readonly<{
  host: string;
  port: number;
  serviceHostname?: string;
  publicOrigins?: readonly string[];
  uiOrigins?: readonly string[];
  healthAuthority?: string;
  privateNetworkOrigins?: readonly string[];
  dataDir?: string;
  databasePath: string;
  scratchDir: string;
  modelCacheDir: string;
  allowOnlineProviders: boolean;
  elevenLabsApiKey?: string;
  elevenLabsBaseUrl?: string;
}>;

type LocalJobStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
type LocalJobKind = 'waiting' | 'noop' | 'local-transcription' | 'elevenlabs-scribe' | 'youtube-caption' | 'embedded-subtitle-list' | 'embedded-subtitle-extract' | 'source-audio-snippet';

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
  receiveCapability?: (capability: string) => void | Promise<void>;
  observeState?: (read: () => unknown) => void;
  deliveryReady?: () => Promise<boolean>;
  startupCheckpoint?: (stage: 'bound' | 'authority-frozen' | 'resources-ready', port: number) => void | Promise<void>;
  commandRunner?: CommandRunner;
  scriptRoot?: string;
  pythonPath?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  defaultLanguage?: string;
  defaultModelName?: AsrModelName;
  defaultDevice?: string;
  defaultComputeType?: string;
  fetchImpl?: typeof fetch;
  elevenLabsApiKey?: string;
  elevenLabsBaseUrl?: string;
  elevenLabsHttpClient?: ElevenLabsHttpClient;
  morphology?: MorphologyRuntimeOptions;
  /** lt-foe.3.3: gloss lookup. startFromCli fills dbPath/mode from the environment. */
  gloss?: GlossRuntimeOptions;
}>;

export type RunningLingotorteLocalService = Readonly<{
  origin: string;
  config: LocalServiceConfig;
  close(): Promise<void>;
}>;

function assertNativeConfig(config: LocalServiceConfig): void {
  for (const [label, path] of [
    ['databasePath', config.databasePath],
    ['scratchDir', config.scratchDir],
    ['modelCacheDir', config.modelCacheDir],
  ] as const) {
    hostNativePath(path, label === 'databasePath' ? 'output-file' : 'directory');
  }
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, { ok: false, error: message });
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
    value === 'youtube-caption' ||
    value === 'embedded-subtitle-list' ||
    value === 'embedded-subtitle-extract' ||
    value === 'source-audio-snippet'
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

function publicStatus(config: LocalServiceConfig, persistence: SqliteLocalPersistence, defaultAsrModelName: AsrModelName, morphology: MorphologyService, gloss: GlossService): unknown {
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
      pathPolicy: nativePathPolicy(process.platform),
      defaultAsrModelName,
      allowOnlineProviders: config.allowOnlineProviders,
    },
    providers: {
      elevenLabsScribe: {
        onlineProvidersAllowed: config.allowOnlineProviders,
        apiKeyPresent: (config.elevenLabsApiKey?.trim().length ?? 0) > 0,
        ready: config.allowOnlineProviders && (config.elevenLabsApiKey?.trim().length ?? 0) > 0,
      },
    },
    persistence: persistence.status(),
    language: { morphology: morphology.capability(), gloss: gloss.capability() },
  };
}

function updateJob(job: LocalJob, patch: Partial<Omit<LocalJob, 'id' | 'kind' | 'createdAt'>>): LocalJob {
  return {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

async function cleanupScratchDirectory(scratchDir: string): Promise<number> {
  const root = resolve(scratchDir);
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory() || !pathInside(root, resolvedNativePath(root))) throw new TypeError('Scratch cleanup refused a linked directory.');
  const entries = await readdir(root, { withFileTypes: true });
  let deletedFiles = 0;
  for (const entry of entries) {
    const target = join(root, entry.name);
    if (!pathInside(root, target)) continue;
    if (entry.isSymbolicLink()) {
      // Unlink only. Never recurse through symlinks or Windows junctions.
      await rm(target, { force: true });
    } else if (entry.isDirectory()) {
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
  return key === 'mediaPath' ? value : value.trim();
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
  try { return hostNativePath(path, 'input-file'); }
  catch { throw new TypeError(`${label} must be a fully qualified absolute local path.`); }
}

function defaultScriptRoot(runtime: LocalServiceRuntime): string {
  return hostNativePath(runtime.scriptRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), 'directory');
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
  modelName: AsrModelName;
  alignWords: boolean;
  pythonPath: string;
  ffmpegPath: string;
  device: string;
  computeType: string;
}>;

type ElevenLabsScribePayload = Readonly<{
  mediaPath: string;
  language: string;
  modelId: string;
  allowOnlineProvider: boolean;
  ffmpegPath: string;
}>;

type YouTubeCaptionPayload = Readonly<{
  url: string;
  language: string;
  allowPublicRead: boolean;
}>;

type EmbeddedSubtitleListPayload = Readonly<{
  mediaPath: string;
  ffprobePath?: string;
}>;

type EmbeddedSubtitleExtractPayload = Readonly<{
  mediaPath: string;
  streamIndex: number;
  outputFormat: 'srt' | 'vtt' | 'ass';
  language: string;
  role: 'target' | 'native' | 'other';
  ffprobePath?: string;
  ffmpegPath?: string;
}>;

type SourceAudioSnippetPayload = Readonly<{
  mediaPath: string;
  startMs: number;
  endMs: number;
  ffmpegPath?: string;
}>;

function sourceAudioSnippetPayload(value: unknown, runtime: LocalServiceRuntime): SourceAudioSnippetPayload {
  const body = asObject(value, 'source audio snippet payload');
  const startMs = body.startMs;
  const endMs = body.endMs;
  if (typeof startMs !== 'number' || typeof endMs !== 'number') throw new TypeError('startMs and endMs must be numbers.');
  return {
    mediaPath: absolutePathField(requiredStringField(body, 'mediaPath'), 'mediaPath'), startMs, endMs,
    ffmpegPath: nativeExecutable(runtime.ffmpegPath ?? 'ffmpeg'),
  };
}

function isAsrModelName(value: string): value is AsrModelName {
  return (ALLOWED_ASR_MODEL_NAMES as readonly string[]).includes(value);
}

function jobAsrModelName(value: unknown, fallback: AsrModelName): AsrModelName {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !isAsrModelName(value.trim())) {
    throw new TypeError(ASR_MODEL_VALIDATION_MESSAGE);
  }
  return value.trim() as AsrModelName;
}

export function resolveDefaultAsrModelName(
  value: string | undefined,
  warn: (message: string) => void = console.warn,
): AsrModelName {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_ASR_MODEL_NAME;
  if (isAsrModelName(trimmed)) return trimmed;
  warn(`LINGOTORTE_ASR_MODEL is unsupported; using ${DEFAULT_ASR_MODEL_NAME}. Allowed values: ${ALLOWED_ASR_MODEL_NAMES.join(', ')}.`);
  return DEFAULT_ASR_MODEL_NAME;
}

function localTranscriptionPayload(value: unknown, runtime: LocalServiceRuntime): LocalTranscriptionPayload {
  const body = asObject(value, 'local transcription payload');
  return {
    mediaPath: absolutePathField(requiredStringField(body, 'mediaPath'), 'mediaPath'),
    language: optionalStringField(body, 'language', runtime.defaultLanguage ?? 'pl'),
    modelName: jobAsrModelName(body.modelName, runtime.defaultModelName ?? DEFAULT_ASR_MODEL_NAME),
    alignWords: optionalBooleanField(body, 'alignWords', true),
    pythonPath: selectPythonExecutable(runtime.pythonPath),
    ffmpegPath: nativeExecutable(runtime.ffmpegPath ?? 'ffmpeg'),
    device: optionalStringField(body, 'device', runtime.defaultDevice ?? 'cpu'),
    computeType: optionalStringField(body, 'computeType', runtime.defaultComputeType ?? 'int8'),
  };
}

function elevenLabsScribePayload(value: unknown, runtime: LocalServiceRuntime): ElevenLabsScribePayload {
  const body = asObject(value, 'ElevenLabs Scribe payload');
  return {
    mediaPath: absolutePathField(requiredStringField(body, 'mediaPath'), 'mediaPath'),
    language: optionalStringField(body, 'language', runtime.defaultLanguage ?? 'pl'),
    modelId: optionalStringField(body, 'modelId', 'scribe_v2'),
    allowOnlineProvider: optionalBooleanField(body, 'allowOnlineProvider', false),
    ffmpegPath: nativeExecutable(runtime.ffmpegPath ?? 'ffmpeg'),
  };
}

function youTubeCaptionPayload(value: unknown): YouTubeCaptionPayload {
  const body = asObject(value, 'YouTube caption payload');
  return {
    url: requiredStringField(body, 'url'),
    language: optionalStringField(body, 'language', 'pl'),
    allowPublicRead: optionalBooleanField(body, 'allowPublicRead', false),
  };
}

function embeddedSubtitleListPayload(value: unknown, runtime: LocalServiceRuntime): EmbeddedSubtitleListPayload {
  const body = asObject(value, 'embedded subtitle list payload');
  return {
    mediaPath: absolutePathField(requiredStringField(body, 'mediaPath'), 'mediaPath'),
    ffprobePath: nativeExecutable(runtime.ffprobePath ?? 'ffprobe'),
  };
}

function embeddedSubtitleExtractPayload(value: unknown, runtime: LocalServiceRuntime): EmbeddedSubtitleExtractPayload {
  const body = asObject(value, 'embedded subtitle extract payload');
  const outputFormat = body.outputFormat;
  if (outputFormat !== 'srt' && outputFormat !== 'vtt' && outputFormat !== 'ass') {
    throw new TypeError('outputFormat must be one of: srt, vtt, ass.');
  }
  const role = body.role;
  if (role !== 'target' && role !== 'native' && role !== 'other') {
    throw new TypeError('role must be one of: target, native, other.');
  }
  const streamIndex = body.streamIndex;
  if (typeof streamIndex !== 'number' || !Number.isInteger(streamIndex) || streamIndex < 0) {
    throw new TypeError('streamIndex must be a non-negative integer.');
  }
  return {
    mediaPath: absolutePathField(requiredStringField(body, 'mediaPath'), 'mediaPath'),
    streamIndex,
    outputFormat,
    language: optionalStringField(body, 'language', 'pl'),
    role,
    ffprobePath: nativeExecutable(runtime.ffprobePath ?? 'ffprobe'),
    ffmpegPath: nativeExecutable(runtime.ffmpegPath ?? 'ffmpeg'),
  };
}

function payloadSummary(kind: LocalJobKind, payload: unknown): unknown {
  if (kind === 'local-transcription') {
    const record = asObject(payload, 'local transcription payload');
    return {
      language: typeof record.language === 'string' ? record.language : 'pl',
      modelName: jobAsrModelName(record.modelName, DEFAULT_ASR_MODEL_NAME),
      alignWords: record.alignWords !== false,
      mediaPath: '[local-media-path]',
    };
  }
  if (kind === 'elevenlabs-scribe') {
    const record = asObject(payload, 'ElevenLabs Scribe payload');
    return {
      language: typeof record.language === 'string' ? record.language : 'pl',
      modelId: typeof record.modelId === 'string' ? record.modelId : 'scribe_v2',
      providerConsent: record.allowOnlineProvider === true,
      mediaPath: '[local-media-path]',
    };
  }
  if (kind === 'youtube-caption') {
    const record = asObject(payload, 'YouTube caption payload');
    return {
      language: typeof record.language === 'string' ? record.language : 'pl',
      publicReadAuthorized: record.allowPublicRead === true,
      source: '[public-youtube-url]',
    };
  }
  if (kind === 'embedded-subtitle-list') {
    return { mediaPath: '[local-media-path]' };
  }
  if (kind === 'embedded-subtitle-extract') {
    const record = asObject(payload, 'embedded subtitle extract payload') as Record<string, unknown>;
    return {
      mediaPath: '[local-media-path]',
      streamIndex: record.streamIndex,
      outputFormat: record.outputFormat,
      language: typeof record.language === 'string' ? record.language : 'pl',
      role: record.role,
    };
  }
  if (kind === 'source-audio-snippet') {
    const record = asObject(payload, 'source audio snippet payload');
    const startMs = typeof record.startMs === 'number' ? record.startMs : undefined;
    const endMs = typeof record.endMs === 'number' ? record.endMs : undefined;
    return { mediaPath: '[local-media-path]', startMs, endMs, durationMs: startMs !== undefined && endMs !== undefined ? endMs - startMs : undefined };
  }
  return undefined;
}

function mediaPathFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const mediaPath = (payload as Record<string, unknown>).mediaPath;
  return typeof mediaPath === 'string' && mediaPath.length > 0 ? resolve(mediaPath) : undefined;
}

function redactJobFailureMessage(error: unknown, payload: unknown, config: LocalServiceConfig, runtime: LocalServiceRuntime): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const mediaPath = mediaPathFromPayload(payload);
  const mediaDir = mediaPath !== undefined ? dirname(mediaPath) : undefined;
  let message = redactLocalPaths(rawMessage, [
    config.scratchDir,
    config.modelCacheDir,
    config.databasePath,
    ...(mediaPath !== undefined ? [mediaPath] : []),
    ...(mediaDir !== undefined ? [mediaDir] : []),
  ]);
  for (const secret of [config.elevenLabsApiKey, runtime.elevenLabsApiKey]) {
    if (secret !== undefined && secret.length > 0) {
      message = message.split(secret).join('[secret]');
    }
  }
  return message;
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

async function runElevenLabsScribe(payloadValue: unknown, config: LocalServiceConfig, runtime: LocalServiceRuntime, jobId: string): Promise<LocalAsrTranscriptionResult> {
  if (!config.allowOnlineProviders) {
    throw new TypeError('ElevenLabs Scribe transcription is disabled; set LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true for this local service.');
  }
  const payload = elevenLabsScribePayload(payloadValue, runtime);
  if (!payload.allowOnlineProvider) {
    throw new TypeError('ElevenLabs Scribe transcription requires explicit provider consent.');
  }
  const apiKey = (runtime.elevenLabsApiKey ?? config.elevenLabsApiKey ?? '').trim();
  if (apiKey.length === 0) {
    throw new TypeError('ElevenLabs Scribe transcription requires ELEVENLABS_API_KEY in the local service environment.');
  }
  const jobScratchDir = join(config.scratchDir, 'jobs', jobId);
  await mkdir(jobScratchDir, { recursive: true });
  const audioPath = join(jobScratchDir, 'elevenlabs-scribe-audio.wav');
  const runner = runtime.commandRunner ?? nodeCommandRunner;

  await extractAudioWithFfmpeg({
    ffmpegPath: payload.ffmpegPath,
    inputPath: payload.mediaPath,
    outputPath: audioPath,
  }, runner);

  const baseUrl = runtime.elevenLabsBaseUrl ?? config.elevenLabsBaseUrl;
  return transcribeWithElevenLabsScribe({
    allowOnlineProvider: true,
    apiKey,
    audioPath,
    language: payload.language,
    modelId: payload.modelId,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  }, runtime.elevenLabsHttpClient);
}

function videoIdFromYouTubeUrl(url: string): string {
  const trimmed = url.trim();
  const direct = /^[A-Za-z0-9_-]{11}$/.exec(trimmed);
  if (direct) return trimmed;
  const parsed = new URL(trimmed);
  if (parsed.hostname === 'youtu.be') {
    const id = parsed.pathname.replace(/^\//, '').slice(0, 11);
    if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
  }
  const queryId = parsed.searchParams.get('v');
  if (queryId && /^[A-Za-z0-9_-]{11}$/.test(queryId)) return queryId;
  throw new TypeError('YouTube caption import requires a public YouTube URL or 11-character video id.');
}

function textFromTimedTextSegment(segment: unknown): string {
  const record = asObject(segment, 'YouTube timedtext segment');
  const raw = record.utf8;
  return typeof raw === 'string' ? raw : '';
}

async function runYouTubeCaptionRead(payloadValue: unknown, config: LocalServiceConfig, runtime: LocalServiceRuntime): Promise<unknown> {
  if (!config.allowOnlineProviders) {
    throw new TypeError('YouTube caption public reads are disabled; set LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true for this local service.');
  }
  const payload = youTubeCaptionPayload(payloadValue);
  if (!payload.allowPublicRead) {
    throw new TypeError('YouTube caption read requires explicit public-read authorization.');
  }
  const videoId = videoIdFromYouTubeUrl(payload.url);
  const timedTextUrl = new URL('https://www.youtube.com/api/timedtext');
  timedTextUrl.searchParams.set('v', videoId);
  timedTextUrl.searchParams.set('lang', payload.language);
  timedTextUrl.searchParams.set('fmt', 'json3');
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const response = await fetchImpl(timedTextUrl);
  if (!response.ok) {
    throw new TypeError(`YouTube caption public read failed with HTTP ${response.status}.`);
  }
  const json = await response.json() as Record<string, unknown>;
  const events = Array.isArray(json.events) ? json.events : [];
  const segments = events.flatMap((eventValue) => {
    const event = asObject(eventValue, 'YouTube timedtext event');
    const startMs = typeof event.tStartMs === 'number' ? event.tStartMs : 0;
    const durationMs = typeof event.dDurationMs === 'number' ? event.dDurationMs : 0;
    const text = Array.isArray(event.segs)
      ? event.segs.map(textFromTimedTextSegment).join('').replace(/\s+/g, ' ').trim()
      : '';
    return text && durationMs > 0 ? [{ startMs, endMs: startMs + durationMs, text }] : [];
  });
  if (segments.length === 0) {
    throw new TypeError('YouTube timedtext returned no caption segments for the requested language.');
  }
  return {
    videoId,
    language: payload.language,
    isAutoGenerated: true,
    segments,
  };
}

async function runEmbeddedSubtitleList(
  payloadValue: unknown,
  _config: LocalServiceConfig,
  runtime: LocalServiceRuntime,
): Promise<FfprobeSubtitleListingResult> {
  const payload = embeddedSubtitleListPayload(payloadValue, runtime);
  const runner = runtime.commandRunner ?? nodeCommandRunner;
  return listEmbeddedSubtitleTracks({
    ...(payload.ffprobePath !== undefined ? { ffprobePath: payload.ffprobePath } : {}),
    mediaPath: payload.mediaPath,
  }, runner);
}

async function runEmbeddedSubtitleExtract(
  payloadValue: unknown,
  config: LocalServiceConfig,
  runtime: LocalServiceRuntime,
  jobId: string,
): Promise<{ extract: FfmpegSubtitleExtractionResult; importResult: import('@lingotorte/subtitles/src/import').ParsedSubtitle }> {
  const payload = embeddedSubtitleExtractPayload(payloadValue, runtime);
  const runner = runtime.commandRunner ?? nodeCommandRunner;
  const jobScratchDir = join(config.scratchDir, 'jobs', jobId);
  await mkdir(jobScratchDir, { recursive: true });
  const ext = payload.outputFormat === 'ass' ? 'ass' : payload.outputFormat === 'vtt' ? 'vtt' : 'srt';
  const extractedPath = join(jobScratchDir, `embedded-subtitle-stream-${payload.streamIndex}.${ext}`);
  const extract = await extractEmbeddedSubtitleTrack({
    ...(payload.ffmpegPath !== undefined ? { ffmpegPath: payload.ffmpegPath } : {}),
    mediaPath: payload.mediaPath,
    streamIndex: payload.streamIndex,
    outputPath: extractedPath,
    outputFormat: payload.outputFormat,
  }, runner);
  // Import the extracted subtitle through the existing pipeline; result is draft/imported.
  // We use a synthetic mediaId placeholder since the service layer works with paths.
  // Embedded extraction can produce timing drift (PGS→SRT, ASS→SRT conversions) and the
  // text quality has not been reviewed, so the track must enter as 'draft' with warning flags
  // rather than defaulting to 'approved' — preserving the correction/approval gate.
  const importResult = await importSubtitle({
    mediaId: `embedded-extract:${jobId}`,
    language: payload.language,
    role: payload.role,
    path: extractedPath,
    isActive: false,
    transcriptStatus: 'draft',
    provenance: {
      language: payload.language,
      warningFlags: ['timingUnverified', 'qualityUnreviewed'],
    },
  });
  return { extract, importResult };
}

export async function startLingotorteLocalService(config: LocalServiceConfig, runtimeInput: LocalServiceRuntime = {}): Promise<RunningLingotorteLocalService> {
  const runtime: LocalServiceRuntime = {
    ...runtimeInput,
    pythonPath: selectPythonExecutable(runtimeInput.pythonPath),
    defaultModelName: runtimeInput.defaultModelName ?? DEFAULT_ASR_MODEL_NAME,
  };
  assertNativeConfig(config);
  if (runtime.scriptRoot !== undefined) hostNativePath(runtime.scriptRoot, 'directory');
  for (const command of [runtime.pythonPath, runtime.ffmpegPath, runtime.ffprobePath]) {
    if (command !== undefined) nativeExecutable(command);
  }
  assertMutablePaths(config);
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new TypeError('Invalid service port.');
  const hostname = config.serviceHostname ?? config.host;
  const displayHostname = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  canonicalOrigin(`http://${displayHostname}`);
  const uiOrigins = config.uiOrigins ?? ['http://127.0.0.1:5173'];
  uiOrigins.forEach(canonicalOrigin);
  if (config.publicOrigins && (!config.publicOrigins.length || config.port === 0)) throw new TypeError('Docker requires fixed port and public origins.');
  config.publicOrigins?.forEach(canonicalOrigin);
  if (config.publicOrigins && (!config.uiOrigins ||
      JSON.stringify([...new Set(config.publicOrigins)].sort()) !== JSON.stringify([...new Set(config.uiOrigins)].sort()) ||
      config.privateNetworkOrigins?.length ||
      (config.healthAuthority !== undefined && config.healthAuthority !== `127.0.0.1:${config.port}`))) {
    throw new TypeError('Docker requires matching exact public/UI origins and a separate loopback health-only authority.');
  }
  if (!config.publicOrigins && ['0.0.0.0', '::', '[::]'].includes(hostname)) throw new TypeError('An exact advertised service hostname is required for wildcard bind.');
  // Validate the entire ephemeral policy before binding; port 1 is only a
  // non-listening validation placeholder, never an accepted authority.
  if (config.port === 0) freezePolicy([`http://${displayHostname}:1`], uiOrigins, config.healthAuthority, config.privateNetworkOrigins);
  let policy: AdmissionPolicy | undefined = config.port === 0 ? undefined : freezePolicy(
    config.publicOrigins ?? [`http://${displayHostname}${config.port === 80 ? '' : `:${config.port}`}`], uiOrigins,
    config.healthAuthority, config.privateNetworkOrigins);
  if (!runtime.receiveCapability) throw new TypeError('Private capability delivery is required.');
  const capability = randomBytes(32);
  await runtime.receiveCapability(capability.toString('base64url'));
  const deliveryReady = runtime.deliveryReady ?? (async () => true);
  if (!await deliveryReady()) throw new TypeError('Private delivery is unavailable.');
  let admissionReady = false;
  // lt-04k.1: denial sockets lingering to discard unread bodies; destroyed on close() so shutdown never waits on them.
  const lingeringSockets = new Set<Socket>();
  const denialLinger = Object.freeze({ ms: DENIAL_LINGER_MS, bytes: DENIAL_LINGER_BYTES, headerStageBytes: DENIAL_LINGER_HEADER_STAGE_BYTES, sockets: lingeringSockets });
  let dispatch: ((request: IncomingMessage, response: ServerResponse, path: string, body?: Record<string, unknown>) => Promise<void>) | undefined;
  const boundary = async (request: IncomingMessage, response: ServerResponse, expectContinue = false) => {
    if (!admissionReady || !policy || !dispatch) { response.writeHead(503, { connection: 'close' }); response.end(); return; }
    try {
      const admitted = await admit(request, response, policy, capability, deliveryReady, expectContinue);
      // Revalidate after awaited body/receiver work at the dispatch boundary.
      if (!admissionReady || !await deliveryReady() || !admissionReady) { response.writeHead(503, { connection: 'close' }); response.end(); return; }
      if (admitted.preflight) { response.writeHead(204); response.end(); return; }
      await dispatch(request, response, admitted.path, admitted.body);
    } catch (error) { if (!response.headersSent) deny(response, error, denialLinger); else response.destroy(); }
  };
  const server: Server = createServer((request, response) => { void boundary(request, response); });
  server.on('checkContinue', (request, response) => { void boundary(request, response, true); });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.timeout = 15_000;
  server.keepAliveTimeout = 5_000;
  const listen = () => new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(config.port, config.host, () => { server.off('error', rejectPromise); resolvePromise(); });
  });
  let openedPersistence: SqliteLocalPersistence | undefined;
  let startupScratch: string | undefined;
  try {
  if (config.port === 0) {
    await listen();
    const address = server.address();
    if (!address || typeof address === 'string') throw new TypeError('Missing actual service authority.');
    await runtime.startupCheckpoint?.('bound', address.port);
    policy = freezePolicy([`http://${displayHostname}:${address.port}`], uiOrigins, config.healthAuthority, config.privateNetworkOrigins);
    await runtime.startupCheckpoint?.('authority-frozen', address.port);
  }
  const configuredScratchDir = config.scratchDir;
  await mkdir(dirname(config.databasePath), { recursive: true });
  await mkdir(config.scratchDir, { recursive: true });
  await mkdir(config.modelCacheDir, { recursive: true });

  // Every artifact belongs to this newly-created run child, never the operator parent.
  const runScratchDir = await mkdtemp(join(resolvedNativePath(config.scratchDir), 'run-'));
  startupScratch = runScratchDir;
  config = { ...config, scratchDir: runScratchDir };
  const snippetScratchDir = join(runScratchDir, 'source-audio-snippets');
  await mkdir(snippetScratchDir);

  const persistence = SqliteLocalPersistence.open(config.databasePath);
  openedPersistence = persistence;
  const jobs = new Map<string, LocalJob>();
  const snippets = new Map<string, { path: string; lastAccess: number }>();
  const inFlightSnippetJobs = new Set<Promise<void>>();
  let snippetAccessCounter = 0;
  let allocatedJobIds = 0;
  let allocatedSnippetIds = 0;
  let snippetLifecycle: 'open' | 'cleaning' | 'closing' = 'open';
  let artifactCleanupPromise: Promise<number> | undefined;
  runtime.observeState?.(() => ({ state: persistence.loadVersionedSnapshot(), jobs: [...jobs.entries()],
    snippets: [...snippets.entries()], snippetAccessCounter, allocatedJobIds, allocatedSnippetIds, snippetLifecycle, inFlight: inFlightSnippetJobs.size }));

  const deleteSnippet = async (snippetId: string): Promise<boolean> => {
    const entry = snippets.get(snippetId);
    if (!entry || !pathInside(snippetScratchDir, entry.path)) return false;
    snippets.delete(snippetId);
    await rm(entry.path, { force: true });
    return true;
  };

  const runSourceAudioSnippetJob = async (jobId: string): Promise<void> => {
    const queued = jobs.get(jobId);
    if (!queued || queued.status === 'cancelled') return;
    if (snippetLifecycle !== 'open') {
      jobs.set(jobId, updateJob(queued, { status: 'cancelled', message: 'Source snippet lifecycle cleanup is in progress.' }));
      return;
    }
    jobs.set(jobId, updateJob(queued, { status: 'running', message: 'Preparing source audio snippet.' }));
    let outputPath: string | undefined;
    try {
      const payload = sourceAudioSnippetPayload(queued.payload, runtime);
      const snippetId = randomUUID();
      allocatedSnippetIds++;
      outputPath = join(snippetScratchDir, `${snippetId}.wav`);
      if (!pathInside(snippetScratchDir, outputPath)) throw new TypeError('Invalid snippet output location.');
      const extracted = await extractSourceAudioSnippet({
        ...(payload.ffmpegPath !== undefined ? { ffmpegPath: payload.ffmpegPath } : {}),
        inputPath: payload.mediaPath, outputPath, startMs: payload.startMs, endMs: payload.endMs,
      }, runtime.commandRunner ?? nodeCommandRunner);
      const current = jobs.get(jobId);
      if (!current || current.status === 'cancelled' || snippetLifecycle !== 'open') {
        await rm(outputPath, { force: true });
        if (current && current.status !== 'cancelled') {
          jobs.set(jobId, updateJob(current, { status: 'cancelled', message: 'Source snippet lifecycle cleanup is in progress.' }));
        }
        return;
      }
      snippets.set(snippetId, { path: outputPath, lastAccess: ++snippetAccessCounter });
      if (snippets.size > 16) {
        const oldest = [...snippets.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0];
        if (oldest) await deleteSnippet(oldest[0]);
      }
      jobs.set(jobId, updateJob(current, {
        status: 'completed', message: 'Source audio snippet ready.',
        result: { snippetId, url: `/api/snippets/${snippetId}`, mimeType: extracted.mimeType, startMs: payload.startMs, endMs: payload.endMs, durationMs: extracted.durationMs },
      }));
    } catch (error) {
      if (outputPath !== undefined) await rm(outputPath, { force: true });
      const current = jobs.get(jobId);
      if (!current || current.status === 'cancelled' || snippetLifecycle !== 'open') return;
      jobs.set(jobId, updateJob(current, { status: 'failed', message: redactJobFailureMessage(error, current.payload, config, runtime) }));
    }
  };

  const finishSourceAudioSnippetJob = (jobId: string): void => {
    const work = runSourceAudioSnippetJob(jobId);
    inFlightSnippetJobs.add(work);
    void work.then(
      () => inFlightSnippetJobs.delete(work),
      () => inFlightSnippetJobs.delete(work),
    );
  };

  const drainSnippetJobs = async (): Promise<void> => {
    while (inFlightSnippetJobs.size > 0) {
      await Promise.allSettled([...inFlightSnippetJobs]);
    }
  };

  const cleanupAllScratchArtifacts = (): Promise<number> => {
    if (artifactCleanupPromise !== undefined) return artifactCleanupPromise;
    snippetLifecycle = 'cleaning';
    artifactCleanupPromise = (async () => {
      try {
        await drainSnippetJobs();
        snippets.clear();
        const deleted = await cleanupScratchDirectory(config.scratchDir);
        await mkdir(snippetScratchDir);
        return deleted;
      } finally {
        artifactCleanupPromise = undefined;
        if (snippetLifecycle === 'cleaning') snippetLifecycle = 'open';
      }
    })();
    return artifactCleanupPromise;
  };

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
        jobs.set(jobId, updateJob(current, {
          status: 'failed',
          message: redactJobFailureMessage(error, current.payload, config, runtime),
        }));
      }
    })();
  };

  const finishElevenLabsScribeJob = (jobId: string): void => {
    void (async () => {
      const queued = jobs.get(jobId);
      if (!queued || queued.status === 'cancelled') return;
      jobs.set(jobId, updateJob(queued, { status: 'running', message: 'Running ElevenLabs Scribe transcription.' }));
      try {
        const transcript = await runElevenLabsScribe(queued.payload, config, runtime, jobId);
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'completed',
          message: 'ElevenLabs Scribe transcription completed.',
          result: { transcript },
        }));
      } catch (error) {
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'failed',
          message: redactJobFailureMessage(error, current.payload, config, runtime),
        }));
      }
    })();
  };

  const finishYouTubeCaptionJob = (jobId: string): void => {
    void (async () => {
      const queued = jobs.get(jobId);
      if (!queued || queued.status === 'cancelled') return;
      jobs.set(jobId, updateJob(queued, { status: 'running', message: 'Reading public YouTube captions.' }));
      try {
        const caption = await runYouTubeCaptionRead(queued.payload, config, runtime);
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'completed',
          message: 'Public YouTube caption read completed.',
          result: { caption },
        }));
      } catch (error) {
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    })();
  };

  const finishEmbeddedSubtitleListJob = (jobId: string): void => {
    void (async () => {
      const queued = jobs.get(jobId);
      if (!queued || queued.status === 'cancelled') return;
      jobs.set(jobId, updateJob(queued, { status: 'running', message: 'Listing embedded subtitle tracks.' }));
      try {
        const listing = await runEmbeddedSubtitleList(queued.payload, config, runtime);
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'completed',
          message: 'Embedded subtitle track listing completed.',
          result: { listing },
        }));
      } catch (error) {
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'failed',
          message: redactJobFailureMessage(error, current.payload, config, runtime),
        }));
      }
    })();
  };

  const finishEmbeddedSubtitleExtractJob = (jobId: string): void => {
    void (async () => {
      const queued = jobs.get(jobId);
      if (!queued || queued.status === 'cancelled') return;
      jobs.set(jobId, updateJob(queued, { status: 'running', message: 'Extracting embedded subtitle track.' }));
      try {
        const result = await runEmbeddedSubtitleExtract(queued.payload, config, runtime, jobId);
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'completed',
          message: 'Embedded subtitle track extracted and imported as draft.',
          result: {
            extract: {
              effect: result.extract.effect,
              outputPath: '[local-scratch]',
              outputFormat: result.extract.outputFormat,
              streamIndex: result.extract.streamIndex,
            },
            track: {
              id: result.importResult.track.id,
              language: result.importResult.track.language,
              role: result.importResult.track.role,
              format: result.importResult.track.format,
              transcriptStatus: result.importResult.track.transcriptStatus,
              transcriptSourceKind: result.importResult.track.transcriptSourceKind,
              provenance: result.importResult.track.provenance,
              cueCount: result.importResult.cues.length,
            },
            cues: result.importResult.cues.map((cue) => ({
              cueIndex: cue.cueIndex,
              startMs: cue.startMs,
              endMs: cue.endMs,
              text: cue.text,
            })),
          },
        }));
      } catch (error) {
        const current = jobs.get(jobId);
        if (!current || current.status === 'cancelled') return;
        jobs.set(jobId, updateJob(current, {
          status: 'failed',
          message: redactJobFailureMessage(error, current.payload, config, runtime),
        }));
      }
    })();
  };

  const morphology = makeMorphologyService(runtime.morphology);
  morphology.warm();
  const gloss = makeGlossService(runtime.gloss);
  gloss.warm();
  dispatch = async (request, response, path, admittedBody) => {
    try {

      if (request.method === 'GET' && path === '/api/health') {
        sendJson(response, 200, { ok: true, service: SERVICE_NAME, version: SERVICE_VERSION });
        return;
      }

      if (request.method === 'GET' && path === '/api/status') {
        sendJson(response, 200, publicStatus(config, persistence, runtime.defaultModelName ?? DEFAULT_ASR_MODEL_NAME, morphology, gloss));
        return;
      }

      if (request.method === 'POST' && path === MORPHOLOGY_ROUTE) {
        let input;
        try { input = validateMorphologyRequest(admittedBody); }
        catch (error) {
          if (error instanceof MorphologyValidationError) sendJson(response, 400, { ok: false, error: error.code });
          else sendJson(response, 200, { status: 'error', code: 'internal' });
          return;
        }
        sendJson(response, 200, await morphology.analyze(input));
        return;
      }

      if (request.method === 'POST' && path === GLOSS_ROUTE) {
        let input;
        try { input = validateGlossRequest(admittedBody); }
        catch (error) {
          if (error instanceof GlossValidationError) sendJson(response, 400, { ok: false, error: error.code });
          else sendJson(response, 200, { status: 'error', code: 'internal' });
          return;
        }
        sendJson(response, 200, await gloss.lookup(input));
        return;
      }

      if (request.method === 'POST' && path === ANKI_EXPORT_ROUTE) {
        let input;
        try { input = validateAnkiExportRequest(admittedBody); }
        catch (error) {
          if (error instanceof AnkiValidationError) sendJson(response, 400, { ok: false, error: error.code });
          else sendError(response, 500, 'Anki export failed.');
          return;
        }
        let body: Buffer;
        try { body = await buildApkg(input, { scratchDir: config.scratchDir }); }
        catch { sendError(response, 500, 'Anki export failed.'); return; }
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': body.byteLength, 'cache-control': 'no-store',
          'content-disposition': 'attachment; filename="lingotorte.apkg"', 'x-content-type-options': 'nosniff' });
        response.end(body);
        return;
      }

      if (request.method === 'GET' && path === '/api/state') {
        sendJson(response, 200, { ok: true, ...persistence.loadVersionedSnapshot(), restoreCapability: 'active-audit-restore-v1' });
        return;
      }

      if (request.method === 'POST' && (path === '/api/restore/preview' || path === '/api/restore/commit')) {
        const body = objectBody(admittedBody);
        const allowed = path.endsWith('/commit') ? ['manifest', 'mode', 'expectedRevision', 'learnerAudit', 'confirmation'] : ['manifest', 'mode', 'expectedRevision', 'learnerAudit'];
        if (Object.keys(body).some(key => !allowed.includes(key)) || !('manifest' in body) || typeof body.mode !== 'string' || !['merge', 'replace-active'].includes(body.mode)) {
          sendError(response, 400, 'Invalid restore envelope.'); return;
        }
        if (body.expectedRevision === undefined) { sendError(response, 428, 'A durable state revision is required.'); return; }
        try {
          const input = body as unknown as Parameters<typeof persistence.commitRestore>[0];
          const result = path.endsWith('/preview')
            ? persistence.previewRestore(input.manifest, input.mode, input.expectedRevision, input.learnerAudit)
            : persistence.commitRestore(input);
          sendJson(response, 200, { ok: true, ...result });
        } catch (error) {
          if (error instanceof SnapshotRevisionConflictError) sendError(response, 409, error.message);
          else if (error instanceof TypeError) sendError(response, 400, 'Restore rejected: invalid input, immutable conflict, or missing confirmation.');
          else sendError(response, 500, 'Restore failed before commit.');
        }
        return;
      }

      if (request.method === 'PUT' && path === '/api/state') {
        const body = objectBody(admittedBody);
        if (body.expectedRevision === undefined) {
          sendError(response, 428, 'A durable state revision is required. Read state before saving.');
          return;
        }
        if (typeof body.expectedRevision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(body.expectedRevision)) {
          sendError(response, 400, 'Invalid durable state revision.');
          return;
        }
        const savedAt = new Date().toISOString();
        try {
          const revision = persistence.saveSnapshot(body.snapshot as LocalStoreSnapshot, savedAt, body.expectedRevision);
          sendJson(response, 200, { ok: true, revision, savedAt, persistence: persistence.status() });
        } catch (error) {
          if (error instanceof SnapshotRevisionConflictError) sendError(response, 409, error.message);
          else throw error;
        }
        return;
      }

      if (request.method === 'POST' && path === '/api/jobs') {
        const body = objectBody(admittedBody);
        const kind = jobKind(body.kind);
        if (kind === 'source-audio-snippet' && snippetLifecycle !== 'open') {
          sendError(response, 409, 'Source snippet lifecycle cleanup is in progress.');
          return;
        }
        const now = new Date().toISOString();
        const status: LocalJobStatus = kind === 'noop' ? 'completed' : 'queued';
        const rawPayload = body.payload ?? {};
        const payload = kind === 'local-transcription' ? localTranscriptionPayload(rawPayload, runtime)
          : kind === 'elevenlabs-scribe' ? elevenLabsScribePayload(rawPayload, runtime)
          : kind === 'embedded-subtitle-list' ? embeddedSubtitleListPayload(rawPayload, runtime)
          : kind === 'embedded-subtitle-extract' ? embeddedSubtitleExtractPayload(rawPayload, runtime)
          : kind === 'source-audio-snippet' ? sourceAudioSnippetPayload(rawPayload, runtime) : rawPayload;
        if (['local-transcription', 'elevenlabs-scribe', 'embedded-subtitle-list', 'embedded-subtitle-extract', 'source-audio-snippet'].includes(kind)) {
          const mediaPath = (payload as { mediaPath: string }).mediaPath;
          assertMediaOutsideScratch(mediaPath, configuredScratchDir);
          assertReadableNativeFile(mediaPath);
        }
        allocatedJobIds++;
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
        if (kind === 'elevenlabs-scribe') finishElevenLabsScribeJob(job.id);
        if (kind === 'youtube-caption') finishYouTubeCaptionJob(job.id);
        if (kind === 'embedded-subtitle-list') finishEmbeddedSubtitleListJob(job.id);
        if (kind === 'embedded-subtitle-extract') finishEmbeddedSubtitleExtractJob(job.id);
        if (kind === 'source-audio-snippet') finishSourceAudioSnippetJob(job.id);
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

      const snippetMatch = /^\/api\/snippets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(path);
      if (snippetMatch && request.method === 'GET') {
        const entry = snippets.get(snippetMatch[1]!);
        if (!entry || !pathInside(snippetScratchDir, entry.path)) { sendError(response, 404, 'Source snippet not found.'); return; }
        entry.lastAccess = ++snippetAccessCounter;
        const body = await readFile(entry.path);
        response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': body.byteLength, 'cache-control': 'no-store' });
        response.end(body);
        return;
      }
      if (snippetMatch && request.method === 'DELETE') {
        if (!await deleteSnippet(snippetMatch[1]!)) { sendError(response, 404, 'Source snippet not found.'); return; }
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === 'POST' && path === '/api/artifacts/cleanup') {
        const deletedFiles = await cleanupAllScratchArtifacts();
        sendJson(response, 200, { ok: true, deletedFiles });
        return;
      }

      sendError(response, 404, 'Route not found.');
    } catch (error) {
      sendError(response, 400, error instanceof TypeError ? error.message : 'Local operation failed; paths and tool diagnostics are redacted.');
    }
  };

  await runtime.startupCheckpoint?.('resources-ready', (server.address() as { port: number } | null)?.port ?? config.port);
  if (!await deliveryReady()) throw new TypeError('Private delivery is unavailable.');
  if (config.port !== 0) await listen();
  admissionReady = true;

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new TypeError('Unable to resolve local service address.');
  }
  const origin = config.publicOrigins?.[0] ?? `http://${displayHostname}${address.port === 80 ? '' : `:${address.port}`}`;
  const runtimeConfig: LocalServiceConfig = { ...config, port: address.port };

  return {
    origin,
    config: runtimeConfig,
    async close() {
      admissionReady = false;
      snippetLifecycle = 'closing';
      const closed = new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) rejectPromise(error);
          else resolvePromise();
        });
      });
      for (const socket of lingeringSockets) socket.destroy();
      await closed;
      if (artifactCleanupPromise !== undefined) await artifactCleanupPromise;
      await drainSnippetJobs();
      snippets.clear();
      try { await cleanupScratchDirectory(snippetScratchDir); }
      finally { gloss.close(); persistence.close(); }
    },
  };
  } catch (error) {
    admissionReady = false;
    server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolvePromise => server.close(() => resolvePromise()));
    openedPersistence?.close();
    if (startupScratch) await rm(startupScratch, { recursive: true, force: true });
    throw error;
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): LocalServiceConfig {
  const paths = mutablePathsFromEnv(env, nativePathPolicy(process.platform).platform, homedir());
  return {
    host: env.LINGOTORTE_HOST ?? '127.0.0.1',
    port: /^(0|[1-9][0-9]{0,4})$/.test(env.LINGOTORTE_PORT ?? '5174') ? Number(env.LINGOTORTE_PORT ?? '5174') : NaN,
    ...(env.LINGOTORTE_SERVICE_HOSTNAME ? { serviceHostname: env.LINGOTORTE_SERVICE_HOSTNAME } : {}),
    ...(env.LINGOTORTE_PUBLIC_ORIGINS !== undefined ? { publicOrigins: env.LINGOTORTE_PUBLIC_ORIGINS.split(',') } : {}),
    ...(env.LINGOTORTE_UI_ORIGINS !== undefined ? { uiOrigins: env.LINGOTORTE_UI_ORIGINS.split(',') } : {}),
    ...(env.LINGOTORTE_HEALTH_AUTHORITY ? { healthAuthority: env.LINGOTORTE_HEALTH_AUTHORITY } : {}),
    ...(env.LINGOTORTE_PRIVATE_NETWORK_ORIGINS !== undefined ? { privateNetworkOrigins: env.LINGOTORTE_PRIVATE_NETWORK_ORIGINS.split(',') } : {}),
    ...paths,
    allowOnlineProviders: env.LINGOTORTE_ALLOW_ONLINE_PROVIDERS === 'true',
    ...(env.ELEVENLABS_API_KEY !== undefined ? { elevenLabsApiKey: env.ELEVENLABS_API_KEY } : {}),
    ...(env.ELEVENLABS_BASE_URL !== undefined ? { elevenLabsBaseUrl: env.ELEVENLABS_BASE_URL } : {}),
  };
}

export async function startFromCli(): Promise<void> {
  const defaultModelName = resolveDefaultAsrModelName(process.env.LINGOTORTE_ASR_MODEL);
  const config = configFromEnv();
  const mode = process.env.LINGOTORTE_PRIVATE_DELIVERY ?? 'tty';
  if (!['tty', 'socket'].includes(mode)) throw new TypeError('Invalid private delivery mode.');
  if (mode === 'socket' && !config.publicOrigins?.length) throw new TypeError('Docker requires explicit public origins.');
  const delivery = mode === 'socket' ? await socketDelivery() : await nativeTerminalDelivery();
  let service: RunningLingotorteLocalService;
  const gloss: GlossRuntimeOptions = {
    // An invalid configured path degrades to not-installed rather than blocking startup.
    ...(() => { try { return { dbPath: glossDbPathFromEnv(process.env, nativePathPolicy(process.platform).platform, homedir()) }; } catch { return {}; } })(),
    mode: process.env.LINGOTORTE_GLOSS === 'disabled' ? 'disabled' : 'enabled',
  };
  try { service = await startLingotorteLocalService(config, { defaultModelName, gloss, ...delivery }); }
  catch (error) { await delivery.close(); throw error; }
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
      defaultAsrModelName: defaultModelName,
      allowOnlineProviders: service.config.allowOnlineProviders,
    },
    providers: {
      elevenLabsScribe: {
        onlineProvidersAllowed: service.config.allowOnlineProviders,
        apiKeyPresent: (service.config.elevenLabsApiKey?.trim().length ?? 0) > 0,
        ready: service.config.allowOnlineProviders && (service.config.elevenLabsApiKey?.trim().length ?? 0) > 0,
      },
    },
  }));
  const close = async () => {
    await service.close();
    await delivery.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startFromCli().catch((error: unknown) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof TypeError ? error.message : 'Local service startup failed; diagnostic paths redacted.' }));
    process.exit(1);
  });
}
