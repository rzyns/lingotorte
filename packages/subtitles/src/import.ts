import type { Cue, SubtitleTrack, SubtitleFormat } from '@lingotorte/domain';
import { makeCue, makeSubtitleTrack } from '@lingotorte/domain';
import { inferSubtitleFormat, normalizeCueText, readLocalSubtitle, sha256Text, sourceKindFromPath } from '@lingotorte/storage';

export type ParsedSubtitle = Readonly<{
  track: SubtitleTrack;
  cues: Cue[];
}>;

export type ImportSubtitleInput = Readonly<{
  mediaId: string;
  language: string;
  role: 'target' | 'native' | 'other';
  path: string;
  isActive?: boolean;
}>;

const srtTimestampPattern = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/;
const vttTimestampPattern = /^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})$/;
const assTimestampPattern = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{2})$/;

function parseSrtTimestamp(value: string): number {
  const match = srtTimestampPattern.exec(value);
  if (!match) {
    throw new TypeError(`Invalid SRT timestamp: ${value}`);
  }
  const hours = match[1]!;
  const minutes = match[2]!;
  const seconds = match[3]!;
  const millis = match[4]!;
  return (
    Number.parseInt(hours, 10) * 3_600_000 +
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1_000 +
    Number.parseInt(millis, 10)
  );
}

function parseVttTimestamp(value: string): number {
  const match = vttTimestampPattern.exec(value);
  if (!match) {
    throw new TypeError(`Invalid VTT timestamp: ${value}`);
  }
  const hours = match[1] ?? '0';
  const minutes = match[2]!;
  const seconds = match[3]!;
  const millis = match[4]!;
  return (
    Number.parseInt(hours, 10) * 3_600_000 +
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1_000 +
    Number.parseInt(millis, 10)
  );
}

function parseAssTimestamp(value: string): number {
  const match = assTimestampPattern.exec(value);
  if (!match) {
    throw new TypeError(`Invalid ASS/SSA timestamp: ${value}`);
  }
  const hours = match[1]!;
  const minutes = match[2]!;
  const seconds = match[3]!;
  const centis = match[4]!;
  return (
    Number.parseInt(hours, 10) * 3_600_000 +
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1_000 +
    Number.parseInt(centis, 10) * 10
  );
}

