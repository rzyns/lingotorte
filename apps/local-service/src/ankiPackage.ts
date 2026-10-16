// lt-dxo: POST /api/export/anki — builds a legacy Anki package (.apkg: collection.anki2 schema 11 + media '{}')
// from note rows computed by the browser mapper. Local file only: no AnkiConnect, no live collection, no AnkiWeb.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ANKI_DEFAULT_DECK, ANKI_GUID_RE, ANKI_MAX_FIELD_CHARS, ANKI_MAX_NOTES, ANKI_TAG_RE, type AnkiNoteRow } from '../../../packages/domain/src/ankiExport.ts';

export const ANKI_EXPORT_ROUTE = '/api/export/anki';
export const ANKI_EXPORT_MAX_BODY_BYTES = 4 * 1024 * 1024;
export const ANKI_MAX_TAGS = 8;
export const ANKI_MAX_DECK_CHARS = 100;
/** Stable ids so re-imports map onto the same notetype/deck (and the GUIDs onto the same notes). */
export const ANKI_NOTETYPE_ID = 1_760_000_000_001;
export const ANKI_DECK_ID = 1_760_000_000_002;
export const ANKI_NOTETYPE_NAME = 'Lingotorte';
export const ANKI_FIELDS = ['Word', 'Meaning', 'Context', 'Notes', 'Attribution'] as const;

export class AnkiValidationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export type ValidatedAnkiExportRequest = Readonly<{ deckName: string; notes: readonly AnkiNoteRow[] }>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) =>
  required.every(k => k in v) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const NOTE_KEYS = ['guid', 'word', 'meaningHtml', 'contextHtml', 'notesHtml', 'attributionHtml', 'tags'] as const;
const fieldOk = (v: unknown, allowEmpty: boolean) => typeof v === 'string' && (allowEmpty || v.length > 0) && v.length <= ANKI_MAX_FIELD_CHARS
  && !/[\u0000-\u0008\u000a-\u001f\u007f]|\t/.test(v);

export function validateAnkiExportRequest(body: unknown): ValidatedAnkiExportRequest {
  if (!isRecord(body) || !exactKeys(body, ['notes'], ['deckName'])) throw new AnkiValidationError('invalid-envelope');
  let deckName = ANKI_DEFAULT_DECK;
  if (body.deckName !== undefined) {
    if (typeof body.deckName !== 'string' || !body.deckName.trim() || body.deckName !== body.deckName.trim() || [...body.deckName].length > ANKI_MAX_DECK_CHARS
      || /[\u0000-\u001f\u007f"]/.test(body.deckName) || body.deckName.includes('::')) throw new AnkiValidationError('invalid-deck-name');
    deckName = body.deckName;
  }
  if (!Array.isArray(body.notes) || body.notes.length === 0) throw new AnkiValidationError('invalid-notes');
  if (body.notes.length > ANKI_MAX_NOTES) throw new AnkiValidationError('too-many-notes');
  const seen = new Set<string>();
  const notes = body.notes.map((n): AnkiNoteRow => {
    if (!isRecord(n) || !exactKeys(n, NOTE_KEYS)) throw new AnkiValidationError('invalid-notes');
    if (typeof n.guid !== 'string' || !ANKI_GUID_RE.test(n.guid) || seen.has(n.guid)) throw new AnkiValidationError('invalid-notes');
    seen.add(n.guid);
    if (!fieldOk(n.word, false)) throw new AnkiValidationError('invalid-notes');
    for (const k of ['meaningHtml', 'contextHtml', 'notesHtml', 'attributionHtml'] as const) if (!fieldOk(n[k], true)) throw new AnkiValidationError('invalid-notes');
    if (!Array.isArray(n.tags) || n.tags.length > ANKI_MAX_TAGS || !n.tags.every(t => typeof t === 'string' && ANKI_TAG_RE.test(t))) throw new AnkiValidationError('invalid-notes');
    return { guid: n.guid, word: n.word as string, meaningHtml: n.meaningHtml as string, contextHtml: n.contextHtml as string,
      notesHtml: n.notesHtml as string, attributionHtml: n.attributionHtml as string, tags: [...n.tags as string[]] };
  });
  return { deckName, notes };
}

/** Anki's sort-field normalisation (approx. stripHTMLMedia) used for sfld and csum. */
export function ankiStripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}
export function ankiChecksum(html: string): number {
  return parseInt(createHash('sha1').update(ankiStripHtml(html), 'utf8').digest('hex').slice(0, 8), 16);
}
export function ankiNoteFields(note: AnkiNoteRow): string[] {
  return [note.word, note.meaningHtml, note.contextHtml, note.notesHtml, note.attributionHtml];
}

const CONTEXT = '{{#Context}}<br><small>{{Context}}</small>{{/Context}}';
const EXTRAS = '{{#Notes}}<br><br><small>{{Notes}}</small>{{/Notes}}{{#Attribution}}<br><br><small>{{Attribution}}</small>{{/Attribution}}';
export const ANKI_TEMPLATES = [
  { name: 'Recognition', qfmt: `{{Word}}${CONTEXT}`, afmt: `{{FrontSide}}\n\n<hr id=answer>\n\n{{Meaning}}${EXTRAS}` },
  // Production front is only {{#Meaning}}…{{/Meaning}}: Anki treats it as empty (no card) when Meaning is empty.
  { name: 'Production', qfmt: '{{#Meaning}}{{Meaning}}{{/Meaning}}', afmt: `{{FrontSide}}\n\n<hr id=answer>\n\n{{Word}}${CONTEXT}${EXTRAS}` },
] as const;

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

function deckJson(id: number, name: string, mod: number) {
  return { id, name, mod, usn: 0, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false,
    desc: '', dyn: 0, conf: 1, extendNew: 0, extendRev: 0 };
}
function collectionJson(deckName: string, mod: number) {
  const model = {
    id: ANKI_NOTETYPE_ID, name: ANKI_NOTETYPE_NAME, type: 0, mod, usn: 0, sortf: 0, did: ANKI_DECK_ID,
    tmpls: ANKI_TEMPLATES.map((t, ord) => ({ name: t.name, ord, qfmt: t.qfmt, afmt: t.afmt, did: null, bqfmt: '', bafmt: '' })),
    flds: ANKI_FIELDS.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
    css: '.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}\n',
    latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}', latexsvg: false, req: [[0, 'any', [0]], [1, 'all', [1]]], tags: [], vers: [],
  };
  const dconf = { id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
    new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
    rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
    lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 } };
  const conf = { activeDecks: [1], curDeck: 1, newSpread: 0, collapseTime: 1200, timeLim: 0, estTimes: true, dueCounts: true, curModel: ANKI_NOTETYPE_ID,
    nextPos: 1, sortType: 'noteFld', sortBackwards: false, addToCur: true };
  return {
    conf: JSON.stringify(conf),
    models: JSON.stringify({ [ANKI_NOTETYPE_ID]: model }),
    decks: JSON.stringify({ 1: deckJson(1, 'Default', mod), [ANKI_DECK_ID]: deckJson(ANKI_DECK_ID, deckName, mod) }),
    dconf: JSON.stringify({ 1: dconf }),
  };
}

