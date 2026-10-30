import type { AppModel, Selection } from '../uiTypes';
import { requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { currentTargetTrack, undoSave, type SaveReceipt, type UnappliedDraft } from '../model';
import { showToast } from './toast.ts';
import { suggestMeaningForSelection } from '../morphologyPanel.ts';

export const CAPTURE_REQUIRES_APPROVAL_MESSAGE = 'Approve the transcript before saving from it.';

/**
 * lt-cms: the single entry point for every collect gesture (drag-select, Save sentence…, timed word,
 * subtitle-overlay word). Opens the Selection form with a fresh meaning/notes draft and focuses Meaning;
 * nothing is persisted until Save / Enter in Meaning.
 */
export function openCapture(model: AppModel, selection: NonNullable<Selection>, draft?: { meaning: string; notes: string }): boolean {
  const targetTrack = currentTargetTrack(model);
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
  model.pendingMeaningSuggestion = null;
  model.pendingNotes = draft?.notes ?? '';
  window.getSelection()?.removeAllRanges();
  requestFocusAfterRender(model, 'selection-meaning');
  rerenderApp(model);
  // lt-foe.3.4: dictionary suggestion for a single word, without blocking; never over an Undo draft.
  if (!draft?.meaning) void suggestMeaningForSelection(model, selection, () => rerenderApp(model)).catch(() => {});
  return true;
}

/**
 * lt-e0j: "Saved “text” · Undo" for every capture-form save. Undo removes what this save created (see undoSave),
 * re-opens the form with the previous selection/meaning/notes, and confirms with a plain "Removed" toast. If the
 * item or card changed since the save, Undo refuses with a plain toast and changes nothing.
 * lt-192.3: a paired save the service has not confirmed yet says so and is never shown as "Saved"; a save that joined an
 * existing item discloses the meaning/notes it did not apply.
 */
export function showSaveToast(model: AppModel, receipt: SaveReceipt): void {
  const text = receipt.pending ? receipt.displayText : receipt.item.displayText;
  const paired = Boolean(receipt.pending || receipt.operationId);
  const settle = (ok: boolean) => {
    if (!ok) {
      showToast(model, paired
        ? `Can\u2019t undo \u201c${text}\u201d \u2014 ${model.learnerOperations.message ?? 'the change is not confirmed yet'}`
        : `Can\u2019t undo \u2014 \u201c${text}\u201d changed since it was saved`);
      rerenderApp(model);
      return;
    }
    showToast(model, `Removed \u201c${text}\u201d`);
    if (!openCapture(model, receipt.selection, { meaning: receipt.meaning, notes: receipt.notes })) rerenderApp(model);
  };
  const undo = () => {
    const result = undoSave(model, receipt);
    if (typeof result === 'boolean') settle(result); else void result.then(settle, () => settle(false));
  };
  if (receipt.pending) {
    showToast(model, `Not saved yet: \u201c${text}\u201d is waiting for the local service`, undo);
    return;
  }
  showToast(model, `Saved \u201c${text}\u201d${unappliedDraftText(receipt.unappliedDraft)}`, undo);
}

/** lt-192.3: a capture-form save that failed (e.g. browser storage full) says so where the learner is; nothing was saved. */
export function showSaveFailureToast(model: AppModel, error: unknown): void {
  const message = error instanceof Error && error.message ? error.message : 'The save failed; nothing was saved.';
  showToast(model, `Not saved: ${message}`);
}

function unappliedDraftText(draft: UnappliedDraft | null | undefined): string {
  if (!draft) return '';
  const parts: string[] = [];
  if (draft.meaning !== undefined) parts.push(`your meaning \u201c${draft.meaning}\u201d was not applied${draft.existingMeaning ? ` (kept \u201c${draft.existingMeaning}\u201d)` : ''}`);
  if (draft.notes !== undefined) parts.push(`your notes were not applied${draft.existingNotes ? ' (kept the existing notes)' : ''}`);
  return ` \u2014 already saved; ${parts.join('; ')}. Edit the item in Saved to change it.`;
}
