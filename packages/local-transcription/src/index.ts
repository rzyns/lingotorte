import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, normalize } from 'node:path';

export type CommandRunnerOptions = Readonly<{
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}>;

export type CommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandRunnerOptions,
) => Promise<CommandResult>;

export const nodeCommandRunner: CommandRunner = async (command, args, options) => new Promise((resolve) => {
  execFile(command, [...args], { cwd: options.cwd, env: options.env }, (error, stdout, stderr) => {
    const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
    const errorMessage = error instanceof Error ? error.message : '';
    resolve({ exitCode, stdout, stderr: stderr || errorMessage });
  });
});

export type FfmpegAudioExtractionInput = Readonly<{
  ffmpegPath?: string;
  inputPath: string;
  outputPath: string;
}>;

export type FfmpegAudioExtractionResult = Readonly<{
  effect: 'audio-extracted';
  audioPath: string;
  sampleRateHz: 16000;
  channels: 1;
  codec: 'pcm_s16le';
}>;

export type TranscriptWordTimingSourceKind = 'provider-word-timing' | 'forced-alignment' | 'manual-edit';

export type LocalTranscriptWord = Readonly<{
  wordIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  startMs: number;
  endMs: number;
  confidence?: number;
  speakerId?: string;
  sourceKind?: TranscriptWordTimingSourceKind;
}>;

export type LocalTranscriptSegment = Readonly<{
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  words?: readonly LocalTranscriptWord[];
}>;

export type LocalAsrTranscriptionResult = Readonly<{
  engine: string;
  modelName: string;
  modelVersion?: string;
  language: string;
  segments: readonly LocalTranscriptSegment[];
}>;

export type FasterWhisperTranscriptionInput = Readonly<{
  pythonPath?: string;
  scriptPath: string;
  audioPath: string;
  language: string;
  modelName: string;
  device?: 'cpu' | 'cuda' | string;
  computeType?: string;
}>;

export type WhisperXAlignmentInput = Readonly<{
  pythonPath?: string;
  scriptPath: string;
  audioPath: string;
  transcriptJsonPath: string;
  language: string;
  device?: 'cpu' | 'cuda' | string;
}>;

export type ElevenLabsScribeTranscriptionInput = Readonly<{
  allowOnlineProvider: boolean;
  apiKey: string;
  audioPath: string;
  audioBytes?: Uint8Array;
  language?: string;
  baseUrl?: string;
  modelId?: 'scribe_v2' | string;
}>;

export type ElevenLabsSpeechToTextRequest = Readonly<{
  url: string;
  method: 'POST';
  headers: Readonly<Record<string, string>>;
  form: readonly Readonly<{ name: string; value: string | Uint8Array; filename?: string; contentType?: string }>[];
}>;

export type ElevenLabsHttpResponse = Readonly<{
  status: number;
  json: unknown;
}>;

export type ElevenLabsHttpClient = (request: ElevenLabsSpeechToTextRequest) => Promise<ElevenLabsHttpResponse>;

function requireAbsolutePath(path: string, label: string): string {
  const normalized = normalize(path);
  if (!isAbsolute(normalized)) {
    throw new TypeError(`${label} must be an absolute local path.`);
  }
  return normalized;
}

function roundMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function confidenceFromAverageLogprob(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return roundConfidence(Math.exp(value));
}

function confidenceFromProbability(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return roundConfidence(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function asOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return asString(value, label);
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function asOptionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return asNumber(value, label);
}

function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }
  return value;
}

function findWordSpan(segmentText: string, wordText: string, searchFrom: number): Readonly<{ charStart: number; charEnd: number }> {
  const charStart = segmentText.indexOf(wordText, searchFrom);
  if (charStart >= 0) return { charStart, charEnd: charStart + wordText.length };
  return { charStart: searchFrom, charEnd: searchFrom + wordText.length };
}

function audioContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'application/octet-stream';
}

