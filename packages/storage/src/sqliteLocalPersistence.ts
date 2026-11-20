import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { assertNativeOutput } from '../../domain/src/nativePathsNode.ts';
import type {
  CardType,
  Cue,
  ExportJob,
  ImportJob,
  ImportJobEvent,
  MediaAsset,
  MediaFileObservation,
  PracticeAttempt,
  PracticeMode,
  PracticeResult,
  ProviderPolicyEntry,
  ProviderPolicyProviderId,
  Rating,
  ReviewCard,
  ReviewCardState,
  ReviewEvent,
  SavedItem,
  SavedItemKind,
  SavedOccurrence,
  Sha256Digest,
  SourceKind,
  SubtitleFormat,
  SubtitleRole,
  SubtitleTrack,
  TranscriptQualityReport,
  TranscriptSourceKind,
  TranscriptTrackProvenance,
  TranscriptTrackStatus,
  TranscriptWordTiming,
  TranscriptWordTimingSourceKind,
} from '@lingotorte/domain';
import { createEmptyLocalStoreSnapshot, normalizeLocalStoreSnapshot, type LearnerStateSnapshot, type LocalStoreSnapshot, type TrackTranscriptBundle, type TranscriptBundle } from './localStore.ts';
import { sameHistoryPayload, unionHistory, normalizeLearnerAudit, type LearnerAudit } from './learnerAudit.ts';
import { planLearnerRestore, type RestoreMode } from './restorePlanner.ts';
import { canonicalJson, requireRestoreConfirmation, validateMeaningSource, type RestoreConfirmation } from '@lingotorte/domain';
import { LocalStore } from './localStore.ts';
import {
  LEARNER_OPERATION_RECEIPT_CAP, LEARNER_OPERATION_RECEIPT_TTL_MS, OPERATION_OWNED_COLLECTIONS, diffOperationOwned, learnerOperationRequestDigestInput,
  reconcileOperationOwned, type LearnerOperationIdentity, type LearnerOperationReceipt, type LearnerOperationRequest, type OperationOwnedCollection,
} from './learnerOperations.ts';

const CURRENT_SCHEMA_VERSION = 14;
const SNAPSHOT_KEY = 'default';

export class SnapshotRevisionConflictError extends Error {
  constructor() { super('Durable state changed. Reconnect and choose which state to keep; browser work was not saved.'); }
}

/** lt-584.4: a track's transcript bundle is write-once; a second write is a conflict (HTTP 409). */
/** lt-192.3: the operation id was already used for a different request (HTTP 409 `operation-id-reused`). */
export class OperationIdReusedError extends Error {
  constructor() { super('This operation id was already used for a different request; nothing was applied.'); }
}
/** lt-192.3: an unknown operation outside the service's eligibility boundary (HTTP 409 with `code`); nothing was applied. */
export class OperationIneligibleError extends Error {
  constructor(readonly code: 'generation-changed' | 'incarnation-changed' | 'operation-expired' | 'invalid-basis', message: string) { super(message); }
}

export class TranscriptBundleConflictError extends Error {
  constructor(trackId: string) { super(`Transcript bundle for track ${trackId} already exists and is write-once.`); }
}

/** lt-584.4: the addressed subtitle track or media asset is not in durable state (HTTP 404). */
export class DurableEntityNotFoundError extends Error {
  constructor(kind: 'track' | 'media', id: string) { super(`Unknown ${kind} ${id}.`); }
}

const TRANSCRIPT_KEYS = ['cues', 'transcriptWordTimings'] as const;

type OperationStateRow = Readonly<{ generation: string; last_non_operation_revision: number; next_receipt_seq: number; pruned_through_seq: number; protection_active: number }>;
function revisionNumber(token: string): number { return Number(token.slice('rev:'.length)); }
type RowHistoryEntry = { revision: number; before: string | null; after: string | null };
// Strict: an unreadable history proves nothing, so the fence then treats the row as ambiguous (refused).
function parseRowHistory(json: string): RowHistoryEntry[] {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const image = (v: unknown) => v === null || typeof v === 'string';
  if (!value.every(e => e && typeof e === 'object' && Number.isSafeInteger(e.revision) && image(e.before) && image(e.after))) return [];
  return (value as RowHistoryEntry[]).slice().sort((a, b) => a.revision - b.revision);
}

const CREATE_SNAPSHOT_STORE_SQL = `
  CREATE TABLE IF NOT EXISTS lingotorte_schema (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL
  );
  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 1)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
  CREATE TABLE IF NOT EXISTS lingotorte_snapshots (
    snapshot_key TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`.trim();

const CREATE_MEDIA_ASSET_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS media_asset (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_path TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    container TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    imported_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    privacy_label TEXT NOT NULL CHECK (privacy_label IN ('synthetic', 'owned', 'licensed'))
  );
  CREATE INDEX IF NOT EXISTS idx_media_asset_privacy_label ON media_asset(privacy_label);
  CREATE INDEX IF NOT EXISTS idx_media_asset_content_sha256 ON media_asset(content_sha256);
  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 2)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

const CREATE_TRANSCRIPT_PROJECTIONS_SQL = `
  CREATE TABLE IF NOT EXISTS subtitle_track (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    language TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('target', 'native', 'other')),
    format TEXT NOT NULL CHECK (format IN ('srt', 'vtt', 'ass', 'json')),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('synthetic', 'owned', 'licensed')),
    source_path TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    track_version INTEGER NOT NULL CHECK (track_version >= 0),
    transcript_status TEXT NOT NULL CHECK (transcript_status IN ('candidate', 'draft', 'correcting', 'approved', 'superseded')),
    transcript_source_kind TEXT NOT NULL CHECK (transcript_source_kind IN ('user-subtitle-file', 'youtube-caption', 'youtube-auto-caption', 'online-asr', 'local-asr', 'forced-alignment', 'manual-edit', 'synthetic-fixture')),
    provenance_json TEXT NOT NULL,
    quality_report_json TEXT,
    is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_subtitle_track_media_role_language ON subtitle_track(media_id, role, language);
  CREATE INDEX IF NOT EXISTS idx_subtitle_track_status ON subtitle_track(transcript_status);

  CREATE TABLE IF NOT EXISTS cue (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    cue_index INTEGER NOT NULL CHECK (cue_index >= 0),
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER NOT NULL CHECK (end_ms >= start_ms),
    text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    text_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (track_id, cue_index)
  );
  CREATE INDEX IF NOT EXISTS idx_cue_track_time ON cue(track_id, start_ms, end_ms);

  CREATE TABLE IF NOT EXISTS transcript_word_timing (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    cue_id TEXT NOT NULL,
    analysis_run_id TEXT,
    word_index INTEGER NOT NULL CHECK (word_index >= 0),
    char_start INTEGER NOT NULL CHECK (char_start >= 0),
    char_end INTEGER NOT NULL CHECK (char_end >= char_start),
    text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER NOT NULL CHECK (end_ms >= start_ms),
    confidence REAL,
    speaker_id TEXT,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('provider-word-timing', 'forced-alignment', 'manual-edit')),
    engine TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_version TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_word_timing_track_time ON transcript_word_timing(track_id, start_ms, end_ms);
  CREATE INDEX IF NOT EXISTS idx_word_timing_cue_time ON transcript_word_timing(cue_id, start_ms, end_ms);

  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 3)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

const CREATE_LEARNER_SOURCE_PROJECTIONS_SQL = `
  CREATE TABLE IF NOT EXISTS media_file_observation (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    mtime_ms INTEGER NOT NULL CHECK (mtime_ms >= 0),
    content_sha256 TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    exists_on_disk INTEGER NOT NULL CHECK (exists_on_disk IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS idx_media_file_observation_media_time ON media_file_observation(media_id, observed_at);
  CREATE INDEX IF NOT EXISTS idx_media_file_observation_exists ON media_file_observation(exists_on_disk);

  CREATE TABLE IF NOT EXISTS saved_item (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('lexeme', 'phrase', 'sentence')),
    language TEXT NOT NULL,
    display_text TEXT NOT NULL,
    meaning TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_saved_item_kind_language ON saved_item(kind, language);

  CREATE TABLE IF NOT EXISTS saved_occurrence (
    id TEXT PRIMARY KEY,
    saved_item_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    cue_id TEXT NOT NULL,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER NOT NULL CHECK (end_ms >= start_ms),
    selection_kind TEXT NOT NULL CHECK (selection_kind IN ('lexeme', 'phrase', 'sentence')),
    selection_text TEXT NOT NULL,
    context_before TEXT,
    context_after TEXT,
    created_at TEXT NOT NULL,
    source_context_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_saved_occurrence_item ON saved_occurrence(saved_item_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_saved_occurrence_media_cue_time ON saved_occurrence(media_id, cue_id, start_ms, end_ms);

  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 4)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

const CREATE_REVIEW_PRACTICE_JOB_PROJECTIONS_SQL = `
  CREATE TABLE IF NOT EXISTS review_card (
    id TEXT PRIMARY KEY,
    saved_item_id TEXT NOT NULL,
    saved_occurrence_id TEXT NOT NULL,
    card_type TEXT NOT NULL CHECK (card_type IN ('recognition', 'production')),
    prompt_template TEXT NOT NULL,
    created_at TEXT NOT NULL,
    suspended_at TEXT,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_review_card_saved_item ON review_card(saved_item_id);
  CREATE INDEX IF NOT EXISTS idx_review_card_saved_occurrence ON review_card(saved_occurrence_id);

  CREATE TABLE IF NOT EXISTS review_card_state (
    card_id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('new', 'learning', 'review', 'relearning')),
    due_at TEXT NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    elapsed_days INTEGER NOT NULL CHECK (elapsed_days >= 0),
    scheduled_days INTEGER NOT NULL CHECK (scheduled_days >= 0),
    reps INTEGER NOT NULL CHECK (reps >= 0),
    lapses INTEGER NOT NULL CHECK (lapses >= 0),
    last_reviewed_at TEXT,
    fsrs_version TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_review_card_state_due ON review_card_state(due_at, state);

  CREATE TABLE IF NOT EXISTS review_event (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    response_ms INTEGER CHECK (response_ms IS NULL OR response_ms >= 0),
    previous_state_json TEXT NOT NULL,
    next_state_json TEXT NOT NULL,
    device_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_review_event_card_time ON review_event(card_id, reviewed_at, created_at);

  CREATE TABLE IF NOT EXISTS practice_attempt (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('typed-input', 'multiple-choice', 'audio-recall', 'speaking')),
    result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'pass-with-hesitation', 'skipped', 'abandoned')),
    given_answer TEXT,
    expected_answer TEXT,
    response_ms INTEGER CHECK (response_ms IS NULL OR response_ms >= 0),
    source_context_json TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    event_link_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_practice_attempt_card_time ON practice_attempt(card_id, reviewed_at, created_at);

  CREATE TABLE IF NOT EXISTS import_job (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('media', 'subtitle', 'transcript', 'learner-export')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT,
    input_manifest_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_import_job_status_started ON import_job(status, started_at);

  CREATE TABLE IF NOT EXISTS import_job_event (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_import_job_event_job_time ON import_job_event(job_id, created_at);

  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 5)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

const CREATE_EXPORT_JOB_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS export_job (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('learner-json-manifest')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    destination_kind TEXT NOT NULL CHECK (destination_kind IN ('browser-download', 'file-system-access')),
    destination_label TEXT NOT NULL,
    manifest_sha256 TEXT NOT NULL,
    content_summary_json TEXT NOT NULL,
    error_code TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_export_job_status_started ON export_job(status, started_at);
  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 6)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

const CREATE_PROVIDER_POLICY_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS provider_policy (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL CHECK (provider_id IN ('elevenlabs-scribe', 'youtube-caption')),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    allowed_data_classes_json TEXT NOT NULL,
    requires_confirmation INTEGER NOT NULL DEFAULT 1 CHECK (requires_confirmation IN (0, 1)),
    first_approved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_provider_policy_provider_enabled ON provider_policy(provider_id, enabled);
  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 7)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

// Rebuild only this projection: SQLite cannot alter an existing CHECK constraint.
// Historical migration SQL remains immutable because its checksums are persisted.
const EXPAND_PRACTICE_MODES_SQL = `
  CREATE TABLE practice_attempt_v8 (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder')),
    result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'pass-with-hesitation', 'skipped', 'abandoned')),
    given_answer TEXT,
    expected_answer TEXT,
    response_ms INTEGER CHECK (response_ms IS NULL OR response_ms >= 0),
    source_context_json TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    event_link_json TEXT NOT NULL
  );
  INSERT INTO practice_attempt_v8 (
    id, card_id, mode, result, given_answer, expected_answer,
    response_ms, source_context_json, reviewed_at, created_at, event_link_json
  ) SELECT id, card_id, mode, result, given_answer, expected_answer,
    response_ms, source_context_json, reviewed_at, created_at, event_link_json
    FROM practice_attempt;
  DROP TABLE practice_attempt;
  ALTER TABLE practice_attempt_v8 RENAME TO practice_attempt;
  CREATE INDEX idx_practice_attempt_card_time ON practice_attempt(card_id, reviewed_at, created_at);
  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 8)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

