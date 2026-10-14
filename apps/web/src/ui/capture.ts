import type { AppModel, Selection } from '../uiTypes';
import { requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { undoSave, type SaveReceipt } from '../model';
import { showToast } from './toast.ts';

export const CAPTURE_REQUIRES_APPROVAL_MESSAGE = 'Approve the transcript before saving from it.';

/**
 * lt-cms: the single entry point for every collect gesture (drag-select, Save sentence…, timed word,
 * subtitle-overlay word). Opens the Selection form with a fresh meaning/notes draft and focuses Meaning;
 * nothing is persisted until Save occurrence / Enter in Meaning.
 */
export function openCapture(model: AppModel, selection: NonNullable<Selection>, draft?: { meaning: string; notes: string }): boolean {
  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  if (targetTrack?.transcriptStatus !== 'approved') {
    model.importError = CAPTURE_REQUIRES_APPROVAL_MESSAGE;
    window.getSelection()?.removeAllRanges();
    rerenderApp(model);
    return false;
  }
  if (model.importError === CAPTURE_REQUIRES_APPROVAL_MESSAGE) model.importError = null;
  // lt-dlf.1: pause explicitly so the learner can type; position stays in model.player.currentTimeMs.
  const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
  if (video && !video.paused) video.pause();
  model.player.isPlaying = false;
  model.selection = selection;
  // lt-e0j: Undo re-opens the form with the values the learner had typed.
  model.pendingMeaning = draft?.meaning ?? '';
  model.pendingNotes = draft?.notes ?? '';
  window.getSelection()?.removeAllRanges();
  requestFocusAfterRender(model, 'selection-meaning');
  rerenderApp(model);
  return true;
}

/**
 * lt-e0j: "Saved “text” · Undo" for every capture-form save. Undo removes what this save created (see undoSave),
 * re-opens the form with the previous selection/meaning/notes, and confirms with a plain "Removed" toast. If the
 * item or card changed since the save, Undo refuses with a plain toast and changes nothing.
 */
export function showSaveToast(model: AppModel, receipt: SaveReceipt): void {
  const text = receipt.item.displayText;
  showToast(model, `Saved \u201c${text}\u201d`, () => {
    if (!undoSave(model, receipt)) {
      showToast(model, `Can\u2019t undo \u2014 \u201c${text}\u201d changed since it was saved`);
      rerenderApp(model);
      return;
    }
    showToast(model, `Removed \u201c${text}\u201d`);
    if (!openCapture(model, receipt.selection, { meaning: receipt.meaning, notes: receipt.notes })) rerenderApp(model);
  });
}
