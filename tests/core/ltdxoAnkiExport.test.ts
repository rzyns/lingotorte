import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ankiGuidFor, buildAnkiExportPlan, buildAnkiTextExport, DICTIONARY_ATTRIBUTION, type SavedItem, type SavedOccurrence } from '../../packages/domain/src';
import { ANKI_DECK_ID, ANKI_EXPORT_ROUTE, ANKI_NOTETYPE_ID, buildApkg, crc32, validateAnkiExportRequest } from '../../apps/local-service/src/ankiPackage.ts';
import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';

// lt-dxo: Anki file export (mapper, .txt golden, .apkg readback, route). Synthetic fixture only.
vi.setConfig({ testTimeout: 60_000 });
const repo = resolve(import.meta.dirname, '../..');
const input = JSON.parse(readFileSync(join(repo, 'tests/fixtures/anki/synthetic-anki-input.json'), 'utf8')) as { savedItems: SavedItem[]; savedOccurrences: SavedOccurrence[] };
const plan = () => buildAnkiExportPlan(input.savedItems, input.savedOccurrences);
const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
const temp = () => { const r = mkdtempSync(join(tmpdir(), 'ltdxo-')); roots.push(r); return r; };

function readStoredZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(0);
  const count = buf.readUInt16LE(end + 10); let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    expect(buf.readUInt16LE(p + 10)).toBe(0); // STORED
    const crc = buf.readUInt32LE(p + 16); const size = buf.readUInt32LE(p + 20); const nameLen = buf.readUInt16LE(p + 28); const off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    expect(buf.readUInt32LE(off)).toBe(0x04034b50);
    const dataStart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

describe('lt-dxo Anki mapper', () => {
  it('excludes archived items, orders by createdAt then id, and counts cards', () => {
    const p = plan();
    expect(p.notes.map(n => n.guid)).toEqual(['1', '2', '3', '5'].map(i => ankiGuidFor(`10000000-0000-4000-8000-00000000000${i}`)));
    expect(p).toMatchObject({ noteCount: 4, cardCount: 6, excludedArchived: 1, hasDictionaryMeaning: true });
    expect(JSON.stringify(p.notes)).not.toContain('stare');
  });
  it('escapes all learner text, neutralises tabs/newlines and highlights the earliest occurrence', () => {
    const [kot, script] = plan().notes;
    expect(kot!.contextHtml).toBe('Ten <b>kot</b> &amp; &#39;pies&#39; śpi.');
    expect(kot!.notesHtml).toBe('Line one<br>Line two &amp; &lt;i&gt;three&lt;/i&gt;');
    expect(script!.word).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(script!.contextHtml).toBe('a b <b>&lt;script&gt;</b>');
    for (const n of plan().notes) for (const v of Object.values(n)) if (typeof v === 'string') expect(v).not.toMatch(/[\t\n\r]/);
  });
  it('adds attribution only for dictionary-suggested meanings and exports no source/media metadata', () => {
    const notes = plan().notes;
    expect(notes[0]!.attributionHtml).toContain('Wiktionary');
    expect(notes[0]!.attributionHtml).toBe(DICTIONARY_ATTRIBUTION.replace(/&/g, '&amp;'));
    expect(notes.slice(1).every(n => n.attributionHtml === '')).toBe(true);
    const json = JSON.stringify(notes);
    for (const leak of ['secret-name', 'fixtures/media', '2026-10', '10000000-', '20000000-', 'sha256']) expect(json).not.toContain(leak);
    expect(notes.map(n => n.tags)).toEqual([['lingotorte', 'word'], ['lingotorte', 'word'], ['lingotorte', 'phrase'], ['lingotorte', 'word']]);
  });
  it('derives stable, non-UUID guids', () => {
    expect(ankiGuidFor('abc')).toBe(ankiGuidFor('abc'));
    expect(ankiGuidFor('abc')).not.toBe(ankiGuidFor('abd'));
    expect(ankiGuidFor('abc')).toMatch(/^lt[0-9a-f]{20}$/);
    expect(plan().notes.map(n => n.guid)).toEqual(plan().notes.map(n => n.guid));
  });
  it('matches the checked-in .txt golden (LF)', () => {
    const expected = readFileSync(join(repo, 'tests/fixtures/anki/synthetic-anki-expected.txt'), 'utf8');
    expect(expected).not.toContain('\r');
    expect(buildAnkiTextExport(plan().notes)).toBe(expected);
  });
});

