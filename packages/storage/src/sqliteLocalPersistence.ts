import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
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
import { LocalStore, createEmptyLocalStoreSnapshot, normalizeLocalStoreSnapshot, type LocalStoreSnapshot } from './localStore.ts';

const CURRENT_SCHEMA_VERSION = 6;
const SNAPSHOT_KEY = 'default';

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

type SnapshotRow = Readonly<{
  snapshot_json: string;
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
  appliedMigrations: readonly SqliteSchemaMigration[];
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

function sameReviewEventPayload(a: ReviewEvent, b: ReviewEvent): boolean {
  return (
    a.id === b.id &&
    a.cardId === b.cardId &&
    a.reviewedAt === b.reviewedAt &&
    a.rating === b.rating &&
    (a.responseMs ?? null) === (b.responseMs ?? null) &&
    a.previousStateJson === b.previousStateJson &&
    a.nextStateJson === b.nextStateJson &&
    (a.deviceId ?? null) === (b.deviceId ?? null) &&
    a.createdAt === b.createdAt
  );
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
];

export class SqliteLocalPersistence {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
    this.initialize();
  }

  static open(databasePath: string): SqliteLocalPersistence {
    if (databasePath !== ':memory:' && !databasePath.startsWith('/')) {
      throw new TypeError('SQLite local persistence path must be absolute, or :memory: for tests.');
    }
    return new SqliteLocalPersistence(new DatabaseSync(databasePath));
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result = 'applied')
      );
    `);
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
    return rows.map((row) => ({
      id: row.id,
      trackId: row.track_id,
      cueIndex: row.cue_index,
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.text,
      normalizedText: row.normalized_text,
      textSha256: row.text_sha256 as Sha256Digest,
      createdAt: row.created_at,
    }));
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
    return rows.map((row) => {
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
    });
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
    return rows.map((row) => ({
      id: row.id,
      mediaId: row.media_id,
      path: row.path,
      sizeBytes: row.size_bytes,
      mtimeMs: row.mtime_ms,
      contentSha256: row.content_sha256 as Sha256Digest,
      observedAt: row.observed_at,
      exists: row.exists_on_disk === 1,
    }));
  }

  listSavedItems(): readonly SavedItem[] {
    const rows = this.db
      .prepare(`
        SELECT id, kind, language, display_text, meaning, notes,
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

  private saveMediaAssetProjection(snapshot: LocalStoreSnapshot): void {
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

  private saveTranscriptProjections(snapshot: LocalStoreSnapshot): void {
    this.db.prepare('DELETE FROM transcript_word_timing').run();
    this.db.prepare('DELETE FROM cue').run();
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

  private saveLearnerSourceProjections(snapshot: LocalStoreSnapshot): void {
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
        id, kind, language, display_text, meaning, notes,
        created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of Object.values(snapshot.savedItems)) {
      insertSavedItem.run(
        item.id,
        item.kind,
        item.language,
        item.displayText,
        item.meaning ?? null,
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

  private saveReviewPracticeJobProjections(snapshot: LocalStoreSnapshot): void {
    this.db.prepare('DELETE FROM import_job').run();
    this.db.prepare('DELETE FROM practice_attempt').run();
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
        if (!sameReviewEventPayload(reviewEventFromRow(existing), event)) {
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
    for (const attempt of snapshot.practiceAttempts) {
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

  private saveExportJobProjection(snapshot: LocalStoreSnapshot): void {
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

  status(): SqliteLocalPersistenceStatus {
    const hasSnapshot = this.db
      .prepare('SELECT 1 FROM lingotorte_snapshots WHERE snapshot_key = ? LIMIT 1')
      .get(SNAPSHOT_KEY) !== undefined;
    const schemaRow = this.db
      .prepare('SELECT MAX(version) AS schema_version FROM schema_migration WHERE result = ?')
      .get('applied') as SchemaVersionRow;
    return {
      schemaVersion: schemaRow.schema_version ?? CURRENT_SCHEMA_VERSION,
      hasSnapshot,
      appliedMigrations: this.listMigrations(),
    };
  }

  loadSnapshot(): LocalStoreSnapshot {
    const row = this.db
      .prepare('SELECT snapshot_json FROM lingotorte_snapshots WHERE snapshot_key = ? LIMIT 1')
      .get(SNAPSHOT_KEY) as SnapshotRow | undefined;
    const snapshot = row ? normalizeLocalStoreSnapshot(JSON.parse(row.snapshot_json)) : createEmptyLocalStoreSnapshot();
    return {
      ...snapshot,
      reviewEvents: [...this.listReviewEvents()],
      importJobEvents: [...this.listImportJobEvents()],
    };
  }

  saveSnapshot(snapshot: LocalStoreSnapshot, updatedAt = new Date().toISOString()): void {
    const normalized = normalizeLocalStoreSnapshot(snapshot);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(`
          INSERT INTO lingotorte_snapshots (snapshot_key, schema_version, snapshot_json, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(snapshot_key) DO UPDATE SET
            schema_version = excluded.schema_version,
            snapshot_json = excluded.snapshot_json,
            updated_at = excluded.updated_at
        `)
        .run(SNAPSHOT_KEY, CURRENT_SCHEMA_VERSION, JSON.stringify(normalized), updatedAt);
      this.saveMediaAssetProjection(normalized);
      this.saveTranscriptProjections(normalized);
      this.saveLearnerSourceProjections(normalized);
      this.saveReviewPracticeJobProjections(normalized);
      this.saveExportJobProjection(normalized);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  saveStore(store: LocalStore, updatedAt?: string): void {
    this.saveSnapshot(store.snapshot(), updatedAt);
  }

  hydrateStore(): LocalStore {
    return new LocalStore(this.loadSnapshot());
  }

  close(): void {
    this.db.close();
  }
}