// --- STORED (no compression) zip with CRC32, fixed DOS timestamp for byte determinism ---
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function storedZip(entries: readonly { name: string; data: Uint8Array }[]): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  const DOS_TIME = 0; const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01 00:00
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8'); const crc = crc32(entry.data); const size = entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, Buffer.from(entry.data));
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + size;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

export type BuildApkgOptions = Readonly<{ scratchDir: string; now?: number }>;

/** Builds the package in a private temp dir under scratchDir and always removes it. */
export async function buildApkg(request: ValidatedAnkiExportRequest, options: BuildApkgOptions): Promise<Buffer> {
  const nowMs = options.now ?? Date.now();
  const mod = Math.floor(nowMs / 1000);
  const dir = await mkdtemp(join(options.scratchDir, 'anki-'));
  try {
    const dbPath = join(dir, 'collection.anki2');
    const db = new DatabaseSync(dbPath);
    try {
      db.exec('PRAGMA journal_mode = DELETE;');
      db.exec(SCHEMA);
      const json = collectionJson(request.deckName, mod);
      db.prepare('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)')
        .run(mod, nowMs, nowMs, json.conf, json.models, json.decks, json.dconf, '{}');
      const insertNote = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, \'\')');
      const insertCard = db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, \'\')');
      db.exec('BEGIN');
      try {
      let cardId = nowMs;
      request.notes.forEach((note, index) => {
        const noteId = nowMs + index;
        const fields = ankiNoteFields(note);
        insertNote.run(noteId, note.guid, ANKI_NOTETYPE_ID, mod, note.tags.length ? ` ${note.tags.join(' ')} ` : '', fields.join('\x1f'), ankiStripHtml(note.word), ankiChecksum(note.word));
        insertCard.run(cardId++, noteId, ANKI_DECK_ID, 0, mod, index + 1);
        if (note.meaningHtml) insertCard.run(cardId++, noteId, ANKI_DECK_ID, 1, mod, index + 1);
      });
      db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } finally { db.close(); }
    const collection = await readFile(dbPath);
    return storedZip([{ name: 'collection.anki2', data: collection }, { name: 'media', data: Buffer.from('{}', 'utf8') }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
