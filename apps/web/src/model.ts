import { requireServiceNativePath, readNativePathPolicy, NATIVE_PATH_COMPATIBILITY_MESSAGE, type NativePathPolicy } from '../../../packages/domain/src/nativePaths.ts';
import { LocalStore, type LocalStoreSnapshot } from '../../../packages/storage/src/localStore';
import { planLearnerRestore } from '../../../packages/storage/src/restorePlanner.ts';
import { sameHistoryPayload, unionHistory } from '../../../packages/storage/src/learnerAudit.ts';
import { SavedOccurrenceService } from '../../../packages/storage/src/savedOccurrenceService';
import { PracticeService } from '../../../packages/storage/src/practiceService';
import { ExportService, RestoreService } from '../../../packages/storage/src/exportRestoreService';
import { defaultProviderPolicy, makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming, computeExportIntegrity, sha256HexBytes } from '@lingotorte/domain';
import { resolveLocalAdapters, makeWhitespaceTokenizer, makeUnavailableDictionaryAdapter } from '@lingotorte/language';
import { ReviewService, defaultFsrsConfig } from '@lingotorte/review';
import type {
  Cue,
  MediaAsset,
  SavedItem,
  SavedOccurrence,
  ReviewCard,
  LookupOutput,
  SubtitleTrack,
  SubtitleFormat,
  ReviewCardState,
  Rating,
  Sha256Digest,
  SourceKind,
  TranscriptQualityReport,
  TranscriptSourceKind,
  TranscriptWarningFlag,
  TranscriptWordTimingSourceKind,
} from '@lingotorte/domain';
import type { AppModel, BrowserLocalMediaState, BrowserMediaPermissionState, EmbeddedSubtitleTrackState, PlayerState, ReviewBucketConfig } from './uiTypes';
import { buildSourceContext, defaultReviewBucketConfig } from './uiTypes';
import browserFixtureMediaUrl from '../../../fixtures/media/synthetic-polish-dialogue.webm?url';
import browserFixtureTargetSrt from '../../../fixtures/subtitles/synthetic-polish-dialogue.target.srt?raw';
import browserFixtureNativeSrt from '../../../fixtures/subtitles/synthetic-polish-dialogue.native.srt?raw';

export const CUE_SYNC_TOLERANCE_MS = 100;
export const MIN_PLAYBACK_RATE = 0.5;
export const MAX_PLAYBACK_RATE = 1.5;
export const PLAYBACK_RATE_STEP = 0.1;
// '/' selects same-origin routing; every API client appends an /api path.
// An unset build setting retains the direct local development baseline.
export const DEFAULT_LOCAL_SERVICE_BASE_URL = import.meta.env.VITE_LOCAL_SERVICE_BASE_URL ?? 'http://127.0.0.1:5174';
const HANDLE_LABEL_PREFIX = 'browser-file-handle:';

function emptyBrowserLocalMedia(overrides: Partial<BrowserLocalMediaState> = {}): BrowserLocalMediaState {
  return {
    objectUrl: null,
    sourceLabel: null,
    handleName: null,
    permissionState: 'unavailable',
    lastError: null,
    ...overrides,
  };
}

function handleNameFromSourceLabel(sourceLabel: string | null | undefined): string | null {
  if (!sourceLabel?.startsWith(HANDLE_LABEL_PREFIX)) return null;
  return sourceLabel.slice(HANDLE_LABEL_PREFIX.length);
}

function browserLocalMediaForHydratedMedia(media: MediaAsset | null): BrowserLocalMediaState {
  const originalPath = media?.originalPath ?? null;
  const handleName = handleNameFromSourceLabel(originalPath);
  if (handleName) {
    return emptyBrowserLocalMedia({
      sourceLabel: originalPath,
      handleName,
      permissionState: 'unknown',
    });
  }
  if (originalPath?.startsWith('blob:')) {
    return emptyBrowserLocalMedia({
      sourceLabel: originalPath,
      permissionState: 'unavailable',
      lastError: 'Session-scoped browser object URLs cannot be restored after reload. Re-import the media or use a persistent browser file handle.',
    });
  }
  return emptyBrowserLocalMedia();
}

export function createAppModel(): AppModel {
  const policy = defaultProviderPolicy();
  const store = new LocalStore();
  return {
    store,
    clock: () => new Date(),
    savedOccurrenceService: new SavedOccurrenceService(store),
    reviewService: new ReviewService(store, defaultFsrsConfig()),
    practiceService: new PracticeService(store),
    exportService: new ExportService(store, '0.0.0-p6'),
    restoreService: new RestoreService(store),
    providerPolicy: policy,
    adapters: resolveLocalAdapters(policy, 'pl'),
    player: {
      currentTimeMs: 0,
      durationMs: 0,
      isPlaying: false,
      playbackRate: 1,
      loopCue: false,
      loopRange: null,
      sourceRange: null,
      activeCueId: null,
    },
    currentMedia: null,
    browserLocalMedia: emptyBrowserLocalMedia(),
    targetTrackId: null,
    nativeTrackId: null,
    cues: [],
    selection: null,
    importError: null,
    pendingMeaning: '',
    pendingNotes: '',
    view: 'player',
    transcriptQuery: '',
    transcriptLifecycle: {
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      youtubeLanguage: 'pl',
      publicReadAuthorized: false,
      elevenLabsAuthorized: false,
      localAsrMediaPath: '',
      embeddedSubtitle: {
        mediaPath: '',
        language: 'pl',
        listingStatus: 'idle',
        extractionStatus: 'idle',
        tracks: [],
        selectedStreamIndex: null,
        statusMessage: null,
        errorCode: null,
      },
      pendingCueEdits: {},
      pendingCueTimingEdits: {},
      pendingWordTimingEdits: {},
      lastMessage: null,
    },
    review: {
      currentCardId: null,
      activeCardId: null,
      revealed: false,
    },
    practice: {
      mode: 'typed-input',
      pendingAnswer: '',
      lastAttemptResult: null,
      typedAttemptsEnabled: true,
      cardId: null,
      revealed: false,
      choices: null,
      sentenceBuilder: {
        orderedTokens: [],
        poolTokens: [],
      },
    },
    studyMetrics: {
      totalStudyTimeMs: 0,
      todayStudyTimeMs: 0,
      streakDays: 0,
      lastStudyDate: null,
    },
    exportImport: {
      manifestJson: null,
      preview: null,
      lastError: null,
      acknowledgedWarnings: [],
      confirmOverwrite: false,
      confirmReplace: false,
      lastExport: null,
      lastSaveVerified: null,
      lastRestore: null,
    },
    localService: {
      baseUrl: DEFAULT_LOCAL_SERVICE_BASE_URL,
      status: 'disconnected',
      lastMessage: 'Local service not connected.',
      lastSavedAt: null,
      autosaveEnabled: false,
    },
  };
}

import { exactServiceOrigin, pairTransport, capturedTransport, clearPairing, PAIR_AGAIN, type PairedTransport } from './pairedTransport.ts';

export type LocalServiceSyncResult = Readonly<{
  ok: boolean;
  message: string;
}>;

function normalizeLocalServiceBaseUrl(baseUrl: string): string {
  return exactServiceOrigin(baseUrl);
}

/**
 * lt-cfh: pairing lifecycle hooks for the opt-in remembered pairing. Model code
 * only signals events; it never sees or stores the remembered record.
 */
type PairingHooks = { statusOk?: (origin: string) => void; unauthorized?: () => void };
const pairingHooks = new WeakMap<AppModel, PairingHooks>();
export function observePairingLifecycle(model: AppModel, hooks: PairingHooks): void { pairingHooks.set(model, hooks); }
function pairingHook(model: AppModel, run: (hooks: PairingHooks) => void): void {
  const hooks = pairingHooks.get(model);
  if (hooks) try { run(hooks); } catch { /* remembered pairing is best-effort */ }
}

export function pairLocalService(model: AppModel, capability: string, baseUrl = model.localService.baseUrl): void {
  if (restoreStates.get(model)?.committing) throw new TypeError('Restore pending; wait for acknowledgement/readback before pairing.');
  const origin = exactServiceOrigin(baseUrl);
  setLocalServiceBaseUrl(model, origin);
  pairTransport(model, origin, capability, () => {
    const owner = syncOwner(model);
    ++owner.generation;
    owner.choice = null;
    model.localService.status = 'error';
    model.localService.syncState = 'error';
    model.localService.revision = null;
    model.localService.pathPolicy = null;
    model.localService.autosaveEnabled = false;
    model.localService.lastMessage = PAIR_AGAIN;
    notifySync(model);
    pairingHook(model, (hooks) => hooks.unauthorized?.());
  });
}
export function captureLocalServiceTransport(model: AppModel): PairedTransport {
  const transport = capturedTransport(model, model.localService.baseUrl);
  transportModels.set(transport, model);
  return transport;
}
const transportModels = new WeakMap<PairedTransport, AppModel>();
function serializeServiceJob<T>(transport: PairedTransport, work: () => Promise<T>): Promise<T> {
  const model = transportModels.get(transport);
  if (!model) return work();
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing) return Promise.reject(new TypeError('Restore unresolved; service job not sent.'));
  const owner = syncOwner(model); const generation = owner.generation;
  const run = async () => {
    transport.assertCurrent();
    if (generation !== owner.generation || restoreStates.get(model)?.unknown) throw new TypeError('Service job superseded or restore unresolved.');
    const result = await work();
    transport.assertCurrent();
    if (generation !== owner.generation) throw new TypeError('Service job superseded.');
    return result;
  };
  const result = owner.tail.then(run, run); owner.tail = result; return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class LocalServiceRequestError extends TypeError {
  constructor(readonly status: number, message: string) { super(message); }
}

async function fetchLocalServiceJson(transport: PairedTransport, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await transport.request(path, init);
  const value: unknown = await response.json();
  transport.assertCurrent();
  if (!isPlainObject(value)) {
    throw new TypeError('Local service returned a non-object JSON response.');
  }
  if (!response.ok || value.ok === false) {
    throw new LocalServiceRequestError(response.status, typeof value.error === 'string' ? value.error : `Local service request failed with HTTP ${response.status}`);
  }
  return value;
}

function newestFirst<T extends { importedAt?: string; createdAt?: string; lastSeenAt?: string }>(a: T, b: T): number {
  const aStamp = a.lastSeenAt ?? a.importedAt ?? a.createdAt ?? '';
  const bStamp = b.lastSeenAt ?? b.importedAt ?? b.createdAt ?? '';
  return bStamp.localeCompare(aStamp);
}

function chooseActiveTrack(tracks: SubtitleTrack[], role: 'target' | 'native'): SubtitleTrack | null {
  const candidates = tracks
    .filter((track) => track.role === role && track.isActive)
    .sort((a, b) => b.trackVersion - a.trackVersion || newestFirst(a, b));
  return candidates[0] ?? null;
}

function snapshotHasDurableContent(snapshot: LocalStoreSnapshot): boolean {
  return Object.entries(snapshot).some(([key, value]) => key === 'learnerAudit'
    ? (snapshot.learnerAudit?.reviewEvents.length ?? 0) + (snapshot.learnerAudit?.practiceAttempts.length ?? 0) > 0
    : key !== 'schemaVersion' && value !== null && typeof value === 'object' && Object.keys(value).length > 0);
}

export function projectHydratedSnapshotIntoModel(model: AppModel, snapshot: LocalStoreSnapshot): void {
  const hydrated = model.store.replaceSnapshot(snapshot);
  const media = Object.values(hydrated.mediaAssets).sort(newestFirst)[0] ?? null;
  model.currentMedia = media;
  model.browserLocalMedia = browserLocalMediaForHydratedMedia(media);
  if (!media) {
    model.targetTrackId = null;
    model.nativeTrackId = null;
    model.cues = [];
    model.player.durationMs = 0;
    model.player.activeCueId = null;
    return;
  }

  const tracks = Object.values(hydrated.subtitleTracks).filter((track) => track.mediaId === media.id);
  const targetTrack = chooseActiveTrack(tracks, 'target');
  const nativeTrack = chooseActiveTrack(tracks, 'native');
  model.targetTrackId = targetTrack?.id ?? null;
  model.nativeTrackId = nativeTrack?.id ?? null;
  model.cues = targetTrack ? model.store.listCuesForTrack(targetTrack.id) : [];
  model.player.durationMs = media.durationMs;
  model.player.currentTimeMs = 0;
  model.player.activeCueId = model.cues[0]?.id ?? null;
}

type SyncOwner = {
  generation: number;
  editGeneration: number;
  tail: Promise<unknown>;
  baseline: string | null;
  choice: { snapshot: LocalStoreSnapshot; revision: string; comparison: string } | null;
  notify?: () => void;
};
const syncOwners = new WeakMap<AppModel, SyncOwner>();
/**
 * lt-0zc browser snapshot cache hooks. The cache is a crash/reload buffer, never
 * a source of truth: model code only signals "state changed" and, on boot, may be
 * given the serialized snapshot last acknowledged by a service (bound to its origin)
 * so an unchanged cache does not force the Keep/Load choice on reconnect.
 */
type CacheHooks = { changed?: (model: AppModel) => void; ack?: { baseUrl: string; serialized: string } | null; seeded?: { baseUrl: string; serialized: string } | null };
const cacheHooks = new WeakMap<AppModel, CacheHooks>();
function cacheHook(model: AppModel): CacheHooks {
  let hooks = cacheHooks.get(model);
  if (!hooks) { hooks = {}; cacheHooks.set(model, hooks); }
  return hooks;
}
export function observeSnapshotCacheChanges(model: AppModel, changed: (model: AppModel) => void): void { cacheHook(model).changed = changed; }
function signalSnapshotCache(model: AppModel): void { cacheHook(model).changed?.(model); }
/** Last durable-ack baseline (serialized snapshot + origin) for the cache record, or null. */
export function lastAckedSnapshotBaseline(model: AppModel): Readonly<{ baseUrl: string; serialized: string }> | null { return cacheHook(model).ack ?? null; }
/** Boot-time: seed the cached ack baseline; used only while no live baseline exists for the same origin. */
export function seedCachedAckBaseline(model: AppModel, baseUrl: string, serialized: string): void {
  const value = { baseUrl: normalizeLocalServiceBaseUrl(baseUrl), serialized };
  cacheHook(model).ack = value; cacheHook(model).seeded = value;
}
function recordAckBaseline(model: AppModel, baseUrl: string, serialized: string): void {
  cacheHook(model).ack = { baseUrl: normalizeLocalServiceBaseUrl(baseUrl), serialized };
  cacheHook(model).seeded = null; // live baselines supersede the boot-seeded one
}
function effectiveBaseline(model: AppModel, url: string): string | null {
  const owner = syncOwner(model);
  if (owner.baseline !== null) return owner.baseline;
  const ack = cacheHook(model).seeded;
  return ack && ack.baseUrl === url ? ack.serialized : null;
}
function syncOwner(model: AppModel): SyncOwner {
  let owner = syncOwners.get(model);
  if (!owner) { owner = { generation: 0, editGeneration: 0, tail: Promise.resolve(), baseline: null, choice: null }; syncOwners.set(model, owner); }
  return owner;
}
export function observeLocalServiceSync(model: AppModel, notify: () => void): void { syncOwner(model).notify = notify; }
function notifySync(model: AppModel): void { syncOwner(model).notify?.(); }
function browserComparison(model: AppModel): string {
  return JSON.stringify({ editGeneration: syncOwner(model).editGeneration, pendingRestoreIntent: model.store.snapshotPendingRestoreIntent(), snapshot: model.store.snapshot(), media: model.currentMedia?.id,
    browser: model.browserLocalMedia, cueEdits: model.transcriptLifecycle.pendingCueEdits,
    timingEdits: model.transcriptLifecycle.pendingCueTimingEdits, wordEdits: model.transcriptLifecycle.pendingWordTimingEdits });
}
function hasPendingTranscriptEdits(model: AppModel): boolean {
  return [model.transcriptLifecycle.pendingCueEdits, model.transcriptLifecycle.pendingCueTimingEdits,
    model.transcriptLifecycle.pendingWordTimingEdits].some(value => Object.keys(value).length > 0);
}
function stateRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new TypeError('Local service revision missing or invalid. Update the service before saving.');
  return value;
}
const supersededSync = (): LocalServiceSyncResult => ({ ok: false, message: 'Local service operation superseded; browser work was kept.' });

export async function saveModelToLocalService(model: AppModel, baseUrl = model.localService.baseUrl): Promise<LocalServiceSyncResult> {
  const owner = syncOwner(model);
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing || model.store.snapshotPendingRestoreIntent()) {
    return { ok: false, message: 'Explicit restore required: preview and confirm pending restore; outcome unknown must be read back before retry.' };
  }
  let transport: PairedTransport;
  let url: string;
  try { url = normalizeLocalServiceBaseUrl(baseUrl); transport = capturedTransport(model, url); }
  catch { return { ok: false, message: PAIR_AGAIN }; }
  if (normalizeLocalServiceBaseUrl(model.localService.baseUrl) !== url) setLocalServiceBaseUrl(model, url);
  if (owner.choice || model.localService.syncState === 'conflict' || model.localService.status === 'connecting') {
    return { ok: false, message: model.localService.lastMessage ?? 'Finish connecting and confirm the state choice before saving.' };
  }
  const generation = owner.generation;
  const current = () => owner.generation === generation && normalizeLocalServiceBaseUrl(model.localService.baseUrl) === url;
  const run = async (): Promise<LocalServiceSyncResult> => {
    if (!current()) return supersededSync();
    if (!model.localService.revision) return supersededSync();
    if (owner.choice || model.localService.syncState === 'conflict') return { ok: false, message: model.localService.lastMessage ?? 'Reconnect and choose a state before saving.' };
    if (restoreStates.get(model)?.unknown || model.store.snapshotPendingRestoreIntent()) return { ok: false, message: 'Explicit restore required; no ordinary save was sent.' };
    const snapshot = model.store.snapshot();
    const serialized = JSON.stringify(snapshot);
    const expectedRevision = model.localService.revision;
    model.localService.syncState = 'saving';
    model.localService.lastMessage = 'Saving browser state; waiting for durable SQLite acknowledgement.';
    notifySync(model);
    try {
      const ack = await fetchLocalServiceJson(transport, '/api/state', { method: 'PUT', body: JSON.stringify({ snapshot, expectedRevision }) });
      if (!current()) return supersededSync();
      if (ack.ok !== true) throw new TypeError('Local service did not acknowledge durable save.');
      const revision = stateRevision(ack.revision);
      if (typeof ack.savedAt !== 'string' || !Number.isFinite(Date.parse(ack.savedAt))) throw new TypeError('Local service did not acknowledge durable save time.');
      model.localService.revision = revision;
      owner.baseline = serialized;
      recordAckBaseline(model, url, serialized);
      model.localService.status = 'connected';
      model.localService.lastSavedAt = ack.savedAt;
      const dirty = JSON.stringify(model.store.snapshot()) !== serialized || hasPendingTranscriptEdits(model);
      model.localService.syncState = dirty ? 'unsaved' : 'saved';
      model.localService.lastMessage = dirty ? 'Earlier snapshot saved; newer browser edits remain unsaved.' : `Saved local state at ${ack.savedAt}`;
      notifySync(model);
      signalSnapshotCache(model);
      return { ok: !dirty, message: model.localService.lastMessage };
    } catch (error) {
      if (!current()) return supersededSync();
      model.localService.status = 'error';
      model.localService.syncState = error instanceof LocalServiceRequestError && error.status === 409 ? 'conflict' : 'error';
      model.localService.lastMessage = error instanceof Error ? error.message : 'Local save failed; browser work remains unsaved.';
      notifySync(model);
      return { ok: false, message: model.localService.lastMessage };
    }
  };
  // One PUT at a time, including autosave. Every queued call uses the latest snapshot
  // and the preceding durable acknowledgement, never a captured stale revision.
  if (!model.localService.revision) {
    const connected = await connectLocalService(model, url);
    if (!connected.ok) return connected;
    return saveModelToLocalService(model, url);
  }
  const result = owner.tail.then(run, run);
  owner.tail = result;
  return result;
}