function stripAssOverrideTags(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

function stripAssLineBreaks(text: string): string {
  // \\N, \\n, \\h are ASS/SSA explicit line breaks/soft spaces.
  return text.replace(/\\[Nn]/g, ' ').replace(/\\h/g, ' ');
}

function parseAssText(raw: string): string {
  return normalizeCueText(stripAssLineBreaks(stripAssOverrideTags(raw)));
}

type AssSection = Readonly<{
  name: string;
  lines: string[];
}>;

type AssCue = Readonly<{
  cueIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  normalizedText: string;
}>;

function splitAssSections(text: string): AssSection[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const sections: AssSection[] = [];
  let current: AssSection | null = null;
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      if (current) sections.push(current);
      current = { name: sectionMatch[1]!, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function findAssEventsSection(sections: readonly AssSection[]): AssSection {
  const events = sections.find((s) => s.name.toLowerCase() === 'events');
  if (!events) {
    throw new TypeError('ASS/SSA file missing [Events] section');
  }
  return events;
}

function parseAssDialogueLine(line: string, formatHeader: string, index: number): AssCue | null {
  const headerMatch = /^Format:\s*(.+)$/i.exec(formatHeader);
  if (!headerMatch) {
    throw new TypeError('ASS/SSA [Events] section missing Format header');
  }
  const fieldNames = headerMatch[1]!.split(',').map((f) => f.trim().toLowerCase());
  const startIndex = fieldNames.indexOf('start');
  const endIndex = fieldNames.indexOf('end');
  const textIndex = fieldNames.indexOf('text');
  if (startIndex < 0 || endIndex < 0 || textIndex < 0) {
    throw new TypeError('ASS/SSA Events Format must include Start, End, and Text fields');
  }

  const dialogueMatch = /^Dialogue:\s*/i.exec(line);
  if (!dialogueMatch) return null;
  const rawFields = line.slice(dialogueMatch[0].length).split(',');
  if (rawFields.length < fieldNames.length) {
    throw new TypeError(`ASS/SSA Dialogue line ${index + 1} has too few fields`);
  }
  const startMs = parseAssTimestamp(rawFields[startIndex]!.trim());
  const endMs = parseAssTimestamp(rawFields[endIndex]!.trim());
  if (endMs <= startMs) {
    throw new TypeError(`ASS/SSA cue ${index + 1} end time must be after start time`);
  }
  const rawText = rawFields.slice(textIndex).join(',').trim();
  const text = parseAssText(rawText);
  if (text.length === 0) {
    throw new TypeError(`ASS/SSA cue ${index + 1} has empty cue text after stripping tags`);
  }
  return {
    cueIndex: index + 1,
    startMs,
    endMs,
    text,
    normalizedText: text.toLowerCase(),
  };
}

function parseAssCues(text: string): AssCue[] {
  const sections = splitAssSections(text);
  if (sections.length === 0) {
    throw new TypeError('ASS/SSA file has no sections');
  }
  const events = findAssEventsSection(sections);
  const formatHeader = events.lines.find((line) => /^Format:/i.test(line));
  if (!formatHeader) {
    throw new TypeError('ASS/SSA [Events] section missing Format header');
  }
  const cues: AssCue[] = [];
  for (const line of events.lines) {
    if (!/^Dialogue:/i.test(line)) continue;
    const cue = parseAssDialogueLine(line, formatHeader, cues.length);
    if (cue) cues.push(cue);
  }
  if (cues.length === 0) {
    throw new TypeError('ASS/SSA file has no Dialogue lines');
  }
  return cues;
}

function validateCueOrdering(cues: readonly Cue[], formatName: string): void {
  for (let i = 1; i < cues.length; i++) {
    const prev = cues[i - 1]!;
    const curr = cues[i]!;
    if (curr.startMs < prev.endMs) {
      throw new TypeError(
        `${formatName} cue ${curr.cueIndex} starts at ${curr.startMs}ms before previous cue ${prev.cueIndex} ends at ${prev.endMs}ms`,
      );
    }
  }
}

function parseSrtBlock(block: string, index: number): Omit<Cue, 'id' | 'trackId' | 'createdAt'> {
  const lines = block.split('\n').map((line) => line.trim());
  // First line is the numeric cue index. If missing or malformed, we use the provided index.
  const firstLine = lines[0] ?? '';
  if (!/^\d+$/.test(firstLine)) {
    throw new TypeError(`SRT block ${index} missing numeric cue id`);
  }
  const cueIndex = Number.parseInt(firstLine, 10);
  if (lines.length < 2) {
    throw new TypeError(`SRT block ${cueIndex} missing timing or text`);
  }
  const timingLine = lines[1] ?? '';
  const timingMatch = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/.exec(timingLine);
  if (!timingMatch) {
    throw new TypeError(`SRT block ${cueIndex} has invalid timing line: ${timingLine}`);
  }
  const startMs = parseSrtTimestamp(timingMatch[1]!);
  const endMs = parseSrtTimestamp(timingMatch[2]!);
  if (endMs <= startMs) {
    throw new TypeError(`SRT block ${cueIndex} end time must be after start time`);
  }
  const rawText = lines.slice(2).join('\n');
  const text = normalizeCueText(rawText);
  if (text.length === 0) {
    throw new TypeError(`SRT block ${cueIndex} has empty cue text`);
  }
  return {
    cueIndex,
    startMs,
    endMs,
    text,
    normalizedText: text.toLowerCase(),
    textSha256: `sha256:0000000000000000000000000000000000000000000000000000000000000000` as const,
  };
}

export async function parseSrt(path: string, mediaId: string, language: string, role: 'target' | 'native' | 'other', isActive = true): Promise<ParsedSubtitle> {
  const { text, sha256 } = await readLocalSubtitle(path);
  const format: SubtitleFormat = inferSubtitleFormat(path);
  const track = makeSubtitleTrack({
    mediaId,
    language,
    role,
    format,
    sourceKind: sourceKindFromPath(path),
    sourcePath: path,
    contentSha256: sha256,
    isActive,
  });

  const blocks = splitSrtBlocks(text);
  const cueDtos = blocks.map((block, index) => parseSrtBlock(block, index));
  const cues: Cue[] = [];
  for (const dto of cueDtos) {
    const textSha256 = await sha256Text(dto.text);
    cues.push(
      makeCue({
        trackId: track.id,
        cueIndex: dto.cueIndex,
        startMs: dto.startMs,
        endMs: dto.endMs,
        text: dto.text,
        normalizedText: dto.normalizedText,
        textSha256,
      }),
    );
  }

  // Validate strict monotonic ordering and non-overlap for the MVP parser.
  validateCueOrdering(cues, 'SRT');

  return { track, cues };
}

function splitSrtBlocks(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function parseVttBlock(block: string, index: number): Omit<Cue, 'id' | 'trackId' | 'createdAt'> {
  const lines = block.split('\n').map((line) => line.trim());
  let lineIndex = 0;
  let cueIndex = index;

  const firstLine = lines[0] ?? '';
  if (/^\d+$/.test(firstLine)) {
    cueIndex = Number.parseInt(firstLine, 10);
    lineIndex = 1;
  }

  const timingLine = lines[lineIndex] ?? '';
  const timingMatch = /^(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})/.exec(timingLine);
  if (!timingMatch) {
    throw new TypeError(`VTT block ${index} has invalid timing line: ${timingLine}`);
  }
  const timingParts = timingMatch[0]!.split(/\s*-->\s*/);
  const startMs = parseVttTimestamp(timingParts[0]!);
  const endMs = parseVttTimestamp(timingParts[1]!);
  if (endMs <= startMs) {
    throw new TypeError(`VTT block ${index} end time must be after start time`);
  }

  const rawText = lines.slice(lineIndex + 1).join('\n');
  const text = normalizeCueText(rawText);
  if (text.length === 0) {
    throw new TypeError(`VTT block ${index} has empty cue text`);
  }
  return {
    cueIndex,
    startMs,
    endMs,
    text,
    normalizedText: text.toLowerCase(),
    textSha256: `sha256:0000000000000000000000000000000000000000000000000000000000000000` as const,
  };
}

export async function parseVtt(path: string, mediaId: string, language: string, role: 'target' | 'native' | 'other', isActive = true): Promise<ParsedSubtitle> {
  const { text, sha256 } = await readLocalSubtitle(path);
  const format: SubtitleFormat = 'vtt';
  const track = makeSubtitleTrack({
    mediaId,
    language,
    role,
    format,
    sourceKind: sourceKindFromPath(path),
    sourcePath: path,
    contentSha256: sha256,
    isActive,
  });

  const blocks = splitVttBlocks(text);
  const cueDtos = blocks.map((block, index) => parseVttBlock(block, index));
  const cues: Cue[] = [];
  for (const dto of cueDtos) {
    const textSha256 = await sha256Text(dto.text);
    cues.push(
      makeCue({
        trackId: track.id,
        cueIndex: dto.cueIndex,
        startMs: dto.startMs,
        endMs: dto.endMs,
        text: dto.text,
        normalizedText: dto.normalizedText,
        textSha256,
      }),
    );
  }
  // Validate strict monotonic ordering and non-overlap for the MVP parser.
  validateCueOrdering(cues, 'VTT');

  return { track, cues };
}

function splitVttBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized.startsWith('WEBVTT')) {
    throw new TypeError('VTT file must start with WEBVTT header');
  }
  const body = normalized.slice('WEBVTT'.length).trim();
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

export async function parseAss(path: string, mediaId: string, language: string, role: 'target' | 'native' | 'other', isActive = true): Promise<ParsedSubtitle> {
  const { text, sha256 } = await readLocalSubtitle(path);
  const format: SubtitleFormat = 'ass';
  const track = makeSubtitleTrack({
    mediaId,
    language,
    role,
    format,
    sourceKind: sourceKindFromPath(path),
    sourcePath: path,
    contentSha256: sha256,
    isActive,
  });

  const assCues = parseAssCues(text);
  const cues: Cue[] = [];
  for (const dto of assCues) {
    const textSha256 = await sha256Text(dto.text);
    cues.push(
      makeCue({
        trackId: track.id,
        cueIndex: dto.cueIndex,
        startMs: dto.startMs,
        endMs: dto.endMs,
        text: dto.text,
        normalizedText: dto.normalizedText,
        textSha256,
      }),
    );
  }

  validateCueOrdering(cues, 'ASS/SSA');

  return { track, cues };
}

export async function importSubtitle(input: ImportSubtitleInput): Promise<ParsedSubtitle> {
  const format = inferSubtitleFormat(input.path);
  switch (format) {
    case 'srt':
      return parseSrt(input.path, input.mediaId, input.language, input.role, input.isActive ?? true);
    case 'vtt':
      return parseVtt(input.path, input.mediaId, input.language, input.role, input.isActive ?? true);
    case 'ass':
      return parseAss(input.path, input.mediaId, input.language, input.role, input.isActive ?? true);
    case 'json':
      return importTranscriptJson(input);
    default:
      throw new TypeError(`Unsupported subtitle format in core-backend skeleton: ${format}`);
  }
}

export type TranscriptCueJson = Readonly<{
  cueId: string;
  startMs: number;
  endMs: number;
  targetText: string;
  nativeText?: string;
}>;

export type TranscriptJson = Readonly<{
  schemaVersion: 'lingotorte.fixture-transcript.v1';
  mediaId: string;
  targetTrackId: string;
  nativeTrackId?: string;
  cues: readonly TranscriptCueJson[];
}>;

export async function importTranscriptJson(input: ImportSubtitleInput): Promise<ParsedSubtitle> {
  const { text, sha256 } = await readLocalSubtitle(input.path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new TypeError(`Invalid JSON transcript at ${input.path}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`Transcript JSON must be an object at ${input.path}`);
  }
  const record = parsed as Record<string, unknown>;
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== 'lingotorte.fixture-transcript.v1') {
    throw new TypeError(`Unsupported transcript schema version: ${schemaVersion}`);
  }
  const cuesRaw = record.cues;
  if (!Array.isArray(cuesRaw)) {
    throw new TypeError(`Transcript JSON missing cues array at ${input.path}`);
  }

  const track = makeSubtitleTrack({
    mediaId: input.mediaId,
    language: input.language,
    role: input.role,
    format: 'json',
    sourceKind: sourceKindFromPath(input.path),
    sourcePath: input.path,
    contentSha256: sha256,
    isActive: input.isActive ?? true,
  });

  const cues: Cue[] = [];
  let cueIndex = 0;
  for (const cueRaw of cuesRaw) {
    if (typeof cueRaw !== 'object' || cueRaw === null || Array.isArray(cueRaw)) {
      throw new TypeError(`Transcript cue must be an object in ${input.path}`);
    }
    const cueRecord = cueRaw as Record<string, unknown>;
    const startMs = Number(cueRecord.startMs);
    const endMs = Number(cueRecord.endMs);
    const targetText = String(cueRecord.targetText ?? '');
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new TypeError(`Transcript cue has invalid timing in ${input.path}`);
    }
    const text = normalizeCueText(targetText);
    if (text.length === 0) {
      throw new TypeError(`Transcript cue has empty target text in ${input.path}`);
    }
    const textSha256 = await sha256Text(text);
    cues.push(
      makeCue({
        trackId: track.id,
        cueIndex,
        startMs,
        endMs,
        text,
        normalizedText: text.toLowerCase(),
        textSha256,
      }),
    );
    cueIndex += 1;
  }

  return { track, cues };
}
