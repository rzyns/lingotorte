import type {
  Cue,
  SubtitleTrack,
  SubtitleFormat,
  TranscriptTrackStatus,
  TranscriptSourceKind,
  TranscriptTrackProvenance,
} from '@lingotorte/domain';
import { makeCue, makeSubtitleTrack } from '@lingotorte/domain';
import { inferSubtitleFormat, normalizeCueText, readLocalSubtitle, sha256Text, sourceKindFromPath } from '@lingotorte/storage';
import { parseSubtitleText } from './parse.ts';
import type { SubtitleCueDraft } from './parse.ts';

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
  /**
   * Override the default transcript status. Callers importing machine-extracted
   * text (e.g. embedded subtitle extraction) must pass 'draft' (or 'candidate')
   * so the track enters the correction/approval gate instead of 'approved'.
   */
  transcriptStatus?: TranscriptTrackStatus;
  /**
   * Override the inferred transcript source kind for provenance.
   */
  transcriptSourceKind?: TranscriptSourceKind;
  /**
   * Explicit provenance. When omitted, makeSubtitleTrack synthesizes a minimal
   * default (language + empty warningFlags). Callers carrying draft/imported
   * text should pass this so warningFlags survive into the data model.
   */
  provenance?: TranscriptTrackProvenance;
}>;

async function draftsToCues(trackId: SubtitleTrack['id'], drafts: readonly SubtitleCueDraft[]): Promise<Cue[]> {
  const cues: Cue[] = [];
  for (const draft of drafts) {
    const textSha256 = await sha256Text(draft.text);
    cues.push(
      makeCue({
        trackId,
        cueIndex: draft.cueIndex,
        startMs: draft.startMs,
        endMs: draft.endMs,
        text: draft.text,
        normalizedText: draft.normalizedText,
        textSha256,
      }),
    );
  }
  return cues;
}

export type SubtitleOverrideOptions = Pick<ImportSubtitleInput, 'transcriptStatus' | 'transcriptSourceKind' | 'provenance'>;

export async function parseSrt(
  path: string,
  mediaId: string,
  language: string,
  role: 'target' | 'native' | 'other',
  isActive = true,
  overrides?: SubtitleOverrideOptions,
): Promise<ParsedSubtitle> {
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
    ...(overrides?.transcriptStatus !== undefined ? { transcriptStatus: overrides.transcriptStatus } : {}),
    ...(overrides?.transcriptSourceKind !== undefined ? { transcriptSourceKind: overrides.transcriptSourceKind } : {}),
    ...(overrides?.provenance !== undefined ? { provenance: overrides.provenance } : {}),
  });

  const drafts = parseSubtitleText(text, 'srt');
  const cues = await draftsToCues(track.id, drafts);

  return { track, cues };
}

export async function parseVtt(
  path: string,
  mediaId: string,
  language: string,
  role: 'target' | 'native' | 'other',
  isActive = true,
  overrides?: SubtitleOverrideOptions,
): Promise<ParsedSubtitle> {
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
    ...(overrides?.transcriptStatus !== undefined ? { transcriptStatus: overrides.transcriptStatus } : {}),
    ...(overrides?.transcriptSourceKind !== undefined ? { transcriptSourceKind: overrides.transcriptSourceKind } : {}),
    ...(overrides?.provenance !== undefined ? { provenance: overrides.provenance } : {}),
  });

  const drafts = parseSubtitleText(text, 'vtt');
  const cues = await draftsToCues(track.id, drafts);

  return { track, cues };
}

export async function parseAss(
  path: string,
  mediaId: string,
  language: string,
  role: 'target' | 'native' | 'other',
  isActive = true,
  overrides?: SubtitleOverrideOptions,
): Promise<ParsedSubtitle> {
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
    ...(overrides?.transcriptStatus !== undefined ? { transcriptStatus: overrides.transcriptStatus } : {}),
    ...(overrides?.transcriptSourceKind !== undefined ? { transcriptSourceKind: overrides.transcriptSourceKind } : {}),
    ...(overrides?.provenance !== undefined ? { provenance: overrides.provenance } : {}),
  });

  const drafts = parseSubtitleText(text, 'ass');
  const cues = await draftsToCues(track.id, drafts);

  return { track, cues };
}

export async function importSubtitle(input: ImportSubtitleInput): Promise<ParsedSubtitle> {
  const format = inferSubtitleFormat(input.path);
  switch (format) {
    case 'srt':
      return parseSrt(input.path, input.mediaId, input.language, input.role, input.isActive ?? true, input);
    case 'vtt':
      return parseVtt(input.path, input.mediaId, input.language, input.role, input.isActive ?? true, input);
    case 'ass':
      return parseAss(input.path, input.mediaId, input.language, input.role, input.isActive ?? true, input);
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
    ...(input.transcriptStatus !== undefined ? { transcriptStatus: input.transcriptStatus } : {}),
    ...(input.transcriptSourceKind !== undefined ? { transcriptSourceKind: input.transcriptSourceKind } : {}),
    ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
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