export async function connectLocalService(model: AppModel, baseUrl = model.localService.baseUrl): Promise<LocalServiceSyncResult> {
  // Reconnect must not revoke the commit owner or hydrate its unacknowledged result.
  // Unknown outcomes may reconnect only after the pending operation has settled.
  if (restoreStates.get(model)?.committing) return { ok: false, message: 'Restore pending; wait for acknowledgement/readback before reconnecting.' };
  const owner = syncOwner(model);
  let transport: PairedTransport;
  let url: string;
  try { url = normalizeLocalServiceBaseUrl(baseUrl); transport = capturedTransport(model, url); }
  catch { model.localService.status = 'error'; model.localService.lastMessage = PAIR_AGAIN; return { ok: false, message: PAIR_AGAIN }; }
  const generation = ++owner.generation;
  const comparison = browserComparison(model);
  const current = () => owner.generation === generation && normalizeLocalServiceBaseUrl(model.localService.baseUrl) === url;
  model.localService.baseUrl = url;
  model.localService.pathPolicy = null;
  model.localService.revision = null;
  model.localService.lastSavedAt = null;
  owner.choice = null;
  model.localService.status = 'connecting';
  model.localService.lastMessage = 'Connecting and comparing durable state; browser work is kept.';
  notifySync(model);
  try {
    const status = await fetchLocalServiceJson(transport, '/api/status');
    if (!current()) return supersededSync();
    pairingHook(model, (hooks) => hooks.statusOk?.(url));
    const pathPolicy = readNativePathPolicy((status.config as Record<string, unknown> | undefined)?.pathPolicy);
    const state = await fetchLocalServiceJson(transport, '/api/state');
    if (!current()) return supersededSync();
    model.localService.restoreCapability = state.restoreCapability === RESTORE_CAPABILITY ? RESTORE_CAPABILITY : null;
    const revision = stateRevision(state.revision);
    if (restoreStates.get(model)?.unknown) return reconcileRestoreState(model, state);
    const serviceSnapshot = new LocalStore(state.snapshot as LocalStoreSnapshot).snapshot();
    const serialized = JSON.stringify(model.store.snapshot());
    const remote = JSON.stringify(serviceSnapshot);
    const changedDuringConnect = comparison !== browserComparison(model);
    const baseline = effectiveBaseline(model, url);
    const dirty = hasPendingTranscriptEdits(model) || (baseline !== null
      ? baseline !== serialized : snapshotHasDurableContent(model.store.snapshot()));
    model.localService.pathPolicy = pathPolicy;
    if (model.store.snapshotPendingRestoreIntent() || changedDuringConnect || (dirty && remote !== serialized && snapshotHasDurableContent(serviceSnapshot)) || hasPendingTranscriptEdits(model)) {
      model.localService.status = 'connected';
      owner.choice = { snapshot: serviceSnapshot, revision, comparison: browserComparison(model) };
      model.localService.syncState = 'choice';
      model.localService.lastMessage = 'Browser work differs from durable state. Choose Keep browser work or Load service state (discard browser edits and pending restore intent, retain local audit), or cancel. Nothing has been replaced or saved.';
      notifySync(model);
      return { ok: false, message: model.localService.lastMessage };
    }
    model.localService.revision = revision;
    if (!snapshotHasDurableContent(serviceSnapshot) && snapshotHasDurableContent(model.store.snapshot())) {
      model.localService.syncState = 'unsaved';
      model.localService.lastMessage = 'Connected to empty local service; browser work is unsaved until durable acknowledgement.';
    } else {
      projectHydratedSnapshotIntoModel(model, serviceSnapshot);
      owner.baseline = JSON.stringify(model.store.snapshot());
      recordAckBaseline(model, url, owner.baseline);
      signalSnapshotCache(model);
      const hydratedComparison = browserComparison(model);
      const restoredBrowserHandle = await restoreBrowserMediaHandle(model, () => current() && hydratedComparison === browserComparison(model));
      if (!current()) return supersededSync();
      model.localService.syncState = JSON.stringify(model.store.snapshot()) === owner.baseline && !hasPendingTranscriptEdits(model) ? 'idle' : 'unsaved';
      model.localService.lastMessage = model.localService.syncState === 'unsaved' ? 'Connected; newer browser edits remain unsaved.'
        : restoredBrowserHandle ? 'Connected to local service, loaded durable state, and restored the browser media handle for playback.' : 'Connected to local service and loaded durable state.';
    }
    if (!pathPolicy) model.localService.lastMessage += ` ${NATIVE_PATH_COMPATIBILITY_MESSAGE}`;
    model.localService.status = 'connected';
    notifySync(model);
    return { ok: true, message: model.localService.lastMessage };
  } catch (error) {
    if (!current()) return supersededSync();
    model.localService.status = 'error';
    model.localService.syncState = 'error';
    model.localService.lastMessage = error instanceof Error ? error.message : 'Connection failed; browser work was kept.';
    notifySync(model);
    return { ok: false, message: model.localService.lastMessage };
  }
}

export function resolveLocalServiceConnection(model: AppModel, choice: 'browser' | 'service' | 'cancel'): LocalServiceSyncResult {
  if (restoreIsBusy(model)) return { ok: false, message: 'Restore unresolved; reconnect/read back after the pending operation settles before choosing state.' };
  const owner = syncOwner(model);
  const pending = owner.choice;
  if (!pending) return { ok: false, message: 'No pending comparison. Reconnect to compare state.' };
  if (choice === 'cancel') {
    setLocalServiceBaseUrl(model, model.localService.baseUrl);
    model.localService.lastMessage = 'Connection cancelled; browser work was kept and remains unsaved.';
    notifySync(model);
    return { ok: false, message: model.localService.lastMessage };
  }
  if (pending.comparison !== browserComparison(model)) {
    pending.comparison = browserComparison(model);
    model.localService.lastMessage = 'Browser edits changed since comparison. Confirm your choice again; no edits were discarded.';
    notifySync(model);
    return { ok: false, message: model.localService.lastMessage };
  }
  if (choice === 'service') {
    if (model.store.snapshotPendingRestoreIntent()) {
      model.store.installRestoreCandidate(pending.snapshot, pending.snapshot.learnerAudit!);
      sessionRestoreBaselines.delete(model);
    }
    projectHydratedSnapshotIntoModel(model, pending.snapshot);
    model.transcriptLifecycle.pendingCueEdits = {};
    model.transcriptLifecycle.pendingCueTimingEdits = {};
    model.transcriptLifecycle.pendingWordTimingEdits = {};
    owner.baseline = JSON.stringify(model.store.snapshot());
    recordAckBaseline(model, model.localService.baseUrl, owner.baseline);
  }
  owner.choice = null;
  model.localService.revision = pending.revision;
  model.localService.syncState = choice === 'browser' ? 'unsaved' : 'idle';
  model.localService.lastMessage = choice === 'browser' ? 'Browser work kept. Save explicitly to replace the compared durable state; concurrent changes will conflict.' : 'Loaded compared service state; browser edits discarded by explicit confirmation.';
  notifySync(model);
  if (choice === 'service') signalSnapshotCache(model);
  return { ok: true, message: model.localService.lastMessage };
}

export function setLocalServiceBaseUrl(model: AppModel, baseUrl: string): void {
  clearPairing(model);
  const owner = syncOwner(model);
  ++owner.generation;
  owner.choice = null;
  owner.baseline = null;
  model.localService.baseUrl = baseUrl;
  model.localService.pathPolicy = null;
  model.localService.restoreCapability = null;
  model.localService.revision = null;
  model.localService.lastSavedAt = null;
  model.localService.status = 'disconnected';
  model.localService.syncState = 'unsaved';
  model.localService.lastMessage = 'Service connection changed; browser work is kept and unsaved here.';
  notifySync(model);
}

export function setLocalServiceAutosave(model: AppModel, enabled: boolean): void { model.localService.autosaveEnabled = enabled; }

export function markUnsavedBrowserEdits(model: AppModel): void {
  ++syncOwner(model).editGeneration;
  if (!['choice', 'conflict', 'error', 'saving'].includes(model.localService.syncState ?? '')) {
    model.localService.syncState = 'unsaved';
    model.localService.lastMessage = 'Browser changes are unsaved (transcript form drafts are not saved until applied).';
  }
  notifySync(model);
  signalSnapshotCache(model);
}

export function persistIfLocalServiceAutosaveEnabled(model: AppModel): void {
  markUnsavedBrowserEdits(model);
  if (model.localService.revision && !syncOwner(model).choice && model.localService.syncState !== 'conflict') {
    if (model.localService.autosaveEnabled && model.localService.status === 'connected') void saveModelToLocalService(model);
  }
}

export function activeCueAtTime(cues: readonly Cue[], timeMs: number): Cue | null {
  return cues.find((c) => c.startMs <= timeMs && c.endMs > timeMs) ?? null;
}

export function clampPlaybackRate(rate: number): number {
  const clamped = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
  return Math.round(clamped / PLAYBACK_RATE_STEP) * PLAYBACK_RATE_STEP;
}

export function setPlaybackRate(model: AppModel, rate: number): void {
  model.player.playbackRate = clampPlaybackRate(rate);
}

export function cueIndex(cues: readonly Cue[], cueId: string): number {
  return cues.findIndex((c) => c.id === cueId);
}

export function previousCue(cues: readonly Cue[], cueId: string): Cue | null {
  const idx = cueIndex(cues, cueId);
  return cues[idx - 1] ?? null;
}

export function nextCue(cues: readonly Cue[], cueId: string): Cue | null {
  const idx = cueIndex(cues, cueId);
  return cues[idx + 1] ?? null;
}

export function seekToCue(model: AppModel, cue: Cue): void {
  model.player.currentTimeMs = cue.startMs;
  model.player.activeCueId = cue.id;
}

export function seekToTime(model: AppModel, timeMs: number): void {
  model.player.currentTimeMs = Math.max(0, timeMs);
}

export function togglePlay(model: AppModel): void {
  model.player.isPlaying = !model.player.isPlaying;
}

export function toggleLoopCue(model: AppModel): void {
  model.player.loopCue = !model.player.loopCue;
}

export function toggleLoopRange(model: AppModel, startMs: number, endMs: number): void {
  const current = model.player.loopRange;
  if (current !== null && current.startMs === startMs && current.endMs === endMs) {
    model.player.loopRange = null;
  } else {
    model.player.loopRange = { startMs, endMs };
  }
}

export function setLoopRange(model: AppModel, startMs: number, endMs: number): void {
  model.player.loopRange = { startMs, endMs };
}

export function clearLoopRange(model: AppModel): void {
  model.player.loopRange = null;
}

export function normalizeVisualSourceRange(
  startMs: number,
  endMs: number,
  durationMs: number,
): { startMs: number; endMs: number } | null {
  if (![startMs, endMs, durationMs].every(Number.isFinite) || durationMs <= 0) return null;
  const duration = Math.max(0, Math.round(durationMs));
  const first = Math.max(0, Math.min(duration, Math.round(startMs)));
  const second = Math.max(0, Math.min(duration, Math.round(endMs)));
  const range = { startMs: Math.min(first, second), endMs: Math.max(first, second) };
  return range.endMs > range.startMs ? range : null;
}

export function setVisualSourceRange(
  model: AppModel,
  startMs: number,
  endMs: number,
): { startMs: number; endMs: number } | null {
  const range = normalizeVisualSourceRange(startMs, endMs, model.player.durationMs);
  model.player.sourceRange = range;
  return range;
}

export function clearVisualSourceRange(model: AppModel): void {
  model.player.sourceRange = null;
}

export function activeLoopRangeForSelection(
  model: AppModel,
  cue: Cue,
  charStart: number,
  charEnd: number,
): { startMs: number; endMs: number } | null {
  const words = model.store.listTranscriptWordTimingsForCue(cue.id);
  const overlapping = words.filter((w) => w.charStart < charEnd && w.charEnd > charStart);
  if (overlapping.length === 0) return null;
  return {
    startMs: Math.min(...overlapping.map((w) => w.startMs)),
    endMs: Math.max(...overlapping.map((w) => w.endMs)),
  };
}

export function nativeTextForCue(cue: Cue, nativeTrack: SubtitleTrack | null | undefined, nativeCues: readonly Cue[]): string | undefined {
  if (!nativeTrack) return undefined;
  // Find the best native cue overlapping the target cue. A tolerance is useful
  // for hand-authored subtitle drift, but boundary-adjacent cues can otherwise
  // make `.find()` pick the previous native line for an exact cue boundary.
  const cueMidpoint = (cue.startMs + cue.endMs) / 2;
  const best = nativeCues
    .map((nativeCue) => {
      const overlapStart = Math.max(cue.startMs, nativeCue.startMs);
      const overlapEnd = Math.min(cue.endMs, nativeCue.endMs);
      const directOverlapMs = Math.max(0, overlapEnd - overlapStart);
      const withinTolerance = nativeCue.startMs <= cue.endMs + CUE_SYNC_TOLERANCE_MS
        && nativeCue.endMs >= cue.startMs - CUE_SYNC_TOLERANCE_MS;
      const midpointDistanceMs = Math.abs(((nativeCue.startMs + nativeCue.endMs) / 2) - cueMidpoint);
      return { nativeCue, directOverlapMs, withinTolerance, midpointDistanceMs };
    })
    .filter((candidate) => candidate.withinTolerance)
    .sort((a, b) => b.directOverlapMs - a.directOverlapMs || a.midpointDistanceMs - b.midpointDistanceMs)[0]
    ?.nativeCue;
  return best?.text;
}

export function projectPlayerState(
  player: PlayerState,
  cues: readonly Cue[],
  nativeTrack: SubtitleTrack | null | undefined,
  nativeCues: readonly Cue[],
): {
  currentCue: Cue | null;
  nativeText: string | undefined;
  canPrev: boolean;
  canNext: boolean;
  isLooping: boolean;
} {
  const currentCue = activeCueAtTime(cues, player.currentTimeMs);
  const nativeText = currentCue ? nativeTextForCue(currentCue, nativeTrack, nativeCues) : undefined;
  const currentIdx = currentCue ? cueIndex(cues, currentCue.id) : -1;
  return {
    currentCue,
    nativeText,
    canPrev: currentCue ? currentIdx > 0 : cues.length > 0,
    canNext: currentCue ? currentIdx < cues.length - 1 : cues.length > 0,
    isLooping: player.loopCue,
  };
}

export function applyLoopTolerance(videoCurrentMs: number, currentCue: Cue | null, loopEnabled: boolean, loopRange: { startMs: number; endMs: number } | null = null): number | null {
  if (loopRange !== null) {
    const isPastRange = videoCurrentMs > loopRange.endMs + CUE_SYNC_TOLERANCE_MS;
    const isBeforeRange = videoCurrentMs < loopRange.startMs - CUE_SYNC_TOLERANCE_MS;
    if (isPastRange || isBeforeRange) {
      return loopRange.startMs;
    }
    return null;
  }
  if (!loopEnabled || !currentCue) return null;
  const isPastCue = videoCurrentMs > currentCue.endMs + CUE_SYNC_TOLERANCE_MS;
  const isBeforeCue = videoCurrentMs < currentCue.startMs - CUE_SYNC_TOLERANCE_MS;
  if (isPastCue || isBeforeCue) {
    return currentCue.startMs;
  }
  return null;
}

function isNodeRuntime(): boolean {
  const maybeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof maybeProcess?.versions?.node === 'string';
}

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(bytes: ArrayBuffer | Uint8Array): Promise<Sha256Digest> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return `sha256:${sha256HexBytes(bytes)}` as Sha256Digest;
  }
  const input: ArrayBuffer = bytes instanceof Uint8Array ? (bytes.slice().buffer as ArrayBuffer) : bytes;
  const digest = await subtle.digest('SHA-256', input);
  return `sha256:${hexFromBytes(new Uint8Array(digest))}` as Sha256Digest;
}

async function sha256BrowserText(text: string): Promise<Sha256Digest> {
  return sha256Bytes(new TextEncoder().encode(text));
}

function normalizeBrowserCueText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const srtTimestampPattern = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/;
const assTimestampPattern = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{2})$/;

function parseBrowserAssTimestamp(value: string): number {
  const match = assTimestampPattern.exec(value);
  if (!match) {
    throw new TypeError(`Invalid ASS/SSA timestamp: ${value}`);
  }
  return (
    Number.parseInt(match[1]!, 10) * 3_600_000 +
    Number.parseInt(match[2]!, 10) * 60_000 +
    Number.parseInt(match[3]!, 10) * 1_000 +
    Number.parseInt(match[4]!, 10) * 10
  );
}

function stripBrowserAssOverrideTags(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

function stripBrowserAssLineBreaks(text: string): string {
  return text.replace(/\\[Nn]/g, ' ').replace(/\\h/g, ' ');
}

function parseBrowserAssText(raw: string): string {
  return normalizeBrowserCueText(stripBrowserAssLineBreaks(stripBrowserAssOverrideTags(raw)));
}

type BrowserAssSection = Readonly<{
  name: string;
  lines: string[];
}>;

function splitBrowserAssSections(text: string): BrowserAssSection[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const sections: BrowserAssSection[] = [];
  let current: BrowserAssSection | null = null;
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

function parseBrowserAssDialogueLine(line: string, formatHeader: string, index: number): { cueIndex: number; startMs: number; endMs: number; text: string; normalizedText: string } | null {
  const headerMatch = /^Format:\s*(.+)$/i.exec(formatHeader);
  if (!headerMatch) throw new TypeError('ASS/SSA [Events] section missing Format header');
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
  const startMs = parseBrowserAssTimestamp(rawFields[startIndex]!.trim());
  const endMs = parseBrowserAssTimestamp(rawFields[endIndex]!.trim());
  if (endMs <= startMs) {
    throw new TypeError(`ASS/SSA cue ${index + 1} end time must be after start time`);
  }
  const rawText = rawFields.slice(textIndex).join(',').trim();
  const text = parseBrowserAssText(rawText);
  if (text.length === 0) {
    throw new TypeError(`ASS/SSA cue ${index + 1} has empty cue text after stripping tags`);
  }
  return { cueIndex: index + 1, startMs, endMs, text, normalizedText: text.toLowerCase() };
}

export function validateBrowserCueOrdering(cues: readonly Cue[]): void {
  for (let i = 1; i < cues.length; i++) {
    const prev = cues[i - 1]!;
    const curr = cues[i]!;
    if (curr.startMs < prev.endMs) {
      throw new TypeError(
        `Cue ${curr.cueIndex} starts at ${curr.startMs}ms before previous cue ${prev.cueIndex} ends at ${prev.endMs}ms`,
      );
    }
  }
}

export function applyTrackOffsetMs(cues: readonly Cue[], offsetMs: number): Cue[] {
  if (!Number.isFinite(offsetMs)) {
    throw new TypeError('Track offset must be a finite number of milliseconds.');
  }
  if (offsetMs === 0) return cues.map((cue) => ({ ...cue }));
  const shifted: Cue[] = cues.map((cue) => {
    const shiftedStart = Math.max(0, cue.startMs + offsetMs);
    const shiftedEnd = Math.max(shiftedStart + 1, cue.endMs + offsetMs);
    return {
      ...cue,
      startMs: shiftedStart,
      endMs: shiftedEnd,
    };
  });
  // Preserve strict monotonic ordering: each cue must start at or after the previous cue ends.
  for (let i = 1; i < shifted.length; i++) {
    const prev = shifted[i - 1]!;
    const curr = shifted[i]!;
    if (curr.startMs < prev.endMs) {
      const startMs = prev.endMs;
      shifted[i] = {
        ...curr,
        startMs,
        endMs: Math.max(startMs + 1, curr.endMs),
      };
    }
  }
  return shifted;
}

export async function createOffsetCorrectedTranscriptVersion(
  model: AppModel,
  trackId: string,
  offsetMs: number,
): Promise<{ track: SubtitleTrack; cues: Cue[] }> {
  const parent = model.store.getSubtitleTrack(trackId);
  if (!parent) throw new TypeError(`Cannot apply offset to missing transcript track ${trackId}`);
  const parentCues = model.store.listCuesForTrack(trackId);
  if (parentCues.length === 0) throw new TypeError('Cannot apply offset to transcript track with no cues.');

  const shiftedCues = applyTrackOffsetMs(parentCues, offsetMs);
  const segments = shiftedCues.map((cue) => ({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text }));
  const result = await createStructuralCorrectedTranscriptVersion(model, trackId, segments, 0);
  // Preserve the parent's lifecycle status (draft/correcting/approved) instead of defaulting to 'correcting'.
  const status: SubtitleTrack['transcriptStatus'] = parent.transcriptStatus === 'approved' ? 'approved' : parent.transcriptStatus;
  const offsetTrack: SubtitleTrack = {
    ...result.track,
    transcriptStatus: status,
    provenance: {
      ...result.track.provenance,
      warningFlags: [...result.track.provenance.warningFlags, 'timingUnverified'],
    },
  };
  model.store.putSubtitleTrack(offsetTrack);
  persistIfLocalServiceAutosaveEnabled(model);
  return { track: offsetTrack, cues: result.cues };
}

async function parseBrowserAssTextBody(input: {
  mediaId: string;
  language: string;
  role: 'target' | 'native' | 'other';
  path: string;
  text: string;
  isActive?: boolean;
  sourceKind?: SourceKind;
}): Promise<{ track: SubtitleTrack; cues: Cue[] }> {
  const track = makeSubtitleTrack({
    mediaId: input.mediaId,
    language: input.language,
    role: input.role,
    format: 'ass',
    sourceKind: input.sourceKind ?? 'synthetic',
    sourcePath: input.path,
    contentSha256: await sha256BrowserText(input.text),
    isActive: input.isActive ?? true,
  });
  const sections = splitBrowserAssSections(input.text);
  if (sections.length === 0) throw new TypeError('ASS/SSA file has no sections');
  const events = sections.find((s) => s.name.toLowerCase() === 'events');
  if (!events) throw new TypeError('ASS/SSA file missing [Events] section');
  const formatHeader = events.lines.find((line) => /^Format:/i.test(line));
  if (!formatHeader) throw new TypeError('ASS/SSA [Events] section missing Format header');
  const cueDtos: { cueIndex: number; startMs: number; endMs: number; text: string; normalizedText: string }[] = [];
  for (const line of events.lines) {
    if (!/^Dialogue:/i.test(line)) continue;
    const cue = parseBrowserAssDialogueLine(line, formatHeader, cueDtos.length);
    if (cue) cueDtos.push(cue);
  }
  if (cueDtos.length === 0) throw new TypeError('ASS/SSA file has no Dialogue lines');
  const cues: Cue[] = [];
  for (const dto of cueDtos) {
    cues.push(
      makeCue({
        trackId: track.id,
        cueIndex: dto.cueIndex,
        startMs: dto.startMs,
        endMs: dto.endMs,
        text: dto.text,
        normalizedText: dto.normalizedText,
        textSha256: await sha256BrowserText(dto.text),
      }),
    );
  }
  return { track, cues };
}


function parseBrowserSrtTimestamp(value: string): number {
  const match = srtTimestampPattern.exec(value);
  if (!match) {
    throw new TypeError(`Invalid SRT timestamp: ${value}`);
  }
  return (
    Number.parseInt(match[1]!, 10) * 3_600_000 +
    Number.parseInt(match[2]!, 10) * 60_000 +
    Number.parseInt(match[3]!, 10) * 1_000 +
    Number.parseInt(match[4]!, 10)
  );
}

const browserVttTimestampPattern = /^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})$/;

function parseBrowserVttTimestamp(value: string): number {
  const match = browserVttTimestampPattern.exec(value);
  if (!match) {
    throw new TypeError(`Invalid VTT timestamp: ${value}`);
  }
  return (
    Number.parseInt(match[1] ?? '0', 10) * 3_600_000 +
    Number.parseInt(match[2]!, 10) * 60_000 +
    Number.parseInt(match[3]!, 10) * 1_000 +
    Number.parseInt(match[4]!, 10)
  );
}

