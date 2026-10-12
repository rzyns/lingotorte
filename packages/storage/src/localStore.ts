import type {
  Cue,
  ExportJob,
  ImportJob,
  ImportJobEvent,
  MediaAsset,
  MediaFileObservation,
  PracticeAttempt,
  ProviderPolicyEntry,
  ReviewCard,
  ReviewCardState,
  ReviewEvent,
  SavedItem,
  SavedOccurrence,
  SubtitleTrack,
  TranscriptWordTiming,
  UUID,
} from '@lingotorte/domain';

// In-memory local persistence layer for P1/P4/P5 domain core. All writes are synchronous
// and return immutable copies so that consumers cannot accidentally mutate internal state.

export type LocalStoreSnapshot = Readonly<{
  mediaAssets: Record<UUID, MediaAsset>;
  mediaObservations: MediaFileObservation[];
  subtitleTracks: Record<UUID, SubtitleTrack>;
  cues: Record<UUID, Cue>;
  transcriptWordTimings: Record<UUID, TranscriptWordTiming>;
  savedItems: Record<UUID, SavedItem>;
  savedOccurrences: Record<UUID, SavedOccurrence>;
  reviewCards: Record<UUID, ReviewCard>;
  reviewCardStates: Record<UUID, ReviewCardState>;
  reviewEvents: ReviewEvent[];
  practiceAttempts: PracticeAttempt[];
  exportJobs: Record<UUID, ExportJob>;
  providerPolicies: Record<UUID, ProviderPolicyEntry>;
  importJobs: Record<UUID, ImportJob>;
  importJobEvents: ImportJobEvent[];
}>;

export function createEmptyLocalStoreSnapshot(): LocalStoreSnapshot {
  return {
    mediaAssets: {},
    mediaObservations: [],
    subtitleTracks: {},
    cues: {},
    transcriptWordTimings: {},
    savedItems: {},
    savedOccurrences: {},
    reviewCards: {},
    reviewCardStates: {},
    reviewEvents: [],
    practiceAttempts: [],
    exportJobs: {},
    providerPolicies: {},
    importJobs: {},
    importJobEvents: [],
  };
}

