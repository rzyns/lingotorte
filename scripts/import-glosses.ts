// lt-foe.3.2: stream the Wiktextract (kaikki.org) English-Wiktionary raw dump into a
// derived, separate Polish gloss SQLite database (DECISIONS §16a).
//
//   node scripts/import-glosses.ts --input <dump.jsonl[.gz]> --output <glosses-pl.sqlite> \
//     --dump-date YYYY-MM-DD [--language pl] [--replace]
//
// Gloss choice: Wiktextract `glosses` is a path from the general sense to the specific
// sub-sense (kaikki.org renders the parent once and nests the rest), so each sense stores
// only its LAST element, the most specific gloss. Senses with `form_of` are stored as
// kind 'form-of' pointing at the target lemma so lookups can prefer real lemma glosses.
// The receipt printed to stdout carries counts and hashes only, never gloss text.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { PassThrough } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { GLOSS_ATTRIBUTION, GLOSS_FORMAT_VERSION, glossLemmaKey } from '../packages/language/src/glossStore.ts';

const MAX_GLOSS = 500;
const BATCH = 5000;
const UPOS: Record<string, string> = {
  noun: 'NOUN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', name: 'PROPN', pron: 'PRON', num: 'NUM',
  prep: 'ADP', conj: 'CCONJ', particle: 'PART', intj: 'INTJ', det: 'DET',
};

