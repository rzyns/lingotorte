import type { Cue, SavedItem } from '@lingotorte/domain';
import { saveSelectionWithReceipt } from '../../apps/web/src/model.ts';
import type { AppModel } from '../../apps/web/src/uiTypes.ts';

/** Drives the product save path and restores the previous selection even on failure. */
async function captureSelection(model: AppModel, selection: NonNullable<AppModel['selection']>): Promise<SavedItem | null> {
  const previous = model.selection;
  model.selection = selection;
  try { return (await saveSelectionWithReceipt(model))?.item ?? null; }
  finally { model.selection = previous; }
}

export function captureSentence(model: AppModel, cue: Cue) {
  const tokens = cue.text.split(/\s+/).filter(Boolean).length;
  return captureSelection(model, { kind: 'sentence', text: cue.text, cueId: cue.id, tokenStart: 0, tokenEnd: tokens, charStart: 0, charEnd: cue.text.length });
}

export function captureLexeme(model: AppModel, cue: Cue, text: string, charStart: number, charEnd: number, tokenIndex: number) {
  return captureSelection(model, { kind: 'lexeme', text, cueId: cue.id, tokenStart: tokenIndex, tokenEnd: tokenIndex + 1, charStart, charEnd });
}

export function capturePhrase(model: AppModel, cue: Cue, text: string, charStart: number, charEnd: number, tokenStart: number, tokenEnd: number) {
  return captureSelection(model, { kind: 'phrase', text, cueId: cue.id, tokenStart, tokenEnd, charStart, charEnd });
}