// lt-foe.3.1: nullable provenance column; existing rows keep their meaning with NULL (legacy/unknown) source.
const SAVED_ITEM_MEANING_SOURCE_SQL = `
  ALTER TABLE saved_item ADD COLUMN meaning_source_json TEXT;
  INSERT INTO lingotorte_schema (id, schema_version) VALUES (1, 10)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

// lt-584.2 (ADR-0003 Decision 2): opaque monotonic durable revision, bumped in every committed write transaction.
const DURABLE_STATE_SQL = `
  CREATE TABLE durable_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO durable_state (id, revision, updated_at) VALUES (1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  INSERT INTO lingotorte_schema (id, schema_version) VALUES (1, 11)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

// lt-584.4 (C3): entity tables become authoritative. The legacy blob is renamed, kept read-only as rollback evidence,
// and the migration hook rewrites every entity table from it once. A new version: v11 is checksummed in existing ledgers.
const RETIRE_SNAPSHOT_BLOB_SQL = `
  ALTER TABLE lingotorte_snapshots RENAME TO legacy_snapshot_json;
  INSERT INTO lingotorte_schema (id, schema_version) VALUES (1, 12)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

// lt-192.3 (ADR-0004): additive operation receipts, lineage generation, document-writer fence and per-row operation
// ownership. Historical migrations 1-12 and every existing table stay unchanged.
const LEARNER_OPERATIONS_SQL = `
  CREATE TABLE learner_operation_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    generation TEXT NOT NULL,
    last_non_operation_revision INTEGER NOT NULL CHECK (last_non_operation_revision >= 1),
    next_receipt_seq INTEGER NOT NULL CHECK (next_receipt_seq >= 1),
    pruned_through_seq INTEGER NOT NULL CHECK (pruned_through_seq >= 0),
    protection_active INTEGER NOT NULL CHECK (protection_active IN (0, 1))
  );
  INSERT INTO learner_operation_state (id, generation, last_non_operation_revision, next_receipt_seq, pruned_through_seq, protection_active)
    VALUES (1, lower(hex(randomblob(16))), (SELECT revision FROM durable_state WHERE id = 1), 1, 0, 0);
  CREATE TABLE learner_operation_receipt (
    operation_id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL UNIQUE CHECK (seq >= 1),
    kind TEXT NOT NULL CHECK (kind IN ('capture', 'set-meaning', 'undo-capture', 'set-review-enrolment')),
    request_sha256 TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('applied', 'conflict')),
    revision INTEGER NOT NULL,
    generation TEXT NOT NULL,
    incarnation TEXT NOT NULL,
    committed_at TEXT NOT NULL,
    receipt_json TEXT NOT NULL
  );
  CREATE INDEX idx_learner_operation_receipt_committed ON learner_operation_receipt(committed_at);
  CREATE TABLE operation_owned_row (
    collection TEXT NOT NULL CHECK (collection IN ('savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates')),
    row_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    -- Authoritative images since the last non-operation write: [{revision, before, after}] (canonical JSON or null).
    history_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (collection, row_id)
  );
  INSERT INTO lingotorte_schema (id, schema_version) VALUES (1, 13)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

// lt-192.4 (design lt-zt0 §5.1): server-owned ready table for content-addressed managed media blobs. Additive only;
// migrations 1-13 and every existing table stay unchanged. Learner-state saves, restore and export never touch it.
const MANAGED_MEDIA_BLOB_SQL = `
  CREATE TABLE managed_media_blob (
    sha256 TEXT PRIMARY KEY CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('video/mp4','video/webm','video/x-matroska','application/octet-stream')),
    probe_json TEXT NOT NULL DEFAULT '{}',
    stored_at TEXT NOT NULL
  );
  INSERT INTO lingotorte_schema (id, schema_version) VALUES (1, 14)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

const ACTIVE_AUDIT_SQL = `
  CREATE TABLE active_review_event (id TEXT PRIMARY KEY REFERENCES review_event(id));
  CREATE TABLE active_practice_attempt (id TEXT PRIMARY KEY REFERENCES practice_attempt(id));
  CREATE TABLE learner_audit_format (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL CHECK (version = 1), recovery_json TEXT NOT NULL);
  INSERT INTO lingotorte_schema (id, schema_version) VALUES (1, 9)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

export type ShadowCollectionDiff = Readonly<{ blob: number; tables: number; missing: number; extra: number; changed: number; equal: boolean }>;
export type ShadowDiff = { equal: boolean; collections: Record<keyof LocalStoreSnapshot, ShadowCollectionDiff> };

export type DurableRestoreRequest = { manifest: unknown; mode: RestoreMode; expectedRevision: string; confirmation: RestoreConfirmation; learnerAudit?: LearnerAudit };

type SnapshotRow = Readonly<{
  snapshot_json: string;
  schema_version?: number;
}>;

type SchemaVersionRow = Readonly<{
  schema_version: number | null;
}>;

type SchemaMigrationRow = Readonly<{
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
  result: string;
}>;

type MediaAssetRow = Readonly<{
  id: string;
  title: string;
  original_path: string;
  content_sha256: string;
  duration_ms: number;
  container: string;
  size_bytes: number;
  imported_at: string;
  last_seen_at: string;
  privacy_label: string;
}>;

type SubtitleTrackRow = Readonly<{
  id: string;
  media_id: string;
  language: string;
  role: string;
  format: string;
  source_kind: string;
  source_path: string;
  content_sha256: string;
  track_version: number;
  transcript_status: string;
  transcript_source_kind: string;
  provenance_json: string;
  quality_report_json: string | null;
  is_active: number;
  created_at: string;
}>;

type CueRow = Readonly<{
  id: string;
  track_id: string;
  cue_index: number;
  start_ms: number;
  end_ms: number;
  text: string;
  normalized_text: string;
  text_sha256: string;
  created_at: string;
}>;

type TranscriptWordTimingRow = Readonly<{
  id: string;
  track_id: string;
  cue_id: string;
  analysis_run_id: string | null;
  word_index: number;
  char_start: number;
  char_end: number;
  text: string;
  normalized_text: string;
  start_ms: number;
  end_ms: number;
  confidence: number | null;
  speaker_id: string | null;
  source_kind: string;
  engine: string;
  model_name: string;
  model_version: string | null;
  created_at: string;
}>;

type MediaFileObservationRow = Readonly<{
  id: string;
  media_id: string;
  path: string;
  size_bytes: number;
  mtime_ms: number;
  content_sha256: string;
  observed_at: string;
  exists_on_disk: number;
}>;

type SavedItemRow = Readonly<{
  id: string;
  kind: string;
  language: string;
  display_text: string;
  meaning: string | null;
  meaning_source_json: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}>;

type SavedOccurrenceRow = Readonly<{
  id: string;
  saved_item_id: string;
  media_id: string;
  cue_id: string;
  start_ms: number;
  end_ms: number;
  selection_kind: string;
  selection_text: string;
  context_before: string | null;
  context_after: string | null;
  created_at: string;
  source_context_json: string;
}>;

type ReviewCardRow = Readonly<{
  id: string;
  saved_item_id: string;
  saved_occurrence_id: string;
  card_type: string;
  prompt_template: string;
  created_at: string;
  suspended_at: string | null;
  deleted_at: string | null;
}>;

type ReviewCardStateRow = Readonly<{
  card_id: string;
  state: string;
  due_at: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_reviewed_at: string | null;
  fsrs_version: string;
  updated_at: string;
}>;

type ReviewEventRow = Readonly<{
  id: string;
  card_id: string;
  reviewed_at: string;
  rating: string;
  response_ms: number | null;
  previous_state_json: string;
  next_state_json: string;
  device_id: string | null;
  created_at: string;
}>;

type PracticeAttemptRow = Readonly<{
  id: string;
  card_id: string;
  mode: string;
  result: string;
  given_answer: string | null;
  expected_answer: string | null;
  response_ms: number | null;
  source_context_json: string;
  reviewed_at: string;
  created_at: string;
  event_link_json: string;
}>;

type ImportJobRow = Readonly<{
  id: string;
  status: string;
  source_kind: string;
  started_at: string;
  completed_at: string | null;
  error_code: string | null;
  input_manifest_json: string;
}>;

type ExportJobRow = Readonly<{
  id: string;
  kind: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  destination_kind: string;
  destination_label: string;
  manifest_sha256: string;
  content_summary_json: string;
  error_code: string | null;
}>;

type ProviderPolicyRow = Readonly<{
  id: string;
  provider_id: string;
  enabled: number;
  allowed_data_classes_json: string;
  requires_confirmation: number;
  first_approved_at: string | null;
  created_at: string;
  updated_at: string;
}>;

type ImportJobEventRow = Readonly<{
  id: string;
  job_id: string;
  level: string;
  message: string;
  created_at: string;
  data_json: string | null;
}>;

export type SqliteSchemaMigration = Readonly<{
  version: number;
  name: string;
  appliedAt: string;
  checksum: string;
  result: 'applied';
}>;

export type SqliteLocalPersistenceStatus = Readonly<{
  schemaVersion: number;
  hasSnapshot: boolean;
  revision: string;
  appliedMigrations: readonly SqliteSchemaMigration[];
  learnerAuditRecovery: Record<string, number>;
}>;

type MigrationDefinition = Readonly<{
  version: number;
  name: string;
  sql: string;
  checksum: string;
}>;

function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

const CUE_COLUMNS = 'c.id, c.track_id, c.cue_index, c.start_ms, c.end_ms, c.text, c.normalized_text, c.text_sha256, c.created_at';
const WORD_TIMING_COLUMNS = `w.id, w.track_id, w.cue_id, w.analysis_run_id, w.word_index, w.char_start, w.char_end, w.text,
  w.normalized_text, w.start_ms, w.end_ms, w.confidence, w.speaker_id, w.source_kind, w.engine, w.model_name, w.model_version, w.created_at`;

function cueFromRow(row: CueRow): Cue {
  return {
    id: row.id,
    trackId: row.track_id,
    cueIndex: row.cue_index,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text,
    normalizedText: row.normalized_text,
    textSha256: row.text_sha256 as Sha256Digest,
    createdAt: row.created_at,
  };
}

function wordTimingFromRow(row: TranscriptWordTimingRow): TranscriptWordTiming {
  const timing: TranscriptWordTiming = {
    id: row.id,
    trackId: row.track_id,
    cueId: row.cue_id,
    wordIndex: row.word_index,
    charStart: row.char_start,
    charEnd: row.char_end,
    text: row.text,
    normalizedText: row.normalized_text,
    startMs: row.start_ms,
    endMs: row.end_ms,
    sourceKind: row.source_kind as TranscriptWordTimingSourceKind,
    engine: row.engine,
    modelName: row.model_name,
    createdAt: row.created_at,
  };
  return {
    ...timing,
    ...(row.analysis_run_id === null ? {} : { analysisRunId: row.analysis_run_id }),
    ...(row.confidence === null ? {} : { confidence: row.confidence }),
    ...(row.speaker_id === null ? {} : { speakerId: row.speaker_id }),
    ...(row.model_version === null ? {} : { modelVersion: row.model_version }),
  };
}

function observationFromRow(row: MediaFileObservationRow): MediaFileObservation {
  return {
    id: row.id,
    mediaId: row.media_id,
    path: row.path,
    sizeBytes: row.size_bytes,
    mtimeMs: row.mtime_ms,
    contentSha256: row.content_sha256 as Sha256Digest,
    observedAt: row.observed_at,
    exists: row.exists_on_disk === 1,
  };
}

/** Per-collection, per-identity comparison (record key, or `id` for arrays); array order is not significant. */
function diffSnapshots(blob: LocalStoreSnapshot, tables: LocalStoreSnapshot, names: readonly (keyof LocalStoreSnapshot)[] = Object.keys(createEmptyLocalStoreSnapshot()) as (keyof LocalStoreSnapshot)[]): ShadowDiff {
  const entries = (value: unknown): Map<string, unknown> => Array.isArray(value)
    ? new Map(value.map(entry => [String((entry as { id?: unknown }).id), entry]))
    : new Map(Object.entries((value ?? {}) as Record<string, unknown>));
  const audit = (value: LocalStoreSnapshot['learnerAudit']): Map<string, unknown> => new Map([
    ['version', value?.version],
    ...[...entries(value?.reviewEvents)].map(([id, e]) => [`reviewEvents:${id}`, e] as const),
    ...[...entries(value?.practiceAttempts)].map(([id, a]) => [`practiceAttempts:${id}`, a] as const),
  ]);
  const collections = {} as Record<keyof LocalStoreSnapshot, ShadowCollectionDiff>;
  for (const name of names) {
    const a = name === 'learnerAudit' ? audit(blob.learnerAudit) : entries(blob[name]);
    const b = name === 'learnerAudit' ? audit(tables.learnerAudit) : entries(tables[name]);
    const missing = [...a.keys()].filter(key => !b.has(key)).length;
    const extra = [...b.keys()].filter(key => !a.has(key)).length;
    const changed = [...a.keys()].filter(key => b.has(key) && !sameHistoryPayload(a.get(key), b.get(key))).length;
    collections[name] = { blob: a.size, tables: b.size, missing, extra, changed, equal: missing === 0 && extra === 0 && changed === 0 };
  }
  return { equal: Object.values(collections).every(c => c.equal), collections };
}

