import type { AppModel } from '../uiTypes';
import { formatDueAt, formatRelativeDue, formatTimeMs } from '../uiTypes';
import {
  listReviewBuckets,
  nativeTextForCue,
  setView,
  submitReviewRating,
  resolveActiveDueCard,
  toggleReviewReveal,
} from '../model';
import { requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { appendSourceDisclosure, mediaDisplayName, renderUnresolvedSource } from '../ui/common.ts';
import { renderAddMeaning, renderMeaningLine } from './saved.ts';

const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
type ReviewRatingName = (typeof REVIEW_RATINGS)[number];

function rateReviewCard(model: AppModel, cardId: string, rating: ReviewRatingName): void {
  submitReviewRating(model, cardId, rating, model.clock());
  model.review.activeCardId = null;
  model.review.revealed = false;
  requestFocusAfterRender(model, 'review-reveal-toggle', 'review-empty');
  rerenderApp(model);
}

/**
 * lt-dlf.4: Review keyboard flow. Space toggles reveal (unless an interactive control has focus, which
 * keeps native activation); 1-4 rate Again/Hard/Good/Easy once revealed. Returns true when handled.
 * Callers have already rejected editable targets and modifier keys.
 */
export function handleReviewShortcut(model: AppModel, event: KeyboardEvent): boolean {
  if (model.view !== 'review') return false;
  // Auto-repeat must not rate successive cards or flicker reveal; swallow repeats of keys we own.
  if (event.repeat) {
    if (['1', '2', '3', '4', ' ', 'Spacebar'].includes(event.key)) { event.preventDefault(); return true; }
    return false;
  }
  // Act on the card the learner is looking at (the rendered one), not a freshly re-resolved one.
  const cardId = model.review.currentCardId;
  if (!cardId || !document.getElementById('review-reveal-toggle')) return false;
  if (event.key === ' ' || event.key === 'Spacebar') {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, [role="button"], a[href], summary, input, select, textarea, [tabindex]:not(body):not(#review-empty)')) return false;
    event.preventDefault();
    toggleReviewReveal(model);
    rerenderApp(model);
    return true;
  }
  const index = ['1', '2', '3', '4'].indexOf(event.key);
  if (index < 0 || !model.review.revealed) return false;
  // lt-foe.3.1: digits typed into a field (meaning edit, Add meaning) are text, not grades.
  const typingTarget = event.target instanceof Element ? event.target : null;
  if (typingTarget?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return false;
  event.preventDefault();
  rateReviewCard(model, cardId, REVIEW_RATINGS[index]!);
  return true;
}

export function renderReviewView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card review-card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Review';
  section.appendChild(h2);

  const asOf = model.clock();
  const buckets = listReviewBuckets(model, asOf);
  const counts = {
    newCards: buckets.newCards.length,
    learning: buckets.learning.length,
    review: buckets.review.length,
    relearning: buckets.relearning.length,
    mastered: buckets.mastered.length,
  };

  section.appendChild(renderBucketTabs(model, counts));

  const active = resolveActiveDueCard(model, asOf);

  if (!active) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.id = 'review-empty';
    empty.tabIndex = -1;
    empty.textContent = 'No cards due right now. All cards, including mastered cards, return when scheduled.';
    section.appendChild(empty);
    return section;
  }

  const { card, savedItem, occurrence, state } = active;
  // lt-0g9: a reveal belongs to the card it was made on, never to the next presented card.
  if (model.review.currentCardId !== card.id) { model.review.currentCardId = card.id; model.review.revealed = false; }
  const currentCue = model.store.getCue(occurrence.cueId);
  const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
  const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
  const nativeText = currentCue ? nativeTextForCue(currentCue, nativeTrack, nativeCues) : undefined;

  const prompt = document.createElement('div');
  prompt.className = 'review-prompt';
  prompt.setAttribute('role', 'alert');
  prompt.setAttribute('aria-live', 'polite');
  prompt.textContent = card.promptTemplate;
  section.appendChild(prompt);

  if (model.review.revealed) {
    const reveal = document.createElement('div');
    reveal.className = 'review-reveal';

    const targetLine = document.createElement('p');
    targetLine.className = 'review-target';
    targetLine.textContent = savedItem.displayText;
    reveal.appendChild(targetLine);

    if (savedItem.meaning) {
      reveal.appendChild(renderMeaningLine(model, savedItem, 'p', 'review-meaning'));
    } else if (!nativeText) {
      // lt-uzo: no meaning and no native line, so front and back would match; offer an inline answer.
      reveal.appendChild(renderAddMeaning(model, savedItem.id));
    }

    if (currentCue) {
      const context = document.createElement('div');
      context.className = 'review-context';
      const time = document.createElement('p');
      time.className = 'meta';
      time.textContent = `Source: ${formatTimeMs(currentCue.startMs)} – ${formatTimeMs(currentCue.endMs)}`;
      context.appendChild(time);
      const targetContext = document.createElement('p');
      targetContext.className = 'review-target-context';
      targetContext.textContent = currentCue.text;
      context.appendChild(targetContext);
      if (nativeText) {
        const nativeContext = document.createElement('p');
        nativeContext.className = 'review-native-context';
        nativeContext.textContent = nativeText;
        context.appendChild(nativeContext);
      }
      const sourceNote = document.createElement('p');
      sourceNote.className = 'meta';
      appendSourceDisclosure(sourceNote, `Video: ${mediaDisplayName(model, occurrence.sourceContext.mediaId, occurrence.sourceContext.mediaPath)}`, occurrence.sourceContext.mediaPath.startsWith('blob:') ? '' : occurrence.sourceContext.mediaPath);
      context.appendChild(sourceNote);
      reveal.appendChild(context);
    } else {
      reveal.appendChild(renderUnresolvedSource(occurrence.sourceContext.mediaPath));
    }
    section.appendChild(reveal);
  }

  const controls = document.createElement('div');
  controls.className = 'review-controls';

  const revealBtn = document.createElement('button');
  revealBtn.className = 'btn-secondary';
  revealBtn.id = 'review-reveal-toggle';
  revealBtn.setAttribute('aria-keyshortcuts', 'Space');
  revealBtn.textContent = model.review.revealed ? 'Hide answer' : 'Show answer / context';
  revealBtn.addEventListener('click', () => {
    toggleReviewReveal(model);
    rerenderApp(model);
  });
  controls.appendChild(revealBtn);

  const replayBtn = document.createElement('button');
  replayBtn.className = 'btn-secondary';
  replayBtn.textContent = 'Replay source line';
  replayBtn.setAttribute('aria-label', 'Jump back to the source line in the player');
  replayBtn.disabled = !currentCue;
  replayBtn.addEventListener('click', () => {
    if (!currentCue) return;
    setView(model, 'player');
    model.player.currentTimeMs = currentCue.startMs;
    model.player.activeCueId = currentCue.id;
    model.player.isPlaying = false;
    const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
    if (video) {
      video.currentTime = currentCue.startMs / 1000;
    }
    rerenderApp(model);
  });
  controls.appendChild(replayBtn);
  section.appendChild(controls);

  if (model.review.revealed) {
    const buttons = document.createElement('div');
    buttons.className = 'review-buttons';
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', 'Rate your recall');
    for (const rating of REVIEW_RATINGS) {
      const btn = document.createElement('button');
      btn.className = rating;
      btn.textContent = rating.charAt(0).toUpperCase() + rating.slice(1);
      btn.setAttribute('aria-label', `Rate ${rating}`);
      btn.dataset.shortcut = String(REVIEW_RATINGS.indexOf(rating) + 1);
      btn.setAttribute('aria-keyshortcuts', btn.dataset.shortcut);
      btn.addEventListener('click', () => rateReviewCard(model, card.id, rating));
      buttons.appendChild(btn);
    }
    section.appendChild(buttons);
  }

  const hint = document.createElement('p');
  hint.className = 'review-shortcut-hint';
  hint.textContent = 'Space: show answer \u00b7 1\u20134: rate (Again, Hard, Good, Easy) \u00b7 ?: all shortcuts';
  section.appendChild(hint);

  const stats = document.createElement('p');
  stats.className = 'meta';
  // lt-uzo review: count only cards in review; archived (suspended) ones are reported separately.
  const allCards = Object.values(model.store.snapshot().reviewCards).filter((card) => !card.deletedAt);
  const totalCards = allCards.filter((card) => !card.suspendedAt).length;
  const archivedCards = allCards.length - totalCards;
  // lt-unl: "next due" is the earliest due instant across cards in review, not the displayed card's.
  const reviewStates = model.store.snapshot().reviewCardStates;
  const nextDueMs = allCards
    .filter((c) => !c.suspendedAt)
    .map((c) => (reviewStates[c.id] ? new Date(reviewStates[c.id]!.dueAt).valueOf() : Number.NaN))
    .filter((ms) => Number.isFinite(ms))
    .reduce((min, ms) => Math.min(min, ms), Number.POSITIVE_INFINITY);
  const nextDue = Number.isFinite(nextDueMs) ? new Date(nextDueMs) : state.dueAt;
  stats.textContent = `${totalCards} card${totalCards === 1 ? '' : 's'} · next due ${formatRelativeDue(nextDue, model.clock())}${archivedCards > 0 ? ` (${archivedCards} archived)` : ''}`;
  section.appendChild(stats);
  // lt-uzo: FSRS state/due are scheduling detail, kept behind a disclosure.
  const scheduling = document.createElement('details');
  scheduling.className = 'meta review-scheduling';
  const summary = document.createElement('summary');
  summary.textContent = 'scheduling';
  const schedulingText = document.createElement('p');
  schedulingText.textContent = `state: ${state.state} • due: ${formatDueAt(state.dueAt)}`;
  scheduling.append(summary, schedulingText);
  section.appendChild(scheduling);

  return section;
}

function renderBucketTabs(
  _model: AppModel,
  counts: Record<'newCards' | 'learning' | 'review' | 'relearning' | 'mastered', number>,
): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'review-buckets';
  tabs.setAttribute('role', 'region');
  tabs.setAttribute('aria-label', 'Review bucket counts');
  const buckets: { id: keyof typeof counts; label: string }[] = [
    { id: 'newCards', label: 'New' },
    { id: 'learning', label: 'Learning' },
    { id: 'review', label: 'Review' },
    { id: 'relearning', label: 'Relearning' },
    { id: 'mastered', label: 'Mastered' },
  ];
  for (const bucket of buckets) {
    const chip = document.createElement('div');
    chip.className = 'bucket-chip';
    const label = document.createElement('span');
    label.className = 'bucket-label';
    label.textContent = bucket.label;
    const count = document.createElement('span');
    count.className = 'bucket-count';
    count.textContent = String(counts[bucket.id]);
    chip.append(label, count);
    tabs.appendChild(chip);
  }
  return tabs;
}
