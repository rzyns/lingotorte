import type { AppModel } from '../uiTypes';
import type { SavedItem } from '@lingotorte/domain';
import { formatTimeMs } from '../uiTypes';
import { addSavedItemToReview, addSavedItemsToReview, applyUnappliedDraftMeaning, archiveReviewCardsForSavedItem, cueById, cuesForTrack, discardLearnerOperation, dismissUnappliedDraft, learnerOperationMessage, listAllSavedItems, mediaAssetById, mediaTranscriptsNeedLoading, occurrenceContext, openDraftFields, openMediaAsset, pendingEnrolmentFor, pendingMeaningFor, reapplyLearnerOperation, retryLearnerOperation, reviewCardsForSavedItem, setSavedItemMeaning, setView, unappliedDraftOutcomes, unresolvedLearnerOperations, type UnappliedDraft } from '../model';
import type { OutboxRecord } from '../operationOutbox.ts';
import { requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { appendSourceDisclosure, mediaDisplayName, renderTranscriptNotLoaded } from '../ui/common.ts';

export function renderSavedView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card saved-view';

  const tabs = document.createElement('div');
  tabs.className = 'saved-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Saved item categories');
  const categories: { id: 'vocab' | 'sentences'; label: string; kinds: readonly ('lexeme' | 'phrase' | 'sentence')[] }[] = [
    { id: 'vocab', label: 'My Vocab', kinds: ['lexeme', 'phrase'] },
    { id: 'sentences', label: 'My Sentences', kinds: ['sentence'] },
  ];
  const currentTab = model.savedViewTab ?? 'vocab';
  let firstTabButton: HTMLButtonElement | null = null;
  for (const category of categories) {
    const btn = document.createElement('button');
    btn.className = `saved-tab${currentTab === category.id ? ' active' : ''}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(currentTab === category.id));
    btn.setAttribute('aria-controls', `saved-panel-${category.id}`);
    btn.id = `saved-tab-${category.id}`;
    btn.textContent = category.label;
    btn.addEventListener('click', () => {
      model.savedViewTab = category.id;
      rerenderApp(model);
    });
    tabs.appendChild(btn);
    if (!firstTabButton) firstTabButton = btn;
  }
  section.appendChild(tabs);

  const allItems = listAllSavedItems(model);
  const selectedKinds = categories.find((c) => c.id === currentTab)?.kinds ?? ['lexeme', 'phrase'];
  const items = allItems.filter((i) => selectedKinds.includes(i.kind) && !i.archivedAt);

  const heading = document.createElement('h2');
  heading.textContent = currentTab === 'vocab' ? 'My Vocab' : 'My Sentences';
  heading.id = 'saved-heading';
  section.appendChild(heading);
  const pendingPanel = renderPendingOperations(model);
  if (pendingPanel) section.appendChild(pendingPanel);
  const draftsPanel = renderUnappliedDrafts(model);
  if (draftsPanel) section.appendChild(draftsPanel);

  // lt-uzo: bulk opt-in for items in this tab lacking an active review card; hidden when there are none.
  const lacking = items.filter((i) => reviewCardsForSavedItem(model, i.id).active.length === 0 && pendingEnrolmentFor(model, i.id) !== true);
  if (lacking.length > 0) {
    const addAll = document.createElement('button');
    addAll.className = 'btn-secondary saved-add-all';
    addAll.textContent = `Add all to review (${lacking.length})`;
    addAll.addEventListener('click', () => {
      addSavedItemsToReview(model, lacking);
      rerenderApp(model);
    });
    section.appendChild(addAll);
  }

  const panel = document.createElement('div');
  panel.className = 'saved-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.id = `saved-panel-${currentTab}`;
  panel.setAttribute('aria-labelledby', `saved-tab-${currentTab}`);

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = currentTab === 'vocab'
      ? 'No words or phrases saved yet. Select text in a transcript cue to save it.'
      : 'No sentences saved yet. Click “Save sentence…” on a transcript cue.';
    panel.appendChild(empty);
    section.appendChild(panel);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'saved-list';
  for (const item of items) {
    const occurrences = model.savedOccurrenceService.listOccurrencesForItem(item.id);
    const card = document.createElement('article');
    card.className = 'saved-item';
    const title = document.createElement('h3');
    title.textContent = item.displayText;
    card.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${item.kind === 'lexeme' ? 'word' : item.kind} • ${item.language} • saved ${occurrences.length} time${occurrences.length === 1 ? '' : 's'}`;
    card.appendChild(meta);
    // lt-192.3: a meaning edit the service has not confirmed is shown, marked as not saved yet.
    const pendingMeaning = pendingMeaningFor(model, item.id);
    if (pendingMeaning) {
      const { meaning: _m, meaningSource: _s, ...rest } = item;
      const shown = pendingMeaning.meaning === null ? rest : { ...rest, meaning: pendingMeaning.meaning, meaningSource: { kind: 'learner' as const } };
      if (pendingMeaning.meaning !== null) card.appendChild(renderMeaningLine(model, shown, 'div', 'meta meaning'));
      const note = document.createElement('div');
      note.className = 'meta pending-change';
      note.textContent = pendingMeaning.meaning === null ? 'Meaning removal not saved yet' : 'Meaning not saved yet';
      card.appendChild(note);
    } else if (item.meaning) {
      card.appendChild(renderMeaningLine(model, item, 'div', 'meta meaning'));
    } else if (!savedItemNativeLine(model, occurrences[0])) {
      card.appendChild(renderAddMeaning(model, item.id));
    }

    const occurrenceGroup = document.createElement('div');
    occurrenceGroup.className = 'occurrence-group';
    for (const occurrence of occurrences) {
      const link = document.createElement('a');
      link.className = 'occurrence-link';
      link.href = '#';
      const cue = cueById(model, occurrence.cueId);
      const cueText = cue?.text ?? occurrence.selectionText;
      link.textContent = `▶ ${formatTimeMs(occurrence.startMs)} — ${cueText}`;
      link.setAttribute('aria-label', `Jump to ${formatTimeMs(occurrence.startMs)} in ${mediaDisplayName(model, occurrence.sourceContext.mediaId, occurrence.sourceContext.mediaPath)}`);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        // lt-584.5: a media whose transcripts are not loaded is opened (and loaded) first, then the jump seeks.
        if (mediaTranscriptsNeedLoading(model, occurrence.sourceContext.mediaId)) {
          const opened = openMediaAsset(model, occurrence.sourceContext.mediaId);
          rerenderApp(model);
          void opened.then((ok) => { if (ok) jumpToOccurrence(true); else rerenderApp(model); });
          return;
        }
        jumpToOccurrence();
      });
      const jumpToOccurrence = (openedNow = false) => {
        setView(model, 'player');
        model.player.currentTimeMs = occurrence.startMs;
        model.player.activeCueId = occurrence.cueId;
        model.targetTrackId = occurrence.sourceContext.subtitleTrackId;
        model.nativeTrackId = model.currentMedia?.id === occurrence.sourceContext.mediaId ? model.nativeTrackId : null;
        if (model.currentMedia?.id !== occurrence.sourceContext.mediaId) {
          const asset = mediaAssetById(model, occurrence.sourceContext.mediaId);
          if (asset) {
            model.currentMedia = asset;
            model.cues = cuesForTrack(model, occurrence.sourceContext.subtitleTrackId);
          }
        } else if (openedNow) {
          model.cues = cuesForTrack(model, occurrence.sourceContext.subtitleTrackId);
        }
        const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
        if (video) {
          video.currentTime = occurrence.startMs / 1000;
        }
        rerenderApp(model);
      };
      occurrenceGroup.appendChild(link);

      const contextLine = document.createElement('div');
      contextLine.className = 'occurrence-context';
      // lt-dlf.13 (P5): details hold learner-meaningful provenance only (video, time range, line N);
      // never blob: URLs, content hashes or token/char offsets.
      const videoName = mediaDisplayName(model, occurrence.sourceContext.mediaId, occurrence.sourceContext.mediaPath);
      const lineIndex = cuesForTrack(model, occurrence.sourceContext.subtitleTrackId)
        .findIndex((cue) => cue.id === occurrence.sourceContext.cueId);
      const detailParts = [videoName, `${formatTimeMs(occurrence.startMs)}–${formatTimeMs(occurrence.endMs)}`];
      if (lineIndex >= 0) detailParts.push(`line ${lineIndex + 1}`);
      appendSourceDisclosure(
        contextLine,
        `saved from ${videoName} at ${formatTimeMs(occurrence.startMs)}`,
        detailParts.join(' • '),
      );
      occurrenceGroup.appendChild(contextLine);
      const inContext = occurrenceContext(model, occurrence);
      if (inContext?.status === 'not-loaded') occurrenceGroup.appendChild(renderTranscriptNotLoaded(model, inContext.mediaId));
    }
    card.appendChild(occurrenceGroup);

    // lt-uzo: saving creates the card; this toggles it. Off archives (suspends) it, keeping state and history.
    const pendingEnrolment = pendingEnrolmentFor(model, item.id);
    const inReview = pendingEnrolment ?? reviewCardsForSavedItem(model, item.id).active.length > 0;
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn-secondary saved-review-toggle';
    reviewBtn.textContent = `${inReview ? 'In review ✓' : 'Add to review'}${pendingEnrolment === null ? '' : ' (not saved yet)'}`;
    reviewBtn.setAttribute('aria-pressed', String(inReview));
    reviewBtn.disabled = !inReview && occurrences.length === 0;
    reviewBtn.addEventListener('click', () => {
      if (inReview) archiveReviewCardsForSavedItem(model, item.id);
      else addSavedItemToReview(model, item);
      rerenderApp(model);
    });
    card.appendChild(reviewBtn);
    list.appendChild(card);
  }
  panel.appendChild(list);
  section.appendChild(panel);
  return section;
}

