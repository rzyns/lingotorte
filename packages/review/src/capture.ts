import type { LocalStore, SavedOccurrenceService, SaveSelectionInput } from '@lingotorte/storage';
import type { ReviewCard, SavedItem, SavedOccurrence, UUID } from '@lingotorte/domain';
import type { ReviewService } from './reviewService.ts';

export type CaptureInput = SaveSelectionInput;
/**
 * lt-e0j: what one capture-form save created, so Undo removes exactly that and never a pre-existing item.
 * `isNewItem` false + `isNewOccurrence` true is the lt-cms dedupe path (occurrence added to an existing item).
 * `createdCardId` is set only when this save's lt-uzo ensureCard created the card.
 */
export type CaptureReceipt = Readonly<{
  item: SavedItem;
  occurrence: SavedOccurrence;
  card: ReviewCard;
  isNewItem: boolean;
  isNewOccurrence: boolean;
  /** Set only when this capture created the card. */
  createdCardId: UUID | null;
  /** Capture-time state that undo re-checks before mutating anything. */
  baseline: Readonly<{ itemUpdatedAt: string; itemJson: string; occurrenceCount: number }>;
}>;
/** Card ids the UI is currently showing; undo refuses to touch them. */
export type UndoGuard = Readonly<{ activeCardIds: readonly (UUID | null)[] }>;

export class CaptureService {
  constructor(
    private readonly store: LocalStore,
    private readonly saved: SavedOccurrenceService,
    private readonly review: ReviewService,
    private readonly clock: () => Date,
  ) {}

  capture(input: CaptureInput): CaptureReceipt {
    const result = this.saved.saveSelection(input);
    // lt-uzo: a saved item becomes one recognition card (idempotent per saved item, not per occurrence).
    const cardsBefore = this.cardsFor(result.item.id);
    const card = this.ensureCard(result.item, result.occurrence);
    const createdCardId = cardsBefore.active.length + cardsBefore.archived.length === 0 ? card.id : null;
    const baseline = { itemUpdatedAt: result.item.updatedAt, itemJson: JSON.stringify(this.store.getSavedItem(result.item.id) ?? result.item), occurrenceCount: this.store.listSavedOccurrencesForItem(result.item.id).length };
    return { ...result, card, createdCardId, baseline };
  }

  /**
   * lt-e0j Undo. Refuses (returns false, mutates nothing) unless everything this save created is still untouched:
   * the item's updatedAt and occurrence count match the save-time baseline, the created card is still FSRS 'new' with
   * no review events or practice attempts, it is not the card on screen in Review/Practice, and the occurrence is
   * referenced by no card other than the created one. Under that guarantee nothing else can reference what the save
   * created, so a new item is removed outright (item, its occurrence, the created card and its state) instead of being
   * archived; an archived phantom would otherwise still reach Practice/Export. A dedupe save removes only its own
   * occurrence plus a card it created.
   */
  undo(receipt: CaptureReceipt, guard: UndoGuard): boolean {
    if (!receipt.isNewItem && !receipt.isNewOccurrence) return false;
    if (!this.canUndo(receipt, guard)) return false;
    if (receipt.createdCardId) {
      this.store.removeReviewCard(receipt.createdCardId);
      this.store.removeReviewCardState(receipt.createdCardId);
    }
    this.store.removeSavedOccurrence(receipt.occurrence.id);
    if (receipt.isNewItem) this.store.removeSavedItem(receipt.item.id);
    return true;
  }

  canUndo(receipt: CaptureReceipt, guard: UndoGuard): boolean {
    const item = this.store.getSavedItem(receipt.item.id);
    // updatedAt plus the full record: an edit within the same clock tick still counts as a change.
    if (!item || item.updatedAt !== receipt.baseline.itemUpdatedAt || JSON.stringify(item) !== receipt.baseline.itemJson) return false;
    if (this.store.listSavedOccurrencesForItem(item.id).length !== receipt.baseline.occurrenceCount) return false;
    if (!this.store.getSavedOccurrence(receipt.occurrence.id)) return false;
    const cardId = receipt.createdCardId;
    const cards = Object.values(this.store.snapshot().reviewCards);
    // The occurrence (and, for a new item, the item) may be referenced only by the card this save created.
    if (cards.some((c) => c.id !== cardId && (c.savedOccurrenceId === receipt.occurrence.id || (receipt.isNewItem && c.savedItemId === item.id)))) return false;
    // Practice attempts reference cards only (no occurrence id), so checking the created card covers them.
    if (cardId !== null && this.store.listPracticeAttemptsForCard(cardId).length > 0) return false;
    if (cardId) {
      const card = this.store.getReviewCard(cardId);
      if (!card || card.suspendedAt !== undefined || card.deletedAt !== undefined) return false;
      if (this.store.getReviewCardState(cardId)?.state !== 'new') return false;
      if (this.store.listReviewEventsForCard(cardId).length > 0) return false;
      if (guard.activeCardIds.includes(cardId)) return false;
    }
    return true;
  }

