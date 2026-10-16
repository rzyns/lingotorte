// lt-dxo: pure mapper from Lingotorte saved items to Anki note rows, plus the Anki text-import (.txt) writer.
// Export-only: no AnkiConnect, no live collection, no AnkiWeb. Lingotorte stays the canonical review state.
// Not exported: media/audio, file names/paths, timestamps, review/FSRS state, hashes, ids other than the note GUID.
import type { SavedItem, SavedOccurrence } from './coreTypes.ts';
import { DICTIONARY_ATTRIBUTION, sha256HexBytes } from './exportManifest.ts';

export const ANKI_DEFAULT_DECK = 'Lingotorte';
export const ANKI_MAX_NOTES = 5000;
/** Per-field cap (characters, after HTML escaping) shared by the client mapper and the local-service validator. */
export const ANKI_MAX_FIELD_CHARS = 20_000;
export const ANKI_GUID_RE = /^lt[0-9a-f]{20}$/;
export const ANKI_TAG_RE = /^[a-z0-9_-]{1,32}$/;

/** All *Html fields are already HTML: learner text is escaped; the only markup is <b>, <br>, <small>. */
export type AnkiNoteRow = Readonly<{
  guid: string;
  word: string;
  meaningHtml: string;
  contextHtml: string;
  notesHtml: string;
  attributionHtml: string;
  tags: readonly string[];
}>;

export type AnkiExportPlan = Readonly<{
  notes: readonly AnkiNoteRow[];
  noteCount: number;
  /** Recognition for every note, production only when the note has a meaning. */
  cardCount: number;
  excludedArchived: number;
  hasDictionaryMeaning: boolean;
}>;

/** Escape learner text for an HTML field; tabs become spaces and line breaks become <br> so no raw tab/newline survives. */
export function ankiEscapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/\u001f/g, ' ').replace(/\t/g, ' ').replace(/\r\n|\r|\n/g, '<br>')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001e\u007f]/g, '');
}

/** Stable per saved item across exports: 'lt' + first 20 hex chars of sha256(savedItem.id). */
export function ankiGuidFor(savedItemId: string): string {
  return `lt${sha256HexBytes(new TextEncoder().encode(`lingotorte-anki:${savedItemId}`)).slice(0, 20)}`;
}

const byCreated = <T extends { createdAt: string; id: string }>(a: T, b: T) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Resolves a cue id to its current subtitle text (the app's saved occurrences reference cues, not copied text). */
export type AnkiCueTextLookup = (cueId: string) => string | undefined;

/**
 * Context = the item's EARLIEST saved occurrence (createdAt, then id): the sentence the learner first met it in.
 * Primary: the cue text with sourceContext.charSpan wrapped in <b> (the app never stores contextBefore/After).
 * Fallback when the cue is unavailable or the span does not fit: contextBefore + <b>selectionText</b> + contextAfter.
 * Every part is escaped before the <b> is added.
 */
function contextHtmlFor(occurrences: readonly SavedOccurrence[], cueText?: AnkiCueTextLookup): string {
  const first = [...occurrences].sort(byCreated)[0];
  if (!first) return '';
  const text = cueText?.(first.cueId);
  const span = first.sourceContext?.charSpan;
  if (text !== undefined && span && Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.start < span.end && span.end <= text.length) {
    return `${ankiEscapeHtml(text.slice(0, span.start))}<b>${ankiEscapeHtml(text.slice(span.start, span.end))}</b>${ankiEscapeHtml(text.slice(span.end))}`;
  }
  const before = ankiEscapeHtml(first.contextBefore ?? '');
  const after = ankiEscapeHtml(first.contextAfter ?? '');
  const selection = ankiEscapeHtml(first.selectionText);
  if (!before && !after) return selection ? `<b>${selection}</b>` : '';
  return `${before}<b>${selection}</b>${after}`;
}

export function buildAnkiExportPlan(savedItems: readonly SavedItem[], savedOccurrences: readonly SavedOccurrence[], cueText?: AnkiCueTextLookup): AnkiExportPlan {
  const byItem = new Map<string, SavedOccurrence[]>();
  for (const occurrence of savedOccurrences) {
    const list = byItem.get(occurrence.savedItemId) ?? [];
    list.push(occurrence);
    byItem.set(occurrence.savedItemId, list);
  }
  const active = savedItems.filter(item => !item.archivedAt);
  const notes = [...active].sort(byCreated).map((item): AnkiNoteRow => {
    const meaning = item.meaning?.trim() ? item.meaning : '';
    return {
      guid: ankiGuidFor(item.id),
      word: ankiEscapeHtml(item.displayText),
      meaningHtml: ankiEscapeHtml(meaning),
      contextHtml: contextHtmlFor(byItem.get(item.id) ?? [], cueText),
      notesHtml: ankiEscapeHtml(item.notes?.trim() ? item.notes : ''),
      attributionHtml: meaning && item.meaningSource?.kind === 'dictionary-suggested' ? ankiEscapeHtml(DICTIONARY_ATTRIBUTION) : '',
      tags: ['lingotorte', item.kind],
    };
  });
  return {
    notes,
    noteCount: notes.length,
    cardCount: notes.reduce((sum, note) => sum + (note.meaningHtml ? 2 : 1), 0),
    excludedArchived: savedItems.length - active.length,
    hasDictionaryMeaning: notes.some(note => note.attributionHtml !== ''),
  };
}

/** Back side shared by both formats: meaning, notes, attribution (empty parts skipped). */
export function ankiBackHtml(note: AnkiNoteRow): string {
  return [note.meaningHtml, note.notesHtml && `<small>${note.notesHtml}</small>`, note.attributionHtml && `<small>${note.attributionHtml}</small>`]
    .filter(Boolean).join('<br><br>');
}

/**
 * Anki 2.1.55+ text import for the BUILT-IN 'Basic (optional reversed card)' notetype (Front, Back, Add Reverse).
 * Front = word (+ <br><small>context</small>); Back = meaning/notes/attribution, or notes/em dash without a meaning;
 * Add Reverse = 'y' only with a meaning. LF line endings; fields never contain a raw tab or newline.
 */
export function buildAnkiTextExport(notes: readonly AnkiNoteRow[], deckName = ANKI_DEFAULT_DECK): string {
  const deck = deckName.replace(/[\t\r\n\u0000-\u001f]/g, ' ').trim() || ANKI_DEFAULT_DECK;
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic (optional reversed card)',
    `#deck:${deck}`,
    '#guid column:1',
    '#tags column:5',
    '#columns:GUID\tFront\tBack\tAdd Reverse\tTags',
  ];
  for (const note of notes) {
    const front = note.contextHtml ? `${note.word}<br><small>${note.contextHtml}</small>` : note.word;
    const back = note.meaningHtml ? ankiBackHtml(note) : (note.notesHtml ? `<small>${note.notesHtml}</small>` : '\u2014');
    lines.push([note.guid, front, back, note.meaningHtml ? 'y' : '', note.tags.join(' ')].join('\t'));
  }
  return `${lines.join('\n')}\n`;
}
