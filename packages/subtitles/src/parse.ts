import type { SubtitleFormat } from '@lingotorte/domain';
import { normalizeCueText } from '@lingotorte/domain';

export { normalizeCueText } from '@lingotorte/domain';

export type ParsedSubtitleFormat = Exclude<SubtitleFormat, 'json'>;

export type SubtitleCueDraft = Readonly<{
  cueIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  normalizedText: string;
}>;

export type SubtitleParseErrorCode =
  | 'missing-cue-id'
  | 'invalid-timing'
  | 'empty-text'
  | 'overlap'
  | 'missing-header'
  | 'no-sections'
  | 'no-events'
  | 'no-dialogue'
  | 'unsupported-format';

export class SubtitleParseError extends TypeError {
  readonly code: SubtitleParseErrorCode;
  readonly format: ParsedSubtitleFormat;
  /**
   * Block the error points at; null when the whole file is at fault. SRT block errors use the
   * cue id read from the file (as the message does); VTT/ASS block errors and overlap use the
   * 1-based position. The message text keeps its historical numbering, which may differ.
   */
  readonly blockIndex: number | null;

  constructor(code: SubtitleParseErrorCode, format: ParsedSubtitleFormat, blockIndex: number | null, message: string) {
    super(message);
    this.name = 'SubtitleParseError';
    this.code = code;
    this.format = format;
    this.blockIndex = blockIndex;
  }
}

const srtTimestampPattern = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/;
const vttTimestampPattern = /^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})$/;
const assTimestampPattern = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{2})$/;

function toMs(hours: string, minutes: string, seconds: string, fraction: number): number {
  return (
    Number.parseInt(hours, 10) * 3_600_000 +
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1_000 +
    fraction
  );
}

function parseSrtTimestamp(value: string, blockIndex: number): number {
  const match = srtTimestampPattern.exec(value);
  if (!match) {
    throw new SubtitleParseError('invalid-timing', 'srt', blockIndex, `Invalid SRT timestamp: ${value}`);
  }
  return toMs(match[1]!, match[2]!, match[3]!, Number.parseInt(match[4]!, 10));
}

function parseVttTimestamp(value: string, blockIndex: number): number {
  const match = vttTimestampPattern.exec(value);
  if (!match) {
    throw new SubtitleParseError('invalid-timing', 'vtt', blockIndex, `Invalid VTT timestamp: ${value}`);
  }
  return toMs(match[1] ?? '0', match[2]!, match[3]!, Number.parseInt(match[4]!, 10));
}

function parseAssTimestamp(value: string, blockIndex: number): number {
  const match = assTimestampPattern.exec(value);
  if (!match) {
    throw new SubtitleParseError('invalid-timing', 'ass', blockIndex, `Invalid ASS/SSA timestamp: ${value}`);
  }
  return toMs(match[1]!, match[2]!, match[3]!, Number.parseInt(match[4]!, 10) * 10);
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
    throw new SubtitleParseError('no-events', 'ass', null, 'ASS/SSA file missing [Events] section');
  }
  return events;
}