async function parseBrowserSrtText(input: {
  mediaId: string;
  language: string;
  role: 'target' | 'native' | 'other';
  path: string;
  text: string;
  isActive?: boolean;
  sourceKind?: SourceKind;
}): Promise<{ track: SubtitleTrack; cues: Cue[] }> {
  const isAss = input.path.toLowerCase().endsWith('.ass') || input.path.toLowerCase().endsWith('.ssa');
  const isVtt = !isAss && (input.path.toLowerCase().endsWith('.vtt') || input.text.trim().startsWith('WEBVTT'));
  const format: SubtitleFormat = isAss ? 'ass' : isVtt ? 'vtt' : 'srt';

  if (isAss) {
    return parseBrowserAssTextBody(input);
  }

  const track = makeSubtitleTrack({
    mediaId: input.mediaId,
    language: input.language,
    role: input.role,
    format,
    sourceKind: input.sourceKind ?? 'synthetic',
    sourcePath: input.path,
    contentSha256: await sha256BrowserText(input.text),
    isActive: input.isActive ?? true,
  });

  const normalizedText = input.text.replace(/\r\n?/g, '\n').trim();
  const body = isVtt && normalizedText.startsWith('WEBVTT')
    ? normalizedText.slice('WEBVTT'.length).trim()
    : normalizedText;
  const blocks = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const cues: Cue[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    const lines = block.split('\n').map((line) => line.trim());
    let lineIndex = 0;
    let cueIndex = index;
    const firstLine = lines[0] ?? '';
    if (/^\d+$/.test(firstLine)) {
      cueIndex = Number.parseInt(firstLine, 10);
      lineIndex = 1;
    } else if (!isVtt) {
      throw new TypeError(`SRT block ${index} missing numeric cue id`);
    }
    const timingLine = lines[lineIndex] ?? '';
    const timestampPattern = isVtt
      ? /^(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*(?:(\d{2}:)?\d{2}:\d{2}\.\d{3})/
      : /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/;
    const timingMatch = timestampPattern.exec(timingLine);
    if (!timingMatch) {
      throw new TypeError(`${isVtt ? 'VTT' : 'SRT'} block ${cueIndex} has invalid timing line: ${timingLine}`);
    }
    const timingParts = timingMatch[0]!.split(/\s*-->\s*/);
    const startMs = isVtt ? parseBrowserVttTimestamp(timingParts[0]!) : parseBrowserSrtTimestamp(timingParts[0]!);
    const endMs = isVtt ? parseBrowserVttTimestamp(timingParts[1]!) : parseBrowserSrtTimestamp(timingParts[1]!);
    if (endMs <= startMs) {
      throw new TypeError(`${isVtt ? 'VTT' : 'SRT'} block ${cueIndex} end time must be after start time`);
    }
    const text = normalizeBrowserCueText(lines.slice(lineIndex + 1).join('\n'));
    if (text.length === 0) {
      throw new TypeError(`${isVtt ? 'VTT' : 'SRT'} block ${cueIndex} has empty cue text`);
    }
    cues.push(
      makeCue({
        trackId: track.id,
        cueIndex,
        startMs,
        endMs,
        text,
        normalizedText: text.toLowerCase(),
        textSha256: await sha256BrowserText(text),
      }),
    );
  }

  for (let i = 1; i < cues.length; i++) {
    validateBrowserCueOrdering(cues.slice(i - 1, i + 1));
  }

  return { track, cues };
}

async function importBrowserSyntheticFixture(
  model: AppModel,
  mediaPath: string,
  targetSrtPath: string,
  nativeSrtPath?: string,
): Promise<void> {
  const response = await fetch(browserFixtureMediaUrl);
  if (!response.ok) {
    throw new TypeError(`Unable to load browser synthetic media fixture: ${response.status} ${response.statusText}`);
  }
  const mediaBytes = await response.arrayBuffer();
  const container = mediaPath.split('.').pop()?.toLowerCase() ?? 'webm';
  const durationMs = Math.max(1000, Math.round(mediaBytes.byteLength / 50_000) * 1000);
  const asset = makeMediaAsset({
    title: 'Synthetic Polish Dialogue',
    originalPath: browserFixtureMediaUrl,
    contentSha256: await sha256Bytes(mediaBytes),
    durationMs,
    container,
    sizeBytes: mediaBytes.byteLength,
    privacyLabel: 'synthetic',
  });

  const targetParsed = await parseBrowserSrtText({
    mediaId: asset.id,
    language: 'pl',
    role: 'target',
    path: targetSrtPath,
    text: browserFixtureTargetSrt,
  });
  const nativeParsed = nativeSrtPath
    ? await parseBrowserSrtText({
        mediaId: asset.id,
        language: 'en',
        role: 'native',
        path: nativeSrtPath,
        text: browserFixtureNativeSrt,
      })
    : null;

  model.store.putMediaAsset(asset);
  model.store.putSubtitleTrack(targetParsed.track);
  if (nativeParsed) model.store.putSubtitleTrack(nativeParsed.track);
  for (const cue of targetParsed.cues) {
    model.store.putCue(cue);
  }
  if (nativeParsed) {
    for (const cue of nativeParsed.cues) {
      model.store.putCue(cue);
    }
  }

  model.currentMedia = asset;
  model.targetTrackId = targetParsed.track.id;
  model.nativeTrackId = nativeParsed?.track.id ?? null;
  model.cues = model.store.listCuesForTrack(targetParsed.track.id);
  model.player.durationMs = durationMs;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
}

export type BrowserLocalFileImportInput = Readonly<{
  mediaFile: File;
  targetSubtitleFile?: File | null;
  nativeSubtitleFile?: File | null;
  targetLanguage?: string;
  nativeLanguage?: string;
  mediaSourceLabel?: string;
  mediaHandleName?: string | null;
}>;

export type BrowserFileHandleLike = Readonly<{
  name: string;
  getFile(): Promise<File>;
  queryPermission?: (opts: { mode: 'read' }) => Promise<string>;
  requestPermission?: (opts: { mode: 'read' }) => Promise<string>;
}>;

export type BrowserLocalFileHandleImportInput = Readonly<{
  mediaHandle: BrowserFileHandleLike;
  targetSubtitleHandle?: BrowserFileHandleLike | null;
  nativeSubtitleHandle?: BrowserFileHandleLike | null;
  targetLanguage?: string;
  nativeLanguage?: string;
}>;

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName || 'Imported local media';
}

function containerFromFile(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension) return extension;
  return file.type.split('/').pop()?.toLowerCase() || 'unknown';
}

function revokeCurrentMediaObjectUrl(model: AppModel): void {
  const currentPath = model.currentMedia?.originalPath;
  const objectUrl = model.browserLocalMedia.objectUrl ?? (currentPath?.startsWith('blob:') ? currentPath : null);
  if (objectUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(objectUrl);
  }
  model.browserLocalMedia = emptyBrowserLocalMedia();
}

export function mediaPlaybackUrl(model: AppModel): string {
  return model.browserLocalMedia.objectUrl ?? model.currentMedia?.originalPath ?? '';
}

export function needsMediaRelink(model: AppModel): boolean {
  if (!model.currentMedia) return false;
  const path = model.currentMedia.originalPath;
  if (!path.startsWith(HANDLE_LABEL_PREFIX) && !path.startsWith('blob:')) return false;
  return model.browserLocalMedia.objectUrl === null;
}

export function handleNameFromMedia(model: AppModel): string | null {
  if (!model.currentMedia) return null;
  const path = model.currentMedia.originalPath;
  if (!path.startsWith(HANDLE_LABEL_PREFIX)) return null;
  return path.slice(HANDLE_LABEL_PREFIX.length);
}

export type BrowserMediaNameConflictChoice = 'import-new';

/**
 * lt-n31: raised when a selected media file has the same file name as an existing
 * asset but a different content fingerprint. Nothing is written; the caller must
 * ask the learner to either import it as a new asset or cancel.
 */
export class BrowserMediaNameConflictError extends Error {
  readonly fileName: string;
  readonly existingMediaId: string;
  constructor(fileName: string, existingMediaId: string) {
    super(`"${fileName}" has the same name as existing media but different content. Nothing was changed. Choose "Import as new media" to add it separately, or cancel.`);
    this.name = 'BrowserMediaNameConflictError';
    this.fileName = fileName;
    this.existingMediaId = existingMediaId;
  }
}

function mediaNameMatches(asset: MediaAsset, fileName: string): boolean {
  const handleName = handleNameFromSourceLabel(asset.originalPath);
  if (handleName !== null) return handleName === fileName;
  return asset.title === titleFromFileName(fileName);
}

function pickTrackForRelink(tracks: readonly SubtitleTrack[], role: 'target' | 'native', previousId: string | null): string | null {
  const roleTracks = tracks.filter((track) => track.role === role);
  if (previousId && roleTracks.some((track) => track.id === previousId)) return previousId;
  return (roleTracks.find((track) => track.isActive) ?? roleTracks[0])?.id ?? null;
}

async function relinkExistingBrowserMedia(
  model: AppModel,
  existing: MediaAsset,
  input: BrowserLocalFileImportInput,
  objectUrl: string,
  mediaSourceLabel: string,
  targetText: string | null,
  nativeText: string | null,
): Promise<void> {
  const existingTracks = model.store.listSubtitleTracksForMedia(existing.id);
  const previousTarget = model.currentMedia?.id === existing.id ? model.targetTrackId : null;
  const previousNative = model.currentMedia?.id === existing.id ? model.nativeTrackId : null;
  let targetTrackId = pickTrackForRelink(existingTracks, 'target', previousTarget);
  let nativeTrackId = pickTrackForRelink(existingTracks, 'native', previousNative);
  const newTracks: { track: SubtitleTrack; cues: Cue[] }[] = [];
  const supplied: [File | null | undefined, string | null, 'target' | 'native', string][] = [
    [input.targetSubtitleFile, targetText, 'target', input.targetLanguage ?? 'pl'],
    [input.nativeSubtitleFile, nativeText, 'native', input.nativeLanguage ?? 'en'],
  ];
  for (const [file, text, role, language] of supplied) {
    if (!file || text === null) continue;
    const digest = await sha256BrowserText(text);
    const same = existingTracks.find((track) => track.role === role && track.contentSha256 === digest);
    if (same) {
      if (role === 'target') targetTrackId = same.id; else nativeTrackId = same.id;
      continue;
    }
    // Explicitly supplied different subtitles are added beside existing tracks; existing tracks/cues are never replaced.
    const parsed = await parseBrowserSrtText({ mediaId: existing.id, language, role, path: file.name, text, sourceKind: 'owned' });
    newTracks.push(parsed);
    if (role === 'target') targetTrackId = parsed.track.id; else nativeTrackId = parsed.track.id;
  }
  // Persistent handle reselection updates the handle label; a plain-input session URL never replaces the stored source label.
  const originalPath = (input.mediaHandleName || existing.originalPath.startsWith('blob:')) ? mediaSourceLabel : existing.originalPath;
  const relinked: MediaAsset = { ...existing, originalPath, lastSeenAt: new Date().toISOString() };
  revokeCurrentMediaObjectUrl(model);
  model.store.putMediaAsset(relinked);
  for (const parsed of newTracks) {
    model.store.putSubtitleTrack(parsed.track);
    for (const cue of parsed.cues) model.store.putCue(cue);
  }
  model.currentMedia = relinked;
  model.browserLocalMedia = {
    objectUrl,
    sourceLabel: mediaSourceLabel,
    handleName: input.mediaHandleName ?? null,
    permissionState: input.mediaHandleName ? 'granted' : 'unavailable',
    lastError: null,
  };
  model.targetTrackId = targetTrackId;
  model.nativeTrackId = nativeTrackId;
  model.cues = targetTrackId ? model.store.listCuesForTrack(targetTrackId) : [];
  model.player.durationMs = relinked.durationMs;
  model.player.currentTimeMs = 0;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
  persistIfLocalServiceAutosaveEnabled(model);
}

