import type { AppModel, Selection } from '../uiTypes';
import { requestFocusAfterRender, rerenderApp } from '../appShell.ts';

export const CAPTURE_REQUIRES_APPROVAL_MESSAGE = 'Approve the transcript before saving from it.';

/**
 * lt-cms: the single entry point for every collect gesture (drag-select, Save sentence…, timed word,
 * subtitle-overlay word). Opens the Selection form with a fresh meaning/notes draft and focuses Meaning;
 * nothing is persisted until Save occurrence / Enter in Meaning.
 */
export function openCapture(model: AppModel, selection: NonNullable<Selection>): boolean {
  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  if (targetTrack?.transcriptStatus !== 'approved') {
    model.importError = CAPTURE_REQUIRES_APPROVAL_MESSAGE;
    window.getSelection()?.removeAllRanges();
    rerenderApp(model);
    return false;
  }
  if (model.importError === CAPTURE_REQUIRES_APPROVAL_MESSAGE) model.importError = null;
  model.selection = selection;
  model.pendingMeaning = '';
  model.pendingNotes = '';
  window.getSelection()?.removeAllRanges();
  requestFocusAfterRender(model, 'selection-meaning');
  rerenderApp(model);
  return true;
}
