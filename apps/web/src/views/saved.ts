import type { AppModel } from '../uiTypes';
import type { SavedItem } from '@lingotorte/domain';
import { formatTimeMs } from '../uiTypes';
import { addSavedItemToReview, addSavedItemsToReview, archiveReviewCardsForSavedItem, cueById, cuesForTrack, listAllSavedItems, mediaAssetById, occurrenceContext, reviewCardsForSavedItem, setSavedItemMeaning, setView } from '../model';
import { requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { appendSourceDisclosure, mediaDisplayName } from '../ui/common.ts';

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

  // lt-uzo: bulk opt-in for items in this tab lacking an active review card; hidden when there are none.
  const lacking = items.filter((i) => reviewCardsForSavedItem(model, i.id).active.length === 0);
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
    if (item.meaning) {
      card.appendChild(renderMeaningLine(model, item, 'div', 'meta meaning'));
    } else if (!savedItemNativeLine(model, occurrences[0]?.cueId)) {
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
        }
        const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
        if (video) {
          video.currentTime = occurrence.startMs / 1000;
        }
        rerenderApp(model);
      });
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
    }
    card.appendChild(occurrenceGroup);

    // lt-uzo: saving creates the card; this toggles it. Off archives (suspends) it, keeping state and history.
    const inReview = reviewCardsForSavedItem(model, item.id).active.length > 0;
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn-secondary saved-review-toggle';
    reviewBtn.textContent = inReview ? 'In review ✓' : 'Add to review';
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

function savedItemNativeLine(model: AppModel, cueId: string | undefined): string | undefined {
  if (!cueId || !model.nativeTrackId) return undefined;
  return occurrenceContext(model, { cueId })?.nativeText;
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
