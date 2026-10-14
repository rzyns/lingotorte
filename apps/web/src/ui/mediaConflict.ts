import type { AppModel } from '../uiTypes';
import { BrowserMediaNameConflictError, setView } from '../model';
import { rerenderApp } from '../appShell.ts';

// lt-n31: explicit learner choice when a selected file shares a name with existing media but differs in content.
type PendingMediaNameConflict = Readonly<{ message: string; importAsNew: () => Promise<void> }>;
export let pendingMediaNameConflict: PendingMediaNameConflict | null = null;
export function clearPendingMediaNameConflict(): void { pendingMediaNameConflict = null; }

export function handleMediaImportError(model: AppModel, err: unknown, importAsNew: () => Promise<void>): void {
  if (err instanceof BrowserMediaNameConflictError) {
    pendingMediaNameConflict = { message: err.message, importAsNew };
    model.importError = null;
  } else {
    pendingMediaNameConflict = null;
    model.importError = err instanceof Error ? err.message : String(err);
  }
  rerenderApp(model);
}

export function renderMediaNameConflict(model: AppModel): HTMLElement | null {
  const conflict = pendingMediaNameConflict;
  if (!conflict) return null;
  const box = document.createElement('div');
  box.className = 'status-banner warning media-name-conflict';
  // An inline alert with ordinary buttons; not a modal alertdialog, so no focus trap or accessible-name requirement.
  box.setAttribute('role', 'alert');
  const text = document.createElement('p');
  text.id = 'media-name-conflict-message';
  text.textContent = conflict.message;
  const asNew = document.createElement('button');
  asNew.type = 'button';
  asNew.className = 'btn-primary';
  asNew.textContent = 'Import as new media';
  asNew.addEventListener('click', () => {
    pendingMediaNameConflict = null;
    void conflict.importAsNew()
      .then(() => { model.importError = null; setView(model, 'player'); rerenderApp(model); })
      .catch((err: unknown) => { model.importError = err instanceof Error ? err.message : String(err); rerenderApp(model); });
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn-secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    pendingMediaNameConflict = null;
    model.importError = 'Import cancelled. Existing media was not changed.';
    rerenderApp(model);
  });
  box.append(text, asNew, cancel);
  return box;
}
