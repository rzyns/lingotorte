import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { glossDbPathFromEnv } from '../../apps/local-service/src/nativeConfig.ts';
import { GLOSS_ATTRIBUTION, GlossStoreError, openGlossStore } from '../../packages/language/src/glossStore.ts';

// lt-foe.3.2: Wiktextract -> derived Polish gloss SQLite importer and read-only gloss store.
vi.setConfig({ testTimeout: 60_000 });

const repo = resolve(import.meta.dirname, '../..');
const script = join(repo, 'scripts/import-glosses.ts');
const fixture = join(repo, 'tests/fixtures/gloss/synthetic-wiktextract.jsonl');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { try { chmodSync(root, 0o700); } catch { /* ignore */ } rmSync(root, { recursive: true, force: true }); } });
function tempDir() { const root = mkdtempSync(join(tmpdir(), 'ltfoe32-')); roots.push(root); return root; }
function run(...args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}
function importFixture(extra: string[] = [], input = fixture) {
  const output = join(tempDir(), 'glosses-pl.sqlite');
  const result = run('--input', input, '--output', output, '--dump-date', '2026-10-03', ...extra);
  return { ...result, output };
}
function caught(fn: () => unknown): unknown { try { fn(); } catch (error) { return error; } return undefined; }
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
type Row = Record<string, string | number | null>;
function rows(path: string, sql: string): Row[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return db.prepare(sql).all() as Row[]; } finally { db.close(); }
}

