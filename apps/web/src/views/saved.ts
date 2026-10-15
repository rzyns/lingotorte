import type { AppModel } from '../uiTypes';
import type { SavedItem } from '@lingotorte/domain';
import { formatTimeMs } from '../uiTypes';
import { addSavedItemToReview, addSavedItemsToReview, archiveReviewCardsForSavedItem, nativeTextForCue, reviewCardsForSavedItem, setSavedItemMeaning, setView } from '../model';
import { rerenderApp } from '../appShell.ts';
import { appendSourceDisclosure, compactPathLabel } from '../ui/common.ts';

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

  const allItems = Object.values(model.store.snapshot().savedItems) as SavedItem[];
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
      const meaning = document.createElement('div');
      meaning.className = 'meta meaning';
      meaning.textContent = `Meaning: ${item.meaning}`;
      card.appendChild(meaning);
    } else if (!savedItemNativeLine(model, occurrences[0]?.cueId)) {
      card.appendChild(renderAddMeaning(model, item.id));
    }

    const occurrenceGroup = document.createElement('div');
    occurrenceGroup.className = 'occurrence-group';
    for (const occurrence of occurrences) {
      const link = document.createElement('a');
      link.className = 'occurrence-link';
      link.href = '#';
      const cue = model.store.getCue(occurrence.cueId);
      const cueText = cue?.text ?? occurrence.selectionText;
      link.textContent = `▶ ${formatTimeMs(occurrence.startMs)} — ${cueText}`;
      link.setAttribute('aria-label', `Jump to ${formatTimeMs(occurrence.startMs)} in ${occurrence.sourceContext.mediaPath}`);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        setView(model, 'player');
        model.player.currentTimeMs = occurrence.startMs;
        model.player.activeCueId = occurrence.cueId;
        model.targetTrackId = occurrence.sourceContext.subtitleTrackId;
        model.nativeTrackId = model.currentMedia?.id === occurrence.sourceContext.mediaId ? model.nativeTrackId : null;
        if (model.currentMedia?.id !== occurrence.sourceContext.mediaId) {
          const asset = model.store.getMediaAsset(occurrence.sourceContext.mediaId);
          if (asset) {
            model.currentMedia = asset;
            model.cues = model.store.listCuesForTrack(occurrence.sourceContext.subtitleTrackId);
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
      const tokenSpanText = occurrence.sourceContext.tokenSpan.startToken === occurrence.sourceContext.tokenSpan.endToken - 1
        ? `token ${occurrence.sourceContext.tokenSpan.startToken}`
        : `tokens ${occurrence.sourceContext.tokenSpan.startToken}–${occurrence.sourceContext.tokenSpan.endToken - 1}`;
      // lt-unl: token/char spans are provenance; they stay inside the disclosure, off the primary line.
      appendSourceDisclosure(
        contextLine,
        `saved from ${compactPathLabel(occurrence.sourceContext.mediaPath)} at ${formatTimeMs(occurrence.startMs)}`,
        `${occurrence.sourceContext.mediaPath} • ${tokenSpanText} • chars ${occurrence.sourceContext.charSpan.start}–${occurrence.sourceContext.charSpan.end}`,
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
  const cue = model.store.getCue(cueId);
  if (!cue) return undefined;
  return nativeTextForCue(cue, model.store.getSubtitleTrack(model.nativeTrackId) ?? null, model.store.listCuesForTrack(model.nativeTrackId));
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
