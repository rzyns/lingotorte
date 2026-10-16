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
  /**
   * 'lemma': real glosses for the requested lemma; 'form-of': one hop through an inflected-form pointer;
   * 'form-of-text': the lemma's own form-of rows whose targets have no real glosses (target missing, or a
   * phrase as Wiktextract stores some interjections). Their gloss text is the meaning; no formOf is set.
   */
  via: 'lemma' | 'form-of' | 'form-of-text' | null;
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
  const formStmt = db.prepare(`SELECT lemma, pos, upos, gloss, tags_json, form_of FROM gloss_entry
    WHERE lemma_key = ? AND kind = 'form-of' AND form_of IS NOT NULL
    ORDER BY CASE WHEN upos IS NOT NULL AND upos = ? THEN 0 ELSE 1 END, entry_idx, sense_idx`);
  const hasGlossStmt = db.prepare(`SELECT 1 AS x FROM gloss_entry WHERE lemma_key = ? AND kind = 'gloss' LIMIT 1`);
  const toSense = (row: SenseRow): GlossSense => ({ lemma: row.lemma, pos: row.pos, upos: row.upos, gloss: row.gloss, tags: parseTags(row.tags_json) });
  const senses = (key: string, upos: string, limit: number) => (glossStmt.all(key, upos, limit) as SenseRow[]).map(toSense);
  const resolvable = (target: string) => hasGlossStmt.get(glossLemmaKey(target)) !== undefined;
  return {
    /**
     * Per lemma (DB format_version 1, no re-import needed):
     * (a) real 'gloss' rows for lemma_key (matching UPOS first, then entry/sense order) -> via 'lemma';
     * (b) else the first form-of target (matching-UPOS rows first) that has real glosses -> via 'form-of', formOf = target;
     * (c) else the lemma's unresolved form-of rows (targets without real glosses) as senses -> via 'form-of-text'.
     * Mixed UPOS: when `upos` is given and neither a real gloss row nor a resolvable form-of row has that UPOS,
     * but an unresolved form-of row does, (c) is returned instead of (a)/(b) (e.g. cześć INTJ vs its NOUN glosses).
     * maxSenses bounds every branch.
     */
    lookup(lemmas, options = {}) {
      const max = Math.max(1, Math.floor(options.maxSenses ?? 3));
      return lemmas.map(({ lemma, upos }): GlossLookupResult => {
        const key = glossLemmaKey(lemma);
        const wanted = upos ?? '';
        const direct = senses(key, wanted, max);
        const forms = formStmt.all(key, wanted) as (SenseRow & { form_of: string })[];
        const unresolved = forms.filter((r) => !resolvable(r.form_of));
        const text = (): GlossLookupResult => ({ lemma, found: true, via: 'form-of-text', senses: unresolved.slice(0, max).map(toSense) });
        if (upos !== undefined && !direct.some((s) => s.upos === upos) && unresolved.some((r) => r.upos === upos)
          && !forms.some((r) => r.upos === upos && resolvable(r.form_of))) return text();
        if (direct.length > 0) return { lemma, found: true, via: 'lemma', senses: direct };
        const targets = [...new Set(forms.map((r) => r.form_of))];
        for (const target of targets) {
          const hop = senses(glossLemmaKey(target), wanted, max);
          if (hop.length > 0) return { lemma, found: true, via: 'form-of', formOf: target, senses: hop };
        }
        if (unresolved.length > 0) return text();
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