function parseAssDialogueLine(line: string, formatHeader: string, index: number): SubtitleCueDraft | null {
  const headerMatch = /^Format:\s*(.+)$/i.exec(formatHeader);
  if (!headerMatch) {
    throw new SubtitleParseError('missing-header', 'ass', null, 'ASS/SSA [Events] section missing Format header');
  }
  const fieldNames = headerMatch[1]!.split(',').map((f) => f.trim().toLowerCase());
  const startIndex = fieldNames.indexOf('start');
  const endIndex = fieldNames.indexOf('end');
  const textIndex = fieldNames.indexOf('text');
  if (startIndex < 0 || endIndex < 0 || textIndex < 0) {
    throw new SubtitleParseError(
      'missing-header',
      'ass',
      null,
      'ASS/SSA Events Format must include Start, End, and Text fields',
    );
  }

  const dialogueMatch = /^Dialogue:\s*/i.exec(line);
  if (!dialogueMatch) return null;
  const blockIndex = index + 1;
  const rawFields = line.slice(dialogueMatch[0].length).split(',');
  if (rawFields.length < fieldNames.length) {
    throw new SubtitleParseError('invalid-timing', 'ass', blockIndex, `ASS/SSA Dialogue line ${index + 1} has too few fields`);
  }
  const startMs = parseAssTimestamp(rawFields[startIndex]!.trim(), blockIndex);
  const endMs = parseAssTimestamp(rawFields[endIndex]!.trim(), blockIndex);
  if (endMs <= startMs) {
    throw new SubtitleParseError('invalid-timing', 'ass', blockIndex, `ASS/SSA cue ${index + 1} end time must be after start time`);
  }
  const rawText = rawFields.slice(textIndex).join(',').trim();
  const text = parseAssText(rawText);
  if (text.length === 0) {
    throw new SubtitleParseError('empty-text', 'ass', blockIndex, `ASS/SSA cue ${index + 1} has empty cue text after stripping tags`);
  }
  return {
    cueIndex: index + 1,
    startMs,
    endMs,
    text,
    normalizedText: text.toLowerCase(),
  };
}

function parseAssCues(text: string): SubtitleCueDraft[] {
  const sections = splitAssSections(text);
  if (sections.length === 0) {
    throw new SubtitleParseError('no-sections', 'ass', null, 'ASS/SSA file has no sections');
  }
  const events = findAssEventsSection(sections);
  const formatHeader = events.lines.find((line) => /^Format:/i.test(line));
  if (!formatHeader) {
    throw new SubtitleParseError('missing-header', 'ass', null, 'ASS/SSA [Events] section missing Format header');
  }
  const cues: SubtitleCueDraft[] = [];
  for (const line of events.lines) {
    if (!/^Dialogue:/i.test(line)) continue;
    const cue = parseAssDialogueLine(line, formatHeader, cues.length);
    if (cue) cues.push(cue);
  }
  if (cues.length === 0) {
    throw new SubtitleParseError('no-dialogue', 'ass', null, 'ASS/SSA file has no Dialogue lines');
  }
  return cues;
}

const formatNames: Readonly<Record<ParsedSubtitleFormat, string>> = { srt: 'SRT', vtt: 'VTT', ass: 'ASS/SSA' };

function validateCueOrdering(cues: readonly SubtitleCueDraft[], format: ParsedSubtitleFormat): void {
  const formatName = formatNames[format];
  for (let i = 1; i < cues.length; i++) {
    const prev = cues[i - 1]!;
    const curr = cues[i]!;
    if (curr.startMs < prev.endMs) {
      throw new SubtitleParseError(
        'overlap',
        format,
        i + 1,
        `${formatName} cue ${curr.cueIndex} starts at ${curr.startMs}ms before previous cue ${prev.cueIndex} ends at ${prev.endMs}ms`,
      );
    }
  }
}

function parseSrtBlock(block: string, index: number): SubtitleCueDraft {
  const lines = block.split('\n').map((line) => line.trim());
  // First line must be the numeric cue id; a missing or malformed id is an error.
  const firstLine = lines[0] ?? '';
  if (!/^\d+$/.test(firstLine)) {
    throw new SubtitleParseError('missing-cue-id', 'srt', index + 1, `SRT block ${index} missing numeric cue id`);
  }
  const cueIndex = Number.parseInt(firstLine, 10);
  if (lines.length < 2) {
    throw new SubtitleParseError('invalid-timing', 'srt', cueIndex, `SRT block ${cueIndex} missing timing or text`);
  }
  const timingLine = lines[1] ?? '';
  const timingMatch = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/.exec(timingLine);
  if (!timingMatch) {
    throw new SubtitleParseError('invalid-timing', 'srt', cueIndex, `SRT block ${cueIndex} has invalid timing line: ${timingLine}`);
  }
  const startMs = parseSrtTimestamp(timingMatch[1]!, cueIndex);
  const endMs = parseSrtTimestamp(timingMatch[2]!, cueIndex);
  if (endMs <= startMs) {
    throw new SubtitleParseError('invalid-timing', 'srt', cueIndex, `SRT block ${cueIndex} end time must be after start time`);
  }
  const rawText = lines.slice(2).join('\n');
  const text = normalizeCueText(rawText);
  if (text.length === 0) {
    throw new SubtitleParseError('empty-text', 'srt', cueIndex, `SRT block ${cueIndex} has empty cue text`);
  }
  return {
    cueIndex,
    startMs,
    endMs,
    text,
    normalizedText: text.toLowerCase(),
  };
}

