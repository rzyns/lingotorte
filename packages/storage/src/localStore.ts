import type {
  Cue,
  ImportJob,
  ImportJobEvent,
  MediaAsset,
  MediaFileObservation,
  PracticeAttempt,
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
  importJobs: Record<UUID, ImportJob>;
  importJobEvents: ImportJobEvent[];
}>;

export class LocalStore {
  private readonly state: LocalStoreSnapshot = {
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
    importJobs: {},
    importJobEvents: [],
  };

  private clone(): LocalStoreSnapshot {
    return {
      mediaAssets: { ...this.state.mediaAssets },
      mediaObservations: [...this.state.mediaObservations],
      subtitleTracks: { ...this.state.subtitleTracks },
      cues: { ...this.state.cues },
      transcriptWordTimings: { ...this.state.transcriptWordTimings },
      savedItems: { ...this.state.savedItems },
      savedOccurrences: { ...this.state.savedOccurrences },
      reviewCards: { ...this.state.reviewCards },
      reviewCardStates: { ...this.state.reviewCardStates },
      reviewEvents: [...this.state.reviewEvents],
      practiceAttempts: [...this.state.practiceAttempts],
      importJobs: { ...this.state.importJobs },
      importJobEvents: [...this.state.importJobEvents],
    };
  }

  snapshot(): LocalStoreSnapshot {
    return this.clone();
  }

  putMediaAsset(asset: MediaAsset): LocalStoreSnapshot {
    this.state.mediaAssets[asset.id] = asset;
    return this.clone();
  }

  getMediaAsset(id: UUID): MediaAsset | undefined {
    return this.state.mediaAssets[id];
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
    this.state.subtitleTracks[track.id] = track;
    return this.clone();
  }

  getSubtitleTrack(id: UUID): SubtitleTrack | undefined {
    return this.state.subtitleTracks[id];
  }

  listSubtitleTracksForMedia(mediaId: UUID): SubtitleTrack[] {
    return Object.values(this.state.subtitleTracks).filter((t) => t.mediaId === mediaId);
  }

  putCue(cue: Cue): LocalStoreSnapshot {
    this.state.cues[cue.id] = cue;
    return this.clone();
  }

  getCue(id: UUID): Cue | undefined {
    return this.state.cues[id];
  }

  listCuesForTrack(trackId: UUID): Cue[] {
    return Object.values(this.state.cues)
      .filter((c) => c.trackId === trackId)
      .sort((a, b) => a.cueIndex - b.cueIndex || a.startMs - b.startMs);
  }

  putTranscriptWordTiming(timing: TranscriptWordTiming): LocalStoreSnapshot {
    this.state.transcriptWordTimings[timing.id] = timing;
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
    this.state.savedItems[item.id] = item;
    return this.clone();
  }

  getSavedItem(id: UUID): SavedItem | undefined {
    return this.state.savedItems[id];
  }

  getSavedOccurrence(id: UUID): SavedOccurrence | undefined {
    return this.state.savedOccurrences[id];
  }

  listSavedOccurrences(): SavedOccurrence[] {
    return Object.values(this.state.savedOccurrences);
  }

  putSavedOccurrence(occurrence: SavedOccurrence): LocalStoreSnapshot {
    this.state.savedOccurrences[occurrence.id] = occurrence;
    return this.clone();
  }

  listSavedOccurrencesForItem(itemId: UUID): SavedOccurrence[] {
    return Object.values(this.state.savedOccurrences).filter((o) => o.savedItemId === itemId);
  }

  putReviewCard(card: ReviewCard): LocalStoreSnapshot {
    this.state.reviewCards[card.id] = card;
    return this.clone();
  }

  getReviewCard(id: UUID): ReviewCard | undefined {
    return this.state.reviewCards[id];
  }

  putReviewCardState(state: ReviewCardState): LocalStoreSnapshot {
    this.state.reviewCardStates[state.cardId] = state;
    return this.clone();
  }

  getReviewCardState(cardId: UUID): ReviewCardState | undefined {
    return this.state.reviewCardStates[cardId];
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

  putImportJob(job: ImportJob): LocalStoreSnapshot {
    this.state.importJobs[job.id] = job;
    return this.clone();
  }

  getImportJob(id: UUID): ImportJob | undefined {
    return this.state.importJobs[id];
  }

  addImportJobEvent(event: ImportJobEvent): LocalStoreSnapshot {
    this.state.importJobEvents.push(event);
    return this.clone();
  }

  listImportJobEvents(jobId: UUID): ImportJobEvent[] {
    return this.state.importJobEvents.filter((e) => e.jobId === jobId);
  }
}