describe('lt-foe.3.2 import-glosses script', () => {
  it('imports only Polish senses with counts, skips, form-of, UPOS and lemma_key', () => {
    const { code, stdout, stderr, output } = importFixture();
    expect(stderr).toBe('');
    expect(code).toBe(0);
    const receipt = JSON.parse(stdout) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      ok: true, language: 'pl', dumpDate: '2026-10-03', inputSha256: sha(fixture),
      polishLines: 18, malformedLines: 1, entries: 14, senses: 15, glossSenses: 13, formOfSenses: 2, skippedSenses: 2, truncatedGlosses: 1, integrity: 'ok',
    });
    expect(typeof receipt.durationMs).toBe('number');
    // Receipt carries no gloss text.
    expect(stdout).not.toMatch(/synthetic|house|feline/);

    const [source] = rows(output, 'SELECT * FROM gloss_source');
    expect(rows(output, 'SELECT count(*) AS n FROM gloss_source')[0]!.n).toBe(1);
    expect(source).toMatchObject({
      id: 'kaikki-enwiktionary-pl-2026-10-03', licence: 'CC BY-SA 4.0 and GFDL', attribution: GLOSS_ATTRIBUTION,
      dump_date: '2026-10-03', input_sha256: sha(fixture), entry_count: 14, sense_count: 15,
    });
    expect(GLOSS_ATTRIBUTION).toBe('Word meanings from English Wiktionary (en.wiktionary.org), © Wiktionary contributors, via Wiktextract/kaikki.org, CC BY-SA 4.0 and GFDL. Filtered to Polish and converted to SQLite.');
    expect(rows(output, "SELECT value FROM gloss_meta WHERE key = 'format_version'")[0]!.value).toBe('1');

    const all = rows(output, 'SELECT lemma, lemma_key, pos, upos, kind, gloss, form_of FROM gloss_entry ORDER BY id');
    expect(all.some((r) => /czech|english|german/.test(String(r.gloss)))).toBe(false);
    expect(all.filter((r) => r.lemma === 'dom').map((r) => r.gloss)).toEqual(['house (synthetic)', 'home (synthetic)']);
    expect(all.find((r) => r.lemma === 'domu')).toMatchObject({ kind: 'form-of', form_of: 'dom', upos: 'NOUN' });
    expect(all.find((r) => r.lemma === 'Żółw')).toMatchObject({ lemma_key: 'żółw', upos: 'PROPN' });
    expect(all.find((r) => r.lemma === 'iść')!.gloss).toBe('to walk on foot (synthetic)');
    expect(all.find((r) => r.lemma === 'w')!.upos).toBe('ADP');
    expect(all.find((r) => r.lemma === 'i')!.upos).toBe('CCONJ');
    expect(all.find((r) => r.lemma === 'dziwny')!.upos).toBeNull();
    expect(all.some((r) => r.lemma === 'nic' || r.lemma === 'pusty')).toBe(false);
    // A non-Polish entry whose nested translations mention lang_code "pl" is not imported.
    expect(all.some((r) => r.lemma === 'house' || /shelter|synthetic english/.test(String(r.gloss)))).toBe(false);
    const long = all.find((r) => r.lemma === 'długi')!;
    expect(String(long.gloss)).toHaveLength(500);
    expect(readdirSync(join(output, '..'))).toEqual(['glosses-pl.sqlite']);
  });

  it('reads .gz input, hashing the compressed bytes', () => {
    const gz = join(tempDir(), 'raw.jsonl.gz');
    writeFileSync(gz, gzipSync(readFileSync(fixture)));
    const { code, stdout } = importFixture([], gz);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ senses: 15, inputSha256: sha(gz) });
  });

  it('refuses to overwrite unless --replace and leaves no temp file', () => {
    const first = importFixture();
    expect(first.code).toBe(0);
    const before = sha(first.output);
    const again = run('--input', fixture, '--output', first.output, '--dump-date', '2026-10-03');
    expect(again.code).not.toBe(0);
    expect(again.stderr).toMatch(/exists.*--replace/);
    expect(sha(first.output)).toBe(before);
    const replaced = run('--input', fixture, '--output', first.output, '--dump-date', '2026-10-04', '--replace');
    expect(replaced.code).toBe(0);
    expect(rows(first.output, 'SELECT dump_date FROM gloss_source')[0]!.dump_date).toBe('2026-10-04');
    expect(readdirSync(join(first.output, '..'))).toEqual(['glosses-pl.sqlite']);
  });

  it('fails path-free with exit 2 on a truncated .gz and leaves no temp files', () => {
    const dir = tempDir();
    const gz = join(dir, 'raw.jsonl.gz');
    const full = gzipSync(readFileSync(fixture));
    writeFileSync(gz, full.subarray(0, Math.floor(full.length / 2)));
    const outDir = tempDir();
    const output = join(outDir, 'glosses-pl.sqlite');
    const result = run('--input', gz, '--output', output, '--dump-date', '2026-10-03');
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/^import-glosses: /);
    expect(result.stderr).not.toContain(dir);
    expect(result.stderr).not.toContain(outDir);
    expect(result.stdout).toBe('');
    expect(readdirSync(outDir)).toEqual([]);
  });

  it('fails clearly on bad args, a missing file and zero Polish entries', () => {
    expect(run('--input', fixture).code).not.toBe(0);
    const badDate = importFixture(['--dump-date', 'yesterday']);
    expect(badDate.code).not.toBe(0);
    expect(run('--input', fixture, '--output', join(tempDir(), 'x.sqlite'), '--dump-date', '2026-13-40').stderr).toMatch(/dump-date/);
    const missing = run('--input', join(tempDir(), 'absent.jsonl'), '--output', join(tempDir(), 'x.sqlite'), '--dump-date', '2026-10-03');
    expect(missing.code).not.toBe(0);
    expect(missing.stderr).toMatch(/input file/i);
    const noPolish = join(tempDir(), 'en.jsonl');
    writeFileSync(noPolish, '{"word":"house","lang_code":"en","pos":"noun","senses":[{"glosses":["x"]}]}\n');
    const none = importFixture([], noPolish);
    expect(none.code).not.toBe(0);
    expect(none.stderr).toMatch(/no Polish entries/i);
    expect(existsSync(none.output)).toBe(false);
    expect(readdirSync(join(none.output, '..'))).toEqual([]);
  });
});