function savedItemNativeLine(model: AppModel, occurrence: { cueId: string; sourceContext: { mediaId: string } } | undefined): string | undefined {
  if (!occurrence?.cueId || !model.nativeTrackId) return undefined;
  const inContext = occurrenceContext(model, { cueId: occurrence.cueId, sourceContext: { mediaId: occurrence.sourceContext.mediaId } });
  return inContext?.status === 'ok' ? inContext.nativeText : undefined;
}

/** lt-uzo: inline 'Add meaning' for items with neither a meaning nor a native cue line (shared with Review reveal). */
export function renderAddMeaning(model: AppModel, savedItemId: string): HTMLElement {
  const form = document.createElement('form');
  form.className = 'add-meaning';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-meaning-input';
  input.placeholder = 'Add meaning';
  input.required = true;
  input.setAttribute('aria-label', 'Add meaning');
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn-secondary';
  save.textContent = 'Save meaning';
  form.append(input, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (setSavedItemMeaning(model, savedItemId, input.value)) rerenderApp(model);
  });
  return form;
}

/**
 * lt-foe.3.1: 'Meaning: x' with an 'Edit meaning' button that swaps to an inline form (shared with Review reveal).
 * Enter saves, Escape cancels; focus moves to the input on open and back to the Edit button afterwards.
 * An empty save clears the meaning and its source.
 */