export async function importBrowserLocalFiles(
  model: AppModel,
  input: BrowserLocalFileImportInput,
  options: Readonly<{ onNameConflict?: BrowserMediaNameConflictChoice }> = {},
): Promise<void> {
  if (typeof URL.createObjectURL !== 'function') {
    throw new TypeError('Browser local media import requires URL.createObjectURL support.');
  }
  const mediaBytes = await input.mediaFile.arrayBuffer();
  const contentSha256 = await sha256Bytes(mediaBytes);
  // lt-n31 identity: content fingerprint decides; file name alone never relinks.
  const existingSameContent = model.store.listMediaAssets().find((asset) => asset.contentSha256 === contentSha256);
  if (!existingSameContent && options.onNameConflict !== 'import-new') {
    const sameName = model.store.listMediaAssets().find((asset) => mediaNameMatches(asset, input.mediaFile.name));
    if (sameName) throw new BrowserMediaNameConflictError(input.mediaFile.name, sameName.id);
  }
  const objectUrl = URL.createObjectURL(input.mediaFile);
  try {
    const targetText = input.targetSubtitleFile ? await input.targetSubtitleFile.text() : null;
    const nativeText = input.nativeSubtitleFile ? await input.nativeSubtitleFile.text() : null;
    const mediaSourceLabel = input.mediaSourceLabel ?? objectUrl;
    if (existingSameContent) {
      await relinkExistingBrowserMedia(model, existingSameContent, input, objectUrl, mediaSourceLabel, targetText, nativeText);
      return;
    }
    const asset = makeMediaAsset({
      title: titleFromFileName(input.mediaFile.name),
      originalPath: mediaSourceLabel,
      contentSha256,
      durationMs: 1000,
      container: containerFromFile(input.mediaFile),
      sizeBytes: input.mediaFile.size,
      privacyLabel: 'owned',
    });
    const targetParsed = input.targetSubtitleFile && targetText !== null
      ? await parseBrowserSrtText({
          mediaId: asset.id,
          language: input.targetLanguage ?? 'pl',
          role: 'target',
          path: input.targetSubtitleFile.name,
          text: targetText,
          sourceKind: 'owned',
        })
      : null;
    const nativeParsed = nativeText && input.nativeSubtitleFile
      ? await parseBrowserSrtText({
          mediaId: asset.id,
          language: input.nativeLanguage ?? 'en',
          role: 'native',
          path: input.nativeSubtitleFile.name,
          text: nativeText,
          sourceKind: 'owned',
        })
      : null;
    const allParsedCues = [...(targetParsed?.cues ?? []), ...(nativeParsed?.cues ?? [])];
    const durationMs = Math.max(1000, ...allParsedCues.map((cue) => cue.endMs));
    const assetWithDuration = { ...asset, durationMs };

    revokeCurrentMediaObjectUrl(model);
    model.store.putMediaAsset(assetWithDuration);
    if (targetParsed) model.store.putSubtitleTrack(targetParsed.track);
    if (nativeParsed) model.store.putSubtitleTrack(nativeParsed.track);
    if (targetParsed) {
      for (const cue of targetParsed.cues) {
        model.store.putCue(cue);
      }
    }
    if (nativeParsed) {
      for (const cue of nativeParsed.cues) {
        model.store.putCue(cue);
      }
    }

    model.currentMedia = assetWithDuration;
    model.browserLocalMedia = {
      objectUrl,
      sourceLabel: mediaSourceLabel,
      handleName: input.mediaHandleName ?? null,
      permissionState: input.mediaHandleName ? 'granted' : 'unavailable',
      lastError: null,
    };
    model.targetTrackId = targetParsed?.track.id ?? null;
    model.nativeTrackId = nativeParsed?.track.id ?? null;
    model.cues = targetParsed ? model.store.listCuesForTrack(targetParsed.track.id) : [];
    model.player.durationMs = durationMs;
    model.player.currentTimeMs = 0;
    model.player.activeCueId = model.cues[0]?.id ?? null;
    model.importError = null;
    persistIfLocalServiceAutosaveEnabled(model);
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export async function importBrowserLocalFileHandles(
  model: AppModel,
  input: BrowserLocalFileHandleImportInput,
  options: Readonly<{ onNameConflict?: BrowserMediaNameConflictChoice }> = {},
): Promise<void> {
  const mediaFile = await input.mediaHandle.getFile();
  const targetSubtitleFile = input.targetSubtitleHandle ? await input.targetSubtitleHandle.getFile() : null;
  const nativeSubtitleFile = input.nativeSubtitleHandle ? await input.nativeSubtitleHandle.getFile() : null;
  const importInput: BrowserLocalFileImportInput = {
    mediaFile,
    targetSubtitleFile,
    nativeSubtitleFile,
    mediaSourceLabel: `${HANDLE_LABEL_PREFIX}${input.mediaHandle.name}`,
    mediaHandleName: input.mediaHandle.name,
    ...(input.targetLanguage === undefined ? {} : { targetLanguage: input.targetLanguage }),
    ...(input.nativeLanguage === undefined ? {} : { nativeLanguage: input.nativeLanguage }),
  };
  await importBrowserLocalFiles(model, importInput, options);
  await persistBrowserMediaHandle(input.mediaHandle);
}

const HANDLE_STORE_KEY = 'current-media-handle';

function normalizeBrowserPermissionState(value: unknown): BrowserMediaPermissionState {
  return value === 'granted' || value === 'prompt' || value === 'denied' ? value : 'unknown';
}

async function ensureBrowserHandleReadPermission(handle: BrowserFileHandleLike, queryOnly = false): Promise<BrowserMediaPermissionState> {
  try {
    if (typeof handle.queryPermission === 'function') {
      const queried = normalizeBrowserPermissionState(await handle.queryPermission({ mode: 'read' }));
      if (queried === 'granted' || queried === 'denied') return queried;
      // lt-aot: requestPermission needs a user gesture; boot must only query.
      if (queryOnly) return queried === 'unknown' ? 'prompt' : queried;
    }
    if (queryOnly) return 'prompt';
    if (typeof handle.requestPermission === 'function') {
      return normalizeBrowserPermissionState(await handle.requestPermission({ mode: 'read' }));
    }
    return 'unknown';
  } catch {
    return 'error';
  }
}

async function getHandleStore(): Promise<{ get: (key: string) => Promise<unknown>; put: (value: unknown, key: string) => Promise<void> } | null> {
  const store = (globalThis as { lingotorteHandleStore?: { open: () => Promise<unknown> } }).lingotorteHandleStore;
  if (!store) return null;
  try {
    const db = await store.open();
    return db as { get: (key: string) => Promise<unknown>; put: (value: unknown, key: string) => Promise<void> };
  } catch {
    return null;
  }
}

async function persistBrowserMediaHandle(handle: BrowserFileHandleLike): Promise<void> {
  const store = await getHandleStore();
  if (!store) return;
  try {
    await store.put(handle, HANDLE_STORE_KEY);
  } catch {
    // IndexedDB may not support storing handles in all environments
  }
}

export async function restoreBrowserMediaHandle(model: AppModel, isCurrent: () => boolean = () => true, options: { queryOnly?: boolean } = {}): Promise<boolean> {
  const expectedHandleName = handleNameFromMedia(model);
  const sourceLabel = expectedHandleName ? `${HANDLE_LABEL_PREFIX}${expectedHandleName}` : model.browserLocalMedia.sourceLabel;
  const mediaAtStart = model.currentMedia;
  const browserAtStart = model.browserLocalMedia;
  const current = () => isCurrent() && model.currentMedia === mediaAtStart && model.browserLocalMedia === browserAtStart;
  const store = await getHandleStore();
  if (!current()) return false;
  if (!store) {
    if (expectedHandleName) {
      model.browserLocalMedia = emptyBrowserLocalMedia({
        sourceLabel,
        handleName: expectedHandleName,
        permissionState: 'unavailable',
        lastError: 'Browser handle storage is unavailable. The saved media handle cannot be restored automatically. Choose the media again from Library.',
      });
    }
    return false;
  }
  try {
    const handle = await store.get(HANDLE_STORE_KEY) as BrowserFileHandleLike | undefined;
    if (!current()) return false;
    if (!handle) {
      if (expectedHandleName) {
        model.browserLocalMedia = emptyBrowserLocalMedia({
          sourceLabel,
          handleName: expectedHandleName,
          permissionState: 'unknown',
          lastError: `No saved browser handle found for "${expectedHandleName}". Regrant the saved handle or choose the media again.`,
        });
      }
      return false;
    }
    if (expectedHandleName && handle.name !== expectedHandleName) {
      model.browserLocalMedia = emptyBrowserLocalMedia({
        sourceLabel,
        handleName: expectedHandleName,
        permissionState: 'error',
        lastError: `Stored browser handle "${handle.name}" does not match current media "${expectedHandleName}". Choose the media again.`,
      });
      return false;
    }
    const permissionState = await ensureBrowserHandleReadPermission(handle, options.queryOnly === true);
    if (!current()) return false;
    if (options.queryOnly && permissionState === 'prompt') {
      model.browserLocalMedia = emptyBrowserLocalMedia({
        sourceLabel,
        handleName: expectedHandleName ?? handle.name,
        permissionState: 'prompt',
        lastError: null,
      });
      return false;
    }
    if (permissionState !== 'granted' && permissionState !== 'unknown') {
      model.browserLocalMedia = emptyBrowserLocalMedia({
        sourceLabel,
        handleName: expectedHandleName ?? handle.name,
        permissionState,
        lastError: permissionState === 'denied'
          ? `Browser permission for "${expectedHandleName ?? handle.name}" was denied. Regrant the saved handle or choose the media again.`
          : `Browser permission for "${expectedHandleName ?? handle.name}" is ${permissionState}. Regrant the saved handle or choose the media again.`,
      });
      return false;
    }
    const file = await handle.getFile();
    if (!current()) return false;
    const expectedSha = mediaAtStart?.contentSha256;
    if (expectedSha && /^sha256:[0-9a-f]{64}$/.test(expectedSha)) {
      const actualSha = await sha256Bytes(await file.arrayBuffer());
      if (!current()) return false;
      if (actualSha !== expectedSha) {
        model.browserLocalMedia = emptyBrowserLocalMedia({
          sourceLabel,
          handleName: expectedHandleName ?? handle.name,
          permissionState: 'error',
          lastError: `The file behind the saved handle "${handle.name}" changed content and no longer matches this media. Nothing was relinked. Choose the original media again or import the changed file as new media.`,
        });
        return false;
      }
    }
    if (typeof URL.createObjectURL !== 'function') {
      model.browserLocalMedia = emptyBrowserLocalMedia({
        sourceLabel,
        handleName: expectedHandleName ?? handle.name,
        permissionState: 'error',
        lastError: 'Browser object URL creation is unavailable. The media file handle was read but playback could not be initialized.',
      });
      return false;
    }
    const objectUrl = URL.createObjectURL(file);
    const replacedUrl = model.browserLocalMedia.objectUrl;
    if (replacedUrl && replacedUrl !== objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(replacedUrl);
    model.browserLocalMedia = {
      objectUrl,
      sourceLabel: `${HANDLE_LABEL_PREFIX}${handle.name}`,
      handleName: handle.name,
      permissionState: 'granted',
      lastError: null,
    };
    return true;
  } catch (error) {
    if (!current()) return false;
    model.browserLocalMedia = emptyBrowserLocalMedia({
      sourceLabel: expectedHandleName ? `${HANDLE_LABEL_PREFIX}${expectedHandleName}` : model.browserLocalMedia.sourceLabel,
      handleName: expectedHandleName ?? model.browserLocalMedia.handleName,
      permissionState: 'error',
      lastError: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * lt-aot: restore the saved browser media handle at boot, independent of the
 * local service. Only queries permission (never requestPermission, which needs
 * a user gesture); a 'prompt' state leaves a Reconnect affordance for the
 * player. Does not touch the store, so no cache write or dirty flag results.
 */
export async function restoreMediaAtBoot(model: AppModel, timeoutMs = 1500): Promise<boolean> {
  if (!handleNameFromMedia(model) || model.browserLocalMedia.objectUrl) return false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => { timer = setTimeout(() => { timedOut = true; resolve(false); }, timeoutMs); });
  try {
    return await Promise.race([
      restoreBrowserMediaHandle(model, () => !timedOut, { queryOnly: true }).catch(() => false),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type TranscriptSegmentDraft = Readonly<{
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  words?: readonly TranscriptWordTimingDraft[];
}>;

type TranscriptWordTimingDraft = Readonly<{
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

export type YouTubeCaptionProviderResult = Readonly<{
  videoId: string;
  language: string;
  isAutoGenerated: boolean;
  segments: readonly TranscriptSegmentDraft[];
}>;

export type YouTubeCaptionProvider = Readonly<{
  providerId: string;
  privacyMode: 'local' | 'explicit-online';
  assertCurrent?: () => void;
  readonly calls: number;
  fetchCaptions(input: { url: string; language: string }): Promise<YouTubeCaptionProviderResult>;
}>;

export type LocalAsrProviderResult = Readonly<{
  engine: string;
  modelName: string;
  modelVersion?: string;
  language: string;
  segments: readonly TranscriptSegmentDraft[];
}>;

export type LocalAsrProvider = Readonly<{
  providerId: string;
  privacyMode: 'local';
  assertCurrent?: () => void;
  readonly calls: number;
  transcribe(input: { media: MediaAsset; language: string }): Promise<LocalAsrProviderResult>;
}>;

export type ElevenLabsScribeProviderResult = Readonly<{
  language: string;
  modelName: 'scribe_v2' | string;
  modelVersion?: string;
  segments: readonly TranscriptSegmentDraft[];
}>;

export type ElevenLabsScribeProvider = Readonly<{
  providerId: string;
  privacyMode: 'explicit-online';
  assertCurrent?: () => void;
  readonly calls: number;
  transcribe(input: { media: MediaAsset; language: string }): Promise<ElevenLabsScribeProviderResult>;
}>;

export type TranscriptImportResult = Readonly<{ track: SubtitleTrack; cues: Cue[] }>;

export function makeFakeYouTubeCaptionProvider(seed: YouTubeCaptionProviderResult): YouTubeCaptionProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.fake-youtube-caption-provider',
    privacyMode: 'local',
    get calls() {
      return callCount;
    },
    async fetchCaptions() {
      callCount += 1;
      return seed;
    },
  };
}

export function makeFakeLocalAsrProvider(seed: LocalAsrProviderResult): LocalAsrProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.fake-local-asr-provider',
    privacyMode: 'local',
    get calls() {
      return callCount;
    },
    async transcribe() {
      callCount += 1;
      return seed;
    },
  };
}

export type LocalServiceAsrProviderOptions = Readonly<{
  mediaPath?: string;
  pathPolicy?: NativePathPolicy | null | undefined;
  modelName?: string;
  alignWords?: boolean;
  pollAttempts?: number;
  pollDelayMs?: number;
}>;

export type LocalServiceYouTubeCaptionProviderOptions = Readonly<{
  allowPublicRead?: boolean;
  pollAttempts?: number;
  pollDelayMs?: number;
}>;

export type LocalServiceElevenLabsScribeProviderOptions = Readonly<{
  mediaPath?: string;
  pathPolicy?: NativePathPolicy | null | undefined;
  modelId?: 'scribe_v2' | string;
  allowOnlineProvider?: boolean;
  pollAttempts?: number;
  pollDelayMs?: number;
}>;

function recordField(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalStringField(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return stringField(value, label);
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function optionalNumberField(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return numberField(value, label);
}

function transcriptWordTimingSourceKind(value: unknown): TranscriptWordTimingSourceKind | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'provider-word-timing' || value === 'forced-alignment' || value === 'manual-edit') return value;
  throw new TypeError(`Unsupported transcript word timing source kind: ${String(value)}`);
}

function transcriptWordTimingDraftFromJson(value: unknown, index: number): TranscriptWordTimingDraft {
  const word = recordField(value, `local service transcript word ${index + 1}`);
  const confidence = optionalNumberField(word.confidence, 'word confidence');
  const speakerId = optionalStringField(word.speakerId, 'word speakerId');
  const sourceKind = transcriptWordTimingSourceKind(word.sourceKind);
  return {
    wordIndex: numberField(word.wordIndex, 'wordIndex'),
    text: stringField(word.text, 'word text'),
    charStart: numberField(word.charStart, 'word charStart'),
    charEnd: numberField(word.charEnd, 'word charEnd'),
    startMs: numberField(word.startMs, 'word startMs'),
    endMs: numberField(word.endMs, 'word endMs'),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(speakerId !== undefined ? { speakerId } : {}),
    ...(sourceKind !== undefined ? { sourceKind } : {}),
  };
}

function transcriptSegmentDraftFromJson(value: unknown, index: number): TranscriptSegmentDraft {
  const segment = recordField(value, `local service transcript segment ${index + 1}`);
  const wordsValue = segment.words;
  const words = wordsValue === undefined
    ? undefined
    : Array.isArray(wordsValue)
      ? wordsValue.map(transcriptWordTimingDraftFromJson)
      : (() => { throw new TypeError('local service transcript segment words must be an array.'); })();
  const confidence = optionalNumberField(segment.confidence, 'segment confidence');
  return {
    startMs: numberField(segment.startMs, 'segment startMs'),
    endMs: numberField(segment.endMs, 'segment endMs'),
    text: stringField(segment.text, 'segment text'),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(words !== undefined ? { words } : {}),
  };
}

function localServiceAsrResultFromJson(value: unknown): LocalAsrProviderResult {
  const transcript = recordField(value, 'local service transcription result');
  const segments = transcript.segments;
  if (!Array.isArray(segments)) {
    throw new TypeError('local service transcription result segments must be an array.');
  }
  const modelVersion = optionalStringField(transcript.modelVersion, 'transcription modelVersion');
  return {
    engine: stringField(transcript.engine, 'transcription engine'),
    modelName: stringField(transcript.modelName, 'transcription modelName'),
    ...(modelVersion !== undefined ? { modelVersion } : {}),
    language: stringField(transcript.language, 'transcription language'),
    segments: segments.map(transcriptSegmentDraftFromJson),
  };
}

function youtubeCaptionResultFromJson(value: unknown): YouTubeCaptionProviderResult {
  const caption = recordField(value, 'local service YouTube caption result');
  const segments = caption.segments;
  if (!Array.isArray(segments)) {
    throw new TypeError('local service YouTube caption result segments must be an array.');
  }
  return {
    videoId: stringField(caption.videoId, 'YouTube caption videoId'),
    language: stringField(caption.language, 'YouTube caption language'),
    isAutoGenerated: Boolean(caption.isAutoGenerated),
    segments: segments.map(transcriptSegmentDraftFromJson),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const EMBEDDED_PATH_ERROR = 'An explicit absolute owned local media path is required. Browser blob and handle labels do not qualify.';
const EMBEDDED_SERVICE_ERROR = 'Local service unreachable. Connect the loopback service and retry.';

export type EmbeddedSubtitleJobOptions = Readonly<{
  pollAttempts?: number;
  pollDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}>;

function embeddedMediaPath(value: string, policy: unknown): string {
  if (!readNativePathPolicy(policy)) throw new TypeError(NATIVE_PATH_COMPATIBILITY_MESSAGE);
  try { return requireServiceNativePath(value, policy); }
  catch { throw new TypeError(EMBEDDED_PATH_ERROR); }
}

function integerField(value: unknown, label: string): number {
  const number = numberField(value, label);
  if (!Number.isSafeInteger(number)) throw new TypeError(`${label} must be a safe integer.`);
  return number;
}

function booleanField(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean.`);
  return value;
}

function embeddedTrackFromJson(value: unknown, index: number): EmbeddedSubtitleTrackState {
  const track = recordField(value, `embedded subtitle track ${index + 1}`);
  const language = optionalStringField(track.language, 'embedded subtitle language');
  const title = optionalStringField(track.title, 'embedded subtitle title');
  const extractionHint = optionalStringField(track.extractionHint, 'embedded subtitle extraction hint');
  const isDefault = track.isDefault === undefined ? undefined : booleanField(track.isDefault, 'embedded subtitle default flag');
  const isForced = track.isForced === undefined ? undefined : booleanField(track.isForced, 'embedded subtitle forced flag');
  return {
    streamIndex: integerField(track.streamIndex, 'embedded subtitle stream index'),
    codecName: stringField(track.codecName, 'embedded subtitle codec name'),
    codecKind: stringField(track.codecKind, 'embedded subtitle codec kind'),
    isSupported: booleanField(track.isSupported, 'embedded subtitle supported flag'),
    ...(language !== undefined ? { language } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(isDefault !== undefined ? { isDefault } : {}),
    ...(isForced !== undefined ? { isForced } : {}),
    ...(extractionHint !== undefined ? { extractionHint } : {}),
  };
}

function embeddedTracksFromJson(value: unknown): EmbeddedSubtitleTrackState[] {
  const listing = recordField(value, 'embedded subtitle listing');
  if (listing.effect !== 'embedded-subtitles-listed') throw new TypeError('Embedded subtitle listing effect is invalid.');
  if (!Array.isArray(listing.tracks)) throw new TypeError('Embedded subtitle listing tracks must be an array.');
  const tracks = listing.tracks.map(embeddedTrackFromJson);
  if (integerField(listing.streamCount, 'embedded subtitle stream count') !== tracks.length) {
    throw new TypeError('Embedded subtitle stream count does not match returned tracks.');
  }
  const supportedCount = tracks.filter((track) => track.isSupported).length;
  if (integerField(listing.supportedCount, 'embedded subtitle supported count') !== supportedCount) {
    throw new TypeError('Embedded subtitle supported count does not match returned tracks.');
  }
  return tracks;
}

function redactEmbeddedSubtitleError(value: unknown, mediaPath: string): string {
  const raw = value instanceof Error ? value.message : String(value);
  return mediaPath ? raw.split(mediaPath).join('[local-path]') : raw;
}

function isLoopbackConnectivityError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value);
  return /unreachable|failed to fetch|fetch failed|networkerror|econnrefused|connection refused/i.test(message);
}

const EMBEDDED_STALE_OPERATION_ERROR = 'Embedded subtitle operation was superseded by a media context change.';

class StaleEmbeddedSubtitleOperationError extends Error {
  constructor() {
    super(EMBEDDED_STALE_OPERATION_ERROR);
    this.name = 'StaleEmbeddedSubtitleOperationError';
  }
}

export function isStaleEmbeddedSubtitleOperationError(value: unknown): boolean {
  return value instanceof StaleEmbeddedSubtitleOperationError;
}

type EmbeddedSubtitleOperationGenerations = { listing: number; extraction: number };
const embeddedSubtitleOperationGenerations = new WeakMap<AppModel, EmbeddedSubtitleOperationGenerations>();

function embeddedSubtitleGenerations(model: AppModel): EmbeddedSubtitleOperationGenerations {
  const existing = embeddedSubtitleOperationGenerations.get(model);
  if (existing) return existing;
  const created = { listing: 0, extraction: 0 };
  embeddedSubtitleOperationGenerations.set(model, created);
  return created;
}

async function completedEmbeddedJob(
  transport: PairedTransport,
  jobId: string,
  label: string,
  options: EmbeddedSubtitleJobOptions,
  assertContext: () => void,
): Promise<Record<string, unknown>> {
  const attempts = options.pollAttempts ?? 120;
  const delayMs = options.pollDelayMs ?? 1000;
  const wait = options.sleep ?? sleep;
  for (let attempt = 0; attempt < attempts; attempt++) {
    assertContext();
    const response = await fetchLocalServiceJson(transport, `/api/jobs/${encodeURIComponent(jobId)}`);
    assertContext();
    const job = recordField(response.job, `local service ${label} job`);
    const status = stringField(job.status, `local service ${label} job status`);
    if (status === 'completed') return job;
    if (status === 'failed' || status === 'cancelled') {
      const reason = optionalStringField(job.message, `local service ${label} failure`) ?? `status ${status}`;
      throw new TypeError(reason);
    }
    if (status !== 'queued' && status !== 'running') throw new TypeError(`Unsupported ${label} job status: ${status}`);
    if (delayMs > 0) await wait(delayMs);
  }
  throw new TypeError(`${label} job did not finish before the polling deadline.`);
}

export function setEmbeddedSubtitleMediaPath(model: AppModel, value: string): void {
  const state = model.transcriptLifecycle.embeddedSubtitle;
  const generations = embeddedSubtitleGenerations(model);
  generations.listing += 1;
  generations.extraction += 1;
  state.mediaPath = value;
  state.listingStatus = 'idle';
  state.extractionStatus = 'idle';
  state.tracks = [];
  state.selectedStreamIndex = null;
  state.statusMessage = null;
  state.errorCode = null;
}

export function selectEmbeddedSubtitleTrack(model: AppModel, streamIndex: number): void {
  const state = model.transcriptLifecycle.embeddedSubtitle;
  const selected = state.tracks.find((track) => track.streamIndex === streamIndex && track.isSupported);
  if (!selected) throw new TypeError('Select a supported embedded subtitle track.');
  state.selectedStreamIndex = selected.streamIndex;
  state.language = selected.language ?? (state.language || 'pl');
  state.extractionStatus = 'idle';
}

export function listEmbeddedSubtitleTracksFromService(model: AppModel, options: EmbeddedSubtitleJobOptions = {}): Promise<EmbeddedSubtitleTrackState[]> {
  return serializeServiceJob(captureLocalServiceTransport(model), () => listEmbeddedSubtitleTracksFromServiceImpl(model, options));
}
async function listEmbeddedSubtitleTracksFromServiceImpl(
  model: AppModel,
  options: EmbeddedSubtitleJobOptions = {},
): Promise<EmbeddedSubtitleTrackState[]> {
  const transport = captureLocalServiceTransport(model);
  const state = model.transcriptLifecycle.embeddedSubtitle;
  const generations = embeddedSubtitleGenerations(model);
  const listingGeneration = ++generations.listing;
  generations.extraction += 1;
  state.tracks = [];
  state.selectedStreamIndex = null;
  state.extractionStatus = 'idle';
  state.errorCode = null;
  if (model.localService.status !== 'connected') {
    state.listingStatus = 'failed';
    state.statusMessage = EMBEDDED_SERVICE_ERROR;
    throw new TypeError(EMBEDDED_SERVICE_ERROR);
  }
  const pathAtStart = state.mediaPath;
  let mediaPath = '';
  const assertCurrentContext = () => {
    transport.assertCurrent();
    if (generations.listing !== listingGeneration || (mediaPath !== '' && state.mediaPath !== pathAtStart)) {
      throw new StaleEmbeddedSubtitleOperationError();
    }
  };
  try {
    mediaPath = embeddedMediaPath(state.mediaPath, model.localService.pathPolicy);
    state.listingStatus = 'listing';
    state.statusMessage = 'Listing embedded subtitle tracks.';
    const created = await fetchLocalServiceJson(transport, '/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ kind: 'embedded-subtitle-list', payload: { mediaPath } }),
    });
    const createdJob = recordField(created.job, 'local service embedded subtitle listing job');
    const jobId = stringField(createdJob.id, 'embedded subtitle listing job id');
    assertCurrentContext();
    const job = await completedEmbeddedJob(transport, jobId, 'embedded subtitle listing', options, assertCurrentContext);
    const result = recordField(job.result, 'embedded subtitle listing job result');
    const tracks = embeddedTracksFromJson(result.listing);
    assertCurrentContext();
    state.tracks = tracks;
    state.listingStatus = tracks.length === 0 ? 'empty' : 'ready';
    state.statusMessage = tracks.length === 0
      ? 'No embedded subtitle tracks found.'
      : `${tracks.length} embedded subtitle track${tracks.length === 1 ? '' : 's'} found; select one explicitly.`;
    return tracks;
  } catch (error) {
    if (isStaleEmbeddedSubtitleOperationError(error)) throw error;
    assertCurrentContext();
    if (state.listingStatus !== 'empty' && state.listingStatus !== 'ready') state.listingStatus = 'failed';
    if (isLoopbackConnectivityError(error)) {
      state.statusMessage = EMBEDDED_SERVICE_ERROR;
      state.errorCode = 'service-unreachable';
      throw new TypeError(EMBEDDED_SERVICE_ERROR);
    }
    const message = redactEmbeddedSubtitleError(error, mediaPath || state.mediaPath.trim());
    state.statusMessage = message === EMBEDDED_PATH_ERROR ? EMBEDDED_PATH_ERROR : `Embedded subtitle listing failed. ${message}`;
    state.errorCode = message === EMBEDDED_PATH_ERROR ? 'invalid-path' : 'listing-failed';
    throw new TypeError(state.statusMessage);
  }
}

function embeddedOutputFormat(track: EmbeddedSubtitleTrackState): Exclude<SubtitleFormat, 'json'> {
  const codec = track.codecName.toLowerCase();
  if (codec === 'ass' || codec === 'ssa') return 'ass';
  if (codec === 'webvtt') return 'vtt';
  if (codec === 'subrip' || codec === 'srt' || codec === 'mov_text') return 'srt';
  throw new TypeError(`Codec '${track.codecName}' is not directly importable.`);
}

function embeddedWarningFlags(value: unknown): TranscriptWarningFlag[] {
  if (!Array.isArray(value)) throw new TypeError('Embedded subtitle warning flags must be an array.');
  const flags = value.map((flag) => stringField(flag, 'embedded subtitle warning flag'));
  const allowed: readonly TranscriptWarningFlag[] = ['lowConfidence', 'timingUnverified', 'autoCaption', 'downloadRightsUnverified', 'asrDraft', 'providerCaption', 'qualityUnreviewed'];
  if (flags.some((flag) => !allowed.includes(flag as TranscriptWarningFlag))) throw new TypeError('Embedded subtitle warning flags contain an unsupported value.');
  if (!flags.includes('timingUnverified') || !flags.includes('qualityUnreviewed')) {
    throw new TypeError('Embedded subtitle draft is missing required review warnings.');
  }
  return flags as TranscriptWarningFlag[];
}

export function extractSelectedEmbeddedSubtitleDraft(model: AppModel, options: EmbeddedSubtitleJobOptions = {}): Promise<TranscriptImportResult> {
  return serializeServiceJob(captureLocalServiceTransport(model), () => extractSelectedEmbeddedSubtitleDraftImpl(model, options));
}
async function extractSelectedEmbeddedSubtitleDraftImpl(
  model: AppModel,
  options: EmbeddedSubtitleJobOptions = {},
): Promise<TranscriptImportResult> {
  const transport = captureLocalServiceTransport(model);
  const state = model.transcriptLifecycle.embeddedSubtitle;
  const generations = embeddedSubtitleGenerations(model);
  const extractionGeneration = ++generations.extraction;
  if (model.localService.status !== 'connected') {
    state.extractionStatus = 'failed';
    state.statusMessage = EMBEDDED_SERVICE_ERROR;
    throw new TypeError(EMBEDDED_SERVICE_ERROR);
  }
  const media = model.currentMedia;
  if (!media) throw new TypeError('Embedded subtitle draft import requires current owned local media.');
  const pathAtStart = state.mediaPath;
  let mediaPath = '';
  let completedResultReceived = false;
  let selectedStreamIndex: number | null = null;
  const mediaId = media.id;
  const assertCurrentContext = () => {
    transport.assertCurrent();
    if ((mediaPath !== '' && state.mediaPath !== pathAtStart)
      || generations.extraction !== extractionGeneration
      || model.currentMedia?.id !== mediaId
      || (selectedStreamIndex !== null && (state.selectedStreamIndex !== selectedStreamIndex
        || !state.tracks.some((track) => track.streamIndex === selectedStreamIndex && track.isSupported)))) {
      throw new StaleEmbeddedSubtitleOperationError();
    }
  };
  try {
    mediaPath = embeddedMediaPath(state.mediaPath, model.localService.pathPolicy);
    const language = state.language.trim();
    if (!language) throw new TypeError('Embedded subtitle language is required.');
    const selected = state.tracks.find((track) => track.streamIndex === state.selectedStreamIndex && track.isSupported);
    if (!selected) throw new TypeError('Select a supported embedded subtitle track.');
    const outputFormat = embeddedOutputFormat(selected);
    selectedStreamIndex = selected.streamIndex;
    state.extractionStatus = 'extracting';
    state.statusMessage = 'Extracting selected embedded subtitle track.';
    const created = await fetchLocalServiceJson(transport, '/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ kind: 'embedded-subtitle-extract', payload: {
        mediaPath, streamIndex: selected.streamIndex, outputFormat, language, role: 'target',
      } }),
    });
    const createdJob = recordField(created.job, 'local service embedded subtitle extraction job');
    const jobId = stringField(createdJob.id, 'embedded subtitle extraction job id');
    assertCurrentContext();
    const job = await completedEmbeddedJob(transport, jobId, 'embedded subtitle extraction', options, assertCurrentContext);
    assertCurrentContext();
    completedResultReceived = true;
    const result = recordField(job.result, 'embedded subtitle extraction job result');
    const extract = recordField(result.extract, 'embedded subtitle extraction metadata');
    if (extract.effect !== 'embedded-subtitle-extracted') throw new TypeError('Embedded subtitle extraction effect is invalid.');
    if (integerField(extract.streamIndex, 'extracted subtitle stream index') !== selected.streamIndex) throw new TypeError('Extracted subtitle stream index does not match selection.');
    if (stringField(extract.outputFormat, 'extracted subtitle format') !== outputFormat) throw new TypeError('Extracted subtitle format does not match selection.');
    const serviceTrack = recordField(result.track, 'embedded subtitle service track');
    if (serviceTrack.transcriptStatus !== 'draft' || serviceTrack.role !== 'target' || serviceTrack.transcriptSourceKind !== 'user-subtitle-file') {
      throw new TypeError('Extracted subtitle track does not preserve draft target import semantics.');
    }
    if (stringField(serviceTrack.format, 'embedded subtitle service track format') !== outputFormat) throw new TypeError('Embedded subtitle track format does not match extraction.');
    const provenance = recordField(serviceTrack.provenance, 'embedded subtitle service provenance');
    const warningFlags = embeddedWarningFlags(provenance.warningFlags);
    if (!Array.isArray(result.cues) || result.cues.length === 0) throw new TypeError('Extracted subtitle data contains no cues.');
    const segments = result.cues.map((value, index): TranscriptSegmentDraft => {
      const cue = recordField(value, `embedded subtitle cue ${index + 1}`);
      if (integerField(cue.cueIndex, 'embedded subtitle cue index') !== index + 1) throw new TypeError('Embedded subtitle cue indexes must be ordered and contiguous.');
      const startMs = integerField(cue.startMs, 'embedded subtitle cue start');
      const endMs = integerField(cue.endMs, 'embedded subtitle cue end');
      const text = stringField(cue.text, 'embedded subtitle cue text');
      if (startMs < 0 || endMs <= startMs) throw new TypeError('Embedded subtitle cue timing is invalid.');
      return { startMs, endMs, text };
    });
    if (integerField(serviceTrack.cueCount, 'embedded subtitle cue count') !== segments.length) throw new TypeError('Embedded subtitle cue count does not match returned cues.');
    const imported = await putTranscriptSegments(model, {
      media,
      language,
      role: 'target',
      format: outputFormat,
      sourcePath: `embedded-subtitle:${media.id}:stream-${selected.streamIndex}:${selected.codecName}:${outputFormat}`,
      sourceKind: media.privacyLabel,
      transcriptStatus: 'draft',
      transcriptSourceKind: 'user-subtitle-file',
      provenance: {
        language,
        generatedAt: new Date().toISOString(),
        engine: 'ffmpeg-embedded-subtitle',
        warningFlags,
      },
      qualityReport: qualityReportForSegments(segments, warningFlags),
      segments,
      beforeCommit: assertCurrentContext,
    });
    assertCurrentContext();
    state.extractionStatus = 'imported';
    state.statusMessage = 'Embedded subtitle track imported as a draft; correct and approve it before study use.';
    state.errorCode = null;
    model.transcriptLifecycle.pendingCueEdits = {};
    model.transcriptLifecycle.pendingCueTimingEdits = {};
    model.transcriptLifecycle.pendingWordTimingEdits = {};
    return imported;
  } catch (error) {
    if (isStaleEmbeddedSubtitleOperationError(error)) throw error;
    assertCurrentContext();
    state.extractionStatus = 'failed';
    if (isLoopbackConnectivityError(error)) {
      state.statusMessage = EMBEDDED_SERVICE_ERROR;
      state.errorCode = 'service-unreachable';
      throw new TypeError(EMBEDDED_SERVICE_ERROR);
    }
    const reason = redactEmbeddedSubtitleError(error, mediaPath || state.mediaPath.trim());
    state.statusMessage = completedResultReceived
      ? `Extracted subtitle data could not be imported as a draft. ${reason}`
      : `Embedded subtitle extraction failed. ${reason}`;
    state.errorCode = completedResultReceived ? 'import-validation-failed' : 'extraction-failed';
    throw new TypeError(state.statusMessage);
  }
}

export function makeLocalServiceAsrProvider(transport: PairedTransport, options: LocalServiceAsrProviderOptions = {}): LocalAsrProvider {
  let callCount = 0;
  return {
    assertCurrent: transport.assertCurrent,
    providerId: 'lingotorte.loopback-local-service-asr',
    privacyMode: 'local',
    get calls() {
      return callCount;
    },
    async transcribe(input) {
      return serializeServiceJob(transport, async () => {
      callCount += 1;
      const mediaPath = requireServiceNativePath(options.mediaPath === '' || options.mediaPath === undefined ? input.media.originalPath : options.mediaPath, options.pathPolicy);
      const createResponse = await fetchLocalServiceJson(transport, '/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'local-transcription',
          payload: {
            mediaPath,
            language: input.language,
            ...(options.modelName !== undefined ? { modelName: options.modelName } : {}),
            alignWords: options.alignWords ?? true,
          },
        }),
      });
      const createdJob = recordField(createResponse.job, 'local service created job');
      const jobId = stringField(createdJob.id, 'local service job id');
      const attempts = options.pollAttempts ?? 120;
      const delayMs = options.pollDelayMs ?? 1000;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const jobResponse = await fetchLocalServiceJson(transport, `/api/jobs/${encodeURIComponent(jobId)}`);
        const job = recordField(jobResponse.job, 'local service transcription job');
        const status = stringField(job.status, 'local service transcription job status');
        if (status === 'completed') {
          const result = recordField(job.result, 'local service transcription job result');
          return localServiceAsrResultFromJson(result.transcript);
        }
        if (status === 'failed' || status === 'cancelled') {
          const message = optionalStringField(job.message, 'local service transcription job message') ?? `status ${status}`;
          throw new TypeError(`Local service transcription job did not complete: ${message}`);
        }
        if (delayMs > 0) await sleep(delayMs);
      }
      throw new TypeError(`Local service transcription job ${jobId} did not finish before the polling deadline.`);
      });
    },
  };
}

export function makeLocalServiceElevenLabsScribeProvider(transport: PairedTransport, options: LocalServiceElevenLabsScribeProviderOptions = {}): ElevenLabsScribeProvider {
  let callCount = 0;
  return {
    assertCurrent: transport.assertCurrent,
    providerId: 'lingotorte.loopback-local-service-elevenlabs-scribe',
    privacyMode: 'explicit-online',
    get calls() {
      return callCount;
    },
    async transcribe(input) {
      return serializeServiceJob(transport, async () => {
      callCount += 1;
      const mediaPath = requireServiceNativePath(options.mediaPath === '' || options.mediaPath === undefined ? input.media.originalPath : options.mediaPath, options.pathPolicy);
      const createResponse = await fetchLocalServiceJson(transport, '/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'elevenlabs-scribe',
          payload: {
            mediaPath,
            language: input.language,
            modelId: options.modelId ?? 'scribe_v2',
            allowOnlineProvider: options.allowOnlineProvider === true,
          },
        }),
      });
      const createdJob = recordField(createResponse.job, 'local service created ElevenLabs Scribe job');
      const jobId = stringField(createdJob.id, 'local service ElevenLabs Scribe job id');
      const attempts = options.pollAttempts ?? 120;
      const delayMs = options.pollDelayMs ?? 1000;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const jobResponse = await fetchLocalServiceJson(transport, `/api/jobs/${encodeURIComponent(jobId)}`);
        const job = recordField(jobResponse.job, 'local service ElevenLabs Scribe job');
        const status = stringField(job.status, 'local service ElevenLabs Scribe job status');
        if (status === 'completed') {
          const result = recordField(job.result, 'local service ElevenLabs Scribe job result');
          const transcript = localServiceAsrResultFromJson(result.transcript);
          return {
            language: transcript.language,
            modelName: transcript.modelName,
            ...(transcript.modelVersion !== undefined ? { modelVersion: transcript.modelVersion } : {}),
            segments: transcript.segments,
          };
        }
        if (status === 'failed' || status === 'cancelled') {
          const message = optionalStringField(job.message, 'local service ElevenLabs Scribe job message') ?? `status ${status}`;
          throw new TypeError(`Local service ElevenLabs Scribe job did not complete: ${message}`);
        }
        if (delayMs > 0) await sleep(delayMs);
      }
      throw new TypeError(`Local service ElevenLabs Scribe job ${jobId} did not finish before the polling deadline.`);
      });
    },
  };
}

export function makeLocalServiceYouTubeCaptionProvider(transport: PairedTransport, options: LocalServiceYouTubeCaptionProviderOptions = {}): YouTubeCaptionProvider {
  let callCount = 0;
  return {
    assertCurrent: transport.assertCurrent,
    providerId: 'lingotorte.loopback-local-service-youtube-caption',
    privacyMode: 'explicit-online',
    get calls() {
      return callCount;
    },
    async fetchCaptions(input) {
      return serializeServiceJob(transport, async () => {
      callCount += 1;
      const createResponse = await fetchLocalServiceJson(transport, '/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'youtube-caption',
          payload: {
            url: input.url,
            language: input.language,
            allowPublicRead: options.allowPublicRead === true,
          },
        }),
      });
      const createdJob = recordField(createResponse.job, 'local service created YouTube caption job');
      const jobId = stringField(createdJob.id, 'local service YouTube caption job id');
      const attempts = options.pollAttempts ?? 60;
      const delayMs = options.pollDelayMs ?? 1000;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const jobResponse = await fetchLocalServiceJson(transport, `/api/jobs/${encodeURIComponent(jobId)}`);
        const job = recordField(jobResponse.job, 'local service YouTube caption job');
        const status = stringField(job.status, 'local service YouTube caption job status');
        if (status === 'completed') {
          const result = recordField(job.result, 'local service YouTube caption job result');
          return youtubeCaptionResultFromJson(result.caption);
        }
        if (status === 'failed' || status === 'cancelled') {
          const message = optionalStringField(job.message, 'local service YouTube caption job message') ?? `status ${status}`;
          throw new TypeError(`Local service YouTube caption job did not complete: ${message}`);
        }
        if (delayMs > 0) await sleep(delayMs);
      }
      throw new TypeError(`Local service YouTube caption job ${jobId} did not finish before the polling deadline.`);
      });
    },
  };
}

export function makeFakeElevenLabsScribeProvider(seed: ElevenLabsScribeProviderResult): ElevenLabsScribeProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.fake-elevenlabs-scribe-provider',
    privacyMode: 'explicit-online',
    get calls() {
      return callCount;
    },
    async transcribe() {
      callCount += 1;
      return seed;
    },
  };
}

function videoIdFromYouTubeUrl(url: string): string {
  const trimmed = url.trim();
  const direct = /^[A-Za-z0-9_-]{11}$/.exec(trimmed);
  if (direct) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').slice(0, 11);
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    const queryId = parsed.searchParams.get('v');
    if (queryId && /^[A-Za-z0-9_-]{11}$/.test(queryId)) return queryId;
  } catch {
    // Fall through to the explicit error below.
  }
  throw new TypeError('YouTube caption import requires a public YouTube URL or 11-character video id.');
}

function qualityReportForSegments(
  segments: readonly TranscriptSegmentDraft[],
  warningFlags: readonly TranscriptWarningFlag[],
  manualCorrectionCount = 0,
): TranscriptQualityReport {
  let overlappingCueCount = 0;
  let suspiciousGapCount = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!;
    const curr = segments[i]!;
    if (curr.startMs < prev.endMs) overlappingCueCount += 1;
    if (curr.startMs - prev.endMs > 5000) suspiciousGapCount += 1;
  }
  return {
    segmentCount: segments.length,
    coverageDurationMs: Math.max(0, ...segments.map((segment) => segment.endMs)),
    emptyCueCount: segments.filter((segment) => segment.text.trim().length === 0).length,
    overlongCueCount: segments.filter((segment) => segment.text.length > 180).length,
    overlappingCueCount,
    suspiciousGapCount,
    warningFlags,
    manualCorrectionCount,
  };
}

async function putTranscriptSegments(model: AppModel, input: {
  media: MediaAsset;
  language: string;
  role: 'target' | 'native' | 'other';
  format?: SubtitleFormat;
  sourcePath: string;
  sourceKind: SourceKind;
  transcriptStatus: SubtitleTrack['transcriptStatus'];
  transcriptSourceKind: TranscriptSourceKind;
  provenance: SubtitleTrack['provenance'];
  qualityReport: TranscriptQualityReport;
  segments: readonly TranscriptSegmentDraft[];
  beforeCommit?: () => void;
}): Promise<TranscriptImportResult> {
  if (input.segments.length === 0) {
    throw new TypeError('Transcript candidate contains no caption segments.');
  }
  const contentText = input.segments.map((segment) => `${segment.startMs}-${segment.endMs}:${segment.text}`).join('\n');
  const track = makeSubtitleTrack({
    mediaId: input.media.id,
    language: input.language,
    role: input.role,
    format: input.format ?? 'json',
    sourceKind: input.sourceKind,
    sourcePath: input.sourcePath,
    contentSha256: await sha256BrowserText(contentText),
    isActive: true,
    transcriptStatus: input.transcriptStatus,
    transcriptSourceKind: input.transcriptSourceKind,
    provenance: input.provenance,
    qualityReport: input.qualityReport,
  });
  const cues: Cue[] = [];
  for (let index = 0; index < input.segments.length; index++) {
    const segment = input.segments[index]!;
    const text = normalizeBrowserCueText(segment.text);
    if (!text) throw new TypeError(`Transcript segment ${index + 1} has empty cue text`);
    if (segment.endMs <= segment.startMs) throw new TypeError(`Transcript segment ${index + 1} end time must be after start time`);
    cues.push(makeCue({
      trackId: track.id,
      cueIndex: index + 1,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text,
      normalizedText: text.toLowerCase(),
      textSha256: await sha256BrowserText(text),
    }));
  }
  input.beforeCommit?.();
  model.store.putMediaAsset(input.media);
  model.store.putSubtitleTrack(track);
  for (const cue of cues) model.store.putCue(cue);
  model.currentMedia = input.media;
  model.targetTrackId = track.id;
  model.cues = model.store.listCuesForTrack(track.id);
  model.player.durationMs = Math.max(input.media.durationMs, input.qualityReport.coverageDurationMs);
  model.player.currentTimeMs = 0;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
  persistIfLocalServiceAutosaveEnabled(model);
  return { track, cues };
}

function putTranscriptWordTimingsForSegments(model: AppModel, input: {
  imported: TranscriptImportResult;
  segments: readonly TranscriptSegmentDraft[];
  sourceKind: TranscriptWordTimingSourceKind;
  engine: string;
  modelName: string;
  modelVersion?: string;
}): void {
  for (let segmentIndex = 0; segmentIndex < input.segments.length; segmentIndex++) {
    const segment = input.segments[segmentIndex]!;
    const cue = input.imported.cues[segmentIndex];
    if (!cue) throw new TypeError(`Transcript word timings reference missing cue for segment ${segmentIndex + 1}`);
    for (const word of segment.words ?? []) {
      const text = normalizeBrowserCueText(word.text);
      if (!text) throw new TypeError(`Transcript word timing ${word.wordIndex} has empty text`);
      if (word.endMs <= word.startMs) throw new TypeError(`Transcript word timing ${word.wordIndex} end time must be after start time`);
      model.store.putTranscriptWordTiming(makeTranscriptWordTiming({
        trackId: input.imported.track.id,
        cueId: cue.id,
        wordIndex: word.wordIndex,
        charStart: word.charStart,
        charEnd: word.charEnd,
        text,
        normalizedText: text.toLowerCase(),
        startMs: word.startMs,
        endMs: word.endMs,
        sourceKind: word.sourceKind ?? input.sourceKind,
        engine: input.engine,
        modelName: input.modelName,
        ...(word.confidence !== undefined ? { confidence: word.confidence } : {}),
        ...(word.speakerId !== undefined ? { speakerId: word.speakerId } : {}),
        ...(input.modelVersion !== undefined ? { modelVersion: input.modelVersion } : {}),
      }));
    }
  }
}

export async function importYouTubeCaptionCandidate(
  model: AppModel,
  input: { url: string; language: string; allowPublicRead: boolean },
  provider: YouTubeCaptionProvider,
): Promise<TranscriptImportResult> {
  if (!input.allowPublicRead) {
    throw new TypeError('YouTube caption import disabled: explicit public-read authorization is required.');
  }
  const expectedVideoId = videoIdFromYouTubeUrl(input.url);
  provider.assertCurrent?.();
  const result = await provider.fetchCaptions({ url: input.url, language: input.language });
  provider.assertCurrent?.();
  const videoId = result.videoId || expectedVideoId;
  const warningFlags: TranscriptWarningFlag[] = result.isAutoGenerated
    ? ['providerCaption', 'autoCaption', 'timingUnverified']
    : ['providerCaption', 'timingUnverified'];
  const contentHashInput = JSON.stringify({ url: input.url, videoId, segments: result.segments });
  const media = makeMediaAsset({
    title: `YouTube caption candidate ${videoId}`,
    originalPath: `youtube:${videoId}`,
    contentSha256: await sha256BrowserText(contentHashInput),
    durationMs: Math.max(1000, ...result.segments.map((segment) => segment.endMs)),
    container: 'caption-candidate',
    sizeBytes: new TextEncoder().encode(contentHashInput).byteLength,
    privacyLabel: 'licensed',
  });
  return putTranscriptSegments(model, {
    media,
    language: result.language,
    role: 'target',
    sourcePath: `youtube:${videoId}:${result.language}`,
    sourceKind: 'licensed',
    transcriptStatus: 'draft',
    transcriptSourceKind: result.isAutoGenerated ? 'youtube-auto-caption' : 'youtube-caption',
    provenance: {
      sourceUrl: input.url,
      sourceVideoId: videoId,
      retrievedAt: new Date().toISOString(),
      language: result.language,
      isAutoGenerated: result.isAutoGenerated,
      warningFlags,
    },
    beforeCommit: () => provider.assertCurrent?.(),
    qualityReport: qualityReportForSegments(result.segments, warningFlags),
    segments: result.segments,
  });
}

export async function generateLocalAsrDraft(model: AppModel, provider: LocalAsrProvider, language = 'pl'): Promise<TranscriptImportResult> {
  if (!model.currentMedia) {
    throw new TypeError('Local ASR draft generation requires a current local/owned media asset.');
  }
  provider.assertCurrent?.();
  const result = await provider.transcribe({ media: model.currentMedia, language });
  provider.assertCurrent?.();
  const warningFlags: TranscriptWarningFlag[] = ['asrDraft', 'timingUnverified', 'qualityUnreviewed'];
  const imported = await putTranscriptSegments(model, {
    media: model.currentMedia,
    language: result.language,
    role: 'target',
    sourcePath: `local-asr:${model.currentMedia.id}:${provider.providerId}`,
    sourceKind: model.currentMedia.privacyLabel,
    transcriptStatus: 'draft',
    transcriptSourceKind: 'local-asr',
    provenance: {
      generatedAt: new Date().toISOString(),
      language: result.language,
      engine: result.engine,
      modelName: result.modelName,
      ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
      warningFlags,
    },
    beforeCommit: () => provider.assertCurrent?.(),
    qualityReport: qualityReportForSegments(result.segments, warningFlags),
    segments: result.segments,
  });
  provider.assertCurrent?.();
  putTranscriptWordTimingsForSegments(model, {
    imported,
    segments: result.segments,
    sourceKind: 'provider-word-timing',
    engine: result.engine,
    modelName: result.modelName,
    ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return imported;
}

export async function generateElevenLabsScribeDraft(
  model: AppModel,
  provider: ElevenLabsScribeProvider,
  input: { language: string; allowOnlineProvider: boolean },
): Promise<TranscriptImportResult> {
  if (!input.allowOnlineProvider) {
    throw new TypeError('ElevenLabs Scribe draft generation disabled: explicit provider consent is required.');
  }
  if (!model.currentMedia) {
    throw new TypeError('ElevenLabs Scribe draft generation requires a current local/owned media asset.');
  }
  provider.assertCurrent?.();
  const result = await provider.transcribe({ media: model.currentMedia, language: input.language });
  provider.assertCurrent?.();
  const warningFlags: TranscriptWarningFlag[] = ['asrDraft', 'qualityUnreviewed'];
  const imported = await putTranscriptSegments(model, {
    media: model.currentMedia,
    language: result.language,
    role: 'target',
    sourcePath: `online-asr:elevenlabs:${model.currentMedia.id}:${provider.providerId}`,
    sourceKind: model.currentMedia.privacyLabel,
    transcriptStatus: 'draft',
    transcriptSourceKind: 'online-asr',
    provenance: {
      generatedAt: new Date().toISOString(),
      language: result.language,
      engine: 'elevenlabs',
      modelName: result.modelName,
      ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
      warningFlags,
    },
    beforeCommit: () => provider.assertCurrent?.(),
    qualityReport: qualityReportForSegments(result.segments, warningFlags),
    segments: result.segments,
  });

  provider.assertCurrent?.();
  putTranscriptWordTimingsForSegments(model, {
    imported,
    segments: result.segments,
    sourceKind: 'provider-word-timing',
    engine: 'elevenlabs',
    modelName: result.modelName,
    ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
  });

  persistIfLocalServiceAutosaveEnabled(model);
  return imported;
}

export type TranscriptCorrectionWordTimingEdit = Readonly<{
  wordIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  startMs: number;
  endMs: number;
  confidence?: number;
  speakerId?: string;
}>;

export type TranscriptCorrectionEdit = Readonly<{
  cueId: string;
  text?: string;
  startMs?: number;
  endMs?: number;
  wordTimings?: readonly TranscriptCorrectionWordTimingEdit[];
}>;

export async function createCorrectedTranscriptVersion(
  model: AppModel,
  parentTrackId: string,
  edits: readonly TranscriptCorrectionEdit[],
): Promise<TranscriptImportResult> {
  return withTranscriptCorrectionPending(model, () => createCorrectedTranscriptVersionNow(model, parentTrackId, edits));
}

async function createCorrectedTranscriptVersionNow(
  model: AppModel,
  parentTrackId: string,
  edits: readonly TranscriptCorrectionEdit[],
): Promise<TranscriptImportResult> {
  const parent = model.store.getSubtitleTrack(parentTrackId);
  if (!parent) throw new TypeError(`Cannot correct missing transcript track ${parentTrackId}`);
  const parentCues = model.store.listCuesForTrack(parentTrackId);
  if (parentCues.length === 0) throw new TypeError('Cannot correct transcript track with no cues.');
  // Validate word edits before any store write so a rejected word edit cannot leave a partial corrected version.
  for (const edit of edits) {
    for (const word of edit.wordTimings ?? []) {
      if (!normalizeBrowserCueText(word.text)) throw new TypeError(`Corrected word timing ${word.wordIndex} has empty text`);
      if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.endMs <= word.startMs) {
        throw new TypeError(`Corrected word timing ${word.wordIndex} end time must be after start time`);
      }
    }
  }
  const editsByCueId = new Map(edits.map((edit) => [edit.cueId, edit]));
  const segments = parentCues.map((cue) => {
    const edit = editsByCueId.get(cue.id);
    return {
      startMs: edit?.startMs ?? cue.startMs,
      endMs: edit?.endMs ?? cue.endMs,
      text: edit?.text ?? cue.text,
    };
  });
  const manualCorrectionCount = parentCues.filter((cue, index) => {
    const segment = segments[index]!;
    return segment.text !== cue.text || segment.startMs !== cue.startMs || segment.endMs !== cue.endMs;
  }).length;
  const warningFlags: TranscriptWarningFlag[] = ['qualityUnreviewed'];
  const media = model.store.getMediaAsset(parent.mediaId);
  if (!media) throw new TypeError(`Cannot correct transcript without media asset ${parent.mediaId}`);
  const result = await putTranscriptSegments(model, {
    media,
    language: parent.language,
    role: parent.role,
    sourcePath: `${parent.sourcePath}#manual-edit-v${parent.trackVersion + 1}`,
    sourceKind: parent.sourceKind,
    transcriptStatus: 'correcting',
    transcriptSourceKind: 'manual-edit',
    provenance: {
      language: parent.language,
      parentTrackId: parent.id,
      parentTrackSha256: parent.contentSha256,
      warningFlags,
    },
    qualityReport: qualityReportForSegments(segments, warningFlags, manualCorrectionCount),
    segments,
  });
  const correctedTrack = { ...result.track, trackVersion: parent.trackVersion + 1 };
  model.store.putSubtitleTrack(correctedTrack);
  for (let cueIndex = 0; cueIndex < parentCues.length; cueIndex++) {
    const parentCue = parentCues[cueIndex]!;
    const correctedCue = result.cues[cueIndex];
    const edit = editsByCueId.get(parentCue.id);
    if (!correctedCue || !edit?.wordTimings || edit.wordTimings.length === 0) continue;
    for (const word of edit.wordTimings) {
      const text = normalizeBrowserCueText(word.text);
      if (!text) throw new TypeError(`Corrected word timing ${word.wordIndex} has empty text`);
      if (word.endMs <= word.startMs) throw new TypeError(`Corrected word timing ${word.wordIndex} end time must be after start time`);
      model.store.putTranscriptWordTiming(makeTranscriptWordTiming({
        trackId: correctedTrack.id,
        cueId: correctedCue.id,
        wordIndex: word.wordIndex,
        charStart: word.charStart,
        charEnd: word.charEnd,
        text,
        normalizedText: text.toLowerCase(),
        startMs: word.startMs,
        endMs: word.endMs,
        sourceKind: 'manual-edit',
        engine: 'manual-correction',
        modelName: 'correction-editor',
        ...(word.confidence !== undefined ? { confidence: word.confidence } : {}),
        ...(word.speakerId !== undefined ? { speakerId: word.speakerId } : {}),
      }));
    }
  }
  model.targetTrackId = correctedTrack.id;
  persistIfLocalServiceAutosaveEnabled(model);
  return { track: correctedTrack, cues: result.cues };
}

function splitCueTextForCorrection(text: string): readonly [string, string] {
  const normalized = normalizeBrowserCueText(text);
  if (!normalized) return ['', ''];
  const midpoint = Math.floor(normalized.length / 2);
  const afterMidpoint = normalized.indexOf(' ', midpoint);
  const beforeMidpoint = normalized.lastIndexOf(' ', midpoint);
  const splitAt = afterMidpoint > 0
    ? afterMidpoint
    : beforeMidpoint > 0
      ? beforeMidpoint
      : midpoint;
  const first = normalizeBrowserCueText(normalized.slice(0, splitAt));
  const second = normalizeBrowserCueText(normalized.slice(splitAt));
  if (first && second) return [first, second];
  const tokens = normalized.split(/\s+/);
  if (tokens.length > 1) {
    const tokenMidpoint = Math.ceil(tokens.length / 2);
    return [tokens.slice(0, tokenMidpoint).join(' '), tokens.slice(tokenMidpoint).join(' ')];
  }
  return [normalized, normalized];
}

async function createStructuralCorrectedTranscriptVersion(
  model: AppModel,
  parentTrackId: string,
  segments: readonly TranscriptSegmentDraft[],
  manualCorrectionCount: number,
): Promise<TranscriptImportResult> {
  return withTranscriptCorrectionPending(model, () => createStructuralCorrectedTranscriptVersionNow(model, parentTrackId, segments, manualCorrectionCount));
}

async function createStructuralCorrectedTranscriptVersionNow(
  model: AppModel,
  parentTrackId: string,
  segments: readonly TranscriptSegmentDraft[],
  manualCorrectionCount: number,
): Promise<TranscriptImportResult> {
  const parent = model.store.getSubtitleTrack(parentTrackId);
  if (!parent) throw new TypeError(`Cannot correct missing transcript track ${parentTrackId}`);
  const warningFlags: TranscriptWarningFlag[] = ['qualityUnreviewed'];
  const media = model.store.getMediaAsset(parent.mediaId);
  if (!media) throw new TypeError(`Cannot correct transcript without media asset ${parent.mediaId}`);
  const result = await putTranscriptSegments(model, {
    media,
    language: parent.language,
    role: parent.role,
    sourcePath: `${parent.sourcePath}#manual-structure-v${parent.trackVersion + 1}`,
    sourceKind: parent.sourceKind,
    transcriptStatus: 'correcting',
    transcriptSourceKind: 'manual-edit',
    provenance: {
      language: parent.language,
      parentTrackId: parent.id,
      parentTrackSha256: parent.contentSha256,
      warningFlags,
    },
    qualityReport: qualityReportForSegments(segments, warningFlags, manualCorrectionCount),
    segments,
  });
  const correctedTrack = { ...result.track, trackVersion: parent.trackVersion + 1 };
  model.store.putSubtitleTrack(correctedTrack);
  model.targetTrackId = correctedTrack.id;
  model.cues = model.store.listCuesForTrack(correctedTrack.id);
  persistIfLocalServiceAutosaveEnabled(model);
  return { track: correctedTrack, cues: model.cues };
}

export async function splitTranscriptCueInCorrectedVersion(
  model: AppModel,
  parentTrackId: string,
  cueId: string,
): Promise<TranscriptImportResult> {
  const parentCues = model.store.listCuesForTrack(parentTrackId);
  const target = parentCues.find((cue) => cue.id === cueId);
  if (!target) throw new TypeError(`Cannot split missing cue ${cueId}`);
  const [firstText, secondText] = splitCueTextForCorrection(target.text);
  if (!firstText || !secondText) throw new TypeError(`Cannot split cue ${cueId} into two non-empty cues`);
  const splitMs = Math.max(target.startMs + 1, Math.min(target.endMs - 1, Math.round((target.startMs + target.endMs) / 2)));
  const segments = parentCues.flatMap((cue) => {
    if (cue.id !== cueId) return [{ startMs: cue.startMs, endMs: cue.endMs, text: cue.text }];
    return [
      { startMs: cue.startMs, endMs: splitMs, text: firstText },
      { startMs: splitMs, endMs: cue.endMs, text: secondText },
    ];
  });
  return createStructuralCorrectedTranscriptVersion(model, parentTrackId, segments, 1);
}

export async function mergeTranscriptCueWithNextInCorrectedVersion(
  model: AppModel,
  parentTrackId: string,
  cueId: string,
): Promise<TranscriptImportResult> {
  const parentCues = model.store.listCuesForTrack(parentTrackId);
  const targetIndex = parentCues.findIndex((cue) => cue.id === cueId);
  if (targetIndex < 0) throw new TypeError(`Cannot merge missing cue ${cueId}`);
  const target = parentCues[targetIndex]!;
  const next = parentCues[targetIndex + 1];
  if (!next) throw new TypeError(`Cannot merge cue ${cueId} because it has no next cue`);
  const segments: TranscriptSegmentDraft[] = [];
  for (let index = 0; index < parentCues.length; index++) {
    const cue = parentCues[index]!;
    if (index === targetIndex) {
      segments.push({
        startMs: target.startMs,
        endMs: next.endMs,
        text: normalizeBrowserCueText(`${target.text} ${next.text}`),
      });
      index++;
      continue;
    }
    segments.push({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text });
  }
  return createStructuralCorrectedTranscriptVersion(model, parentTrackId, segments, 1);
}

const transcriptCorrectionsInFlight = new WeakMap<AppModel, number>();
async function withTranscriptCorrectionPending<T>(model: AppModel, operation: () => Promise<T>): Promise<T> {
  transcriptCorrectionsInFlight.set(model, (transcriptCorrectionsInFlight.get(model) ?? 0) + 1);
  try {
    return await operation();
  } finally {
    transcriptCorrectionsInFlight.set(model, Math.max(0, (transcriptCorrectionsInFlight.get(model) ?? 1) - 1));
  }
}

/** True while a corrected/structural transcript version is being created for this model. */
export function transcriptCorrectionPending(model: AppModel): boolean {
  return (transcriptCorrectionsInFlight.get(model) ?? 0) > 0;
}

/**
 * True when pending editor values differ from the persisted cue text/boundaries or word text/boundaries of
 * `trackId`. Reverted values are clean. Pending entries that do not belong to `trackId` (for example edits made
 * against a previous version) and non-finite numbers are treated as dirty (fail closed).
 */
export function hasDirtyTranscriptEdits(model: AppModel, trackId: string): boolean {
  const lifecycle = model.transcriptLifecycle;
  const cues = new Map(model.store.listCuesForTrack(trackId).map((cue) => [cue.id, cue]));
  for (const [cueId, text] of Object.entries(lifecycle.pendingCueEdits)) {
    const cue = cues.get(cueId);
    if (!cue || text !== cue.text) return true;
  }
  for (const [cueId, timing] of Object.entries(lifecycle.pendingCueTimingEdits)) {
    const cue = cues.get(cueId);
    if (!cue || timing.startMs !== cue.startMs || timing.endMs !== cue.endMs) return true;
  }
  const wordEntries = Object.entries(lifecycle.pendingWordTimingEdits);
  if (wordEntries.length > 0) {
    const words = new Map(model.store.listTranscriptWordTimingsForTrack(trackId).map((word) => [word.id, word]));
    for (const [wordId, edit] of wordEntries) {
      const word = words.get(wordId);
      if (!word || edit.text !== word.text || edit.startMs !== word.startMs || edit.endMs !== word.endMs) return true;
    }
  }
  return false;
}

/** Returns null when explicit approval of `trackId` is allowed, else the reason it is blocked. */
export function transcriptApprovalBlockReason(model: AppModel, trackId: string): string | null {
  if (transcriptCorrectionPending(model)) return 'Cannot approve while a transcript correction is pending. Wait for it to finish, inspect the result, then approve.';
  if (hasDirtyTranscriptEdits(model, trackId)) return 'Cannot approve with pending transcript edits. Use “Create corrected transcript version”, inspect the corrected version, then approve it.';
  return null;
}

export function approveTranscriptTrack(model: AppModel, trackId: string, approvedAt = new Date().toISOString()): SubtitleTrack {
  const track = model.store.getSubtitleTrack(trackId);
  if (!track) throw new TypeError(`Cannot approve missing transcript track ${trackId}`);
  const blocked = transcriptApprovalBlockReason(model, trackId);
  if (blocked) throw new TypeError(blocked);
  const segments = model.store.listCuesForTrack(trackId).map((cue) => ({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text }));
  const qualityReport = {
    ...(track.qualityReport ?? qualityReportForSegments(segments, track.provenance.warningFlags)),
    approvedAt,
  };
  const approved = { ...track, transcriptStatus: 'approved' as const, qualityReport };
  model.store.putSubtitleTrack(approved);
  persistIfLocalServiceAutosaveEnabled(model);
  return approved;
}

export type YtDlpMediaAcquisitionPlan = Readonly<{
  argv: readonly string[];
  command: string;
  effect: 'plan-only';
}>;

export function planYtDlpMediaAcquisition(input: {
  url: string;
  outputDirectory: string;
  pathPolicy?: NativePathPolicy | null | undefined;
  includeMedia: boolean;
  allowMediaDownload: boolean;
}): YtDlpMediaAcquisitionPlan {
  const outputDirectory = requireServiceNativePath(input.outputDirectory, input.pathPolicy, 'directory');
  videoIdFromYouTubeUrl(input.url);
  if (input.includeMedia && !input.allowMediaDownload) {
    throw new TypeError('YouTube media download requires rights/permission confirmation.');
  }
  const argv = [
    'yt-dlp',
    '--no-playlist',
    ...(!input.includeMedia ? ['--skip-download'] : []),
    '--write-subs',
    '--write-auto-subs',
    '--sub-format',
    'srt/vtt',
    '--paths',
    outputDirectory,
    input.url,
  ];
  return {
    argv,
    command: argv.map((part) => (/[\s'\"]/.test(part) ? JSON.stringify(part) : part)).join(' '),
    effect: 'plan-only',
  };
}

export async function importTargetOnlyFixture(model: AppModel, mediaPath: string, targetSrtPath: string): Promise<void> {
  if (!isNodeRuntime()) {
    await importBrowserSyntheticFixture(model, mediaPath, targetSrtPath);
    return;
  }

  const { sha256File, probeMediaFile } = await import(/* @vite-ignore */ '../../../packages/storage/src/mediaHelpers');
  const { importSubtitle } = await import(/* @vite-ignore */ '../../../packages/subtitles/src/import');
  const fingerprint = await sha256File(mediaPath);
  const probe = await probeMediaFile(mediaPath);
  const asset = makeMediaAsset({
    title: 'Imported local media',
    originalPath: mediaPath,
    contentSha256: fingerprint,
    durationMs: probe.durationMs,
    container: probe.container,
    sizeBytes: probe.sizeBytes,
    privacyLabel: 'synthetic', // Explicit fixture import API; never inferred from path spelling.
  });

  const targetParsed = await importSubtitle({ mediaId: asset.id, language: 'pl', role: 'target', path: targetSrtPath });

  model.store.putMediaAsset(asset);
  model.store.putSubtitleTrack(targetParsed.track);
  for (const cue of targetParsed.cues) {
    model.store.putCue(cue);
  }

  model.currentMedia = asset;
  model.targetTrackId = targetParsed.track.id;
  model.nativeTrackId = null;
  model.cues = model.store.listCuesForTrack(targetParsed.track.id);
  model.player.durationMs = probe.durationMs;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
  persistIfLocalServiceAutosaveEnabled(model);
}

export async function importFixtureMediaAndSubtitles(
  model: AppModel,
  mediaPath: string,
  targetSrtPath: string,
  nativeSrtPath: string,
): Promise<void> {
  if (!isNodeRuntime()) {
    await importBrowserSyntheticFixture(model, mediaPath, targetSrtPath, nativeSrtPath);
    return;
  }

  const { sha256File, probeMediaFile } = await import(/* @vite-ignore */ '../../../packages/storage/src/mediaHelpers');
  const { importSubtitle } = await import(/* @vite-ignore */ '../../../packages/subtitles/src/import');
  const fingerprint = await sha256File(mediaPath);
  const probe = await probeMediaFile(mediaPath);
  const asset = makeMediaAsset({
    title: 'Imported local media',
    originalPath: mediaPath,
    contentSha256: fingerprint,
    durationMs: probe.durationMs,
    container: probe.container,
    sizeBytes: probe.sizeBytes,
    privacyLabel: 'synthetic', // Explicit fixture import API; never inferred from path spelling.
  });

  const targetParsed = await importSubtitle({ mediaId: asset.id, language: 'pl', role: 'target', path: targetSrtPath });
  const nativeParsed = await importSubtitle({ mediaId: asset.id, language: 'en', role: 'native', path: nativeSrtPath });

  model.store.putMediaAsset(asset);
  model.store.putSubtitleTrack(targetParsed.track);
  model.store.putSubtitleTrack(nativeParsed.track);
  for (const cue of targetParsed.cues) {
    model.store.putCue(cue);
  }
  for (const cue of nativeParsed.cues) {
    model.store.putCue(cue);
  }

  model.currentMedia = asset;
  model.targetTrackId = targetParsed.track.id;
  model.nativeTrackId = nativeParsed.track.id;
  model.cues = model.store.listCuesForTrack(targetParsed.track.id);
  model.player.durationMs = probe.durationMs;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
  persistIfLocalServiceAutosaveEnabled(model);
}

function selectionTimeRangeForCue(model: AppModel, cue: Cue, charStart: number, charEnd: number): { start: number; end: number } {
  const overlappingWords = model.store
    .listTranscriptWordTimingsForCue(cue.id)
    .filter((word) => word.charStart < charEnd && word.charEnd > charStart);
  if (overlappingWords.length === 0) {
    return { start: cue.startMs, end: cue.endMs };
  }
  return {
    start: Math.min(...overlappingWords.map((word) => word.startMs)),
    end: Math.max(...overlappingWords.map((word) => word.endMs)),
  };
}

export async function saveSelection(model: AppModel): Promise<SavedItem | null> {
  if (!model.selection || !model.currentMedia || !model.targetTrackId) return null;
  const cue = model.cues.find((c) => c.id === model.selection?.cueId);
  if (!cue || !model.selection) return null;
  // lt-cms: a whole-cue sentence capture keeps saveSentenceFromCue's shape (cue time range, no word-range anchor).
  const isSentence = model.selection.kind === 'sentence';
  const selectionTimeRange = isSentence
    ? { start: cue.startMs, end: cue.endMs }
    : selectionTimeRangeForCue(model, cue, model.selection.charStart, model.selection.charEnd);

  const sourceContext = isSentence
    ? buildSourceContext(
      model.currentMedia.id,
      model.currentMedia.originalPath,
      model.currentMedia.contentSha256,
      model.targetTrackId,
      cue,
      0,
      cue.text.split(/\s+/).filter(Boolean).length,
      0,
      cue.text.length,
    )
    : buildSourceContext(
      model.currentMedia.id,
      model.currentMedia.originalPath,
      model.currentMedia.contentSha256,
      model.targetTrackId,
      cue,
      model.selection.tokenStart,
      model.selection.tokenEnd,
      model.selection.charStart,
      model.selection.charEnd,
      selectionTimeRange,
    );

  const result = model.savedOccurrenceService.saveSelection({
    kind: model.selection.kind,
    language: 'pl',
    displayText: isSentence ? cue.text : model.selection.text,
    ...(model.pendingMeaning ? { meaning: model.pendingMeaning } : {}),
    ...(model.pendingNotes ? { notes: model.pendingNotes } : {}),
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: selectionTimeRange.start,
    endMs: selectionTimeRange.end,
    sourceContext,
  });
  // lt-uzo: a saved item becomes one recognition card (idempotent per saved item, not per occurrence).
  ensureReviewCardForSavedItem(model, result.item, result.occurrence);
  persistIfLocalServiceAutosaveEnabled(model);
  return result.item;
}

export async function saveSentenceFromCue(model: AppModel, cue: Cue): Promise<SavedItem | null> {
  if (!model.currentMedia || !model.targetTrackId) return null;
  const sourceContext = buildSourceContext(
    model.currentMedia.id,
    model.currentMedia.originalPath,
    model.currentMedia.contentSha256,
    model.targetTrackId,
    cue,
    0,
    cue.text.split(/\s+/).filter(Boolean).length,
    0,
    cue.text.length,
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: 'sentence',
    language: 'pl',
    displayText: cue.text,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    sourceContext,
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return result.item;
}

export function saveLexemeFromCue(model: AppModel, cue: Cue, text: string, charStart: number, charEnd: number, tokenIndex: number): SavedItem | null {
  if (!model.currentMedia || !model.targetTrackId) return null;
  const selectionTimeRange = selectionTimeRangeForCue(model, cue, charStart, charEnd);
  const sourceContext = buildSourceContext(
    model.currentMedia.id,
    model.currentMedia.originalPath,
    model.currentMedia.contentSha256,
    model.targetTrackId,
    cue,
    tokenIndex,
    tokenIndex + 1,
    charStart,
    charEnd,
    selectionTimeRange,
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: 'lexeme',
    language: 'pl',
    displayText: text,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: selectionTimeRange.start,
    endMs: selectionTimeRange.end,
    sourceContext,
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return result.item;
}

export function saveSelectedPhraseFromCue(model: AppModel, cue: Cue, text: string, charStart: number, charEnd: number, tokenStart: number, tokenEnd: number): SavedItem | null {
  if (!model.currentMedia || !model.targetTrackId) return null;
  const selectionTimeRange = selectionTimeRangeForCue(model, cue, charStart, charEnd);
  const sourceContext = buildSourceContext(
    model.currentMedia.id,
    model.currentMedia.originalPath,
    model.currentMedia.contentSha256,
    model.targetTrackId,
    cue,
    tokenStart,
    tokenEnd,
    charStart,
    charEnd,
    selectionTimeRange,
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: 'phrase',
    language: 'pl',
    displayText: text,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: selectionTimeRange.start,
    endMs: selectionTimeRange.end,
    sourceContext,
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return result.item;
}

export function createReviewCardForSavedItem(
  model: AppModel,
  item: SavedItem,
  occurrence: SavedOccurrence,
  cardType: 'recognition' | 'production' = 'recognition',
): ReviewCard {
  const card = model.reviewService.createCard({
    savedItem: item,
    savedOccurrence: occurrence,
    cardType,
    promptTemplate: cardType === 'recognition' ? `Recognize: ${item.displayText}` : `Produce: ${item.meaning ?? item.displayText}`,
  }).card;
  persistIfLocalServiceAutosaveEnabled(model);
  return card;
}

/** Cards referencing a saved item, split into active (in review) and archived (suspended, history kept). */
export function reviewCardsForSavedItem(model: AppModel, savedItemId: string): { active: ReviewCard[]; archived: ReviewCard[] } {
  const cards = Object.values(model.store.snapshot().reviewCards).filter((c) => c.savedItemId === savedItemId && c.deletedAt === undefined);
  return { active: cards.filter((c) => c.suspendedAt === undefined), archived: cards.filter((c) => c.suspendedAt !== undefined) };
}

/**
 * lt-uzo: create the item's recognition card unless one already references it. Archived (suspended) cards count:
 * an item the learner took out of review is not silently re-added by saving another occurrence.
 * Returns the existing or new card; the new card starts FSRS 'new', due at model.clock().
 */
export function ensureReviewCardForSavedItem(model: AppModel, item: SavedItem, occurrence: SavedOccurrence): ReviewCard {
  const { active, archived } = reviewCardsForSavedItem(model, item.id);
  const existing = active[0] ?? archived[0];
  if (existing) return existing;
  const now = model.clock().toISOString();
  const { card, state } = model.reviewService.createCard({
    savedItem: item,
    savedOccurrence: occurrence,
    cardType: 'recognition',
    promptTemplate: `Recognize: ${item.displayText}`,
  });
  const stamped = { ...card, createdAt: now };
  model.store.putReviewCard(stamped);
  model.store.putReviewCardState({ ...state, dueAt: now });
  return stamped;
}

/** Saved-view toggle off: archive (suspend) the item's active cards. Card, state and review events are kept. */
export function archiveReviewCardsForSavedItem(model: AppModel, savedItemId: string): void {
  const now = model.clock().toISOString();
  const active = reviewCardsForSavedItem(model, savedItemId).active;
  if (active.length === 0) return;
  for (const card of active) model.store.putReviewCard({ ...card, suspendedAt: now });
  if (model.review.activeCardId && model.store.getReviewCard(model.review.activeCardId)?.suspendedAt !== undefined) model.review.activeCardId = null;
  persistIfLocalServiceAutosaveEnabled(model);
}

/** Saved-view toggle on: re-activate the most recent archived card (keeping its schedule), else create one. */
export function addSavedItemToReview(model: AppModel, item: SavedItem, persist = true): ReviewCard | null {
  const { active, archived } = reviewCardsForSavedItem(model, item.id);
  if (active[0]) return active[0];
  let result: ReviewCard | null = null;
  const latest = [...archived].sort((a, b) => (b.suspendedAt ?? '').localeCompare(a.suspendedAt ?? ''))[0];
  if (latest) {
    const { suspendedAt: _suspendedAt, ...rest } = latest;
    result = rest;
    model.store.putReviewCard(result);
  } else {
    const occurrence = [...model.savedOccurrenceService.listOccurrencesForItem(item.id)]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (occurrence) result = ensureReviewCardForSavedItem(model, item, occurrence);
  }
  if (persist) persistIfLocalServiceAutosaveEnabled(model);
  return result;
}

/** 'Add all to review (N)': only items lacking an active card; one persist for the batch. */
export function addSavedItemsToReview(model: AppModel, items: readonly SavedItem[]): number {
  let added = 0;
  for (const item of items) {
    if (reviewCardsForSavedItem(model, item.id).active.length > 0) continue;
    if (addSavedItemToReview(model, item, false)) added += 1;
  }
  if (added > 0) persistIfLocalServiceAutosaveEnabled(model);
  return added;
}

/** Inline 'Add meaning': writes savedItem.meaning and persists (also marks the snapshot cache dirty). */
export function setSavedItemMeaning(model: AppModel, savedItemId: string, meaning: string): SavedItem | null {
  const item = model.store.getSavedItem(savedItemId);
  const trimmed = meaning.trim();
  if (!item || !trimmed) return null;
  const updated: SavedItem = { ...item, meaning: trimmed, updatedAt: model.clock().toISOString() };
  model.store.putSavedItem(updated);
  persistIfLocalServiceAutosaveEnabled(model);
  return updated;
}

export function listReviewBuckets(model: AppModel, asOf: Date, bucketConfig?: ReviewBucketConfig): {
  newCards: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  learning: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  review: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  relearning: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  mastered: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
} {
  const config = bucketConfig ?? defaultReviewBucketConfig;
  const base = model.reviewService.listBuckets(asOf);
  const enrich = (cs: { card: ReviewCard; state: ReviewCardState }[]) =>
    cs
      .map((cs) => {
        const savedItem = model.store.getSavedItem(cs.card.savedItemId);
        const occurrence = model.store.getSavedOccurrence(cs.card.savedOccurrenceId);
        if (!savedItem || !occurrence) return null;
        return { card: cs.card, state: cs.state, savedItem, occurrence };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

  const isMastered = (state: ReviewCardState) => state.scheduledDays >= config.masteredIntervalDays;

  return {
    newCards: enrich(base.newCards).filter((cs) => !isMastered(cs.state)),
    learning: enrich(base.learning).filter((cs) => !isMastered(cs.state)),
    review: enrich(base.review).filter((cs) => !isMastered(cs.state)),
    relearning: enrich(base.relearning).filter((cs) => !isMastered(cs.state)),
    mastered: enrich([...base.newCards, ...base.learning, ...base.review, ...base.relearning]).filter((cs) => isMastered(cs.state)),
  };
}

export function projectReviewBucketCounts(model: AppModel, asOf: Date): Record<'newCards' | 'learning' | 'review' | 'relearning' | 'mastered', number> {
  const buckets = listReviewBuckets(model, asOf);
  return {
    newCards: buckets.newCards.length,
    learning: buckets.learning.length,
    review: buckets.review.length,
    relearning: buckets.relearning.length,
    mastered: buckets.mastered.length,
  };
}

export type LearnerProgress = Readonly<{
  savedItems: number;
  reviewCards: number;
  dueCards: number;
  totalReviews: number;
  practiceAttempts: number;
}>;

export function learnerProgress(model: AppModel, asOf: Date): LearnerProgress {
  const snapshot = model.store.snapshot();
  const savedItems = Object.keys(snapshot.savedItems).length;
  const reviewCards = Object.keys(snapshot.reviewCards).length;
  const totalReviews = snapshot.reviewEvents.length;
  const practiceAttempts = snapshot.practiceAttempts.length;
  const bucketCounts = projectReviewBucketCounts(model, asOf);
  // Mastered is a disjoint presentation bucket of genuinely due cards, not retirement.
  const dueCards = bucketCounts.newCards + bucketCounts.learning + bucketCounts.review + bucketCounts.relearning + bucketCounts.mastered;
  return { savedItems, reviewCards, dueCards, totalReviews, practiceAttempts };
}

export function pickNextDueCard(model: AppModel, asOf: Date): { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence } | null {
  const buckets = listReviewBuckets(model, asOf);
  const candidates = [...buckets.newCards, ...buckets.learning, ...buckets.relearning, ...buckets.review, ...buckets.mastered];
  // Preserve FSRS-state priority and due order regardless of the presentation label.
  const priority = { new: 0, learning: 1, relearning: 2, review: 3 };
  candidates.sort((a, b) => priority[a.state.state] - priority[b.state.state]
    || new Date(a.state.dueAt).valueOf() - new Date(b.state.dueAt).valueOf());
  return candidates[0] ?? null;
}

/**
 * The card a review/practice surface is showing: the remembered active card while it remains due,
 * otherwise the next due card. Submissions resolve the same card so a card that becomes due between
 * display and submit cannot be graded in place of the displayed one.
 */
export function resolveActiveDueCard(model: AppModel, asOf: Date): ReturnType<typeof pickNextDueCard> {
  const activeCardId = model.review.activeCardId;
  if (activeCardId) {
    const buckets = listReviewBuckets(model, asOf);
    const remembered = [...buckets.newCards, ...buckets.learning, ...buckets.review, ...buckets.relearning, ...buckets.mastered]
      .find((cs) => cs.card.id === activeCardId);
    if (remembered) return remembered;
  }
  const next = pickNextDueCard(model, asOf);
  model.review.activeCardId = next?.card.id ?? null;
  return next;
}

/** Earliest scheduled due instant strictly after `asOf` among eligible cards, for waking an open queue. */
export function nextReviewDueAfter(model: AppModel, asOf: Date): Date | null {
  const snapshot = model.store.snapshot();
  let earliest: number | null = null;
  for (const card of Object.values(snapshot.reviewCards)) {
    if (card.suspendedAt !== undefined || card.deletedAt !== undefined) continue;
    const state = snapshot.reviewCardStates[card.id];
    if (!state) continue;
    const due = new Date(state.dueAt).valueOf();
    if (Number.isFinite(due) && due > asOf.valueOf() && (earliest === null || due < earliest)) earliest = due;
  }
  return earliest === null ? null : new Date(earliest);
}

export function submitReviewRating(model: AppModel, cardId: string, rating: Rating, reviewedAt: Date): ReviewCardState {
  const { state } = model.reviewService.submitReview(cardId, rating, reviewedAt);
  recordStudyActivity(model, 60_000);
  persistIfLocalServiceAutosaveEnabled(model);
  return state;
}

export type TokenInfo = { tokenIndex: number; charStart: number; charEnd: number; surface: string };

type ActiveDueCard = NonNullable<ReturnType<typeof pickNextDueCard>>;
type PracticeResult = import('@lingotorte/domain').PracticeResult;
type PracticeModeName = import('@lingotorte/domain').PracticeMode;

/**
 * lt-0g9 per-mode practice contract. `prompt` is what is shown before submission and never contains
 * `expected`; `expected` is what the answer is graded against and what is stored as expectedAnswer.
 * - typed-input / multiple-choice: recall the saved item (`savedItem.displayText`) from its meaning,
 *   native cue, or the source cue with the saved span masked.
 * - audio-recall: transcribe the heard source cue (`cue.text`), not the saved item.
 * - sentence-builder: order the shuffled tokens of the source cue (`cue.text`).
 * - speaking: unavailable (no microphone); there is no contract and submission is refused.
 * Grading → FSRS (PracticeService.resultToRating): pass→good, pass-with-hesitation→hard, fail→again,
 * skipped→no FSRS update. A submission after a pre-answer reveal is graded fail.
 */
export type PracticeContract = Readonly<{
  mode: Exclude<PracticeModeName, 'speaking'>;
  prompt: string;
  expected: string;
  expectedSource: 'saved-item' | 'cue-transcription';
  hesitationAllowed: boolean;
}>;

export const PRACTICE_SPEAKING_UNAVAILABLE = 'Speaking practice is unavailable: Lingotorte does not request microphone access. Choose another mode.';
const MASK = '____';

function practiceCueContext(model: AppModel, active: ActiveDueCard): { cue: Cue | null; native: string | undefined } {
  const cue = model.store.getCue(active.occurrence.cueId) ?? null;
  const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
  const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
  return { cue, native: cue ? nativeTextForCue(cue, nativeTrack, nativeCues) : undefined };
}

function leaks(part: string, expected: string): boolean {
  const e = expected.trim().toLowerCase();
  return e.length > 0 && part.toLowerCase().includes(e);
}

export function practiceContractFor(model: AppModel, active: ActiveDueCard, mode: PracticeModeName = model.practice.mode): PracticeContract | null {
  if (mode === 'speaking') return null;
  const { cue, native } = practiceCueContext(model, active);
  const cueText = cue?.text ?? active.savedItem.displayText;
  if (mode === 'audio-recall' || mode === 'sentence-builder') {
    const expected = cueText;
    const lead = mode === 'audio-recall'
      ? 'Listen to the owned source cue, then type what you hear.'
      : 'Build the source cue from the shuffled words.';
    const hint = native && !leaks(native, expected) ? ` Native cue: ${native}` : '';
    return { mode, prompt: `${lead}${hint}`, expected, expectedSource: 'cue-transcription', hesitationAllowed: mode === 'audio-recall' };
  }
  const expected = active.savedItem.displayText;
  const parts: string[] = [];
  if (active.savedItem.meaning) parts.push(`Meaning: ${active.savedItem.meaning}`);
  if (native) parts.push(`Native cue: ${native}`);
  const span = active.occurrence.sourceContext.charSpan;
  if (cue && span && (span.start > 0 || span.end < cue.text.length)) {
    parts.push(`Context: ${cue.text.slice(0, span.start)}${MASK}${cue.text.slice(span.end)}`);
  }
  const safe = parts.filter((part) => !leaks(part, expected));
  const lead = mode === 'multiple-choice' ? 'Choose the saved text.' : 'Type the saved text.';
  const hint = safe.length > 0 ? ` ${safe.join(' • ')}` : ' Replay the source cue for a hint.';
  return { mode, prompt: `${lead}${hint}`, expected, expectedSource: 'saved-item', hesitationAllowed: mode === 'typed-input' };
}

export function gradePracticeAnswer(contract: Pick<PracticeContract, 'expected' | 'hesitationAllowed'>, answer: string): { result: PracticeResult; correct: boolean } {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const a = normalize(answer);
  const e = normalize(contract.expected);
  if (a.length === 0) return { result: 'skipped', correct: false };
  if (a === e) return { result: 'pass', correct: true };
  if (contract.hesitationAllowed && e.includes(a) && a.length >= Math.min(3, e.length)) return { result: 'pass-with-hesitation', correct: true };
  return { result: 'fail', correct: false };
}

export function projectPracticeAttempt(
  active: ActiveDueCard,
  answer: string,
  contract: Pick<PracticeContract, 'expected' | 'hesitationAllowed'> = { expected: active.savedItem.displayText, hesitationAllowed: true },
): { result: PracticeResult; correct: boolean; expected: string } {
  return { ...gradePracticeAnswer(contract, answer), expected: contract.expected };
}

/** Reset per-card practice UI state when the presented card changes; keep one render of prior feedback. */
export function syncPracticeCard(model: AppModel, cardId: string | null): void {
  const p = model.practice;
  if (p.cardId === cardId && cardId !== null) return;
  if (p.cardId !== cardId) {
    p.pendingAnswer = '';
    p.sentenceBuilder.orderedTokens = [];
    p.sentenceBuilder.poolTokens = [];
    p.choices = null;
    p.revealed = false;
    p.cardId = cardId;
  }
  const last = p.lastAttemptResult;
  if (!last) return;
  if (last.nextCardId === undefined) last.nextCardId = cardId;
  else if (last.nextCardId !== cardId) p.lastAttemptResult = null;
}

function recordPracticeAttempt(model: AppModel, mode: PracticeModeName, answer: string, reviewedAt: Date): import('@lingotorte/domain').PracticeAttempt {
  const active = resolveActiveDueCard(model, reviewedAt);
  if (!active) throw new TypeError('No active card for practice attempt');
  const contract = practiceContractFor(model, active, mode);
  if (!contract) throw new TypeError(PRACTICE_SPEAKING_UNAVAILABLE);
  const given = answer.replace(/\s+/g, ' ').trim();
  let { result } = gradePracticeAnswer(contract, given);
  if (model.practice.revealed && model.practice.cardId === active.card.id && result !== 'skipped') result = 'fail';
  const { attempt } = model.practiceService.submitAttempt({
    cardId: active.card.id,
    mode,
    result,
    ...(given.length > 0 ? { givenAnswer: given } : {}),
    expectedAnswer: contract.expected,
    responseMs: 0,
    sourceContext: active.occurrence.sourceContext,
    reviewedAt: reviewedAt.toISOString(),
    updateFsrs: true,
  });
  model.practice.lastAttemptResult = { result, correct: result === 'pass' || result === 'pass-with-hesitation', cardId: active.card.id, expected: contract.expected };
  model.practice.pendingAnswer = '';
  model.practice.sentenceBuilder.orderedTokens = [];
  model.practice.sentenceBuilder.poolTokens = [];
  model.practice.choices = null;
  model.practice.revealed = false;
  model.practice.cardId = null;
  model.review.activeCardId = null;
  recordStudyActivity(model, 45_000);
  persistIfLocalServiceAutosaveEnabled(model);
  return attempt;
}

export function submitPracticeAttempt(model: AppModel, answer: string, reviewedAt: Date): import('@lingotorte/domain').PracticeAttempt {
  return recordPracticeAttempt(model, model.practice.mode, answer, reviewedAt);
}

export function setPracticeMode(model: AppModel, mode: import('@lingotorte/domain').PracticeMode): void {
  if (model.practice.mode === mode) return;
  model.practice.mode = mode;
  model.practice.pendingAnswer = '';
  model.practice.sentenceBuilder.orderedTokens = [];
  model.practice.sentenceBuilder.poolTokens = [];
  model.practice.choices = null;
}

function shuffled<T>(values: readonly T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function generateMultipleChoices(model: AppModel, correctText: string): string[] {
  const key = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const seen = new Set([key(correctText)]);
  const pool: string[] = [];
  const snapshot = model.store.snapshot();
  for (const text of [...Object.values(snapshot.savedItems).map((item) => item.displayText), ...Object.values(snapshot.cues ?? {}).map((cue) => cue.text)]) {
    if (text.trim().length === 0 || seen.has(key(text))) continue;
    seen.add(key(text));
    pool.push(text);
  }
  return shuffled([correctText, ...shuffled(pool).slice(0, 3)]);
}

/** Multiple-choice options generated once per presented card, stable across rerenders and wake timers. */
export function practiceChoicesFor(model: AppModel, cardId: string, correctText: string): string[] {
  syncPracticeCard(model, cardId);
  if (!model.practice.choices) model.practice.choices = generateMultipleChoices(model, correctText);
  return model.practice.choices;
}

export function revealPracticeAnswer(model: AppModel): void {
  model.practice.revealed = true;
}

export function setPracticePendingAnswer(model: AppModel, value: string): void {
  model.practice.pendingAnswer = value;
}

export function clearPracticeLastResult(model: AppModel): void {
  model.practice.lastAttemptResult = null;
}

export function sentenceTokensForCue(cueText: string): string[] {
  return cueText.split(/\s+/).filter((token) => token.length > 0);
}

/** Shuffled pool that is never already in answer order when another order exists. */
export function prepareSentenceBuilderForCue(cueText: string): { poolTokens: string[]; orderedTokens: string[] } {
  const tokens = sentenceTokensForCue(cueText);
  let poolTokens = shuffled(tokens);
  if (poolTokens.join('\u0000') === tokens.join('\u0000') && new Set(tokens).size > 1) {
    poolTokens = [...tokens.slice(1), tokens[0]!];
  }
  return { poolTokens, orderedTokens: [] };
}

export function submitSentenceBuilderAttempt(
  model: AppModel,
  orderedTokens: readonly string[],
  reviewedAt: Date,
): import('@lingotorte/domain').PracticeAttempt {
  return recordPracticeAttempt(model, 'sentence-builder', orderedTokens.join(' '), reviewedAt);
}

export function setSentenceBuilderTokens(model: AppModel, poolTokens: string[], orderedTokens: string[]): void {
  model.practice.sentenceBuilder.poolTokens = poolTokens;
  model.practice.sentenceBuilder.orderedTokens = orderedTokens;
}

/**
 * Study-metrics policy (lt-8vu). All values are local estimates derived only
 * from persisted review/practice events; nothing is tracked or uploaded.
 *
 * - One study action = one plain review rating, one practice attempt without a
 *   linked review event, or one practice attempt together with the FSRS review
 *   event it created (`eventLink.reviewEventId`). The linked pair counts ONCE.
 * - Time is an ESTIMATE: STUDY_ESTIMATE_MS_PER_ACTION per study action; no real
 *   time-on-task is measured.
 * - Days are the learner's local calendar days. The default day key uses the
 *   runtime's local zone (Date local getters); callers may inject a key such as
 *   `timeZoneDayKey('Europe/Warsaw')` or `fixedOffsetDayKey(-300)`. Streak and
 *   "today" compare calendar-day keys, so DST-length days are still one day.
 */
export const STUDY_ESTIMATE_MS_PER_ACTION = 45_000;

export type StudyDayKey = (instant: Date) => string;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export const localDayKey: StudyDayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function fixedOffsetDayKey(offsetMinutesEastOfUtc: number): StudyDayKey {
  return (d) => new Date(d.valueOf() + offsetMinutesEastOfUtc * 60_000).toISOString().slice(0, 10);
}

export function timeZoneDayKey(timeZone: string): StudyDayKey {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (d) => {
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

export function studyActionInstants(
  reviewEvents: readonly { id: string; reviewedAt: string }[],
  practiceAttempts: readonly { reviewedAt: string; eventLink?: { reviewEventId?: string } }[],
): string[] {
  const reviewIds = new Set(reviewEvents.map((e) => e.id));
  const linked = new Set<string>();
  for (const a of practiceAttempts) {
    const id = a.eventLink?.reviewEventId;
    if (id !== undefined && reviewIds.has(id)) linked.add(id);
  }
  return [
    ...reviewEvents.filter((e) => !linked.has(e.id)).map((e) => e.reviewedAt),
    ...practiceAttempts.map((a) => a.reviewedAt),
  ];
}

export function computeStudyMetricsFromEvents(
  actionInstants: readonly string[],
  asOf: Date,
  dayKey: StudyDayKey = localDayKey,
): {
  totalStudyTimeMs: number;
  todayStudyTimeMs: number;
  streakDays: number;
  lastStudyDate: string | null;
} {
  const todayKey = dayKey(asOf);
  const keys = actionInstants.map((t) => dayKey(new Date(t)));
  const sortedDays = [...new Set(keys.map(dayNumber))].sort((x, y) => x - y);
  const lastDay = sortedDays[sortedDays.length - 1];
  const lastStudyDate = lastDay === undefined ? null : keys.find((k) => dayNumber(k) === lastDay)!;

  let streakDays = 0;
  if (lastDay !== undefined) {
    const diffDays = dayNumber(todayKey) - lastDay;
    if (diffDays === 0 || diffDays === 1) {
      streakDays = 1;
      for (let i = sortedDays.length - 2; i >= 0; i--) {
        if (sortedDays[i + 1]! - sortedDays[i]! === 1) streakDays += 1;
        else break;
      }
    }
  }

  const totalStudyTimeMs = keys.length * STUDY_ESTIMATE_MS_PER_ACTION;
  const todayStudyTimeMs = keys.filter((k) => k === todayKey).length * STUDY_ESTIMATE_MS_PER_ACTION;
  return { totalStudyTimeMs, todayStudyTimeMs, streakDays, lastStudyDate };
}

export function recordStudyActivity(model: AppModel, timeSpentMs: number): void {
  // Kept only as a compatibility no-op; the study metrics widget now derives
  // all values from persisted review/practice events via studyMetrics().
  void timeSpentMs;
  void model;
}

export function studyMetrics(model: AppModel, asOf = model.clock(), dayKey: StudyDayKey = localDayKey): Readonly<{
  totalStudyTimeMs: number;
  todayStudyTimeMs: number;
  streakDays: number;
  lastStudyDate: string | null;
}> {
  const snapshot = model.store.snapshot();
  return computeStudyMetricsFromEvents(
    studyActionInstants(snapshot.reviewEvents, snapshot.practiceAttempts),
    asOf,
    dayKey,
  );
}

export function formatCompactDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function makeBrowserExportFileName(exportedAt: string): string {
  const date = new Date(exportedAt);
  if (Number.isNaN(date.valueOf())) {
    const safeTimestamp = exportedAt.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '');
    return `lingotorte-learner-state-${safeTimestamp}.json`;
  }
  const timestamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}`;
  return `lingotorte-learner-state-${timestamp}.json`;
}

export function exportLearnerState(model: AppModel): { manifest: import('@lingotorte/domain').LearnerExportManifest; fileName: string; manifestJson: string; verified: boolean } {
  const manifest = model.exportService.buildManifest();
  const fileName = makeBrowserExportFileName(manifest.exportedAt);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const recompute = computeExportIntegrity(manifest.content);
  const verified = recompute.rootHash === manifest.integrity.rootHash && recompute.recordCount === manifest.integrity.recordCount;
  model.exportImport.lastExport = {
    fileName,
    manifestJson,
    schemaVersion: manifest.schemaVersion,
    applicationVersion: manifest.applicationVersion,
    exportedAt: manifest.exportedAt,
    recordCount: manifest.integrity.recordCount,
    warningCount: manifest.privacyWarnings.length,
    rootHash: manifest.integrity.rootHash,
    manifestIntegrityVerified: verified,
  };
  model.exportImport.lastError = null;
  // lastSaveVerified is reserved exclusively for actual File System Access
  // write+readback success; do not set it here based on manifest integrity alone.
  model.exportImport.lastSaveVerified = null;
  return { manifest, fileName, manifestJson, verified };
}

export function clearRestorePreview(model: AppModel): void {
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing) throw new TypeError(restoreUnknown);
  restoreStates.delete(model);
  model.exportImport.manifestJson = null;
  model.exportImport.preview = null;
  model.exportImport.acknowledgedWarnings = [];
  model.exportImport.confirmOverwrite = false;
  model.exportImport.confirmReplace = false;
  model.exportImport.lastRestore = null;
}

export function verifyExportIntegrity(manifest: import('@lingotorte/domain').LearnerExportManifest): boolean {
  const recompute = computeExportIntegrity(manifest.content);
  return recompute.rootHash === manifest.integrity.rootHash && recompute.recordCount === manifest.integrity.recordCount;
}

export function previewRestoreManifest(model: AppModel, manifestJson: string): import('@lingotorte/domain').RestorePreview {
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing) throw new TypeError(restoreUnknown);
  restoreStates.delete(model);
  model.exportImport.manifestJson = manifestJson;
  model.exportImport.preview = null;
  const parsed = JSON.parse(manifestJson) as unknown;
  const manifest = RestoreService.validateManifest(parsed);
  const preview = model.restoreService.preview(manifest);
  model.exportImport.preview = preview;
  model.exportImport.lastError = null;
  model.exportImport.acknowledgedWarnings = [];
  model.exportImport.confirmOverwrite = false;
  model.exportImport.confirmReplace = false;
  model.exportImport.lastRestore = null;
  return preview;
}

const RESTORE_CAPABILITY = 'active-audit-restore-v1';
type RestorePlan = ReturnType<RestoreService['plan']>;
type RestoreBinding = {
  wire: string; mode: 'merge' | 'replace-active'; comparison: string; generation: number;
  revision: string; transport: PairedTransport; before: LocalStoreSnapshot; intended: LocalStoreSnapshot;
  audit: LocalStoreSnapshot['learnerAudit']; plan: RestorePlan; committing: boolean; unknown: boolean;
  acknowledgedRevision?: string;
};
const restoreStates = new WeakMap<AppModel, RestoreBinding>();
const sessionRestoreBaselines = new WeakMap<AppModel, string>();
export function restoreIsBusy(model: AppModel): boolean { return Boolean(restoreStates.get(model)?.committing || restoreStates.get(model)?.unknown); }
export function hasCurrentDurableRestorePreview(model: AppModel): boolean {
  const b = restoreStates.get(model);
  try { return Boolean(b && !b.committing && !b.unknown && b.generation === syncOwner(model).generation && b.comparison === browserComparison(model) && b.wire === model.exportImport.manifestJson && b.mode === selectedRestoreMode(model) && b.revision === model.localService.revision); } catch { return false; }
}
const restoreUnknown = 'Restore outcome unknown; reconnect/read back before retry. Input and browser before-state are retained; no blind retry was sent.';
function selectedRestoreMode(model: AppModel): 'merge' | 'replace-active' {
  if (model.exportImport.confirmOverwrite === model.exportImport.confirmReplace) throw new TypeError('Choose exactly one restore mode.');
  return model.exportImport.confirmReplace ? 'replace-active' : 'merge';
}
function clearStaleLearnerUi(model: AppModel): void {
  model.review.currentCardId = null; model.review.activeCardId = null; model.review.revealed = false;
  model.practice.pendingAnswer = ''; model.practice.lastAttemptResult = null;
  model.practice.sentenceBuilder.orderedTokens = []; model.practice.sentenceBuilder.poolTokens = [];
  model.practice.cardId = null; model.practice.revealed = false; model.practice.choices = null;
  model.selection = null; model.pendingMeaning = ''; model.pendingNotes = '';
}
function finishRestore(model: AppModel, manifest: import('@lingotorte/domain').LearnerExportManifest, receipt: ReturnType<RestoreService['restoreWithReceipt']>['receipt'] | (Omit<ReturnType<RestoreService['restoreWithReceipt']>['receipt'], 'durability' | 'durablySaved'> & { durability: string; durablySaved: boolean }), preview: import('@lingotorte/domain').RestorePreview): void {
  model.exportImport.lastRestore = {
    restoredAt: new Date().toISOString(), mode: receipt.mode === 'replace-active' ? 'replace-all' : preview.overwriteConfirmationRequired ? 'merge-update' : 'initial',
    manifestIntegrityVerified: true, manifestRecordCount: manifest.integrity.recordCount,
    manifestRootHash: manifest.integrity.rootHash, operationCounts: preview.operations,
    acknowledgedWarningKinds: [...model.exportImport.acknowledgedWarnings], mediaCopied: false,
    effects: receipt.effects, auditEffects: receipt.auditEffects, coalesced: receipt.coalesced,
    durability: receipt.durability, durablySaved: receipt.durablySaved,
  };
  model.exportImport.manifestJson = null; model.exportImport.preview = null; model.exportImport.lastError = null;
  model.exportImport.acknowledgedWarnings = []; model.exportImport.confirmOverwrite = false; model.exportImport.confirmReplace = false;
  model.exportImport.lastExport = null; clearStaleLearnerUi(model);
}
function installDurableRestore(model: AppModel, binding: RestoreBinding, snapshot: LocalStoreSnapshot, revision: string): void {
  model.store.installRestoreCandidate(snapshot, snapshot.learnerAudit!);
  syncOwner(model).baseline = JSON.stringify(model.store.snapshot());
  model.localService.revision = revision; model.localService.status = 'connected'; model.localService.syncState = 'saved';
  model.localService.lastMessage = 'Explicit restore committed; authoritative active/audit state and revision read back.';
  finishRestore(model, RestoreService.validateManifest(JSON.parse(binding.wire)), { mode: binding.mode, effects: binding.plan.effects, auditEffects: binding.plan.auditEffects, coalesced: binding.plan.coalesced, integrity: binding.plan.integrity, durability: 'durable-committed/readback-verified', durablySaved: true }, binding.plan.preview);
  restoreStates.delete(model); sessionRestoreBaselines.delete(model); notifySync(model);
}
function authoritativeRestoreSnapshot(value: unknown): LocalStoreSnapshot {
  if (!isPlainObject(value) || !isPlainObject(value.learnerAudit) || value.learnerAudit.version !== 1) throw new TypeError('Invalid authoritative active/audit snapshot.');
  const snapshot = new LocalStore(value as LocalStoreSnapshot).snapshot();
  if (!sameHistoryPayload(value, snapshot)) throw new TypeError('Incomplete authoritative active/audit snapshot.');
  return snapshot;
}
function reconcileRestoreState(model: AppModel, state: Record<string, unknown>): LocalServiceSyncResult {
  const binding = restoreStates.get(model)!;
  const revision = stateRevision(state.revision);
  const snapshot = authoritativeRestoreSnapshot(state.snapshot);
  // A different service/session is never evidence for the captured operation.
  if (binding.transport.origin !== normalizeLocalServiceBaseUrl(model.localService.baseUrl) || state.ok !== true || state.restoreCapability !== RESTORE_CAPABILITY
    || binding.comparison !== browserComparison(model)) {
    model.localService.lastMessage = restoreUnknown; return { ok: false, message: restoreUnknown };
  }
  if (sameHistoryPayload(snapshot, binding.intended) && (binding.acknowledgedRevision === undefined || revision === binding.acknowledgedRevision)) {
    installDurableRestore(model, binding, snapshot, revision); return { ok: true, message: model.localService.lastMessage! };
  }
  // Do not convert an unchanged or third-party state into a retry authorization.
  model.localService.revision = revision; model.localService.syncState = 'conflict'; model.localService.lastMessage = restoreUnknown;
  notifySync(model); return { ok: false, message: restoreUnknown };
}
export async function previewDurableRestore(model: AppModel): Promise<import('@lingotorte/domain').RestorePreview> {
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing) throw new TypeError(restoreUnknown);
  if (model.localService.restoreCapability !== RESTORE_CAPABILITY) throw new TypeError('Restore capability missing; update/pair the service. No snapshot PUT fallback is permitted.');
  const mode = selectedRestoreMode(model); const wire = model.exportImport.manifestJson;
  if (!wire) throw new TypeError('No restore input.');
  RestoreService.validateManifest(JSON.parse(wire));
  const owner = syncOwner(model); const generation = owner.generation;
  const comparison = browserComparison(model); const transport = capturedTransport(model, model.localService.baseUrl);
  const current = () => { transport.assertCurrent(); if (owner.generation !== generation || browserComparison(model) !== comparison || wire !== model.exportImport.manifestJson || selectedRestoreMode(model) !== mode) throw new TypeError('Restore preview changed; refresh and confirm again.'); };
  const run = async () => {
    current();
    if (owner.choice || !model.localService.revision || model.localService.syncState === 'conflict' || hasPendingTranscriptEdits(model)) throw new TypeError('Resolve browser/service state choice and pending edits before restore.');
    const pending = model.store.snapshotPendingRestoreIntent();
    if (pending && sessionRestoreBaselines.get(model) !== JSON.stringify(model.store.snapshot())) throw new TypeError('Learner edits changed after session restore. Resolve those edits explicitly before importing pending intent.');
    if (!pending && owner.baseline !== null && owner.baseline !== JSON.stringify(model.store.snapshot())) throw new TypeError('Unsaved browser state: save or explicitly load service state before restore.');
    const revision = model.localService.revision;
    const state = await fetchLocalServiceJson(transport, '/api/state'); current();
    if (state.restoreCapability !== RESTORE_CAPABILITY || stateRevision(state.revision) !== revision) throw new TypeError('Service revision/capability changed; reconnect and refresh preview.');
    const before = model.store.snapshot(); const remote = authoritativeRestoreSnapshot(state.snapshot);
    const audit = before.learnerAudit!;
    const combined = { reviewEvents: unionHistory('reviewEvents', remote.learnerAudit!.reviewEvents, audit.reviewEvents), practiceAttempts: unionHistory('practiceAttempts', remote.learnerAudit!.practiceAttempts, audit.practiceAttempts) };
    const plan = planLearnerRestore(JSON.parse(wire), mode, remote, combined);
    for (const name of ['reviewEvents', 'practiceAttempts'] as const) plan.auditEffects[name].appended = plan.audit[name].length - remote.learnerAudit![name].length;
    const reply = await fetchLocalServiceJson(transport, '/api/restore/preview', { method: 'POST', body: JSON.stringify({ manifest: JSON.parse(wire), mode, expectedRevision: revision, learnerAudit: audit }) }); current();
    if (reply.ok !== true || reply.capability !== RESTORE_CAPABILITY || stateRevision(reply.revision) !== revision || !sameHistoryPayload(reply.preview, plan.preview)) throw new TypeError('Invalid authoritative restore preview.');
    restoreStates.set(model, { wire, mode, comparison, generation, revision, transport, before, intended: plan.candidate, audit, plan, committing: false, unknown: false });
    model.exportImport.preview = reply.preview as RestorePlan['preview']; model.exportImport.acknowledgedWarnings = [];
    model.exportImport.lastRestore = null; model.exportImport.lastError = null; notifySync(model); return model.exportImport.preview;
  };
  const result = owner.tail.then(run, run); owner.tail = result; return result;
}
export function previewPendingSessionRestore(model: AppModel): import('@lingotorte/domain').RestorePreview {
  const intent = model.store.snapshotPendingRestoreIntent();
  if (!intent) throw new TypeError('No pending session restore.');
  if (sessionRestoreBaselines.get(model) !== JSON.stringify(model.store.snapshot())) throw new TypeError('Learner edits changed since session restore; resolve them explicitly.');
  const preview = previewRestoreManifest(model, JSON.stringify(intent.manifest));
  model.exportImport.confirmReplace = intent.mode === 'replace-active'; model.exportImport.confirmOverwrite = intent.mode === 'merge';
  return preview;
}
export function confirmRestore(model: AppModel): void | Promise<void> {
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing) throw new TypeError(restoreUnknown);
  const preview = model.exportImport.preview; const wire = model.exportImport.manifestJson;
  if (!preview || !wire) throw new TypeError('No restore preview/input available.');
  const mode = selectedRestoreMode(model);
  const manifest = RestoreService.validateManifest(JSON.parse(wire));
  const confirmation = RestoreService.requireConfirmation({ confirmedAt: new Date().toISOString(), confirmOverwrite: mode === 'merge', confirmReplace: mode === 'replace-active', acknowledgedWarnings: model.exportImport.acknowledgedWarnings });
  if (model.localService.status === 'disconnected' && !model.localService.revision) {
    const result = model.restoreService.restoreWithReceipt(manifest, confirmation);
    sessionRestoreBaselines.set(model, JSON.stringify(model.store.snapshot()));
    finishRestore(model, manifest, result.receipt, preview);
    markUnsavedBrowserEdits(model); return;
  }
  if (model.localService.restoreCapability !== RESTORE_CAPABILITY) throw new TypeError('Restore capability missing; update the service.');
  const binding = restoreStates.get(model);
  const owner = syncOwner(model);
  if (!binding || binding.unknown || binding.committing || binding.wire !== wire || binding.mode !== mode || binding.revision !== model.localService.revision || binding.generation !== owner.generation || binding.comparison !== browserComparison(model)) throw new TypeError('Fresh service-backed preview required; refresh and confirm again.');
  for (const warning of binding.plan.preview.warnings) if (!confirmation.acknowledgedWarnings.includes(warning.kind)) throw new TypeError(`Restore warning ${warning.kind} not acknowledged.`);
  binding.committing = true;
  const current = () => { binding.transport.assertCurrent(); if (binding.generation !== owner.generation || binding.comparison !== browserComparison(model) || binding.wire !== model.exportImport.manifestJson || selectedRestoreMode(model) !== mode) throw new TypeError('Restore owner/input changed.'); };
  const run = async () => {
    let dispatched = false;
    let commitResponseReceived = false;
    try {
      current(); if (binding.revision !== model.localService.revision || owner.choice) throw new TypeError('Restore revision changed; refresh preview.');
      model.localService.syncState = 'saving'; model.localService.lastMessage = 'Restore pending; live learner state has not changed.'; notifySync(model);
      dispatched = true;
      const ack = await fetchLocalServiceJson(binding.transport, '/api/restore/commit', { method: 'POST', body: JSON.stringify({ manifest: JSON.parse(wire), mode, expectedRevision: binding.revision, learnerAudit: binding.audit, confirmation }) }); commitResponseReceived = true; current();
      const revision = stateRevision(ack.revision);
      const snapshot = authoritativeRestoreSnapshot(ack.snapshot);
      const expectedReceipt = { mode, effects: binding.plan.effects, auditEffects: binding.plan.auditEffects, coalesced: binding.plan.coalesced, integrity: 'semantic-hash-verified', durability: 'durable-committed/readback-verified', durablySaved: true };
      if (ack.ok !== true || ack.capability !== RESTORE_CAPABILITY || !sameHistoryPayload(ack.receipt, expectedReceipt) || !sameHistoryPayload(snapshot, binding.intended)) throw new TypeError('Invalid restore acknowledgement.');
      binding.acknowledgedRevision = revision;
      const readback = await fetchLocalServiceJson(binding.transport, '/api/state'); current();
      if (readback.ok !== true || readback.restoreCapability !== RESTORE_CAPABILITY || stateRevision(readback.revision) !== revision || !sameHistoryPayload(authoritativeRestoreSnapshot(readback.snapshot), snapshot)) throw new TypeError('Restore readback mismatch.');
      installDurableRestore(model, binding, snapshot, revision);
    } catch (error) {
      binding.committing = false;
      const rejected = !commitResponseReceived && error instanceof LocalServiceRequestError && [400, 409, 428, 500].includes(error.status);
      binding.unknown = dispatched && !rejected;
      // Keep recovery evidence even when UI/transport ownership is revoked. Do not publish stale completion.
      if (binding.generation === owner.generation) {
        model.exportImport.lastRestore = null; model.exportImport.lastError = binding.unknown ? restoreUnknown : error instanceof Error ? error.message : 'Restore failed before commit.';
        model.localService.syncState = binding.unknown || rejected ? 'conflict' : 'unsaved'; notifySync(model);
      }
      throw new TypeError(binding.unknown ? restoreUnknown : error instanceof Error ? error.message : 'Restore failed before commit.');
    }
  };
  const result = owner.tail.then(run, run); owner.tail = result; return result;
}

export function setExportImportAcknowledgedWarning(model: AppModel, kind: import('@lingotorte/domain').PrivacyWarningKind, acknowledged: boolean): void {
  const current = new Set(model.exportImport.acknowledgedWarnings);
  if (acknowledged) {
    current.add(kind);
  } else {
    current.delete(kind);
  }
  model.exportImport.acknowledgedWarnings = [...current];
}

export function setExportImportConfirmOverwrite(model: AppModel, value: boolean): void {
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing) throw new TypeError(restoreUnknown);
  restoreStates.delete(model);
  model.exportImport.confirmOverwrite = value;
  if (value) model.exportImport.confirmReplace = false;
}

export function setExportImportConfirmReplace(model: AppModel, value: boolean): void {
  if (restoreStates.get(model)?.unknown || restoreStates.get(model)?.committing) throw new TypeError(restoreUnknown);
  restoreStates.delete(model);
  if (model.exportImport.manifestJson) model.exportImport.preview = model.restoreService.preview(RestoreService.validateManifest(JSON.parse(model.exportImport.manifestJson)), value ? 'replace-active' : 'merge');
  model.exportImport.confirmReplace = value;
  if (value) model.exportImport.confirmOverwrite = false;
}

export function setExportImportError(model: AppModel, error: string | null): void {
  model.exportImport.lastError = error;
}

export async function tokenizeCueText(model: AppModel, cue: Cue): Promise<TokenInfo[]> {
  const adapter = model.adapters.tokenizer ?? makeWhitespaceTokenizer('pl');
  const result = await adapter.tokenize({ language: 'pl', cueId: cue.id, text: cue.text, preserveCharOffsets: true });
  return result.tokens.map((t) => ({ tokenIndex: t.tokenIndex, charStart: t.charStart, charEnd: t.charEnd, surface: t.surface }));
}

export async function lookupToken(model: AppModel, token: string, cueId: string): Promise<LookupOutput> {
  const adapter = model.adapters.dictionary ?? makeUnavailableDictionaryAdapter();
  return adapter.lookup({
    target: { kind: 'sentence', cueId, text: token },
    sourceLanguage: 'pl',
    learnerLanguage: 'en',
    context: { cueText: token },
  });
}

export function setTranscriptQuery(model: AppModel, query: string): void {
  model.transcriptQuery = query;
}

export function setView(model: AppModel, view: import('./uiTypes').ViewName): void {
  model.view = view;
}

export type SelectionNonNull = NonNullable<import('./uiTypes').Selection>;

export function setSelection(model: AppModel, selection: NonNullable<import('./uiTypes').Selection>): void {
  model.selection = selection;
}

export function clearSelection(model: AppModel): void {
  model.selection = null;
  model.pendingMeaning = '';
  model.pendingNotes = '';
}

export function setPendingMeaning(model: AppModel, value: string): void {
  model.pendingMeaning = value;
}

export function setPendingNotes(model: AppModel, value: string): void {
  model.pendingNotes = value;
}

export function activateReviewCard(model: AppModel, cardId: string | null): void {
  model.review.activeCardId = cardId;
  model.review.revealed = false;
}

export function toggleReviewReveal(model: AppModel): void {
  model.review.revealed = !model.review.revealed;
}

/** Inject the review/practice clock. The default reads the live system time at each boundary. */
export function setLearningClock(model: AppModel, clock: () => Date): void {
  model.clock = clock;
}

/** Deterministic helper: pin the review/practice clock to one instant (tests and fixtures). */
export function setReviewBucketAsOf(model: AppModel, asOf: Date): void {
  const pinned = asOf.valueOf();
  setLearningClock(model, () => new Date(pinned));
}