function normalizeElevenLabsScribePayload(payload: unknown, input: { modelId: string; fallbackLanguage?: string }): LocalAsrTranscriptionResult {
  const root = asRecord(payload, 'ElevenLabs Scribe JSON');
  const transcriptText = asString(root['text'], 'ElevenLabs Scribe text').trim();
  let cursor = 0;
  const words = asArray(root['words'], 'ElevenLabs Scribe words')
    .map((wordValue, rawIndex) => ({ wordValue, rawIndex }))
    .filter(({ wordValue }) => {
      const word = asRecord(wordValue, 'ElevenLabs Scribe word');
      return word['type'] === 'word';
    })
    .map(({ wordValue }, wordIndex) => {
      const word = asRecord(wordValue, 'ElevenLabs Scribe word');
      const wordText = asString(word['text'], 'ElevenLabs Scribe word text').trim();
      const span = findWordSpan(transcriptText, wordText, cursor);
      const confidence = confidenceFromAverageLogprob(asOptionalNumber(word['logprob'], 'ElevenLabs Scribe word logprob'));
      const speakerId = asOptionalString(word['speaker_id'], 'ElevenLabs Scribe word speaker_id');
      cursor = span.charEnd + 1;
      return {
        wordIndex,
        text: wordText,
        charStart: span.charStart,
        charEnd: span.charEnd,
        startMs: roundMs(asNumber(word['start'], 'ElevenLabs Scribe word start')),
        endMs: roundMs(asNumber(word['end'], 'ElevenLabs Scribe word end')),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(speakerId !== undefined ? { speakerId } : {}),
        sourceKind: 'provider-word-timing' as const,
      };
    });
  const segmentStartMs = words.length > 0 ? Math.min(...words.map((word) => word.startMs)) : 0;
  const segmentEndMs = words.length > 0 ? Math.max(...words.map((word) => word.endMs)) : 0;
  const language = asOptionalString(root['language_code'], 'ElevenLabs Scribe language_code') ?? input.fallbackLanguage ?? 'und';
  const segmentConfidence = confidenceFromProbability(asOptionalNumber(root['language_probability'], 'ElevenLabs Scribe language_probability'));
  return {
    engine: 'elevenlabs',
    modelName: input.modelId,
    language,
    segments: [{
      startMs: segmentStartMs,
      endMs: segmentEndMs,
      text: transcriptText,
      ...(segmentConfidence !== undefined ? { confidence: segmentConfidence } : {}),
      words,
    }],
  };
}

export const elevenLabsFetchHttpClient: ElevenLabsHttpClient = async (request) => {
  const formData = new FormData();
  for (const part of request.form) {
    if (typeof part.value === 'string') {
      formData.append(part.name, part.value);
    } else {
      const bytes = Uint8Array.from(part.value);
      const blobOptions = part.contentType !== undefined ? { type: part.contentType } : {};
      formData.append(part.name, new Blob([bytes.buffer], blobOptions), part.filename);
    }
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: formData,
  });
  return {
    status: response.status,
    json: await response.json() as unknown,
  };
};

function normalizeTranscriptPayload(payload: unknown, options: {
  label: string;
  wordConfidenceField: 'probability' | 'score';
  wordSourceKind?: TranscriptWordTimingSourceKind;
}): LocalAsrTranscriptionResult {
  const root = asRecord(payload, `${options.label} JSON`);
  const segments = asArray(root['segments'], `${options.label} segments`).map((segmentValue) => {
    const segment = asRecord(segmentValue, `${options.label} segment`);
    const text = asString(segment['text'], `${options.label} segment text`).trim();
    let cursor = 0;
    const words = segment['words'] === undefined ? undefined : asArray(segment['words'], `${options.label} words`).map((wordValue, wordIndex) => {
      const word = asRecord(wordValue, `${options.label} word`);
      const wordText = asString(word['word'], `${options.label} word text`).trim();
      const span = findWordSpan(text, wordText, cursor);
      const confidence = confidenceFromProbability(asOptionalNumber(word[options.wordConfidenceField], `${options.label} word ${options.wordConfidenceField}`));
      const speakerId = asOptionalString(word['speaker'], `${options.label} word speaker`);
      cursor = span.charEnd + 1;
      return {
        wordIndex,
        text: wordText,
        charStart: span.charStart,
        charEnd: span.charEnd,
        startMs: roundMs(asNumber(word['start'], `${options.label} word start`)),
        endMs: roundMs(asNumber(word['end'], `${options.label} word end`)),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(speakerId !== undefined ? { speakerId } : {}),
        ...(options.wordSourceKind !== undefined ? { sourceKind: options.wordSourceKind } : {}),
      };
    });
    const confidence = confidenceFromAverageLogprob(asOptionalNumber(segment['avg_logprob'], `${options.label} segment avg_logprob`));
    return {
      startMs: roundMs(asNumber(segment['start'], `${options.label} segment start`)),
      endMs: roundMs(asNumber(segment['end'], `${options.label} segment end`)),
      text,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(words !== undefined ? { words } : {}),
    };
  });
  const modelVersion = asOptionalString(root['model_version'], `${options.label} model_version`);
  return {
    engine: asString(root['engine'], `${options.label} engine`),
    modelName: asString(root['model_name'], `${options.label} model_name`),
    ...(modelVersion !== undefined ? { modelVersion } : {}),
    language: asString(root['language'], `${options.label} language`),
    segments,
  };
}