export function renderMeaningLine(model: AppModel, item: SavedItem, tag: 'div' | 'p', className: string): HTMLElement {
  const line = document.createElement('div');
  line.className = 'meaning-line';
  const editId = `edit-meaning-${item.id}`;
  const inputId = `edit-meaning-input-${item.id}`;
  const label = `Edit meaning for ${item.displayText}`;
  const close = () => {
    model.editingMeaningItemId = null;
    requestFocusAfterRender(model, editId);
    rerenderApp(model);
  };
  if (model.editingMeaningItemId === item.id) {
    const form = document.createElement('form');
    form.className = 'edit-meaning';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = inputId;
    input.className = 'edit-meaning-input';
    input.value = item.meaning ?? '';
    input.setAttribute('aria-label', label);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn-secondary';
    save.textContent = 'Save meaning';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', close);
    const commit = () => {
      setSavedItemMeaning(model, item.id, input.value, { allowClear: true });
      close();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); commit(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    form.append(input, save, cancel);
    line.appendChild(form);
    return line;
  }
  // The meaning element keeps its existing class and exact 'Meaning: x' text; the button is a sibling.
  const text = document.createElement(tag);
  text.className = className;
  text.textContent = `Meaning: ${item.meaning}`;
  line.appendChild(text);
  if (item.meaningSource?.kind === 'dictionary-suggested') {
    const source = document.createElement('span');
    source.className = 'meaning-source-label';
    source.textContent = '(dictionary suggestion)';
    line.appendChild(source);
  }
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.id = editId;
  edit.className = 'btn-secondary edit-meaning-button';
  edit.textContent = 'Edit meaning';
  edit.setAttribute('aria-label', label);
  edit.addEventListener('click', () => {
    model.editingMeaningItemId = item.id;
    requestFocusAfterRender(model, inputId);
    rerenderApp(model);
  });
  line.appendChild(edit);
  return line;
}

const OPERATION_STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  pending: 'not saved yet',
  sending: 'sent, waiting for confirmation (retried with the same change if needed)',
  blocked: 'not applied',
  conflict: 'not applied — changed elsewhere',
  acked: 'saved',
  cancelled: 'discarded',
};

/**
 * lt-192.3: vocabulary changes recorded in this browser but not confirmed by the local service. Each is shown until
 * it is confirmed or explicitly discarded; nothing here is called saved. Loading service state keeps them.
 */