function splitSrtBlocks(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function parseVttBlock(block: string, index: number): SubtitleCueDraft {
  const lines = block.split('\n').map((line) => line.trim());
  let lineIndex = 0;
  let cueIndex = index;

  const firstLine = lines[0] ?? '';
  if (/^\d+$/.test(firstLine)) {
    cueIndex = Number.parseInt(firstLine, 10);
    lineIndex = 1;
  }

  const blockIndex = index + 1;
  const timingLine = lines[lineIndex] ?? '';
  const timingMatch = /^(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})/.exec(timingLine);
  if (!timingMatch) {
    throw new SubtitleParseError('invalid-timing', 'vtt', blockIndex, `VTT block ${index} has invalid timing line: ${timingLine}`);
  }
  const timingParts = timingMatch[0]!.split(/\s*-->\s*/);
  const startMs = parseVttTimestamp(timingParts[0]!, blockIndex);
  const endMs = parseVttTimestamp(timingParts[1]!, blockIndex);
  if (endMs <= startMs) {
    throw new SubtitleParseError('invalid-timing', 'vtt', blockIndex, `VTT block ${index} end time must be after start time`);
  }

  const rawText = lines.slice(lineIndex + 1).join('\n');
  const text = normalizeCueText(rawText);
  if (text.length === 0) {
    throw new SubtitleParseError('empty-text', 'vtt', blockIndex, `VTT block ${index} has empty cue text`);
  }
  return {
    cueIndex,
    startMs,
    endMs,
    text,
    normalizedText: text.toLowerCase(),
  };
}

function splitVttBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  // D-A2: the WEBVTT header is optional; strip it when present.
  const body = normalized.startsWith('WEBVTT') ? normalized.slice('WEBVTT'.length).trim() : normalized;
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

export type SubtitleParseOptions = Readonly<{
  /** Browser ASS/SSA compatibility only; SRT/VTT always enforce non-overlap. Defaults to false. */
  allowAssOverlap?: boolean;
}>;

/** Pure, synchronous. Validates timing/text; ordering is strict unless ASS overlap is explicitly allowed. */
export function parseSubtitleText(text: string, format: ParsedSubtitleFormat, options: SubtitleParseOptions = {}): SubtitleCueDraft[] {
  let drafts: SubtitleCueDraft[];
  switch (format) {
    case 'srt':
      drafts = splitSrtBlocks(text).map((block, index) => parseSrtBlock(block, index));
      break;
    case 'vtt':
      drafts = splitVttBlocks(text).map((block, index) => parseVttBlock(block, index));
      break;
    case 'ass':
      drafts = parseAssCues(text);
      break;
    default:
      throw new SubtitleParseError('unsupported-format', format, null, `Unsupported subtitle format: ${String(format)}`);
  }
  // Preserve browser ASS/SSA dialogue overlap only when explicitly requested.
  if (format !== 'ass' || options.allowAssOverlap !== true) validateCueOrdering(drafts, format);
  return drafts;
}

/** `.srt`/`.vtt`/`.ass`/`.ssa` by extension; a `WEBVTT` first line also means 'vtt'. */
export function inferParsedSubtitleFormat(fileName: string, text?: string): ParsedSubtitleFormat {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'srt':
      return 'srt';
    case 'vtt':
      return 'vtt';
    case 'ass':
    case 'ssa':
      return 'ass';
    default:
      break;
  }
  if (text !== undefined && /^\uFEFF?WEBVTT(?:[ \t]|\r|\n|$)/.test(text)) {
    return 'vtt';
  }
  throw new SubtitleParseError('unsupported-format', 'srt', null, `Unsupported subtitle format for path: ${fileName}`);
}
