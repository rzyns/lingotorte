# lt-foe.3.2: Wiktionary gloss import (result)

Status: implemented on `work/lt-foe.3.2-gloss-import`; real one-time import done 2026-10-16 under DECISIONS.md §16a (Janusz's explicit download instruction is recorded as a comment on `lt-foe.3.2`).

## What was built

- `scripts/import-glosses.ts`: a streaming importer for Wiktextract `.jsonl` or `.jsonl.gz`.
  - Prefilters on `lang_code` and re-checks the top-level `lang_code` after parsing.
  - Writes to a temp file and renames it into place; `--replace` is required to overwrite.
  - Prints a one-line JSON receipt with counts and a sha256 of the input bytes. The receipt contains no gloss text.
- Derived database layout (separate from the learner DB):
  - `gloss_meta` (`format_version=1`)
  - one `gloss_source` row: id, licence, URL, the exact §16a attribution, dump date, input sha256
  - `gloss_entry` rows, either `gloss` or `form-of`, indexed on `(lemma_key, kind)`
- `packages/language/src/glossStore.ts`: a read-only lookup module for the later route (`lt-foe.3.3`).
  - Order of results: the requested lemma's glosses first, preferring a matching UPOS; otherwise one hop through a form-of entry.
  - Errors are typed and contain no paths.
  - It is not exported to the web bundle.
- Compose:
  - `dictionary` volume, mounted read-only on `api` at `/dictionary`, with `LINGOTORTE_GLOSS_DB_PATH`.
  - `dictionary-import` tools-profile service: `network_mode: none`, dump bound read-only at `/import`.
  - The runbook section "Dictionary import (one-time)" covers how to run it.
- Fixtures are hand-written and synthetic (`tests/fixtures/gloss/`). The repository contains no Wiktionary text.

## Real import (2026-10-16)

| Item | Value |
|---|---|
| Input | `https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz`, Last-Modified 2026-10-03 08:24:38 GMT |
| Size | 2,981,058,381 bytes (equal to Content-Length); `gzip -t` OK |
| sha256 (`sha256sum`) | `3dac8a09e57827bef493e2e6b552fe917bf3b1fc55dee05c4e4a3702aff5dbdb` |
| Receipt `inputSha256` | identical |
| Lines / Polish lines / malformed | 10,913,999 / 280,450 / 0 |
| Entries / senses | 199,250 / 266,811 |
| Gloss senses / form-of senses / skipped / truncated at 500 chars | 166,262 / 100,549 / 39 / 2 |
| Integrity check | ok |
| Duration | 147 s inside the import container (2 m 31 s wall) |
| Derived DB | 41,152,512 bytes (40 MB), sha256 `bc6b10280b649ca3b0655e6a43b817b3960b3cc4ee649993ef9069b898ac97eb` |

The dump was deleted after import. A copy of the derived DB, and its sha256, is kept outside the repository, under the operator's local app data. That way a later stack can be seeded without re-downloading. The DB is never committed.

## Coverage probe

Method:
- A hand-written 20-sentence everyday Polish sample (185 word tokens, 146 distinct lemmas).
- Lemmatised by the vendored Morfeusz adapter, then looked up through `glossStore`.
- Run in the image with `--network none`.
- The probe script and sample were scratch files and are not committed.

Results:
- **183 of 185 tokens (98.9%) found a gloss.** 3 of those went via form-of.
- The top sense's UPOS matched Morfeusz's for 150 tokens.

Both misses were lemma errors from Morfeusz, not dictionary gaps. Morfeusz's first reading gave `podróżach→podróża` and `ogrodzie→ogroda`; the correct lemmas are `podróż` and `ogród`.

Quality notes, to carry into `lt-foe.3.3` and `lt-foe.3.4`:
- When Morfeusz's POS differs from the intended reading, the first sense can be the less useful one:
  - `Cześć` analysed as NOUN gave "reverence, honor" rather than the greeting (INTJ).
  - `w` analysed as X gave the letter sense first, then "in, at, on".
- So the UI should show more than one sense, and it should consider Morfeusz's alternative lemmas/POS when the top reading has no gloss or a mismatched POS.

## Verification

- Synthetic-fixture tests: 31 passed across the focused files (`ltfoe32GlossImport`, `nativeConfig`, `tests/no-network`).
- Red-then-green evidence is recorded on the issue.
- Full suite and other checks: see the issue's closing evidence.