function renderPendingOperations(model: AppModel): HTMLElement | null {
  const records = unresolvedLearnerOperations(model);
  if (records.length === 0 && model.learnerOperations.durable) return null;
  const box = document.createElement('section');
  box.className = 'pending-operations status-banner warning';
  box.setAttribute('aria-label', 'Vocabulary changes not saved yet');
  if (!model.learnerOperations.durable) {
    const warn = document.createElement('p');
    warn.textContent = 'This browser cannot store pending vocabulary changes durably; unsaved changes are lost if the page reloads.';
    box.appendChild(warn);
    if (records.length === 0) return box;
  }
  const title = document.createElement('h3');
  title.textContent = `Not saved yet (${records.length})`;
  box.appendChild(title);
  const list = document.createElement('ul');
  for (const record of records) {
    const li = document.createElement('li');
    li.className = `pending-operation pending-operation-${record.status}`;
    li.dataset.operationId = record.operationId;
    li.append(`${record.label}: ${OPERATION_STATUS_TEXT[record.status]}`);
    if (record.error) li.append(` — ${record.error.message || learnerOperationMessage(record.error.code)}`);
    const action = (label: string, run: () => Promise<boolean>) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-link';
      button.textContent = label;
      button.addEventListener('click', () => { button.disabled = true; void run().finally(() => rerenderApp(model)); });
      li.append(' ', button);
    };
    if (record.status === 'blocked' && ['source-unavailable', 'depends-on-unresolved'].includes(record.error?.code ?? '')) action('Retry', () => retryLearnerOperation(model, record.operationId));
    const reapplicable = record.status === 'conflict'
      ? record.request.kind === 'set-meaning' || record.request.kind === 'set-review-enrolment'
      : record.status === 'blocked' && ['generation-changed', 'incarnation-changed', 'operation-expired', 'invalid-basis'].includes(record.error?.code ?? '');
    if (reapplicable) action(record.status === 'conflict' ? 'Apply mine anyway' : 'Reapply', () => reapplyLearnerOperation(model, record.operationId));
    if (record.status !== 'sending') action('Discard', () => discardLearnerOperation(model, record.operationId));
    list.appendChild(li);
  }
  box.appendChild(list);
  return box;
}

/**
 * lt-192.3 (R3): words saved without the learner's meaning/notes because they were already saved (on this or another
 * device). Shown until explicitly resolved, across reloads and tabs; nothing is applied automatically.
 */
function renderUnappliedDrafts(model: AppModel): HTMLElement | null {
  const records = unappliedDraftOutcomes(model);
  if (records.length === 0) return null;
  const box = document.createElement('section');
  box.className = 'unapplied-drafts status-banner warning';
  box.setAttribute('aria-label', 'Saved words whose meaning or notes were not applied');
  const title = document.createElement('h3');
  title.textContent = `Saved, but your meaning or notes were not applied (${records.length})`;
  box.appendChild(title);
  const list = document.createElement('ul');
  for (const record of records) {
    const draft = record.receipt?.result.unappliedDraft as UnappliedDraft | undefined;
    const open = openDraftFields(record);
    if (!draft || open.length === 0) continue;
    const li = document.createElement('li');
    li.className = 'unapplied-draft';
    li.dataset.operationId = record.operationId;
    const parts: string[] = [];
    if (open.includes('meaning')) parts.push(`your meaning \u201c${draft.meaning}\u201d was not applied (kept ${draft.existingMeaning === null ? 'no meaning' : `\u201c${draft.existingMeaning}\u201d`})`);
    else if (record.draftResolved?.meaning === 'applied') parts.push(`your meaning \u201c${draft.meaning}\u201d was sent as a separate change`);
    if (open.includes('notes')) parts.push(`your notes \u201c${draft.notes}\u201d were not applied (kept ${draft.existingNotes === null ? 'no notes' : `\u201c${draft.existingNotes}\u201d`})`);
    li.append(`${record.label.replace(/^Save /, '')} was already saved: ${parts.join('; ')}.`);
    const action = (label: string, run: () => Promise<boolean>) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-link';
      button.textContent = label;
      button.addEventListener('click', () => {
        button.disabled = true;
        void run().catch((error: unknown) => { model.learnerOperations.message = error instanceof Error ? error.message : 'The change was not stored.'; return false; }).finally(() => rerenderApp(model));
      });
      li.append(' ', button);
    };
    // Meaning and notes are decided separately; applying the meaning never resolves the notes (there is no notes writer).
    if (open.includes('meaning')) {
      action('Use my meaning', () => applyUnappliedDraftMeaning(model, record.operationId));
      action('Keep saved meaning', () => dismissUnappliedDraft(model, record.operationId, 'meaning'));
    }
    if (open.includes('notes')) action('Keep saved notes', () => dismissUnappliedDraft(model, record.operationId, 'notes'));
    list.appendChild(li);
  }
  box.appendChild(list);
  return box;
}