export async function extractAudioWithFfmpeg(
  input: FfmpegAudioExtractionInput,
  runner: CommandRunner = nodeCommandRunner,
): Promise<FfmpegAudioExtractionResult> {
  const inputPath = requireAbsolutePath(input.inputPath, 'ffmpeg input path');
  const outputPath = requireAbsolutePath(input.outputPath, 'ffmpeg output path');
  if (inputPath === outputPath) {
    throw new TypeError('ffmpeg audio extraction output path must differ from the input media path.');
  }
  const ffmpegPath = input.ffmpegPath ?? 'ffmpeg';
  const args = [
    '-hide_banner',
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    outputPath,
  ];
  const result = await runner(ffmpegPath, args, { cwd: dirname(outputPath) });
  if (result.exitCode !== 0) {
    throw new Error(`ffmpeg audio extraction failed with exit code ${result.exitCode}: ${result.stderr.trim()}`);
  }
  return {
    effect: 'audio-extracted',
    audioPath: outputPath,
    sampleRateHz: 16000,
    channels: 1,
    codec: 'pcm_s16le',
  };
}

export async function transcribeWithFasterWhisper(
  input: FasterWhisperTranscriptionInput,
  runner: CommandRunner = nodeCommandRunner,
): Promise<LocalAsrTranscriptionResult> {
  const scriptPath = requireAbsolutePath(input.scriptPath, 'faster-whisper script path');
  const audioPath = requireAbsolutePath(input.audioPath, 'faster-whisper audio path');
  const pythonPath = input.pythonPath ?? 'python3';
  const args = [
    scriptPath,
    '--audio',
    audioPath,
    '--language',
    input.language,
    '--model',
    input.modelName,
    '--device',
    input.device ?? 'cpu',
    '--compute-type',
    input.computeType ?? 'int8',
    '--word-timestamps',
  ];
  const result = await runner(pythonPath, args, { cwd: dirname(scriptPath) });
  if (result.exitCode !== 0) {
    throw new Error(`faster-whisper transcription failed with exit code ${result.exitCode}: ${result.stderr.trim()}`);
  }
  return normalizeTranscriptPayload(JSON.parse(result.stdout) as unknown, {
    label: 'faster-whisper',
    wordConfidenceField: 'probability',
  });
}

export async function transcribeWithElevenLabsScribe(
  input: ElevenLabsScribeTranscriptionInput,
  httpClient: ElevenLabsHttpClient = elevenLabsFetchHttpClient,
): Promise<LocalAsrTranscriptionResult> {
  if (!input.allowOnlineProvider) {
    throw new TypeError('ElevenLabs Scribe transcription disabled: explicit provider consent is required.');
  }
  if (input.apiKey.trim().length === 0) {
    throw new TypeError('ElevenLabs Scribe transcription requires a non-empty API key.');
  }
  const audioPath = requireAbsolutePath(input.audioPath, 'ElevenLabs Scribe audio path');
  const audioBytes = input.audioBytes ?? await readFile(audioPath);
  const modelId = input.modelId ?? 'scribe_v2';
  const baseUrl = (input.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/+$/, '');
  const form: ElevenLabsSpeechToTextRequest['form'] = [
    { name: 'file', value: audioBytes, filename: basename(audioPath), contentType: audioContentType(audioPath) },
    { name: 'model_id', value: modelId },
    { name: 'timestamps_granularity', value: 'word' },
    { name: 'diarize', value: 'true' },
    ...(input.language !== undefined ? [{ name: 'language_code', value: input.language }] : []),
  ];
  const response = await httpClient({
    url: `${baseUrl}/v1/speech-to-text`,
    method: 'POST',
    headers: { 'xi-api-key': input.apiKey },
    form,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ElevenLabs Scribe transcription failed with HTTP status ${response.status}.`);
  }
  return normalizeElevenLabsScribePayload(response.json, {
    modelId,
    ...(input.language !== undefined ? { fallbackLanguage: input.language } : {}),
  });
}

export async function alignWordsWithWhisperX(
  input: WhisperXAlignmentInput,
  runner: CommandRunner = nodeCommandRunner,
): Promise<LocalAsrTranscriptionResult> {
  const scriptPath = requireAbsolutePath(input.scriptPath, 'WhisperX alignment script path');
  const audioPath = requireAbsolutePath(input.audioPath, 'WhisperX alignment audio path');
  const transcriptJsonPath = requireAbsolutePath(input.transcriptJsonPath, 'WhisperX transcript JSON path');
  const pythonPath = input.pythonPath ?? 'python3';
  const args = [
    scriptPath,
    '--audio',
    audioPath,
    '--transcript-json',
    transcriptJsonPath,
    '--language',
    input.language,
    '--device',
    input.device ?? 'cpu',
  ];
  const result = await runner(pythonPath, args, { cwd: dirname(scriptPath) });
  if (result.exitCode !== 0) {
    throw new Error(`WhisperX alignment failed with exit code ${result.exitCode}: ${result.stderr.trim()}`);
  }
  return normalizeTranscriptPayload(JSON.parse(result.stdout) as unknown, {
    label: 'WhisperX',
    wordConfidenceField: 'score',
    wordSourceKind: 'forced-alignment',
  });
}
