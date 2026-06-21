import {
  makeSavedItem,
  makeSavedOccurrence,
  type SavedItem,
  type SavedItemKind,
  type SavedOccurrence,
  type UUID,
} from '@lingotorte/domain';
import type { LocalStore } from './localStore';

export type SaveSelectionInput = Readonly<{
  kind: SavedItemKind;
  language: string;
  displayText: string;
  meaning?: string;
  notes?: string;
  mediaId: UUID;
  cueId: UUID;
  startMs: number;
  endMs: number;
  contextBefore?: string;
  contextAfter?: string;
  sourceContext: SavedOccurrence['sourceContext'];
}>;

export type SavedOccurrenceResult = Readonly<{
  item: SavedItem;
  occurrence: SavedOccurrence;
  isNewItem: boolean;
  isNewOccurrence: boolean;
}>;

function normalizeDisplayText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function occurrenceSourceFingerprint(occurrence: SavedOccurrence): string {
  const sc = occurrence.sourceContext;
  return JSON.stringify({
    mediaId: sc.mediaId,
    cueId: sc.cueId,
    startMs: occurrence.startMs,
    endMs: occurrence.endMs,
    tokenStart: sc.tokenSpan.startToken,
    tokenEnd: sc.tokenSpan.endToken,
    charStart: sc.charSpan.start,
    charEnd: sc.charSpan.end,
  });
}

export class SavedOccurrenceService {
  constructor(private readonly store: LocalStore) {}

  snapshot() {
    return this.store.snapshot();
  }

  private findExistingItem(kind: SavedItemKind, language: string, displayText: string): SavedItem | undefined {
    const normalized = normalizeDisplayText(displayText);
    for (const item of Object.values(this.store.snapshot().savedItems)) {
      if (item.kind === kind && item.language === language && normalizeDisplayText(item.displayText) === normalized && !item.archivedAt) {
        return item;
      }
    }
    return undefined;
  }

  private findExistingOccurrence(itemId: UUID, sourceContext: SavedOccurrence['sourceContext']): SavedOccurrence | undefined {
    const occurrences = this.store.listSavedOccurrencesForItem(itemId);
    const candidateFingerprint = JSON.stringify({
      mediaId: sourceContext.mediaId,
      cueId: sourceContext.cueId,
      startMs: sourceContext.timeRangeMs.start,
      endMs: sourceContext.timeRangeMs.end,
      tokenStart: sourceContext.tokenSpan.startToken,
      tokenEnd: sourceContext.tokenSpan.endToken,
      charStart: sourceContext.charSpan.start,
      charEnd: sourceContext.charSpan.end,
    });
    for (const o of occurrences) {
      if (occurrenceSourceFingerprint(o) === candidateFingerprint) {
        return o;
      }
    }
    return undefined;
  }

  saveSelection(input: SaveSelectionInput): SavedOccurrenceResult {
    const existingItem = this.findExistingItem(input.kind, input.language, input.displayText);
    if (existingItem) {
      const existingOccurrence = this.findExistingOccurrence(existingItem.id, input.sourceContext);
      if (existingOccurrence) {
        return { item: existingItem, occurrence: existingOccurrence, isNewItem: false, isNewOccurrence: false };
      }
      const occurrence = makeSavedOccurrence({
        savedItemId: existingItem.id,
        mediaId: input.mediaId,
        cueId: input.cueId,
        startMs: input.startMs,
        endMs: input.endMs,
        selectionKind: input.kind,
        selectionText: input.displayText,
        ...(input.contextBefore !== undefined ? { contextBefore: input.contextBefore } : {}),
        ...(input.contextAfter !== undefined ? { contextAfter: input.contextAfter } : {}),
        sourceContext: input.sourceContext,
      });
      this.store.putSavedOccurrence(occurrence);
      return { item: existingItem, occurrence, isNewItem: false, isNewOccurrence: true };
    }

    const item = makeSavedItem({
      kind: input.kind,
      language: input.language,
      displayText: input.displayText,
      ...(input.meaning !== undefined ? { meaning: input.meaning } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    const occurrence = makeSavedOccurrence({
      savedItemId: item.id,
      mediaId: input.mediaId,
      cueId: input.cueId,
      startMs: input.startMs,
      endMs: input.endMs,
      selectionKind: input.kind,
      selectionText: input.displayText,
      ...(input.contextBefore !== undefined ? { contextBefore: input.contextBefore } : {}),
      ...(input.contextAfter !== undefined ? { contextAfter: input.contextAfter } : {}),
      sourceContext: input.sourceContext,
    });

    this.store.putSavedItem(item);
    this.store.putSavedOccurrence(occurrence);

    return { item, occurrence, isNewItem: true, isNewOccurrence: true };
  }

  listItems(kind?: SavedItemKind): SavedItem[] {
    const items = Object.values(this.store.snapshot().savedItems);
    if (!kind) return items;
    return items.filter((i) => i.kind === kind && !i.archivedAt);
  }

  listOccurrencesForItem(itemId: UUID): SavedOccurrence[] {
    return this.store.listSavedOccurrencesForItem(itemId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