describe('lt-dxo .apkg package', () => {
  async function readBack(bytes: Buffer) {
    const entries = readStoredZip(bytes);
    expect([...entries.keys()]).toEqual(['collection.anki2', 'media']);
    expect(entries.get('media')!.toString('utf8')).toBe('{}');
    const path = join(temp(), 'collection.anki2');
    writeFileSync(path, entries.get('collection.anki2')!);
    return new DatabaseSync(path, { readOnly: true });
  }
  it('reads back as a valid schema-11 collection with the Lingotorte notetype, notes and cards', async () => {
    const scratch = temp();
    const notes = plan().notes;
    const bytes = await buildApkg(validateAnkiExportRequest({ notes }), { scratchDir: scratch, now: 1_760_000_000_000 });
    expect(await readdir(scratch)).toEqual([]);
    const db = await readBack(bytes);
    try {
      const col = db.prepare('SELECT * FROM col').all() as any[];
      expect(col).toHaveLength(1);
      expect(col[0].ver).toBe(11);
      const models = JSON.parse(col[0].models); const decks = JSON.parse(col[0].decks);
      JSON.parse(col[0].dconf); JSON.parse(col[0].conf);
      const model = models[String(ANKI_NOTETYPE_ID)];
      expect(model.name).toBe('Lingotorte');
      expect(model.flds.map((f: any) => f.name)).toEqual(['Word', 'Meaning', 'Context', 'Notes', 'Attribution']);
      expect(model.tmpls.map((t: any) => t.name)).toEqual(['Recognition', 'Production']);
      expect(decks[String(ANKI_DECK_ID)].name).toBe('Lingotorte');
      const rows = db.prepare('SELECT * FROM notes ORDER BY id').all() as any[];
      expect(rows).toHaveLength(4);
      rows.forEach((row, i) => {
        const n = notes[i]!;
        expect(row.guid).toBe(n.guid);
        expect(row.mid).toBe(ANKI_NOTETYPE_ID);
        expect(String(row.flds).split('\x1f')).toEqual([n.word, n.meaningHtml, n.contextHtml, n.notesHtml, n.attributionHtml]);
        const stripped = String(row.sfld);
        expect(row.csum).toBe(parseInt(createHash('sha1').update(stripped).digest('hex').slice(0, 8), 16));
        const cards = db.prepare('SELECT ord, did FROM cards WHERE nid = ? ORDER BY ord').all(row.id) as any[];
        expect(cards.map(c => c.ord)).toEqual(n.meaningHtml ? [0, 1] : [0]);
        expect(cards.every(c => c.did === ANKI_DECK_ID)).toBe(true);
      });
      expect(rows[1].sfld).toBe('<script>alert("x")</script>');
      expect((db.prepare('SELECT count(*) c FROM cards').get() as any).c).toBe(6);
      expect((db.prepare('SELECT count(*) c FROM revlog').get() as any).c).toBe(0);
    } finally { db.close(); }
  });
  it('is stable across builds (guids and, with the same clock, bytes)', async () => {
    const notes = plan().notes;
    const a = await buildApkg(validateAnkiExportRequest({ notes }), { scratchDir: temp(), now: 1 });
    const b = await buildApkg(validateAnkiExportRequest({ notes: plan().notes }), { scratchDir: temp(), now: 9_999 });
    const guids = async (bytes: Buffer) => { const db = await readBack(bytes); try { return (db.prepare('SELECT guid FROM notes ORDER BY id').all() as any[]).map(r => r.guid); } finally { db.close(); } };
    expect(await guids(a)).toEqual(await guids(b));
    const c = await buildApkg(validateAnkiExportRequest({ notes }), { scratchDir: temp(), now: 1 });
    expect(c.equals(a)).toBe(true);
  });
  it('validates strictly', () => {
    const note = plan().notes[0]!;
    const bad = (body: unknown, code: string) => expect(() => validateAnkiExportRequest(body)).toThrow(code);
    bad({ notes: [note], extra: 1 }, 'invalid-envelope');
    bad({ notes: [] }, 'invalid-notes');
    bad({ notes: [{ ...note, mediaPath: 'x' }] }, 'invalid-notes');
    bad({ notes: [{ ...note, word: 3 }] }, 'invalid-notes');
    bad({ notes: [{ ...note, word: '' }] }, 'invalid-notes');
    bad({ notes: [{ ...note, notesHtml: 'a\tb' }] }, 'invalid-notes');
    bad({ notes: [{ ...note, guid: 'raw-uuid' }] }, 'invalid-notes');
    bad({ notes: [note, note] }, 'invalid-notes');
    bad({ notes: [{ ...note, meaningHtml: 'x'.repeat(20_001) }] }, 'invalid-notes');
    bad({ notes: [{ ...note, tags: ['has space'] }] }, 'invalid-notes');
    bad({ notes: Array.from({ length: 5001 }, (_, i) => ({ ...note, guid: ankiGuidFor(String(i)) })) }, 'too-many-notes');
    bad({ notes: [note], deckName: 'a\nb' }, 'invalid-deck-name');
    expect(validateAnkiExportRequest({ notes: [note], deckName: 'Polish' }).deckName).toBe('Polish');
  });
});

describe('lt-dxo POST /api/export/anki', () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });
  async function start() {
    const root = await mkdtemp(join(tmpdir(), 'ltdxo-svc-'));
    const service = await startPairedService({ host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'),
      scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
    return service;
  }
  const post = (origin: string, body: unknown) => pairedFetch(`${origin}${ANKI_EXPORT_ROUTE}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('returns the package bytes as an attachment', async () => {
    const service = await start();
    const res = await post(service.origin, { notes: plan().notes });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="lingotorte.apkg"');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect([...readStoredZip(bytes).keys()]).toEqual(['collection.anki2', 'media']);
  });
  it('rejects unknown keys, bad notes, oversize bodies and unpaired callers', async () => {
    const service = await start();
    const r1 = await post(service.origin, { notes: plan().notes, media: {} });
    expect([r1.status, await r1.json()]).toEqual([400, { ok: false, error: 'invalid-envelope' }]);
    const r2 = await post(service.origin, { notes: [{ ...plan().notes[0], id: 'x' }] });
    expect(r2.status).toBe(400);
    const big = JSON.stringify({ notes: [{ ...plan().notes[0], notesHtml: 'x'.repeat(4 * 1024 * 1024) }] });
    const r3 = await post(service.origin, big);
    expect(r3.status).toBe(413);
    const r4 = await fetch(`${service.origin}${ANKI_EXPORT_ROUTE}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: plan().notes }) });
    expect(r4.status).toBe(401);
    const r5 = await pairedFetch(`${service.origin}${ANKI_EXPORT_ROUTE}`);
    expect(r5.status).toBe(405);
  });
});