const LEARNER_COLLECTIONS = (Object.keys(createEmptyLocalStoreSnapshot()) as (keyof LocalStoreSnapshot)[]).filter(name => !(TRANSCRIPT_KEYS as readonly string[]).includes(name));

function withoutTranscripts(snapshot: LocalStoreSnapshot): LearnerStateSnapshot {
  const { cues: _cues, transcriptWordTimings: _timings, ...state } = snapshot;
  return state;
}

function groupByTrack(snapshot: Pick<LocalStoreSnapshot, 'cues' | 'transcriptWordTimings'>): Map<string, TrackTranscriptBundle> {
  const tracks = new Map<string, { cues: Cue[]; wordTimings: TranscriptWordTiming[] }>();
  const slot = (trackId: string) => { let entry = tracks.get(trackId); if (!entry) tracks.set(trackId, entry = { cues: [], wordTimings: [] }); return entry; };
  for (const cue of Object.values(snapshot.cues)) slot(cue.trackId).cues.push(cue);
  for (const timing of Object.values(snapshot.transcriptWordTimings)) slot(timing.trackId).wordTimings.push(timing);
  return tracks;
}

function sameBundle(a: TrackTranscriptBundle, b: TrackTranscriptBundle): boolean {
  const byId = <T extends { id: string }>(rows: readonly T[]) => Object.fromEntries(rows.map(row => [row.id, row]));
  return a.cues.length === b.cues.length && a.wordTimings.length === b.wordTimings.length
    && sameHistoryPayload(byId(a.cues), byId(b.cues)) && sameHistoryPayload(byId(a.wordTimings), byId(b.wordTimings));
}

function reviewEventFromRow(row: ReviewEventRow): ReviewEvent {
  const event: ReviewEvent = {
    id: row.id,
    cardId: row.card_id,
    reviewedAt: row.reviewed_at,
    rating: row.rating as Rating,
    previousStateJson: row.previous_state_json,
    nextStateJson: row.next_state_json,
    createdAt: row.created_at,
  };
  return {
    ...event,
    ...(row.response_ms === null ? {} : { responseMs: row.response_ms }),
    ...(row.device_id === null ? {} : { deviceId: row.device_id }),
  };
}


function importJobEventFromRow(row: ImportJobEventRow): ImportJobEvent {
  const event: ImportJobEvent = {
    id: row.id,
    jobId: row.job_id,
    level: row.level as ImportJobEvent['level'],
    message: row.message,
    createdAt: row.created_at,
  };
  return {
    ...event,
    ...(row.data_json === null ? {} : { dataJson: row.data_json }),
  };
}

function sameImportJobEventPayload(a: ImportJobEvent, b: ImportJobEvent): boolean {
  return (
    a.id === b.id &&
    a.jobId === b.jobId &&
    a.level === b.level &&
    a.message === b.message &&
    a.createdAt === b.createdAt &&
    (a.dataJson ?? null) === (b.dataJson ?? null)
  );
}

const MIGRATIONS: readonly MigrationDefinition[] = [
  {
    version: 1,
    name: 'create_snapshot_store',
    sql: CREATE_SNAPSHOT_STORE_SQL,
    checksum: migrationChecksum(CREATE_SNAPSHOT_STORE_SQL),
  },
  {
    version: 2,
    name: 'create_media_asset_projection',
    sql: CREATE_MEDIA_ASSET_PROJECTION_SQL,
    checksum: migrationChecksum(CREATE_MEDIA_ASSET_PROJECTION_SQL),
  },
  {
    version: 3,
    name: 'create_transcript_projections',
    sql: CREATE_TRANSCRIPT_PROJECTIONS_SQL,
    checksum: migrationChecksum(CREATE_TRANSCRIPT_PROJECTIONS_SQL),
  },
  {
    version: 4,
    name: 'create_learner_source_projections',
    sql: CREATE_LEARNER_SOURCE_PROJECTIONS_SQL,
    checksum: migrationChecksum(CREATE_LEARNER_SOURCE_PROJECTIONS_SQL),
  },
  {
    version: 5,
    name: 'create_review_practice_job_projections',
    sql: CREATE_REVIEW_PRACTICE_JOB_PROJECTIONS_SQL,
    checksum: migrationChecksum(CREATE_REVIEW_PRACTICE_JOB_PROJECTIONS_SQL),
  },
  {
    version: 6,
    name: 'create_export_job_projection',
    sql: CREATE_EXPORT_JOB_PROJECTION_SQL,
    checksum: migrationChecksum(CREATE_EXPORT_JOB_PROJECTION_SQL),
  },
  {
    version: 7,
    name: 'create_provider_policy_projection',
    sql: CREATE_PROVIDER_POLICY_PROJECTION_SQL,
    checksum: migrationChecksum(CREATE_PROVIDER_POLICY_PROJECTION_SQL),
  },
  {
    version: 8,
    name: 'expand_practice_modes',
    sql: EXPAND_PRACTICE_MODES_SQL,
    checksum: migrationChecksum(EXPAND_PRACTICE_MODES_SQL),
  },
  { version: 9, name: 'active_learner_audit_membership', sql: ACTIVE_AUDIT_SQL, checksum: migrationChecksum(ACTIVE_AUDIT_SQL) },
  { version: 10, name: 'saved_item_meaning_source', sql: SAVED_ITEM_MEANING_SOURCE_SQL, checksum: migrationChecksum(SAVED_ITEM_MEANING_SOURCE_SQL) },
  { version: 11, name: 'durable_state_revision', sql: DURABLE_STATE_SQL, checksum: migrationChecksum(DURABLE_STATE_SQL) },
  { version: 12, name: 'retire_snapshot_blob', sql: RETIRE_SNAPSHOT_BLOB_SQL, checksum: migrationChecksum(RETIRE_SNAPSHOT_BLOB_SQL) },
  { version: 13, name: 'learner_operations', sql: LEARNER_OPERATIONS_SQL, checksum: migrationChecksum(LEARNER_OPERATIONS_SQL) },
  { version: 14, name: 'managed_media_blob', sql: MANAGED_MEDIA_BLOB_SQL, checksum: migrationChecksum(MANAGED_MEDIA_BLOB_SQL) },
];

/** lt-192.4: one ready managed blob (server-owned; never part of learner state, restore or export). */
export type ManagedMimeType = 'video/mp4' | 'video/webm' | 'video/x-matroska' | 'application/octet-stream';
export type ManagedBlobRow = Readonly<{ sha256: string; sizeBytes: number; mimeType: ManagedMimeType }>;

/** lt-192.3: the transaction context handed to an operation's apply callback. */
export type LearnerOperationContext = Readonly<{
  /** Authoritative learner state (no transcripts) plus the transcript bundles the callback asked for. Mutate freely. */
  store: LocalStore;
  /** Server clock for this operation. */
  now: Date;
  /** Load one track's stored transcript bundle into `store` (cues and word timings); false when none is stored. */
  loadTrackBundle(trackId: string): boolean;
  /** A retained receipt of this lineage, if any. */
  receipt(operationId: string): LearnerOperationReceipt | undefined;
}>;
export type LearnerOperationOutcome =
  | Readonly<{ status: 'applied'; result: Record<string, unknown> }>
  | Readonly<{ status: 'conflict'; result: Record<string, unknown> }>;

export class SqliteLocalPersistence {
  private readonly db: DatabaseSync;
  /** lt-192.3: one opaque id per open (process incarnation); never persisted except inside receipts. */
  readonly incarnation = randomBytes(16).toString('hex');

  private constructor(db: DatabaseSync) {
    this.db = db;
    try { this.initialize(); } catch (error) { this.db.close(); throw error; }
  }