function cloneSnapshot(snapshot: LocalStoreSnapshot): LocalStoreSnapshot {
  return structuredClone(snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOrEmpty<T>(value: unknown): Record<UUID, T> {
  return isRecord(value) ? { ...(value as Record<UUID, T>) } : {};
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? [...(value as T[])] : [];
}

export function normalizeLocalStoreSnapshot(value: unknown): LocalStoreSnapshot {
  if (!isRecord(value)) return createEmptyLocalStoreSnapshot();
  return {
    mediaAssets: recordOrEmpty<MediaAsset>(value.mediaAssets),
    mediaObservations: arrayOrEmpty<MediaFileObservation>(value.mediaObservations),
    subtitleTracks: recordOrEmpty<SubtitleTrack>(value.subtitleTracks),
    cues: recordOrEmpty<Cue>(value.cues),
    transcriptWordTimings: recordOrEmpty<TranscriptWordTiming>(value.transcriptWordTimings),
    savedItems: recordOrEmpty<SavedItem>(value.savedItems),
    savedOccurrences: recordOrEmpty<SavedOccurrence>(value.savedOccurrences),
    reviewCards: recordOrEmpty<ReviewCard>(value.reviewCards),
    reviewCardStates: recordOrEmpty<ReviewCardState>(value.reviewCardStates),
    reviewEvents: arrayOrEmpty<ReviewEvent>(value.reviewEvents),
    practiceAttempts: arrayOrEmpty<PracticeAttempt>(value.practiceAttempts),
    exportJobs: recordOrEmpty<ExportJob>(value.exportJobs),
    providerPolicies: recordOrEmpty<ProviderPolicyEntry>(value.providerPolicies),
    importJobs: recordOrEmpty<ImportJob>(value.importJobs),
    importJobEvents: arrayOrEmpty<ImportJobEvent>(value.importJobEvents),
  };
}

export class LocalStore {
  private state: LocalStoreSnapshot;

  private pendingRestoreIntent: { mode: 'merge' | 'replace-active'; manifest: unknown } | undefined;

  snapshotPendingRestoreIntent() { return structuredClone(this.pendingRestoreIntent); }

  private restoreAudit: { reviewEvents: ReviewEvent[]; practiceAttempts: PracticeAttempt[] } = { reviewEvents: [], practiceAttempts: [] };

  snapshotRestoreAudit() {
    return structuredClone(this.restoreAudit);
  }

  installRestoreCandidate(snapshot: LocalStoreSnapshot, audit: { reviewEvents: ReviewEvent[]; practiceAttempts: PracticeAttempt[] }, intent?: { mode: 'merge' | 'replace-active'; manifest: unknown }): LocalStoreSnapshot {
    const next = cloneSnapshot(snapshot);
    const nextAudit = structuredClone(audit);
    const nextIntent = structuredClone(intent);
    const result = cloneSnapshot(next);
    this.state = next;
    this.restoreAudit = nextAudit;
    this.pendingRestoreIntent = nextIntent;
    return result;
  }

  constructor(initialSnapshot: LocalStoreSnapshot = createEmptyLocalStoreSnapshot()) {
    this.state = cloneSnapshot(normalizeLocalStoreSnapshot(initialSnapshot));
  }

  replaceSnapshot(snapshot: LocalStoreSnapshot): LocalStoreSnapshot {
    this.state = cloneSnapshot(normalizeLocalStoreSnapshot(snapshot));
    return this.clone();
  }

  private clone(): LocalStoreSnapshot {
    return cloneSnapshot(this.state);
  }

  snapshot(): LocalStoreSnapshot {
    return this.clone();
  }

  putMediaAsset(asset: MediaAsset): LocalStoreSnapshot {
    Object.defineProperty(this.state.mediaAssets, asset.id, { value: asset, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getMediaAsset(id: UUID): MediaAsset | undefined {
    return Object.hasOwn(this.state.mediaAssets, id) ? this.state.mediaAssets[id] : undefined;
  }

  listMediaAssets(): MediaAsset[] {
    return Object.values(this.state.mediaAssets);
  }

  addMediaObservation(observation: MediaFileObservation): LocalStoreSnapshot {
    this.state.mediaObservations.push(observation);
    return this.clone();
  }

  getLatestObservation(mediaId: UUID): MediaFileObservation | undefined {
    return [...this.state.mediaObservations]
      .reverse()
      .find((o) => o.mediaId === mediaId);
  }

  putSubtitleTrack(track: SubtitleTrack): LocalStoreSnapshot {
    Object.defineProperty(this.state.subtitleTracks, track.id, { value: track, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getSubtitleTrack(id: UUID): SubtitleTrack | undefined {
    return Object.hasOwn(this.state.subtitleTracks, id) ? this.state.subtitleTracks[id] : undefined;
  }

  listSubtitleTracksForMedia(mediaId: UUID): SubtitleTrack[] {
    return Object.values(this.state.subtitleTracks).filter((t) => t.mediaId === mediaId);
  }

  putCue(cue: Cue): LocalStoreSnapshot {
    Object.defineProperty(this.state.cues, cue.id, { value: cue, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getCue(id: UUID): Cue | undefined {
    return Object.hasOwn(this.state.cues, id) ? this.state.cues[id] : undefined;
  }

  listCuesForTrack(trackId: UUID): Cue[] {
    return Object.values(this.state.cues)
      .filter((c) => c.trackId === trackId)
      .sort((a, b) => a.cueIndex - b.cueIndex || a.startMs - b.startMs);
  }

  putTranscriptWordTiming(timing: TranscriptWordTiming): LocalStoreSnapshot {
    Object.defineProperty(this.state.transcriptWordTimings, timing.id, { value: timing, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  listTranscriptWordTimingsForTrack(trackId: UUID): TranscriptWordTiming[] {
    return Object.values(this.state.transcriptWordTimings)
      .filter((timing) => timing.trackId === trackId)
      .sort((a, b) => a.startMs - b.startMs || a.wordIndex - b.wordIndex);
  }

  listTranscriptWordTimingsForCue(cueId: UUID): TranscriptWordTiming[] {
    return Object.values(this.state.transcriptWordTimings)
      .filter((timing) => timing.cueId === cueId)
      .sort((a, b) => a.startMs - b.startMs || a.wordIndex - b.wordIndex);
  }

  putSavedItem(item: SavedItem): LocalStoreSnapshot {
    Object.defineProperty(this.state.savedItems, item.id, { value: item, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getSavedItem(id: UUID): SavedItem | undefined {
    return Object.hasOwn(this.state.savedItems, id) ? this.state.savedItems[id] : undefined;
  }

  getSavedOccurrence(id: UUID): SavedOccurrence | undefined {
    return Object.hasOwn(this.state.savedOccurrences, id) ? this.state.savedOccurrences[id] : undefined;
  }

  listSavedOccurrences(): SavedOccurrence[] {
    return Object.values(this.state.savedOccurrences);
  }

  putSavedOccurrence(occurrence: SavedOccurrence): LocalStoreSnapshot {
    Object.defineProperty(this.state.savedOccurrences, occurrence.id, { value: occurrence, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  listSavedOccurrencesForItem(itemId: UUID): SavedOccurrence[] {
    return Object.values(this.state.savedOccurrences).filter((o) => o.savedItemId === itemId);
  }

  putReviewCard(card: ReviewCard): LocalStoreSnapshot {
    Object.defineProperty(this.state.reviewCards, card.id, { value: card, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getReviewCard(id: UUID): ReviewCard | undefined {
    return Object.hasOwn(this.state.reviewCards, id) ? this.state.reviewCards[id] : undefined;
  }

  putReviewCardState(state: ReviewCardState): LocalStoreSnapshot {
    Object.defineProperty(this.state.reviewCardStates, state.cardId, { value: state, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getReviewCardState(cardId: UUID): ReviewCardState | undefined {
    return Object.hasOwn(this.state.reviewCardStates, cardId) ? this.state.reviewCardStates[cardId] : undefined;
  }

  addReviewEvent(event: ReviewEvent): LocalStoreSnapshot {
    this.state.reviewEvents.push(event);
    return this.clone();
  }

  listReviewEventsForCard(cardId: UUID): ReviewEvent[] {
    return this.state.reviewEvents.filter((e) => e.cardId === cardId);
  }

  addPracticeAttempt(attempt: PracticeAttempt): LocalStoreSnapshot {
    this.state.practiceAttempts.push(attempt);
    return this.clone();
  }

  listPracticeAttempts(): PracticeAttempt[] {
    return [...this.state.practiceAttempts];
  }

  listPracticeAttemptsForCard(cardId: UUID): PracticeAttempt[] {
    return this.state.practiceAttempts.filter((a) => a.cardId === cardId);
  }

  putExportJob(job: ExportJob): LocalStoreSnapshot {
    Object.defineProperty(this.state.exportJobs, job.id, { value: job, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getExportJob(id: UUID): ExportJob | undefined {
    return Object.hasOwn(this.state.exportJobs, id) ? this.state.exportJobs[id] : undefined;
  }

  listExportJobs(): ExportJob[] {
    return Object.values(this.state.exportJobs);
  }

  putProviderPolicy(policy: ProviderPolicyEntry): LocalStoreSnapshot {
    Object.defineProperty(this.state.providerPolicies, policy.id, { value: policy, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getProviderPolicy(id: UUID): ProviderPolicyEntry | undefined {
    return Object.hasOwn(this.state.providerPolicies, id) ? this.state.providerPolicies[id] : undefined;
  }

  listProviderPolicies(): ProviderPolicyEntry[] {
    return Object.values(this.state.providerPolicies);
  }

  putImportJob(job: ImportJob): LocalStoreSnapshot {
    Object.defineProperty(this.state.importJobs, job.id, { value: job, enumerable: true, writable: true, configurable: true });
    return this.clone();
  }

  getImportJob(id: UUID): ImportJob | undefined {
    return Object.hasOwn(this.state.importJobs, id) ? this.state.importJobs[id] : undefined;
  }

  addImportJobEvent(event: ImportJobEvent): LocalStoreSnapshot {
    this.state.importJobEvents.push(event);
    return this.clone();
  }

  listImportJobEvents(jobId: UUID): ImportJobEvent[] {
    return this.state.importJobEvents.filter((e) => e.jobId === jobId);
  }

  removeSavedItem(id: UUID): void {
    delete this.state.savedItems[id];
  }

  removeSavedOccurrence(id: UUID): void {
    delete this.state.savedOccurrences[id];
  }

  removeReviewCard(id: UUID): void {
    delete this.state.reviewCards[id];
  }

  removeReviewCardState(id: UUID): void {
    delete this.state.reviewCardStates[id];
  }

  removeReviewEvent(id: UUID): void {
    const index = this.state.reviewEvents.findIndex((e) => e.id === id);
    if (index >= 0) this.state.reviewEvents.splice(index, 1);
  }

  removePracticeAttempt(id: UUID): void {
    const index = this.state.practiceAttempts.findIndex((a) => a.id === id);
    if (index >= 0) this.state.practiceAttempts.splice(index, 1);
  }
}