function fail(message: string): never {
  process.stderr.write(`import-glosses: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  let replace = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--replace') { replace = true; continue; }
    if (!['--input', '--output', '--dump-date', '--language'].includes(arg)) fail(`unknown argument ${JSON.stringify(arg)}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value`);
    values[arg.slice(2)] = value;
    i += 1;
  }
  const { input, output } = values;
  const dumpDate = values['dump-date'];
  const language = values.language ?? 'pl';
  if (!input || !output || !dumpDate) fail('usage: --input <path> --output <path.sqlite> --dump-date YYYY-MM-DD [--language pl] [--replace]');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dumpDate) || !validDate(dumpDate)) fail('--dump-date must be a real YYYY-MM-DD date');
  if (!/^[a-z]{2,3}$/.test(language)) fail('--language must be a 2-3 letter code');
  return { input, output, dumpDate, language, replace };
}

function validDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

type Sense = { glosses?: unknown; tags?: unknown; form_of?: unknown };
type Entry = { word?: unknown; lang_code?: unknown; pos?: unknown; senses?: unknown; redirect?: unknown };

async function main() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.input) || !statSync(args.input).isFile()) fail('input file not found');
  if (!existsSync(dirname(args.output))) fail('output directory does not exist');
  if (existsSync(args.output) && !args.replace) fail('output already exists; pass --replace to overwrite it');

  const temp = join(dirname(args.output), `.${basename(args.output)}.${process.pid}.tmp`);
  rmSync(temp, { force: true });
  let db: DatabaseSync | undefined;
  const cleanup = () => { try { if (db?.isOpen) db.close(); } catch { /* ignore */ } for (const s of ['', '-journal', '-wal', '-shm']) rmSync(temp + s, { force: true }); };
  try {
    db = new DatabaseSync(temp);
    db.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;
      CREATE TABLE gloss_meta(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE gloss_source(id TEXT PRIMARY KEY, name TEXT NOT NULL, licence TEXT NOT NULL, url TEXT NOT NULL,
        attribution TEXT NOT NULL, dump_date TEXT NOT NULL, input_sha256 TEXT NOT NULL, imported_at TEXT NOT NULL,
        entry_count INTEGER NOT NULL, sense_count INTEGER NOT NULL);
      CREATE TABLE gloss_entry(id INTEGER PRIMARY KEY, lemma TEXT NOT NULL, lemma_key TEXT NOT NULL, pos TEXT NOT NULL,
        upos TEXT, entry_idx INTEGER, sense_idx INTEGER, kind TEXT NOT NULL CHECK(kind IN ('gloss','form-of')),
        gloss TEXT NOT NULL, form_of TEXT, tags_json TEXT);`);
    const insert = db.prepare('INSERT INTO gloss_entry(lemma, lemma_key, pos, upos, entry_idx, sense_idx, kind, gloss, form_of, tags_json) VALUES (?,?,?,?,?,?,?,?,?,?)');

    const hash = createHash('sha256');
    const file = createReadStream(args.input);
    file.on('data', (chunk) => hash.update(chunk));
    const text = args.input.endsWith('.gz') ? file.pipe(createGunzip()) : file.pipe(new PassThrough());
    // Surface read and gunzip errors (e.g. a truncated .gz) through the line iterator.
    file.on('error', (error) => text.destroy(error));
    text.on('error', () => { /* rethrown by the readline async iterator */ });
    const lines = createInterface({ input: text, crlfDelay: Infinity });
    const needles = [`"lang_code": "${args.language}"`, `"lang_code":"${args.language}"`];
    const c = { lines: 0, polishLines: 0, malformedLines: 0, entries: 0, senses: 0, glossSenses: 0, formOfSenses: 0, skippedSenses: 0, truncatedGlosses: 0 };
    let pending = 0;
    db.exec('BEGIN');
    for await (const line of lines) {
      c.lines += 1;
      if (!needles.some((n) => line.includes(n))) continue;
      c.polishLines += 1;
      let entry: Entry;
      try { entry = JSON.parse(line) as Entry; } catch { c.malformedLines += 1; continue; }
      if (entry === null || typeof entry !== 'object' || entry.lang_code !== args.language || entry.redirect !== undefined) continue;
      if (typeof entry.word !== 'string' || entry.word.trim() === '' || typeof entry.pos !== 'string' || !Array.isArray(entry.senses)) continue;
      const lemma = entry.word.normalize('NFC');
      const upos = UPOS[entry.pos] ?? null;
      let stored = 0;
      for (const [senseIdx, raw] of (entry.senses as Sense[]).entries()) {
        const glosses = Array.isArray(raw?.glosses) ? raw.glosses.filter((g): g is string => typeof g === 'string' && g.trim() !== '') : [];
        const tags = Array.isArray(raw?.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [];
        if (glosses.length === 0 || tags.includes('no-gloss')) { c.skippedSenses += 1; continue; }
        const full = glosses[glosses.length - 1]!.trim();
        if (full.length > MAX_GLOSS) c.truncatedGlosses += 1;
        const gloss = full.slice(0, MAX_GLOSS);
        const target = Array.isArray(raw.form_of) ? (raw.form_of as { word?: unknown }[]).find((f) => typeof f?.word === 'string' && f.word.trim() !== '')?.word as string | undefined : undefined;
        insert.run(lemma, glossLemmaKey(lemma), entry.pos, upos, c.entries, senseIdx, target ? 'form-of' : 'gloss', gloss,
          target ? target.normalize('NFC') : null, tags.length ? JSON.stringify(tags) : null);
        if (target) c.formOfSenses += 1; else c.glossSenses += 1;
        stored += 1;
        pending += 1;
      }
      if (stored > 0) { c.entries += 1; c.senses += stored; }
      if (pending >= BATCH) { db.exec('COMMIT; BEGIN'); pending = 0; }
    }
    db.exec('COMMIT');
    if (c.entries === 0) throw new UsageError(`no Polish entries found for language "${args.language}"`);

    const inputSha256 = hash.digest('hex');
    const id = `kaikki-enwiktionary-${args.language}-${args.dumpDate}`;
    db.exec('CREATE INDEX gloss_entry_lookup ON gloss_entry(lemma_key, kind)');
    db.prepare('INSERT INTO gloss_meta VALUES (?, ?)').run('format_version', String(GLOSS_FORMAT_VERSION));
    db.prepare('INSERT INTO gloss_source VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, 'English Wiktionary via Wiktextract/kaikki.org',
      'CC BY-SA 4.0 and GFDL', 'https://kaikki.org/dictionary/rawdata.html', GLOSS_ATTRIBUTION, args.dumpDate, inputSha256,
      new Date().toISOString(), c.entries, c.senses);
    db.exec('ANALYZE');
    db.exec('VACUUM');
    const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    if (integrity !== 'ok') throw new UsageError('integrity check failed');
    db.close();
    if (existsSync(args.output) && !args.replace) throw new UsageError('output appeared during import; pass --replace to overwrite it');
    renameSync(temp, args.output);
    process.stdout.write(`${JSON.stringify({ ok: true, sourceId: id, language: args.language, dumpDate: args.dumpDate, inputSha256, ...c, integrity, durationMs: Date.now() - started })}\n`);
  } catch (error) {
    cleanup();
    if (error instanceof UsageError) fail(error.message);
    fail(`import failed (${error instanceof Error ? error.name : 'error'})`);
  }
}

class UsageError extends Error {}

await main();