  static open(databasePath: string): SqliteLocalPersistence {
    const path = databasePath === ':memory:' ? databasePath : assertNativeOutput(databasePath);
    return new SqliteLocalPersistence(new DatabaseSync(path));
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result = 'applied')
      );
    `);
    const ledger = this.db.prepare('SELECT version, name, applied_at, checksum, result FROM schema_migration ORDER BY version').all() as SchemaMigrationRow[];
    if (ledger.some((row, index) => row.version !== index + 1)) throw new Error('Incomplete SQLite migration ledger');
    for (const row of ledger) {
      const expected = MIGRATIONS.find(m => m.version === row.version);
      if (!expected || row.name !== expected.name || row.checksum !== expected.checksum || row.result !== 'applied') throw new Error('Unsupported or changed SQLite migration ledger');
    }
    const schema = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lingotorte_schema'").get();
    if (schema) {
      const version = this.db.prepare('SELECT schema_version FROM lingotorte_schema WHERE id=1').get() as SchemaVersionRow | undefined;
      if (version && (version.schema_version ?? 0) > CURRENT_SCHEMA_VERSION) throw new Error('Unsupported future SQLite schema');
      if (ledger.length && version?.schema_version !== ledger.length) throw new Error('SQLite schema and ledger disagree');
    }
    for (const migration of MIGRATIONS) {
      this.applyMigration(migration);
    }
  }

  private applyMigration(migration: MigrationDefinition): void {
    const row = this.db
      .prepare('SELECT version, name, applied_at, checksum, result FROM schema_migration WHERE version = ? LIMIT 1')
      .get(migration.version) as SchemaMigrationRow | undefined;
    if (row !== undefined) {
      if (row.name !== migration.name || row.checksum !== migration.checksum || row.result !== 'applied') {
        throw new Error(`SQLite migration ${migration.version} does not match the expected forward-only definition.`);
      }
      return;
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(migration.sql);
      if (migration.version === 9) this.initializeActiveAudit();
      // The snapshot row content is unchanged by v10 (no item has a source yet); only its version tag moves.
      if (migration.version === 10) this.db.prepare('UPDATE lingotorte_snapshots SET schema_version = ? WHERE schema_version = 9').run(10);
      // The snapshot row content is unchanged by v11 (the revision lives in durable_state); only its version tag moves.
      if (migration.version === 11) this.db.prepare('UPDATE lingotorte_snapshots SET schema_version = ? WHERE schema_version = 10').run(11);
      if (migration.version === 12) this.backfillTablesFromLegacyBlob();
      this.db
        .prepare('INSERT INTO schema_migration (version, name, applied_at, checksum, result) VALUES (?, ?, ?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString(), migration.checksum, 'applied');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listMigrations(): readonly SqliteSchemaMigration[] {
    const rows = this.db
      .prepare('SELECT version, name, applied_at, checksum, result FROM schema_migration ORDER BY version ASC')
      .all() as SchemaMigrationRow[];
    return rows.map((row) => {
      if (row.result !== 'applied') {
        throw new Error(`SQLite migration ${row.version} has unsupported result ${row.result}.`);
      }
      return {
        version: row.version,
        name: row.name,
        appliedAt: row.applied_at,
        checksum: row.checksum,
        result: row.result,
      };
    });
  }

  listMediaAssets(): readonly MediaAsset[] {
    const rows = this.db
      .prepare(`
        SELECT id, title, original_path, content_sha256, duration_ms, container,
               size_bytes, imported_at, last_seen_at, privacy_label
        FROM media_asset
        ORDER BY imported_at ASC, id ASC
      `)
      .all() as MediaAssetRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      originalPath: row.original_path,
      contentSha256: row.content_sha256 as Sha256Digest,
      durationMs: row.duration_ms,
      container: row.container,
      sizeBytes: row.size_bytes,
      importedAt: row.imported_at,
      lastSeenAt: row.last_seen_at,
      privacyLabel: row.privacy_label as SourceKind,
    }));
  }

  listSubtitleTracks(): readonly SubtitleTrack[] {
    const rows = this.db
      .prepare(`
        SELECT id, media_id, language, role, format, source_kind, source_path,
               content_sha256, track_version, transcript_status,
               transcript_source_kind, provenance_json, quality_report_json,
               is_active, created_at
        FROM subtitle_track
        ORDER BY media_id ASC, role ASC, language ASC, track_version ASC, id ASC
      `)
      .all() as SubtitleTrackRow[];
    return rows.map((row) => {
      const track: SubtitleTrack = {
        id: row.id,
        mediaId: row.media_id,
        language: row.language,
        role: row.role as SubtitleRole,
        format: row.format as SubtitleFormat,
        sourceKind: row.source_kind as SourceKind,
        sourcePath: row.source_path,
        contentSha256: row.content_sha256 as Sha256Digest,
        trackVersion: row.track_version,
        transcriptStatus: row.transcript_status as TranscriptTrackStatus,
        transcriptSourceKind: row.transcript_source_kind as TranscriptSourceKind,
        provenance: parseJson<TranscriptTrackProvenance>(row.provenance_json),
        isActive: row.is_active === 1,
        createdAt: row.created_at,
      };
      if (row.quality_report_json === null) return track;
      return {
        ...track,
        qualityReport: parseJson<TranscriptQualityReport>(row.quality_report_json),
      };
    });
  }

  listCuesForTrack(trackId: string): readonly Cue[] {
    const rows = this.db
      .prepare(`
        SELECT id, track_id, cue_index, start_ms, end_ms, text,
               normalized_text, text_sha256, created_at
        FROM cue
        WHERE track_id = ?
        ORDER BY cue_index ASC, start_ms ASC, id ASC
      `)
      .all(trackId) as CueRow[];
    return rows.map(cueFromRow);
  }

  listTranscriptWordTimingsForCue(cueId: string): readonly TranscriptWordTiming[] {
    const rows = this.db
      .prepare(`
        SELECT id, track_id, cue_id, analysis_run_id, word_index, char_start,
               char_end, text, normalized_text, start_ms, end_ms, confidence,
               speaker_id, source_kind, engine, model_name, model_version,
               created_at
        FROM transcript_word_timing
        WHERE cue_id = ?
        ORDER BY start_ms ASC, word_index ASC, id ASC
      `)
      .all(cueId) as TranscriptWordTimingRow[];
    return rows.map(wordTimingFromRow);
  }

  listMediaFileObservations(mediaId: string): readonly MediaFileObservation[] {
    const rows = this.db
      .prepare(`
        SELECT id, media_id, path, size_bytes, mtime_ms, content_sha256,
               observed_at, exists_on_disk
        FROM media_file_observation
        WHERE media_id = ?
        ORDER BY observed_at ASC, id ASC
      `)
      .all(mediaId) as MediaFileObservationRow[];
    return rows.map(observationFromRow);
  }

  // lt-584.4: unkeyed readers for the authoritative path (one query per collection, not one per key).
  private listAllCues(): readonly Cue[] {
    return (this.db.prepare(`SELECT ${CUE_COLUMNS} FROM cue c ORDER BY c.track_id ASC, c.cue_index ASC, c.start_ms ASC, c.id ASC`).all() as CueRow[]).map(cueFromRow);
  }

  private listAllTranscriptWordTimings(): readonly TranscriptWordTiming[] {
    return (this.db.prepare(`SELECT ${WORD_TIMING_COLUMNS} FROM transcript_word_timing w ORDER BY w.cue_id ASC, w.start_ms ASC, w.word_index ASC, w.id ASC`).all() as TranscriptWordTimingRow[]).map(wordTimingFromRow);
  }

  private listAllMediaFileObservations(): readonly MediaFileObservation[] {
    return (this.db.prepare(`
      SELECT id, media_id, path, size_bytes, mtime_ms, content_sha256, observed_at, exists_on_disk
      FROM media_file_observation ORDER BY media_id ASC, observed_at ASC, id ASC
    `).all() as MediaFileObservationRow[]).map(observationFromRow);
  }

  private bundleForTrack(trackId: string): TrackTranscriptBundle {
    return {
      cues: (this.db.prepare(`SELECT ${CUE_COLUMNS} FROM cue c WHERE c.track_id = ? ORDER BY c.cue_index ASC, c.start_ms ASC, c.id ASC`).all(trackId) as CueRow[]).map(cueFromRow),
      wordTimings: (this.db.prepare(`SELECT ${WORD_TIMING_COLUMNS} FROM transcript_word_timing w WHERE w.track_id = ? ORDER BY w.start_ms ASC, w.word_index ASC, w.id ASC`).all(trackId) as TranscriptWordTimingRow[]).map(wordTimingFromRow),
    };
  }

  private trackHasCues(trackId: string): boolean {
    return this.db.prepare('SELECT 1 FROM cue WHERE track_id = ? LIMIT 1').get(trackId) !== undefined;
  }

  listSavedItems(): readonly SavedItem[] {
    const rows = this.db
      .prepare(`
        SELECT id, kind, language, display_text, meaning, meaning_source_json, notes,
               created_at, updated_at, archived_at
        FROM saved_item
        ORDER BY created_at ASC, id ASC
      `)
      .all() as SavedItemRow[];
    return rows.map((row) => {
      const item: SavedItem = {
        id: row.id,
        kind: row.kind as SavedItemKind,
        language: row.language,
        displayText: row.display_text,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return {
        ...item,
        ...(row.meaning === null ? {} : { meaning: row.meaning }),
        ...(row.meaning === null || row.meaning_source_json === null ? {} : { meaningSource: validateMeaningSource(JSON.parse(row.meaning_source_json)) }),
        ...(row.notes === null ? {} : { notes: row.notes }),
        ...(row.archived_at === null ? {} : { archivedAt: row.archived_at }),
      };
    });
  }

  listSavedOccurrences(): readonly SavedOccurrence[] {
    const rows = this.db
      .prepare(`
        SELECT id, saved_item_id, media_id, cue_id, start_ms, end_ms,
               selection_kind, selection_text, context_before, context_after,
               created_at, source_context_json
        FROM saved_occurrence
        ORDER BY created_at ASC, id ASC
      `)
      .all() as SavedOccurrenceRow[];
    return rows.map((row) => {
      const occurrence: SavedOccurrence = {
        id: row.id,
        savedItemId: row.saved_item_id,
        mediaId: row.media_id,
        cueId: row.cue_id,
        startMs: row.start_ms,
        endMs: row.end_ms,
        selectionKind: row.selection_kind as SavedItemKind,
        selectionText: row.selection_text,
        createdAt: row.created_at,
        sourceContext: parseJson<SavedOccurrence['sourceContext']>(row.source_context_json),
      };
      return {
        ...occurrence,
        ...(row.context_before === null ? {} : { contextBefore: row.context_before }),
        ...(row.context_after === null ? {} : { contextAfter: row.context_after }),
      };
    });
  }

  listReviewCards(): readonly ReviewCard[] {
    const rows = this.db
      .prepare(`
        SELECT id, saved_item_id, saved_occurrence_id, card_type,
               prompt_template, created_at, suspended_at, deleted_at
        FROM review_card
        ORDER BY created_at ASC, id ASC
      `)
      .all() as ReviewCardRow[];
    return rows.map((row) => {
      const card: ReviewCard = {
        id: row.id,
        savedItemId: row.saved_item_id,
        savedOccurrenceId: row.saved_occurrence_id,
        cardType: row.card_type as CardType,
        promptTemplate: row.prompt_template,
        createdAt: row.created_at,
      };
      return {
        ...card,
        ...(row.suspended_at === null ? {} : { suspendedAt: row.suspended_at }),
        ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
      };
    });
  }

  listReviewCardStates(): readonly ReviewCardState[] {
    const rows = this.db
      .prepare(`
        SELECT card_id, state, due_at, stability, difficulty, elapsed_days,
               scheduled_days, reps, lapses, last_reviewed_at, fsrs_version,
               updated_at
        FROM review_card_state
        ORDER BY due_at ASC, card_id ASC
      `)
      .all() as ReviewCardStateRow[];
    return rows.map((row) => {
      const state: ReviewCardState = {
        cardId: row.card_id,
        state: row.state as ReviewCardState['state'],
        dueAt: row.due_at,
        stability: row.stability,
        difficulty: row.difficulty,
        elapsedDays: row.elapsed_days,
        scheduledDays: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        fsrsVersion: row.fsrs_version,
        updatedAt: row.updated_at,
      };
      return {
        ...state,
        ...(row.last_reviewed_at === null ? {} : { lastReviewedAt: row.last_reviewed_at }),
      };
    });
  }

  listReviewEvents(): readonly ReviewEvent[] {
    this.assertAuditFormat();
    const ids = new Set((this.db.prepare('SELECT id FROM active_review_event').all() as { id: string }[]).map(r => r.id));
    return this.listAuditReviewEvents().filter(e => ids.has(e.id));
  }

  listAuditReviewEvents(): readonly ReviewEvent[] {
    const rows = this.db
      .prepare(`
        SELECT id, card_id, reviewed_at, rating, response_ms,
               previous_state_json, next_state_json, device_id, created_at
        FROM review_event
        ORDER BY reviewed_at ASC, created_at ASC, id ASC
      `)
      .all() as ReviewEventRow[];
    return rows.map(reviewEventFromRow);
  }

  listPracticeAttempts(): readonly PracticeAttempt[] {
    this.assertAuditFormat();
    const ids = new Set((this.db.prepare('SELECT id FROM active_practice_attempt').all() as { id: string }[]).map(r => r.id));
    return this.listAuditPracticeAttempts().filter(a => ids.has(a.id));
  }

  listAuditPracticeAttempts(): readonly PracticeAttempt[] {
    const rows = this.db
      .prepare(`
        SELECT id, card_id, mode, result, given_answer, expected_answer,
               response_ms, source_context_json, reviewed_at, created_at,
               event_link_json
        FROM practice_attempt
        ORDER BY reviewed_at ASC, created_at ASC, id ASC
      `)
      .all() as PracticeAttemptRow[];
    return rows.map((row) => {
      const attempt: PracticeAttempt = {
        id: row.id,
        cardId: row.card_id,
        mode: row.mode as PracticeMode,
        result: row.result as PracticeResult,
        sourceContext: parseJson<PracticeAttempt['sourceContext']>(row.source_context_json),
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
        eventLink: parseJson<PracticeAttempt['eventLink']>(row.event_link_json),
      };
      return {
        ...attempt,
        ...(row.given_answer === null ? {} : { givenAnswer: row.given_answer }),
        ...(row.expected_answer === null ? {} : { expectedAnswer: row.expected_answer }),
        ...(row.response_ms === null ? {} : { responseMs: row.response_ms }),
      };
    });
  }

  listImportJobs(): readonly ImportJob[] {
    const rows = this.db
      .prepare(`
        SELECT id, status, source_kind, started_at, completed_at,
               error_code, input_manifest_json
        FROM import_job
        ORDER BY started_at ASC, id ASC
      `)
      .all() as ImportJobRow[];
    return rows.map((row) => {
      const job: ImportJob = {
        id: row.id,
        status: row.status as ImportJob['status'],
        sourceKind: row.source_kind as ImportJob['sourceKind'],
        startedAt: row.started_at,
        inputManifestJson: row.input_manifest_json,
      };
      return {
        ...job,
        ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
        ...(row.error_code === null ? {} : { errorCode: row.error_code }),
      };
    });
  }

  listExportJobs(): readonly ExportJob[] {
    const rows = this.db
      .prepare(`
        SELECT id, kind, status, started_at, completed_at,
               destination_kind, destination_label, manifest_sha256,
               content_summary_json, error_code
        FROM export_job
        ORDER BY started_at ASC, id ASC
      `)
      .all() as ExportJobRow[];
    return rows.map((row) => {
      const job: ExportJob = {
        id: row.id,
        kind: row.kind as ExportJob['kind'],
        status: row.status as ExportJob['status'],
        startedAt: row.started_at,
        destinationKind: row.destination_kind as ExportJob['destinationKind'],
        destinationLabel: row.destination_label,
        manifestSha256: row.manifest_sha256 as Sha256Digest,
        contentSummaryJson: row.content_summary_json,
      };
      return {
        ...job,
        ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
        ...(row.error_code === null ? {} : { errorCode: row.error_code }),
      };
    });
  }

  listProviderPolicies(): readonly ProviderPolicyEntry[] {
    const rows = this.db
      .prepare(`
        SELECT id, provider_id, enabled, allowed_data_classes_json,
               requires_confirmation, first_approved_at, created_at, updated_at
        FROM provider_policy
        ORDER BY provider_id ASC, id ASC
      `)
      .all() as ProviderPolicyRow[];
    return rows.map((row) => {
      const policy: ProviderPolicyEntry = {
        id: row.id,
        providerId: row.provider_id as ProviderPolicyProviderId,
        enabled: row.enabled === 1,
        allowedDataClasses: parseJson<readonly string[]>(row.allowed_data_classes_json),
        requiresConfirmation: row.requires_confirmation === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return {
        ...policy,
        ...(row.first_approved_at === null ? {} : { firstApprovedAt: row.first_approved_at }),
      };
    });
  }

  listImportJobEvents(): readonly ImportJobEvent[] {
    const rows = this.db
      .prepare(`
        SELECT id, job_id, level, message, created_at, data_json
        FROM import_job_event
        ORDER BY created_at ASC, id ASC
      `)
      .all() as ImportJobEventRow[];
    return rows.map(importJobEventFromRow);
  }

  private saveMediaAssetProjection(snapshot: LearnerStateSnapshot): void {
    this.db.prepare('DELETE FROM media_asset').run();
    const insert = this.db.prepare(`
      INSERT INTO media_asset (
        id, title, original_path, content_sha256, duration_ms, container,
        size_bytes, imported_at, last_seen_at, privacy_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const asset of Object.values(snapshot.mediaAssets)) {
      insert.run(
        asset.id,
        asset.title,
        asset.originalPath,
        asset.contentSha256,
        asset.durationMs,
        asset.container,
        asset.sizeBytes,
        asset.importedAt,
        asset.lastSeenAt,
        asset.privacyLabel,
      );
    }
  }

  // Track metadata is learner state: rewritten with every learner-state save.
  private saveSubtitleTrackProjection(snapshot: LearnerStateSnapshot): void {
    this.db.prepare('DELETE FROM subtitle_track').run();

    const insertTrack = this.db.prepare(`
      INSERT INTO subtitle_track (
        id, media_id, language, role, format, source_kind, source_path,
        content_sha256, track_version, transcript_status, transcript_source_kind,
        provenance_json, quality_report_json, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const track of Object.values(snapshot.subtitleTracks)) {
      insertTrack.run(
        track.id,
        track.mediaId,
        track.language,
        track.role,
        track.format,
        track.sourceKind,
        track.sourcePath,
        track.contentSha256,
        track.trackVersion,
        track.transcriptStatus,
        track.transcriptSourceKind,
        JSON.stringify(track.provenance),
        track.qualityReport === undefined ? null : JSON.stringify(track.qualityReport),
        track.isActive ? 1 : 0,
        track.createdAt,
      );
    }
  }

  // lt-584.4: insert-only (no DELETE): transcript bundles are write-once per track; callers enforce that.
  private saveTranscriptProjections(snapshot: Pick<LocalStoreSnapshot, 'cues' | 'transcriptWordTimings'>): void {
    const insertCue = this.db.prepare(`
      INSERT INTO cue (
        id, track_id, cue_index, start_ms, end_ms, text,
        normalized_text, text_sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const cue of Object.values(snapshot.cues)) {
      insertCue.run(
        cue.id,
        cue.trackId,
        cue.cueIndex,
        cue.startMs,
        cue.endMs,
        cue.text,
        cue.normalizedText,
        cue.textSha256,
        cue.createdAt,
      );
    }

    const insertTiming = this.db.prepare(`
      INSERT INTO transcript_word_timing (
        id, track_id, cue_id, analysis_run_id, word_index, char_start,
        char_end, text, normalized_text, start_ms, end_ms, confidence,
        speaker_id, source_kind, engine, model_name, model_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const timing of Object.values(snapshot.transcriptWordTimings)) {
      insertTiming.run(
        timing.id,
        timing.trackId,
        timing.cueId,
        timing.analysisRunId ?? null,
        timing.wordIndex,
        timing.charStart,
        timing.charEnd,
        timing.text,
        timing.normalizedText,
        timing.startMs,
        timing.endMs,
        timing.confidence ?? null,
        timing.speakerId ?? null,
        timing.sourceKind,
        timing.engine,
        timing.modelName,
        timing.modelVersion ?? null,
        timing.createdAt,
      );
    }
  }

  private saveLearnerSourceProjections(snapshot: LearnerStateSnapshot): void {
    this.db.prepare('DELETE FROM saved_occurrence').run();
    this.db.prepare('DELETE FROM saved_item').run();
    this.db.prepare('DELETE FROM media_file_observation').run();

    const insertObservation = this.db.prepare(`
      INSERT INTO media_file_observation (
        id, media_id, path, size_bytes, mtime_ms, content_sha256,
        observed_at, exists_on_disk
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const observation of snapshot.mediaObservations) {
      insertObservation.run(
        observation.id,
        observation.mediaId,
        observation.path,
        observation.sizeBytes,
        observation.mtimeMs,
        observation.contentSha256,
        observation.observedAt,
        observation.exists ? 1 : 0,
      );
    }

    const insertSavedItem = this.db.prepare(`
      INSERT INTO saved_item (
        id, kind, language, display_text, meaning, meaning_source_json, notes,
        created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of Object.values(snapshot.savedItems)) {
      insertSavedItem.run(
        item.id,
        item.kind,
        item.language,
        item.displayText,
        item.meaning ?? null,
        item.meaning !== undefined && item.meaningSource !== undefined ? JSON.stringify(validateMeaningSource(item.meaningSource)) : null,
        item.notes ?? null,
        item.createdAt,
        item.updatedAt,
        item.archivedAt ?? null,
      );
    }

    const insertSavedOccurrence = this.db.prepare(`
      INSERT INTO saved_occurrence (
        id, saved_item_id, media_id, cue_id, start_ms, end_ms,
        selection_kind, selection_text, context_before, context_after,
        created_at, source_context_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const occurrence of Object.values(snapshot.savedOccurrences)) {
      insertSavedOccurrence.run(
        occurrence.id,
        occurrence.savedItemId,
        occurrence.mediaId,
        occurrence.cueId,
        occurrence.startMs,
        occurrence.endMs,
        occurrence.selectionKind,
        occurrence.selectionText,
        occurrence.contextBefore ?? null,
        occurrence.contextAfter ?? null,
        occurrence.createdAt,
        JSON.stringify(occurrence.sourceContext),
      );
    }
  }

  private saveReviewPracticeJobProjections(snapshot: LearnerStateSnapshot): void {
    this.db.prepare('DELETE FROM import_job').run();

    this.db.prepare('DELETE FROM review_card_state').run();
    this.db.prepare('DELETE FROM review_card').run();

    const insertReviewCard = this.db.prepare(`
      INSERT INTO review_card (
        id, saved_item_id, saved_occurrence_id, card_type,
        prompt_template, created_at, suspended_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const card of Object.values(snapshot.reviewCards)) {
      insertReviewCard.run(
        card.id,
        card.savedItemId,
        card.savedOccurrenceId,
        card.cardType,
        card.promptTemplate,
        card.createdAt,
        card.suspendedAt ?? null,
        card.deletedAt ?? null,
      );
    }

    const insertReviewCardState = this.db.prepare(`
      INSERT INTO review_card_state (
        card_id, state, due_at, stability, difficulty, elapsed_days,
        scheduled_days, reps, lapses, last_reviewed_at, fsrs_version,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const state of Object.values(snapshot.reviewCardStates)) {
      insertReviewCardState.run(
        state.cardId,
        state.state,
        state.dueAt,
        state.stability,
        state.difficulty,
        state.elapsedDays,
        state.scheduledDays,
        state.reps,
        state.lapses,
        state.lastReviewedAt ?? null,
        state.fsrsVersion,
        state.updatedAt,
      );
    }

    this.appendLearnerAudit(snapshot.learnerAudit ?? normalizeLearnerAudit(undefined, snapshot));
    this.saveImportJobs(snapshot);
  }

  private appendLearnerAudit(snapshot: { reviewEvents: readonly ReviewEvent[]; practiceAttempts: readonly PracticeAttempt[] }): void {
    const selectReviewEvent = this.db.prepare(`
      SELECT id, card_id, reviewed_at, rating, response_ms,
             previous_state_json, next_state_json, device_id, created_at
      FROM review_event
      WHERE id = ?
      LIMIT 1
    `);
    const insertReviewEvent = this.db.prepare(`
      INSERT INTO review_event (
        id, card_id, reviewed_at, rating, response_ms,
        previous_state_json, next_state_json, device_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of snapshot.reviewEvents) {
      const existing = selectReviewEvent.get(event.id) as ReviewEventRow | undefined;
      if (existing !== undefined) {
        if (!sameHistoryPayload(reviewEventFromRow(existing), event)) {
          throw new Error(`Cannot rewrite append-only review event ${event.id}.`);
        }
        continue;
      }
      insertReviewEvent.run(
        event.id,
        event.cardId,
        event.reviewedAt,
        event.rating,
        event.responseMs ?? null,
        event.previousStateJson,
        event.nextStateJson,
        event.deviceId ?? null,
        event.createdAt,
      );
    }

    const insertPracticeAttempt = this.db.prepare(`
      INSERT INTO practice_attempt (
        id, card_id, mode, result, given_answer, expected_answer,
        response_ms, source_context_json, reviewed_at, created_at,
        event_link_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const existingAttempts = new Map(this.listAuditPracticeAttempts().map(a => [a.id, a]));
    for (const attempt of snapshot.practiceAttempts) {
      const prior = existingAttempts.get(attempt.id);
      if (prior) {
        if (!sameHistoryPayload(prior, attempt)) throw new TypeError(`Immutable history conflict: practiceAttempts ${attempt.id}`);
        continue;
      }
      insertPracticeAttempt.run(
        attempt.id,
        attempt.cardId,
        attempt.mode,
        attempt.result,
        attempt.givenAnswer ?? null,
        attempt.expectedAnswer ?? null,
        attempt.responseMs ?? null,
        JSON.stringify(attempt.sourceContext),
        attempt.reviewedAt,
        attempt.createdAt,
        JSON.stringify(attempt.eventLink),
      );
    }

  }

  private saveImportJobs(snapshot: LearnerStateSnapshot): void {
    const insertImportJob = this.db.prepare(`
      INSERT INTO import_job (
        id, status, source_kind, started_at, completed_at,
        error_code, input_manifest_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const job of Object.values(snapshot.importJobs)) {
      insertImportJob.run(
        job.id,
        job.status,
        job.sourceKind,
        job.startedAt,
        job.completedAt ?? null,
        job.errorCode ?? null,
        job.inputManifestJson,
      );
    }

    const selectImportJobEvent = this.db.prepare(`
      SELECT id, job_id, level, message, created_at, data_json
      FROM import_job_event
      WHERE id = ?
      LIMIT 1
    `);
    const insertImportJobEvent = this.db.prepare(`
      INSERT INTO import_job_event (
        id, job_id, level, message, created_at, data_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const event of snapshot.importJobEvents) {
      const existing = selectImportJobEvent.get(event.id) as ImportJobEventRow | undefined;
      if (existing !== undefined) {
        if (!sameImportJobEventPayload(importJobEventFromRow(existing), event)) {
          throw new Error(`Cannot rewrite append-only import job event ${event.id}.`);
        }
        continue;
      }
      insertImportJobEvent.run(
        event.id,
        event.jobId,
        event.level,
        event.message,
        event.createdAt,
        event.dataJson ?? null,
      );
    }
  }

  private saveExportJobProjection(snapshot: LearnerStateSnapshot): void {
    this.db.prepare('DELETE FROM export_job').run();
    const insertExportJob = this.db.prepare(`
      INSERT INTO export_job (
        id, kind, status, started_at, completed_at, destination_kind,
        destination_label, manifest_sha256, content_summary_json, error_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const job of Object.values(snapshot.exportJobs)) {
      insertExportJob.run(
        job.id,
        job.kind,
        job.status,
        job.startedAt,
        job.completedAt ?? null,
        job.destinationKind,
        job.destinationLabel,
        job.manifestSha256,
        job.contentSummaryJson,
        job.errorCode ?? null,
      );
    }
  }

  private saveProviderPolicyProjection(snapshot: LearnerStateSnapshot): void {
    this.db.prepare('DELETE FROM provider_policy').run();
    const insertProviderPolicy = this.db.prepare(`
      INSERT INTO provider_policy (
        id, provider_id, enabled, allowed_data_classes_json,
        requires_confirmation, first_approved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const policy of Object.values(snapshot.providerPolicies)) {
      insertProviderPolicy.run(
        policy.id,
        policy.providerId,
        policy.enabled ? 1 : 0,
        JSON.stringify(policy.allowedDataClasses),
        policy.requiresConfirmation ? 1 : 0,
        policy.firstApprovedAt ?? null,
        policy.createdAt,
        policy.updatedAt,
      );
    }
  }

  status(): SqliteLocalPersistenceStatus {
    const hasSnapshot = this.db.prepare('SELECT 1 FROM media_asset LIMIT 1').get() !== undefined
      || this.db.prepare('SELECT 1 FROM subtitle_track LIMIT 1').get() !== undefined
      || this.db.prepare('SELECT 1 FROM saved_item LIMIT 1').get() !== undefined
      || this.db.prepare('SELECT 1 FROM review_card LIMIT 1').get() !== undefined
      || ['saved_occurrence', 'review_event', 'practice_attempt', 'import_job', 'export_job', 'provider_policy', 'media_file_observation']
        .some(table => this.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get() !== undefined)
      || this.db.prepare('SELECT revision FROM durable_state WHERE id=1 AND revision > 1').get() !== undefined;
    const schemaRow = this.db
      .prepare('SELECT MAX(version) AS schema_version FROM schema_migration WHERE result = ?')
      .get('applied') as SchemaVersionRow;
    return {
      schemaVersion: schemaRow.schema_version ?? CURRENT_SCHEMA_VERSION,
      hasSnapshot,
      revision: this.currentRevision(),
      appliedMigrations: this.listMigrations(),
      learnerAuditRecovery: JSON.parse((this.db.prepare('SELECT recovery_json FROM learner_audit_format WHERE id=1').get() as { recovery_json: string }).recovery_json),
    };
  }

  /** The whole durable state, assembled from the authoritative entity tables (lt-584.4). */
  loadSnapshot(): LocalStoreSnapshot {
    return this.loadSnapshotFromTables(true);
  }

  /** The full snapshot and its revision, read in one transaction. Serves the transitional GET /api/state (D-R8) and tests. */
  loadVersionedSnapshot(): { snapshot: LocalStoreSnapshot; revision: string } {
    return this.read(() => ({ snapshot: this.loadSnapshot(), revision: this.currentRevision() }));
  }

  /** Learner state (everything except the per-media transcript bundles) and its revision, read in one transaction. */
  loadLearnerState(): { state: LearnerStateSnapshot; revision: string } {
    return this.read(() => ({ state: withoutTranscripts(this.loadSnapshotFromTables(false)), revision: this.currentRevision() }));
  }

  /**
   * lt-192.4: the ready managed blob bound to a media asset through `contentSha256` (`sha256:<hex>`).
   * `undefined` = unknown media id; `null` = no ready blob row. One read-only statement; no effects.
   */
  managedBlobForMedia(mediaId: string): ManagedBlobRow | null | undefined {
    const row = this.db.prepare(`SELECT b.sha256 AS sha256, b.size_bytes AS size_bytes, b.mime_type AS mime_type
      FROM media_asset a LEFT JOIN managed_media_blob b ON a.content_sha256 = 'sha256:' || b.sha256 WHERE a.id = ? LIMIT 1`)
      .get(mediaId) as { sha256: string | null; size_bytes: number | null; mime_type: string | null } | undefined;
    if (row === undefined) return undefined;
    if (row.sha256 === null || row.size_bytes === null || row.mime_type === null) return null;
    return { sha256: row.sha256, sizeBytes: row.size_bytes, mimeType: row.mime_type as ManagedMimeType };
  }

  /** Every transcript bundle of one media, keyed by track id; tracks of other media are never read. */
  loadTranscripts(mediaId: string): TranscriptBundle & { mediaId: string; revision: string } {
    return this.read(() => {
      if (this.db.prepare('SELECT 1 FROM media_asset WHERE id = ? LIMIT 1').get(mediaId) === undefined) throw new DurableEntityNotFoundError('media', mediaId);
      const tracks: Record<string, { cues: Cue[]; wordTimings: TranscriptWordTiming[] }> = {};
      for (const row of this.db.prepare('SELECT id FROM subtitle_track WHERE media_id = ? ORDER BY id').all(mediaId) as { id: string }[]) tracks[row.id] = { cues: [], wordTimings: [] };
      const cues = this.db.prepare(`SELECT ${CUE_COLUMNS} FROM cue c JOIN subtitle_track t ON t.id = c.track_id
        WHERE t.media_id = ? ORDER BY c.track_id ASC, c.cue_index ASC, c.start_ms ASC, c.id ASC`).all(mediaId) as CueRow[];
      for (const row of cues) tracks[row.track_id]!.cues.push(cueFromRow(row));
      const timings = this.db.prepare(`SELECT ${WORD_TIMING_COLUMNS} FROM transcript_word_timing w JOIN subtitle_track t ON t.id = w.track_id
        WHERE t.media_id = ? ORDER BY w.track_id ASC, w.start_ms ASC, w.word_index ASC, w.id ASC`).all(mediaId) as TranscriptWordTimingRow[];
      for (const row of timings) tracks[row.track_id]!.wordTimings.push(wordTimingFromRow(row));
      return { mediaId, revision: this.currentRevision(), tracks };
    });
  }

  private read<T>(body: () => T): T {
    this.db.exec('BEGIN');
    try { const result = body(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  // Cue, word-timing and observation rows carry no foreign key and may legally reference absent parents, so the
  // full snapshot reads them unkeyed rather than through their parents.
  private loadSnapshotFromTables(includeTranscripts: boolean): LocalStoreSnapshot {
    const byId = <T extends { readonly id: string }>(rows: readonly T[]): Record<string, T> => Object.fromEntries(rows.map(row => [row.id, row]));
    return {
      mediaAssets: byId(this.listMediaAssets()),
      mediaObservations: [...this.listAllMediaFileObservations()],
      subtitleTracks: byId(this.listSubtitleTracks()),
      cues: includeTranscripts ? byId(this.listAllCues()) : {},
      transcriptWordTimings: includeTranscripts ? byId(this.listAllTranscriptWordTimings()) : {},
      savedItems: byId(this.listSavedItems()),
      savedOccurrences: byId(this.listSavedOccurrences()),
      reviewCards: byId(this.listReviewCards()),
      reviewCardStates: Object.fromEntries(this.listReviewCardStates().map(state => [state.cardId, state])),
      reviewEvents: [...this.listReviewEvents()],
      practiceAttempts: [...this.listPracticeAttempts()],
      learnerAudit: { version: 1, reviewEvents: [...this.listAuditReviewEvents()], practiceAttempts: [...this.listAuditPracticeAttempts()] },
      exportJobs: byId(this.listExportJobs()),
      providerPolicies: byId(this.listProviderPolicies()),
      importJobs: byId(this.listImportJobs()),
      importJobEvents: [...this.listImportJobEvents()],
    };
  }

  /** Test support: compares the authoritative tables with a reference snapshot, per collection and per entity identity
   *  (record key, or `id` for arrays; table readers impose their own order). The reference is `expected` when given,
   *  else the retired legacy blob (legacy_snapshot_json, overlaid with table history as the blob loader did) when one
   *  is present; with neither, the tables are compared with themselves and `reference` is 'none'.
   *  `missing` = in the reference only, `extra` = in the tables only, `changed` = same identity, different payload.
   *  Opens its own read transaction: never call it inside one (the v12 hook uses the in-transaction diffSnapshots). */
  loadSnapshotShadowDiff(expected?: LocalStoreSnapshot): ShadowDiff & { reference: 'expected' | 'legacy-blob' | 'none' } {
    return this.read(() => {
      const tables = this.loadSnapshot();
      if (expected !== undefined) return { ...diffSnapshots(normalizeLocalStoreSnapshot(expected), tables), reference: 'expected' as const };
      const legacy = this.readLegacyBlob('legacy_snapshot_json');
      return { ...diffSnapshots(legacy ?? tables, tables), reference: legacy === undefined ? 'none' as const : 'legacy-blob' as const };
    });
  }

  // Reads a legacy blob row and overlays the relational history exactly as the pre-C3 blob loader did. Returns undefined
  // when the table or the row is absent (fresh database). Runs inside the caller's transaction.
  private readLegacyBlob(table: 'legacy_snapshot_json'): LocalStoreSnapshot | undefined {
    if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table) === undefined) return undefined;
    const row = this.db.prepare(`SELECT snapshot_json, schema_version FROM ${table} WHERE snapshot_key = ? LIMIT 1`).get(SNAPSHOT_KEY) as SnapshotRow | undefined;
    if (!row) return undefined;
    if ((row.schema_version ?? 0) > 11) throw new Error('Unsupported durable snapshot schema');
    let raw: unknown;
    try { raw = JSON.parse(row.snapshot_json); } catch { throw new Error('Corrupt durable snapshot'); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Corrupt durable snapshot');
    const record = raw as Record<string, unknown>;
    for (const [name, empty] of Object.entries(createEmptyLocalStoreSnapshot())) {
      const value = record[name];
      if (name === 'learnerAudit' || value === undefined) continue;
      if (Array.isArray(empty) ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Corrupt durable snapshot collection');
    }
    const snapshot = normalizeLocalStoreSnapshot(raw);
    return {
      ...snapshot,
      reviewEvents: [...this.listReviewEvents()],
      practiceAttempts: [...this.listPracticeAttempts()],
      learnerAudit: { version: 1, reviewEvents: [...this.listAuditReviewEvents()], practiceAttempts: [...this.listAuditPracticeAttempts()] },
      importJobEvents: [...this.listImportJobEvents()],
    };
  }

  // v12 migration hook (inside the migration transaction): rewrite every entity table once from the legacy blob,
  // assert the tables now equal it, and restart the durable revision. History and import-job events are already
  // relational (v9) and are overlaid, not rewritten. A fresh database has no blob row and nothing to backfill.
  private backfillTablesFromLegacyBlob(): void {
    const legacy = this.readLegacyBlob('legacy_snapshot_json');
    if (legacy !== undefined) {
      for (const table of ['transcript_word_timing', 'cue', 'import_job']) this.db.prepare(`DELETE FROM ${table}`).run();
      this.writeLearnerProjections(legacy);
      this.saveTranscriptProjections(legacy);
      const diff = diffSnapshots(legacy, this.loadSnapshot());
      if (!diff.equal) throw new Error(`Legacy snapshot backfill mismatch: ${Object.entries(diff.collections).filter(([, c]) => !c.equal).map(([name]) => name).join(', ')}`);
    }
    this.db.prepare("UPDATE durable_state SET revision = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1").run();
  }

  private currentRevision(): string {
    const row = this.db.prepare('SELECT revision FROM durable_state WHERE id=1').get() as { revision: number } | undefined;
    if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Missing or invalid durable state revision');
    return `rev:${row.revision}`;
  }

  // Call only inside an open write transaction: the bump commits or rolls back with the write.
  private bumpRevision(updatedAt: string): string {
    const result = this.db.prepare('UPDATE durable_state SET revision = revision + 1, updated_at = ? WHERE id=1').run(updatedAt);
    if (result.changes !== 1) throw new Error('Missing durable state revision');
    return this.currentRevision();
  }

  private assertAuditFormat(): void {
    const marker = this.db.prepare('SELECT version FROM learner_audit_format WHERE id=1').get() as { version: number } | undefined;
    if (marker?.version !== 1) throw new Error('Missing or unsupported initialized learner audit format');
    if (this.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Invalid active history membership');
  }

  private selectHistory(snapshot: { reviewEvents: readonly ReviewEvent[]; practiceAttempts: readonly PracticeAttempt[] }): void {
    this.db.prepare('DELETE FROM active_review_event').run();
    this.db.prepare('DELETE FROM active_practice_attempt').run();
    const review = this.db.prepare('INSERT INTO active_review_event (id) VALUES (?)');
    const practice = this.db.prepare('INSERT INTO active_practice_attempt (id) VALUES (?)');
    for (const e of snapshot.reviewEvents) review.run(e.id);
    for (const a of snapshot.practiceAttempts) practice.run(a.id);
  }

  // v9 migration hook. Runs only inside the v9 migration, i.e. before v12 renames the blob table, so it still reads the
  // historical name. It no longer rewrites the blob: v12 backfills the tables from it and overlays this relational history.
  private initializeActiveAudit(): void {
    const row = this.db.prepare('SELECT snapshot_json, schema_version FROM lingotorte_snapshots WHERE snapshot_key=?').get(SNAPSHOT_KEY) as SnapshotRow | undefined;
    if (row && (row.schema_version ?? 0) > 11) throw new Error('Unsupported future snapshot schema');
    let raw: unknown;
    try { raw = row ? JSON.parse(row.snapshot_json) : undefined; } catch { throw new Error('Corrupt legacy snapshot'); }
    if (row && (!raw || typeof raw !== 'object' || Array.isArray(raw))) throw new Error('Corrupt legacy snapshot');
    if (row) {
      const record = raw as Record<string, unknown>;
      for (const name of ['reviewEvents', 'practiceAttempts', 'importJobEvents']) if (record[name] !== undefined && !Array.isArray(record[name])) throw new Error('Corrupt legacy snapshot history');
      if (!record.mediaAssets || typeof record.mediaAssets !== 'object' || Array.isArray(record.mediaAssets)) throw new Error('Corrupt legacy snapshot');
      for (const name of ['mediaAssets', 'savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates']) if (record[name] !== undefined && (!record[name] || typeof record[name] !== 'object' || Array.isArray(record[name]))) throw new Error('Corrupt legacy snapshot collection');
    }
    const snapshot = row ? normalizeLocalStoreSnapshot(raw) : createEmptyLocalStoreSnapshot();
    const tableReviews = [...this.listAuditReviewEvents()]; const tableAttempts = [...this.listAuditPracticeAttempts()];
    const recovery = {
      snapshotOnlyReviews: snapshot.reviewEvents.filter(e => !tableReviews.some(t => t.id === e.id)).length,
      tableOnlyReviews: tableReviews.filter(e => !snapshot.reviewEvents.some(t => t.id === e.id)).length,
      snapshotOnlyAttempts: snapshot.practiceAttempts.filter(e => !tableAttempts.some(t => t.id === e.id)).length,
      tableOnlyAttempts: tableAttempts.filter(e => !snapshot.practiceAttempts.some(t => t.id === e.id)).length,
    };
    const audit = normalizeLearnerAudit(snapshot.learnerAudit, {
      reviewEvents: unionHistory('reviewEvents', tableReviews, snapshot.reviewEvents),
      practiceAttempts: unionHistory('practiceAttempts', tableAttempts, snapshot.practiceAttempts),
    });
    const inconsistencies = {
      orphanReviews: audit.reviewEvents.filter(e => !Object.hasOwn(snapshot.reviewCards, e.cardId)).length,
      orphanAttempts: audit.practiceAttempts.filter(a => !Object.hasOwn(snapshot.reviewCards, a.cardId)).length,
      unresolvedAttemptLinks: audit.practiceAttempts.filter(a => a.eventLink.reviewEventId !== undefined && !audit.reviewEvents.some(e => e.id === a.eventLink.reviewEventId && e.cardId === a.cardId)).length,
    };
    this.appendLearnerAudit(audit);
    const active = { ...snapshot, reviewEvents: audit.reviewEvents, practiceAttempts: audit.practiceAttempts, learnerAudit: audit };
    // Backfill only append-only import-job events; do not rewrite unrelated projections.
    const insert = this.db.prepare('INSERT INTO import_job_event (id, job_id, level, message, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?)');
    const existing = new Map(this.listImportJobEvents().map(e => [e.id, e]));
    for (const event of snapshot.importJobEvents) {
      const prior = existing.get(event.id);
      if (prior && !sameImportJobEventPayload(prior, event)) throw new Error(`Conflicting legacy import-job event ${event.id}`);
      if (!prior) { insert.run(event.id, event.jobId, event.level, event.message, event.createdAt, event.dataJson ?? null); existing.set(event.id, event); }
    }
    this.selectHistory(active);
    this.db.prepare('INSERT INTO learner_audit_format (id, version, recovery_json) VALUES (1, 1, ?)').run(JSON.stringify({ ...recovery, ...inconsistencies }));
  }

  // Every non-transcript projection, plus append-only history and active membership. Runs inside a write transaction.
  private writeLearnerProjections(snapshot: LearnerStateSnapshot): void {
    this.appendLearnerAudit(snapshot.learnerAudit ?? normalizeLearnerAudit(undefined, snapshot));
    this.selectHistory(snapshot);
    this.saveMediaAssetProjection(snapshot);
    this.saveSubtitleTrackProjection(snapshot);
    this.saveLearnerSourceProjections(snapshot);
    this.saveReviewPracticeJobProjections(snapshot);
    this.saveExportJobProjection(snapshot);
    this.saveProviderPolicyProjection(snapshot);
  }

  // Merge the incoming learner state with retained history (never reactivating inactive history implicitly).
  private learnerCandidate(normalized: LocalStoreSnapshot): LearnerStateSnapshot {
    const current = this.loadSnapshotFromTables(false);
    const audit = normalizeLearnerAudit(current.learnerAudit, current);
    for (const name of ['reviewEvents', 'practiceAttempts'] as const) {
      const active = new Set(current[name].map(e => e.id)); const retained = new Set(audit[name].map(e => e.id));
      if (normalized[name].some(e => retained.has(e.id) && !active.has(e.id))) throw new TypeError('Explicit restore required to reactivate inactive history');
    }
    return withoutTranscripts({ ...normalized,
      reviewEvents: unionHistory('reviewEvents', current.reviewEvents, normalized.reviewEvents),
      practiceAttempts: unionHistory('practiceAttempts', current.practiceAttempts, normalized.practiceAttempts),
      learnerAudit: { version: 1 as const,
        reviewEvents: unionHistory('reviewEvents', audit.reviewEvents, normalized.learnerAudit!.reviewEvents),
        practiceAttempts: unionHistory('practiceAttempts', audit.practiceAttempts, normalized.learnerAudit!.practiceAttempts) },
      // Import-job events are append-only: retained events stay; a conflicting payload is rejected on write.
      importJobEvents: [...new Map([...current.importJobEvents, ...normalized.importJobEvents].map(e => [e.id, e])).values()],
    });
  }

  // Write a learner candidate and verify the tables read it back exactly. Runs inside a write transaction.
  private writeLearnerCandidate(candidate: LearnerStateSnapshot): LearnerStateSnapshot {
    this.writeLearnerProjections(candidate);
    const authoritative = withoutTranscripts(this.loadSnapshotFromTables(false));
    const diff = diffSnapshots(normalizeLocalStoreSnapshot(candidate), normalizeLocalStoreSnapshot(authoritative), LEARNER_COLLECTIONS);
    if (!diff.equal) throw new Error(`Durable candidate readback mismatch: ${Object.entries(diff.collections).filter(([, c]) => !c.equal).map(([name]) => name).join(', ')}`);
    return authoritative;
  }

  // Insert one track's bundle; the caller has checked that the track has no stored cue rows. Runs inside a write transaction.
  private insertTrackBundle(trackId: string, bundle: TrackTranscriptBundle): void {
    if (bundle.cues.some(cue => cue.trackId !== trackId) || bundle.wordTimings.some(timing => timing.trackId !== trackId)) throw new TypeError('Transcript bundle rows must belong to the addressed track');
    this.saveTranscriptProjections({ cues: Object.fromEntries(bundle.cues.map(cue => [cue.id, cue])), transcriptWordTimings: Object.fromEntries(bundle.wordTimings.map(timing => [timing.id, timing])) });
  }

  private write<T>(expectedRevision: string | undefined, updatedAt: string, body: () => T): { result: T; revision: string } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (expectedRevision !== undefined) this.assertDocumentBasis(expectedRevision);
      const result = body();
      const revision = this.bumpRevision(updatedAt);
      this.markNonOperationWrite(revision);
      this.db.exec('COMMIT'); return { result, revision };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  // lt-192.3 (ADR-0004 §3): a document writer's basis is current when no NON-operation write happened after it. Only
  // operations may have committed in between; they own disjoint rows, which the document fence reconciles. Inside a
  // write transaction.
  private assertDocumentBasis(expectedRevision: string): void {
    const current = this.currentRevision();
    if (expectedRevision === current) return;
    const expected = /^rev:(\d{1,15})$/.exec(expectedRevision);
    const n = expected ? Number(expected[1]) : NaN;
    if (!Number.isSafeInteger(n) || n > revisionNumber(current) || n < this.operationState().last_non_operation_revision) throw new SnapshotRevisionConflictError();
  }

  // Every non-operation writer (learner state, transcript bundle, fixture snapshot, restore) records its revision.
  private markNonOperationWrite(revision: string): void {
    if (this.db.prepare('UPDATE learner_operation_state SET last_non_operation_revision = ? WHERE id = 1').run(revisionNumber(revision)).changes !== 1) throw new Error('Missing learner operation state');
  }

  private operationState(): OperationStateRow {
    const row = this.db.prepare('SELECT generation, last_non_operation_revision, next_receipt_seq, pruned_through_seq, protection_active FROM learner_operation_state WHERE id = 1').get() as OperationStateRow | undefined;
    if (!row) throw new Error('Missing learner operation state');
    return row;
  }

  /** Save learner state (everything except transcript bundles) under whole-document CAS; returns the new revision.
   *  Transcript bundles are written per track through saveTrackTranscript and are never touched here. */
  /**
   * lt-192.3: `fence`, when given, receives whether the operation fence reconciled a stale view of operation-owned rows
   * and, if so, the authoritative operation-owned rows now stored (so the client can install them).
   */
  saveLearnerState(state: LearnerStateSnapshot, expectedRevision: string, updatedAt = new Date().toISOString(), fence?: { reconciled?: boolean | undefined; operationOwned?: Pick<LearnerStateSnapshot, OperationOwnedCollection> | unknown }): string {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('Invalid learner state');
    if (TRANSCRIPT_KEYS.some(key => Object.hasOwn(state, key))) throw new TypeError('Learner state must not carry cues or transcriptWordTimings');
    if (typeof expectedRevision !== 'string') throw new TypeError('Invalid durable state revision');
    const { result, revision } = this.write(expectedRevision, updatedAt, () => {
      const fenced = this.fenceOperationOwned(withoutTranscripts(normalizeLocalStoreSnapshot(state)), expectedRevision);
      const stored = this.writeLearnerCandidate(this.learnerCandidate(normalizeLocalStoreSnapshot(fenced.candidate)));
      return { reconciled: fenced.reconciled, stored };
    });
    if (fence) {
      fence.reconciled = result.reconciled;
      if (result.reconciled) {
        const { savedItems, savedOccurrences, reviewCards, reviewCardStates } = result.stored;
        fence.operationOwned = { savedItems, savedOccurrences, reviewCards, reviewCardStates };
      }
    }
    return revision;
  }

  // lt-192.3 (ADR-0004 §3): inside the write transaction. Before any operation was applied the document path keeps its
  // historical whole-document semantics; afterwards operation-owned rows are fenced (see reconcileOperationOwned).
  private fenceOperationOwned(body: LearnerStateSnapshot, expectedRevision: string): { candidate: LearnerStateSnapshot; reconciled: boolean } {
    if (this.operationState().protection_active !== 1) return { candidate: body, reconciled: false };
    const basis = revisionNumber(expectedRevision);
    const touched = this.db.prepare('SELECT revision, history_json FROM operation_owned_row WHERE collection = ? AND row_id = ?');
    return reconcileOperationOwned(body, withoutTranscripts(this.loadSnapshotFromTables(false)), (collection, id) => {
      const row = touched.get(collection, id) as { revision: number; history_json: string } | undefined;
      if (!row || row.revision <= basis) return undefined;
      // History since the basis: the first later touch's before-image is the row AT the basis; then each after-image.
      const since = parseRowHistory(row.history_json).filter(entry => entry.revision > basis);
      return since.length ? [since[0]!.before, ...since.map(entry => entry.after)] : [];
    });
  }

  /** lt-584.5 (plan 2.4): ids of the given learner-state tracks that are not `candidate`, have no stored bundle, and
   *  are not already stored as a non-candidate track (rows saved before the strict contract stay accepted, so an
   *  existing database never becomes unsavable). Read in one transaction. */
  tracksMissingTranscriptBundle(tracks: Readonly<Record<string, unknown>>): string[] {
    return this.read(() => Object.entries(tracks).filter(([trackId, track]) => {
      if (track && typeof track === 'object' && (track as { transcriptStatus?: unknown }).transcriptStatus === 'candidate') return false;
      if (this.trackHasCues(trackId)) return false;
      const stored = this.db.prepare('SELECT transcript_status FROM subtitle_track WHERE id = ? LIMIT 1').get(trackId) as { transcript_status: string } | undefined;
      return !stored || stored.transcript_status === 'candidate';
    }).map(([trackId]) => trackId));
  }

  /** Write one track's transcript bundle once (write-once per track) under CAS; returns the new revision. */
  saveTrackTranscript(trackId: string, bundle: TrackTranscriptBundle, expectedRevision: string, updatedAt = new Date().toISOString()): string {
    if (typeof expectedRevision !== 'string') throw new TypeError('Invalid durable state revision');
    if (!bundle || !Array.isArray(bundle.cues) || !Array.isArray(bundle.wordTimings) || bundle.cues.length === 0) throw new TypeError('Invalid transcript bundle');
    const cueIds = new Set(bundle.cues.map(cue => cue.id));
    if (cueIds.size !== bundle.cues.length || bundle.wordTimings.some(timing => !cueIds.has(timing.cueId))) throw new TypeError('Invalid transcript bundle');
    return this.write(expectedRevision, updatedAt, () => {
      if (this.trackHasCues(trackId)) throw new TranscriptBundleConflictError(trackId);
      this.insertTrackBundle(trackId, bundle);
    }).revision;
  }

  /** @internal Composition kept for fixtures: one transaction, one bump. Each track's bundle in the snapshot is written
   *  once when the track has no stored cues, must equal the stored bundle exactly otherwise (never rewritten), and then
   *  the learner state is saved under the same operation-ownership fence as saveLearnerState. */
  saveSnapshot(snapshot: LocalStoreSnapshot, updatedAt = new Date().toISOString(), expectedRevision?: string): string {
    const normalized = normalizeLocalStoreSnapshot(snapshot);
    return this.write(expectedRevision, updatedAt, () => {
      for (const [trackId, bundle] of groupByTrack(normalized)) {
        if (bundle.cues.length === 0) throw new TypeError('Invalid transcript bundle: word timings without cues');
        if (!this.trackHasCues(trackId)) { this.insertTrackBundle(trackId, bundle); continue; }
        if (!sameBundle(this.bundleForTrack(trackId), bundle)) throw new TranscriptBundleConflictError(trackId);
      }
      // lt-192.3: the fixture writer is fenced exactly like saveLearnerState (no undeclared bypass); without an expected
      // revision its basis is the current revision, so it may not change any operation-owned row.
      const fenced = this.fenceOperationOwned(withoutTranscripts(normalized), expectedRevision ?? this.currentRevision());
      this.writeLearnerCandidate(this.learnerCandidate(normalizeLocalStoreSnapshot(fenced.candidate)));
    }).revision;
  }

  private restorePlan(manifest: unknown, mode: RestoreMode, expectedRevision: string, stagedAudit?: LearnerAudit) {
    if (typeof expectedRevision !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(expectedRevision)) throw new TypeError('Invalid durable state revision');
    const current = normalizeLocalStoreSnapshot(withoutTranscripts(this.loadSnapshotFromTables(false)));
    // lt-192.3: restore preview AND confirmation stay bound to the exact revision previewed (strict CAS). Unlike document
    // saves, a restore is never rebased over intervening operations: their effects were not in the learner's preview.
    if (expectedRevision !== this.currentRevision()) throw new SnapshotRevisionConflictError();
    const audit = normalizeLearnerAudit(current.learnerAudit, current);
    const staged = stagedAudit === undefined ? audit : normalizeLearnerAudit(stagedAudit, { reviewEvents: [], practiceAttempts: [] });
    const combined = { reviewEvents: unionHistory('reviewEvents', audit.reviewEvents, staged.reviewEvents), practiceAttempts: unionHistory('practiceAttempts', audit.practiceAttempts, staged.practiceAttempts) };
    const plan = planLearnerRestore(manifest, mode, current, combined);
    for (const name of ['reviewEvents', 'practiceAttempts'] as const) plan.auditEffects[name].appended = plan.audit[name].length - audit[name].length;
    return plan;
  }

  previewRestore(manifest: unknown, mode: RestoreMode, expectedRevision: string, learnerAudit?: LearnerAudit) {
    return this.read(() => {
      const plan = this.restorePlan(manifest, mode, expectedRevision, learnerAudit);
      return { revision: expectedRevision, capability: 'active-audit-restore-v1' as const, preview: plan.preview };
    });
  }

  commitRestore(request: DurableRestoreRequest) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const plan = this.restorePlan(request.manifest, request.mode, request.expectedRevision, request.learnerAudit);
      const confirmation = requireRestoreConfirmation(request.confirmation);
      if (confirmation.confirmReplace !== (request.mode === 'replace-active') || confirmation.confirmOverwrite !== (request.mode === 'merge')) throw new TypeError('Restore mode confirmation mismatch');
      for (const warning of plan.preview.warnings) if (!confirmation.acknowledgedWarnings.includes(warning.kind)) throw new TypeError('Restore warning not acknowledged');
      const updatedAt = new Date().toISOString();
      const candidate = withoutTranscripts(plan.candidate);
      const state = this.writeLearnerCandidate(candidate);
      if (!diffSnapshots(normalizeLocalStoreSnapshot({ ...candidate, importJobEvents: state.importJobEvents }), normalizeLocalStoreSnapshot(state), LEARNER_COLLECTIONS).equal) throw new Error('Restore result reconciliation mismatch');
      const snapshot = this.loadSnapshot();
      const revision = this.bumpRevision(updatedAt);
      this.markNonOperationWrite(revision);
      // lt-192.3: a restore starts a new operation lineage; unknown intents of the old lineage are refused, not applied.
      this.db.prepare('UPDATE learner_operation_state SET generation = ? WHERE id = 1').run(randomBytes(16).toString('hex'));
      const receipt = { mode: plan.mode, effects: plan.effects, auditEffects: plan.auditEffects, coalesced: plan.coalesced,
        integrity: plan.integrity, durability: 'durable-committed/readback-verified' as const, durablySaved: true as const };
      this.db.exec('COMMIT'); return { snapshot, revision, receipt, capability: 'active-audit-restore-v1' as const };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  /** lt-192.3: the operation identity a client needs to build eligible requests, read with the learner state. */
  loadLearnerStateWithOperations(): { state: LearnerStateSnapshot; revision: string; operations: LearnerOperationIdentity } {
    return this.read(() => ({ state: withoutTranscripts(this.loadSnapshotFromTables(false)), revision: this.currentRevision(), operations: this.operationIdentity() }));
  }

  private operationIdentity(): LearnerOperationIdentity {
    const state = this.operationState();
    return { generation: state.generation, incarnation: this.incarnation, receiptSeq: state.next_receipt_seq - 1, prunedThroughSeq: state.pruned_through_seq, protectionActive: state.protection_active === 1 };
  }

  private storedReceipt(operationId: string): { receipt: LearnerOperationReceipt; requestSha256: string } | undefined {
    const row = this.db.prepare('SELECT request_sha256, receipt_json FROM learner_operation_receipt WHERE operation_id = ?').get(operationId) as { request_sha256: string; receipt_json: string } | undefined;
    return row ? { receipt: JSON.parse(row.receipt_json) as LearnerOperationReceipt, requestSha256: row.request_sha256 } : undefined;
  }

  /**
   * lt-192.3 (ADR-0004 §2): apply one learner operation exactly once. In ONE `BEGIN IMMEDIATE` transaction: look up the
   * receipt; a retained receipt for the same request is returned as is (no second effect), for a different request it
   * is refused. An unknown id must be eligible (same lineage generation and process incarnation, basis not older than
   * the pruned boundary). Then `apply` runs against the authoritative rows; only operation-owned collections may change.
   * Changed rows are written, ownership stamps, revision, terminal receipt and pruning commit together or not at all.
   */
  applyLearnerOperation(request: LearnerOperationRequest, apply: (context: LearnerOperationContext) => LearnerOperationOutcome, now = new Date()): { receipt: LearnerOperationReceipt; replayed: boolean; operations: LearnerOperationIdentity } {
    const requestSha256 = createHash('sha256').update(learnerOperationRequestDigestInput(request)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.storedReceipt(request.operationId);
      if (prior) {
        if (prior.requestSha256 !== requestSha256) throw new OperationIdReusedError();
        const operations = this.operationIdentity();
        this.db.exec('COMMIT');
        return { receipt: prior.receipt, replayed: true, operations };
      }
      const state = this.operationState();
      if (request.basis.generation !== state.generation) throw new OperationIneligibleError('generation-changed', 'The service state was restored or replaced since this change was made; it was not applied.');
      if (request.basis.incarnation !== this.incarnation) throw new OperationIneligibleError('incarnation-changed', 'The service restarted since this change was made and has no record of it; it was not applied.');
      if (request.basis.receiptSeq < state.pruned_through_seq) throw new OperationIneligibleError('operation-expired', 'This change is older than the service keeps records for; it was not applied.');
      if (request.basis.receiptSeq > state.next_receipt_seq - 1) throw new OperationIneligibleError('invalid-basis', 'This change names service state that does not exist; it was not applied.');
      const before = withoutTranscripts(this.loadSnapshotFromTables(false));
      const store = new LocalStore({ ...before, cues: {}, transcriptWordTimings: {} });
      const context: LearnerOperationContext = {
        store, now,
        loadTrackBundle: (trackId) => {
          const bundle = this.bundleForTrack(trackId);
          for (const cue of bundle.cues) store.putCue(cue);
          for (const timing of bundle.wordTimings) store.putTranscriptWordTiming(timing);
          return bundle.cues.length > 0;
        },
        receipt: (operationId) => {
          const stored = this.storedReceipt(operationId)?.receipt;
          return stored && stored.generation === state.generation ? stored : undefined;
        },
      };
      const outcome = apply(context);
      const after = withoutTranscripts(store.snapshot());
      for (const name of LEARNER_COLLECTIONS) {
        if ((OPERATION_OWNED_COLLECTIONS as readonly string[]).includes(name)) continue;
        if (JSON.stringify(normalizeLocalStoreSnapshot(before)[name]) !== JSON.stringify(normalizeLocalStoreSnapshot(after)[name])) throw new Error(`Learner operation changed a document-owned collection: ${name}`);
      }
      const diff = diffOperationOwned(before, after);
      const changedIds = Object.fromEntries(OPERATION_OWNED_COLLECTIONS.map(name => [name, Object.keys(diff.rows[name])])) as Record<OperationOwnedCollection, string[]>;
      const changed = OPERATION_OWNED_COLLECTIONS.map(name => changedIds[name].length > 0 || diff.removed[name].length > 0);
      if (outcome.status === 'applied') {
        // The receipt also carries the current images of the item/card it names (e.g. a dedup capture's existing item),
        // so the client can show the canonical rows without a full reload.
        const named = outcome.result as { savedItemId?: unknown; occurrenceId?: unknown; cardId?: unknown };
        if (typeof named.savedItemId === 'string' && after.savedItems[named.savedItemId]) diff.rows.savedItems[named.savedItemId] ??= after.savedItems[named.savedItemId];
        if (typeof named.occurrenceId === 'string' && after.savedOccurrences[named.occurrenceId]) diff.rows.savedOccurrences[named.occurrenceId] ??= after.savedOccurrences[named.occurrenceId];
        if (typeof named.cardId === 'string' && after.reviewCards[named.cardId]) {
          diff.rows.reviewCards[named.cardId] ??= after.reviewCards[named.cardId];
          if (after.reviewCardStates[named.cardId]) diff.rows.reviewCardStates[named.cardId] ??= after.reviewCardStates[named.cardId];
        }
      }
      let revision = this.currentRevision();
      if (outcome.status === 'applied') {
        const committedAt = now.toISOString();
        if (changed.some(Boolean)) {
          const stored = this.writeLearnerCandidate({ ...before, savedItems: after.savedItems, savedOccurrences: after.savedOccurrences, reviewCards: after.reviewCards, reviewCardStates: after.reviewCardStates });
          revision = this.bumpRevision(committedAt);
          // Per-row stamp plus the authoritative before/after images, so a later stale document save can prove that a
          // differing row is an unmodified historical view (reconcileOperationOwned). Entries at or before the last
          // non-operation write can never be needed again (no document basis may predate it) and are dropped.
          const keepAfter = state.last_non_operation_revision;
          const read = this.db.prepare('SELECT history_json FROM operation_owned_row WHERE collection = ? AND row_id = ?');
          const stamp = this.db.prepare(`INSERT INTO operation_owned_row (collection, row_id, revision, history_json) VALUES (?, ?, ?, ?)
            ON CONFLICT(collection, row_id) DO UPDATE SET revision = excluded.revision, history_json = excluded.history_json`);
          const image = (rows: Record<string, unknown>, id: string) => Object.hasOwn(rows, id) ? canonicalJson(rows[id]) : null;
          for (const name of OPERATION_OWNED_COLLECTIONS) for (const id of [...changedIds[name], ...diff.removed[name]]) {
            const prior = (read.get(name, id) as { history_json: string } | undefined)?.history_json;
            const history = parseRowHistory(prior ?? '[]').filter(entry => entry.revision > keepAfter);
            history.push({ revision: revisionNumber(revision), before: image(before[name] as Record<string, unknown>, id), after: image(stored[name] as Record<string, unknown>, id) });
            stamp.run(name, id, revisionNumber(revision), JSON.stringify(history));
          }
        }
        this.db.prepare('UPDATE learner_operation_state SET protection_active = 1 WHERE id = 1').run();
      }
      const seq = state.next_receipt_seq;
      const receipt: LearnerOperationReceipt = {
        operationId: request.operationId, kind: request.kind, status: outcome.status, seq, revision, generation: state.generation,
        committedAt: now.toISOString(), result: outcome.result,
        rows: outcome.status === 'applied' ? diff.rows : { savedItems: {}, savedOccurrences: {}, reviewCards: {}, reviewCardStates: {} },
        removed: outcome.status === 'applied' ? diff.removed : { savedItems: [], savedOccurrences: [], reviewCards: [], reviewCardStates: [] },
      };
      this.db.prepare(`INSERT INTO learner_operation_receipt (operation_id, seq, kind, request_sha256, status, revision, generation, incarnation, committed_at, receipt_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(request.operationId, seq, request.kind, requestSha256, outcome.status, revisionNumber(revision), state.generation, this.incarnation, receipt.committedAt, JSON.stringify(receipt));
      this.db.prepare('UPDATE learner_operation_state SET next_receipt_seq = ? WHERE id = 1').run(seq + 1);
      this.pruneOperationReceipts(now);
      const operations = this.operationIdentity();
      this.db.exec('COMMIT');
      return { receipt, replayed: false, operations };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* the failed statement already ended the transaction */ }
      throw error;
    }
  }

  // Inside the operation transaction: keep at most LEARNER_OPERATION_RECEIPT_CAP receipts, none past the TTL, and move
  // the eligibility boundary past every pruned sequence so an unknown request from before it is refused, never re-applied.
  private pruneOperationReceipts(now: Date): void {
    const cutoff = new Date(now.valueOf() - LEARNER_OPERATION_RECEIPT_TTL_MS).toISOString();
    const maxSeq = (this.db.prepare('SELECT MAX(seq) AS seq FROM learner_operation_receipt').get() as { seq: number | null }).seq ?? 0;
    const byCap = maxSeq - LEARNER_OPERATION_RECEIPT_CAP;
    const doomed = this.db.prepare('SELECT MAX(seq) AS seq FROM learner_operation_receipt WHERE committed_at < ? OR seq <= ?').get(cutoff, byCap) as { seq: number | null };
    if (doomed.seq === null) return;
    // Sequences are monotonic, so pruning by age removes a prefix; the boundary is the highest pruned sequence.
    this.db.prepare('DELETE FROM learner_operation_receipt WHERE seq <= ?').run(doomed.seq);
    this.db.prepare('UPDATE learner_operation_state SET pruned_through_seq = MAX(pruned_through_seq, ?) WHERE id = 1').run(doomed.seq);
  }

  close(): void {
    this.db.close();
  }
}