describe('lt-foe.3.2 gloss store', () => {
  function store() { return openGlossStore(importFixture().output); }

  it('returns real glosses ordered by UPOS match, then entry and sense order', () => {
    const glosses = store();
    const [dom, kotVerb, kotNone] = glosses.lookup([{ lemma: 'Dom' }, { lemma: 'kot', upos: 'VERB' }, { lemma: 'kot' }]);
    expect(dom).toMatchObject({ lemma: 'Dom', found: true, via: 'lemma' });
    expect(dom!.senses.map((s) => s.gloss)).toEqual(['house (synthetic)', 'home (synthetic)']);
    expect(kotVerb!.senses.map((s) => s.upos)).toEqual(['VERB', 'NOUN']);
    expect(kotNone!.senses.map((s) => s.upos)).toEqual(['NOUN', 'VERB']);
    expect(glosses.lookup([{ lemma: 'żółw', upos: 'PROPN' }])[0]!.senses[0]!.lemma).toBe('Żółw');
    expect(glosses.lookup([{ lemma: 'dom' }], { maxSenses: 1 })[0]!.senses).toHaveLength(1);
    glosses.close();
  });

  it('resolves form-of pointers one hop and reports unknown lemmas', () => {
    const glosses = store();
    const [domu, unknown] = glosses.lookup([{ lemma: 'domu' }, { lemma: 'nieznany' }]);
    expect(domu).toMatchObject({ found: true, via: 'form-of', formOf: 'dom' });
    expect(domu!.senses[0]!.gloss).toBe('house (synthetic)');
    expect(unknown).toEqual({ lemma: 'nieznany', found: false, via: null, senses: [] });
    expect(glosses.source()).toMatchObject({ id: 'kaikki-enwiktionary-pl-2026-10-03', attribution: GLOSS_ATTRIBUTION, entryCount: 14, senseCount: 15 });
    glosses.close();
  });

  it('is read-only', () => {
    const { output } = importFixture();
    const glosses = openGlossStore(output);
    glosses.close();
    const db = new DatabaseSync(output, { readOnly: true });
    expect(() => db.exec("DELETE FROM gloss_entry")).toThrow();
    db.close();
  });

  it('fails with typed, path-free errors for missing or invalid databases', () => {
    const dir = tempDir();
    const missing = join(dir, 'nope.sqlite');
    const err = caught(() => openGlossStore(missing));
    expect(err).toBeInstanceOf(GlossStoreError);
    expect((err as GlossStoreError).code).toBe('missing');
    expect((err as Error).message).not.toContain(dir);

    const garbage = join(dir, 'garbage.sqlite');
    writeFileSync(garbage, 'not a database at all, just text padding '.repeat(20));
    expect(() => openGlossStore(garbage)).toThrow(expect.objectContaining({ code: 'invalid' }));

    const wrong = join(dir, 'wrong.sqlite');
    const db = new DatabaseSync(wrong);
    db.exec("CREATE TABLE gloss_meta(key TEXT PRIMARY KEY, value TEXT); INSERT INTO gloss_meta VALUES ('format_version','2')");
    db.close();
    const wrongErr = caught(() => openGlossStore(wrong)) as GlossStoreError;
    expect(wrongErr.code).toBe('invalid');
    expect(wrongErr.message).not.toContain(dir);
  });
});

describe('lt-foe.3.2 gloss path config', () => {
  it('uses LINGOTORTE_GLOSS_DB_PATH or a default beside the data directory', () => {
    expect(glossDbPathFromEnv({ LINGOTORTE_GLOSS_DB_PATH: '/dictionary/glosses-pl.sqlite' }, 'linux', '/home/x')).toBe('/dictionary/glosses-pl.sqlite');
    expect(glossDbPathFromEnv({ LINGOTORTE_DATA_DIR: '/state' }, 'linux', '/home/x')).toBe('/state/glosses-pl.sqlite');
    expect(() => glossDbPathFromEnv({ LINGOTORTE_GLOSS_DB_PATH: 'relative.sqlite' }, 'linux', '/home/x')).toThrow();
  });
});
