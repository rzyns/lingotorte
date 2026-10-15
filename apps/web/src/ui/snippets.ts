import { isNativePath } from '../../../../packages/domain/src/nativePaths.ts';
import type { AppModel } from '../uiTypes';
import { releaseSourceAudioSnippet, type SourceAudioSnippetLifecycle } from '../sourceAudioSnippet.ts';
import { clearVisualSourceRange } from '../model';

type PracticeSnippetUiState = SourceAudioSnippetLifecycle & {
  mediaPath: string;
  status: 'path-required' | 'unavailable' | 'preparing' | 'ready' | 'playing' | 'failed' | 'cleaned';
  message: string;
  generation: number;
  contextKey: string;
};

export const practiceSnippetStates = new WeakMap<AppModel, PracticeSnippetUiState>();

type SourceRangeSnippetUiState = SourceAudioSnippetLifecycle & {
  mediaPath: string;
  status: 'idle' | 'path-required' | 'preparing' | 'ready' | 'failed' | 'cleaned';
  message: string;
  generation: number;
  contextKey: string;
  mediaId: string | null;
};

export const sourceRangeSnippetStates = new WeakMap<AppModel, SourceRangeSnippetUiState>();

export function hasNativeInputPath(model: AppModel, value: string): boolean {
  return isNativePath(value, model.localService.pathPolicy);
}

export function hasExtractableCurrentMedia(model: AppModel): boolean {
  return model.currentMedia?.privacyLabel === 'owned' || model.currentMedia?.privacyLabel === 'synthetic';
}

function preferredSourceRangeMediaPath(model: AppModel): string {
  const configured = model.transcriptLifecycle.localAsrMediaPath;
  if (hasNativeInputPath(model, configured)) return configured;
  const fallback = model.currentMedia?.originalPath ?? '';
  return hasNativeInputPath(model, fallback) ? fallback : '';
}

export function sourceRangeContextKey(model: AppModel, state: SourceRangeSnippetUiState): string {
  const range = model.player.sourceRange;
  return [
    model.currentMedia?.id ?? '',
    hasExtractableCurrentMedia(model) ? 'extractable' : 'non-extractable',
    state.mediaPath.trim(),
    range?.startMs ?? '',
    range?.endMs ?? '',
  ].join('|');
}

function sourceRangeSnippetState(model: AppModel): SourceRangeSnippetUiState {
  const existing = sourceRangeSnippetStates.get(model);
  if (existing) return existing;
  const mediaPath = preferredSourceRangeMediaPath(model);
  const created: SourceRangeSnippetUiState = {
    objectUrl: null,
    mediaPath,
    status: mediaPath ? 'idle' : 'path-required',
    message: mediaPath
      ? 'Select a range to prepare transient source audio.'
      : 'Enter the full path to the video file first.',
    generation: 0,
    contextKey: '',
    mediaId: model.currentMedia?.id ?? null,
  };
  created.contextKey = sourceRangeContextKey(model, created);
  sourceRangeSnippetStates.set(model, created);
  return created;
}

export function invalidateSourceRangeSnippet(model: AppModel, message: string): SourceRangeSnippetUiState {
  const state = sourceRangeSnippetState(model);
  state.generation += 1;
  releaseSourceAudioSnippet(state);
  state.status = state.mediaPath.trim() ? 'idle' : 'path-required';
  state.message = message;
  state.contextKey = sourceRangeContextKey(model, state);
  return state;
}

export function synchronizeSourceRangeSnippet(model: AppModel): SourceRangeSnippetUiState {
  const state = sourceRangeSnippetState(model);
  const mediaId = model.currentMedia?.id ?? null;
  if (state.mediaId !== mediaId) {
    state.mediaId = mediaId;
    clearVisualSourceRange(model);
    return invalidateSourceRangeSnippet(model, 'Media changed; select a new source range.');
  }
  const contextKey = sourceRangeContextKey(model, state);
  if (state.contextKey !== contextKey) {
    return invalidateSourceRangeSnippet(model, 'Range or media path changed; prepare fresh source audio.');
  }
  return state;
}

function practiceSnippetState(model: AppModel): PracticeSnippetUiState {
  const existing = practiceSnippetStates.get(model);
  if (existing) return existing;
  const created: PracticeSnippetUiState = { objectUrl: null, mediaPath: '', status: 'path-required', message: 'Enter the full path to the video file first.', generation: 0, contextKey: '' };
  created.contextKey = practiceSnippetContextKey(model, created);
  practiceSnippetStates.set(model, created);
  return created;
}

// lt-q3d: everything a prepared Practice snippet is bound to; any change revokes/invalidates it.
export function practiceSnippetContextKey(model: AppModel, state: PracticeSnippetUiState): string {
  // Read-only: the card id fixes the cue bounds; never resolve/advance the queue here.
  return JSON.stringify([
    model.view, model.practice.mode, model.practice.cardId ?? '',
    // A submit/skip that re-presents the same card is still a new presentation.
    model.practice.cardId ? model.store.listPracticeAttemptsForCard(model.practice.cardId).length : 0,
    state.mediaPath.trim(), model.localService.baseUrl, model.localService.status, model.localService.pathPolicy ?? null,
  ]);
}

export function invalidatePracticeSnippet(model: AppModel, message: string): PracticeSnippetUiState {
  const state = practiceSnippetState(model);
  state.generation += 1;
  releaseSourceAudioSnippet(state);
  state.status = state.mediaPath.trim() ? 'cleaned' : 'path-required';
  state.message = message;
  state.contextKey = practiceSnippetContextKey(model, state);
  return state;
}

export function synchronizePracticeSnippet(model: AppModel): PracticeSnippetUiState {
  const state = practiceSnippetState(model);
  if (state.contextKey !== practiceSnippetContextKey(model, state)) {
    return invalidatePracticeSnippet(model, state.objectUrl || state.status === 'preparing'
      ? 'Card, mode, view, media path or service changed; transient browser audio cleaned.'
      : state.message);
  }
  return state;
}