  /** Cards referencing a saved item, split into active (in review) and archived (suspended, history kept). */
  cardsFor(savedItemId: UUID): { active: ReviewCard[]; archived: ReviewCard[] } {
    const cards = Object.values(this.store.snapshot().reviewCards).filter((c) => c.savedItemId === savedItemId && c.deletedAt === undefined);
    return { active: cards.filter((c) => c.suspendedAt === undefined), archived: cards.filter((c) => c.suspendedAt !== undefined) };
  }

  /**
   * lt-uzo: create the item's recognition card unless one already references it. Archived (suspended) cards count:
   * an item the learner took out of review is not silently re-added by saving another occurrence.
   * Returns the existing or new card; the new card starts FSRS 'new', due at the supplied clock.
   * Public solely to preserve model.ensureReviewCardForSavedItem's exported signature during extraction.
   */
  ensureCard(item: SavedItem, occurrence: SavedOccurrence): ReviewCard {
    const { active, archived } = this.cardsFor(item.id);
    const existing = active[0] ?? archived[0];
    if (existing) return existing;
    const now = this.clock().toISOString();
    const { card, state } = this.review.createCard({
      savedItem: item,
      savedOccurrence: occurrence,
      cardType: 'recognition',
      promptTemplate: `Recognize: ${item.displayText}`,
    });
    const stamped = { ...card, createdAt: now };
    this.store.putReviewCard(stamped);
    this.store.putReviewCardState({ ...state, dueAt: now });
    return stamped;
  }

  /** Saved-view toggle off: archive (suspend) the item's active cards. Card, state and review events are kept. */
  archiveCards(savedItemId: UUID): UUID[] {
    const now = this.clock().toISOString();
    const active = this.cardsFor(savedItemId).active;
    if (active.length === 0) return [];
    for (const card of active) this.store.putReviewCard({ ...card, suspendedAt: now });
    return active.map((card) => card.id);
  }

  /** Saved-view toggle on: re-activate the most recent archived card (keeping its schedule), else create one. */
  reactivate(item: SavedItem): ReviewCard | null {
    const { active, archived } = this.cardsFor(item.id);
    if (active[0]) return active[0];
    let result: ReviewCard | null = null;
    const latest = [...archived].sort((a, b) => (b.suspendedAt ?? '').localeCompare(a.suspendedAt ?? ''))[0];
    if (latest) {
      const { suspendedAt: _suspendedAt, ...rest } = latest;
      result = rest;
      this.store.putReviewCard(result);
    } else {
      const occurrence = [...this.saved.listOccurrencesForItem(item.id)]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (occurrence) result = this.ensureCard(item, occurrence);
    }
    return result;
  }

  /** Learner-sourced meaning edit; unchanged re-save keeps provenance; allowClear removes meaning + source. */
  setMeaning(savedItemId: UUID, meaning: string, options: { allowClear?: boolean } = {}): SavedItem | null {
    const item = this.store.getSavedItem(savedItemId);
    const trimmed = meaning.trim();
    if (!item || (!trimmed && !options.allowClear)) return null;
    // An unchanged re-save keeps the existing provenance (e.g. an accepted dictionary suggestion).
    if (trimmed && trimmed === item.meaning) return item;
    const { meaning: _meaning, meaningSource: _source, ...rest } = item;
    const updated: SavedItem = trimmed
      ? { ...rest, meaning: trimmed, meaningSource: { kind: 'learner' }, updatedAt: this.clock().toISOString() }
      : { ...rest, updatedAt: this.clock().toISOString() };
    this.store.putSavedItem(updated);
    return updated;
  }
}
