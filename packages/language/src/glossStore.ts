import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// lt-foe.3.2: read-only access to the derived Polish gloss database built by
// scripts/import-glosses.ts (DECISIONS §16a). Local file only; no network.

export const GLOSS_FORMAT_VERSION = 1;
export const GLOSS_ATTRIBUTION = 'Word meanings from English Wiktionary (en.wiktionary.org), © Wiktionary contributors, via Wiktextract/kaikki.org, CC BY-SA 4.0 and GFDL. Filtered to Polish and converted to SQLite.';

/** NFC + Polish-aware lowercase; shared by the importer and lookups. */
export function glossLemmaKey(lemma: string): string {
  return lemma.normalize('NFC').toLocaleLowerCase('pl');
}

export type GlossStoreErrorCode = 'missing' | 'invalid';
/** Typed failure; messages never include filesystem paths or SQLite internals. */
export class GlossStoreError extends Error {
  readonly code: GlossStoreErrorCode;
  constructor(code: GlossStoreErrorCode, message: string) {
    super(message);
    this.name = 'GlossStoreError';
    this.code = code;
  }
}

export type GlossSource = Readonly<{
  id: string; name: string; licence: string; url: string; attribution: string;
  dumpDate: string; inputSha256: string; importedAt: string; entryCount: number; senseCount: number;
}>;
export type GlossSense = Readonly<{ lemma: string; pos: string; upos: string | null; gloss: string; tags: readonly string[] }>;
export type GlossLookupResult = Readonly<{
  lemma: string;
  found: boolean;
  /** 'lemma': real glosses for the requested lemma; 'form-of': one hop through an inflected-form pointer. */
  via: 'lemma' | 'form-of' | null;
  formOf?: string;
  senses: readonly GlossSense[];
}>;
export type GlossQuery = Readonly<{ lemma: string; upos?: string }>;
export interface GlossStore {
  lookup(lemmas: readonly GlossQuery[], options?: { maxSenses?: number }): GlossLookupResult[];
  source(): GlossSource;
  close(): void;
}

type SenseRow = { lemma: string; pos: string; upos: string | null; gloss: string; tags_json: string | null };

export function openGlossStore(path: string): GlossStore {
  if (!existsSync(path)) throw new GlossStoreError('missing', 'Gloss database is not installed.');
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch {
    throw new GlossStoreError('invalid', 'Gloss database cannot be opened.');
  }
  let source: GlossSource;
  try {
    const meta = db.prepare("SELECT value FROM gloss_meta WHERE key = 'format_version'").get() as { value?: string } | undefined;
    if (meta?.value !== String(GLOSS_FORMAT_VERSION)) throw new Error('format');
    const sources = db.prepare('SELECT * FROM gloss_source').all() as Record<string, string | number>[];
    if (sources.length !== 1) throw new Error('source');
    const row = sources[0]!;
    source = Object.freeze({
      id: String(row.id), name: String(row.name), licence: String(row.licence), url: String(row.url),
      attribution: String(row.attribution), dumpDate: String(row.dump_date), inputSha256: String(row.input_sha256),
      importedAt: String(row.imported_at), entryCount: Number(row.entry_count), senseCount: Number(row.sense_count),
    });
    db.prepare('SELECT 1 FROM gloss_entry LIMIT 1').all();
  } catch {
    db.close();
    throw new GlossStoreError('invalid', 'Gloss database has an unsupported format.');
  }
  const glossStmt = db.prepare(`SELECT lemma, pos, upos, gloss, tags_json FROM gloss_entry
    WHERE lemma_key = ? AND kind = 'gloss'
    ORDER BY CASE WHEN upos IS NOT NULL AND upos = ? THEN 0 ELSE 1 END, entry_idx, sense_idx LIMIT ?`);
  const formStmt = db.prepare(`SELECT form_of FROM gloss_entry
    WHERE lemma_key = ? AND kind = 'form-of' AND form_of IS NOT NULL
    ORDER BY CASE WHEN upos IS NOT NULL AND upos = ? THEN 0 ELSE 1 END, entry_idx, sense_idx`);
  const senses = (key: string, upos: string, limit: number) => (glossStmt.all(key, upos, limit) as SenseRow[]).map((row): GlossSense => ({
    lemma: row.lemma, pos: row.pos, upos: row.upos, gloss: row.gloss, tags: parseTags(row.tags_json),
  }));
  return {
    lookup(lemmas, options = {}) {
      const max = Math.max(1, Math.floor(options.maxSenses ?? 3));
      return lemmas.map(({ lemma, upos }) => {
        const key = glossLemmaKey(lemma);
        const wanted = upos ?? '';
        const direct = senses(key, wanted, max);
        if (direct.length > 0) return { lemma, found: true, via: 'lemma', senses: direct };
        const targets = [...new Set((formStmt.all(key, wanted) as { form_of: string }[]).map((r) => r.form_of))];
        for (const target of targets) {
          const hop = senses(glossLemmaKey(target), wanted, max);
          if (hop.length > 0) return { lemma, found: true, via: 'form-of', formOf: target, senses: hop };
        }
        return { lemma, found: false, via: null, senses: [] };
      });
    },
    source: () => source,
    close: () => { if (db.isOpen) db.close(); },
  };
}

function parseTags(json: string | null): string[] {
  if (json === null) return [];
  try { const value: unknown = JSON.parse(json); return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : []; } catch { return []; }
}
