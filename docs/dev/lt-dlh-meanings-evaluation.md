# lt-dlh: local word meanings and the manual-meaning workflow (evaluation)

Status: evaluation complete. Janusz decided on 2026-10-16 (DECISIONS.md §16a): kaikki/Wiktextract English Wiktionary as primary, plWordNet as a later secondary, the attribution in §3 as written, and a one-time download of the 2.8 GB `.gz` raw dump. Nothing has been downloaded or imported yet. No code changed.

Evidence labels: **[code]** read in this repository at `9b4567d`; **[O]** observed on the source's own page or metadata on 2026-10-16; **[I]** inference or unverified prior knowledge; **[R]** recommendation.

## 1. What exists today (manual meanings)

- Capture form: the Selection panel has a Meaning field; `saveSelectionWithReceipt` stores it as `SavedItem.meaning` (`apps/web/src/model.ts:3347,3384`). [code]
- Inline "Add meaning" appears in Saved and in the Review reveal only when an item has neither a meaning nor a native cue line (`apps/web/src/views/saved.ts:91-97,178`; `views/review.ts:111-118`). It writes through `setSavedItemMeaning` and persists (`model.ts:3574`). [code]
- `SavedItem.meaning` is a bare optional string (`packages/domain/src/coreTypes.ts:242`, SQLite `saved_item.meaning TEXT`). There is no record of where a meaning came from. [code]
- The morphology panel hard-codes "Word meanings and translations are not available…" (`apps/web/src/morphologyPanel.ts:203`). [code]
- Source context is already kept per occurrence (`SavedOccurrenceSourceContext`: media, track, cue, time/token/char span). A meaning attaches to the item, so it never replaces or loses this context. [code]
- The design doc already sets the lookup order and the output shape, with the source and licence recorded on every entry (`docs/architecture/language-adapter-design.md:169-240`). The order is: learner override → local dictionary → local model → opt-in online. [code]

**Gaps:**
1. An existing meaning cannot be edited. The inline input only appears when the meaning is empty.
2. A meaning's origin (typed vs. dictionary-suggested) is not recorded.
3. There is no lookup at all, so every recognition card made after lt-uzo is thin unless the learner types something.

## 2. Candidate sources

| Source | Licence | Polish coverage | English quality | Size to fetch | Verdict |
|---|---|---|---|---|---|
| **kaikki.org / Wiktextract, English Wiktionary** | CC BY-SA 4.0 + GFDL (Wiktionary terms) [I] | 175,915 word forms; senses: Noun 114,422, Verb 68,337, Adj 37,434, Adv 6,314 [O] | Best: English glosses written for learners, with POS, tags, forms and IPA | Per-language Polish JSONL 789 MB, marked **deprecated** [O]; replacement is the full raw dump, 2.8 GB .gz / 23.9 GB, filtered on `lang_code=pl` [O]. Updated weekly [O] | **Primary** [R] |
| kaikki, Polish Wiktionary (`pl-extract`) | CC BY-SA / GFDL [I] | Polish definitions; English only via `translations` [I] | Coarser alignment to senses; the extractor is "work in progress" [O] | 131 MB .gz [O] | Later backfill |
| FreeDict pol-eng 2025.11.23 | CC BY-SA 3.0 (WikDict, from Wiktionary) [I] | 42,088 headwords [O] | Mostly overlaps Wiktionary | ~2–3 MB [O] | Fallback only |
| plWordNet 4.5 + English mapping | Princeton-style permissive; the notice must appear on all copies, including internal ones [O] | 514k units [O] | English = PWN synset lemmas/definitions via interlingual links; not a learner gloss [I] | 444 MB SQL dump [O] | Secondary candidate; heavy ETL |
| Wikidata Lexemes | CC0 [I] | 3,683 Polish lexemes, 321 English-glossed senses [O] | Too sparse | — | Reject for now |
| PanLex / OMW / Apertium | CC0 / WordNet / GPL [I] | Noisy or small | — | — | Reject for now |
| dict.cc, Glosbe | No redistribution / proprietary [I] | — | — | — | **Reject** (terms) |

## 3. Recommended design [R]

**Source.** English Wiktionary via Wiktextract. Pin one dump date in the import receipt for reproducibility.

**One-time operator step, outside the app.**
- Janusz downloads one file himself, once.
- `scripts/import-glosses.ts <local-path>` streams it, keeps only `lang_code == "pl"` entries that have non-empty `senses[].glosses`, and writes a SQLite file to a Docker volume, not the repo.
- The app and its tests never download anything. No-network tests still pass, and the import script is not run in CI.

Table (sketch): `gloss_entry(lemma, pos, sense_idx, gloss, tags_json)` plus `gloss_source(name, licence, url, dump_date, entry_count, sha256_of_input)`. Expected size after filtering: tens of MB [I]; to be measured at import.

**Service route.** `POST /api/language/gloss`, behind the same `admit()` gate as morphology: bounded body, a list of lemmas plus a UPOS hint. The response is a discriminated union:
- `available`: entries, each carrying `source` and `licence`
- `unavailable`: one of `not-installed | disabled | unsupported-language`
- `no-entry`
- `error`

When the dictionary is not installed, the route reports `not-installed` and the UI says so. The UI never pretends a meaning exists.

**UI.**
- The morphology panel shows the top 1–3 glosses for the chosen reading, labelled "Wiktionary (CC BY-SA)". It replaces the hard-coded unavailable line only when the state is `available`, and keeps the honest per-state text otherwise.
- The Meaning field in capture is *pre-filled as a suggestion*. The learner accepts or edits it, and nothing is saved until they press Save (same rule as today).
- The UI keeps "dictionary gloss", "native cue line" and "your meaning" visually distinct (design doc :228).

**Provenance.** Add optional `meaningSource: 'learner' | 'dictionary-suggested'` (plus the source id) to `SavedItem`. Accepting a suggestion unchanged records `dictionary-suggested`, and any edit records `learner`. Later lookups never overwrite a saved meaning (design doc :13). This needs a schema/export-manifest field and a forward migration. That belongs to a separate implementation child.

**Edit meaning.** Make the saved meaning editable in Saved and in the Review reveal, which fixes gap 1. It is independent of the dictionary and can ship first.

**Attribution.** A Credits/About line in Settings, shown only once a dictionary is installed:
> Word meanings from English Wiktionary (en.wiktionary.org), © Wiktionary contributors, via Wiktextract/kaikki.org, CC BY-SA 4.0 and GFDL. Filtered to Polish and converted to SQLite.

**Fixtures.** Hand-written synthetic entries only, about 10–20 lemmas, so the repository contains no CC BY-SA-derived text.

**Online adapters.** Out of scope. Any online dictionary, translation or LLM meaning needs separate consent under DECISIONS §6. This design adds no network path.

## 4. Proposed follow-up children (after Janusz's decision)

1. Make an existing meaning editable in Saved and Review, and record `meaningSource` with a migration. This has no dictionary dependency.
2. Import script and `gloss_*` schema on a dedicated volume, with an import receipt and synthetic-fixture tests.
3. `/api/language/gloss` route with admission, bounds, typed states, a no-network proof and a not-installed state.
4. UI: glosses in the morphology panel, Meaning pre-fill, the Credits line, and a live Chrome check.

## 5. Open questions for Janusz

- Approve English Wiktionary via kaikki/Wiktextract (CC BY-SA 4.0/GFDL) as the source?
- Approve the attribution text above?
- Approve the one-time download. Options: (a) the 789 MB per-language file while it still exists; (b) the 2.8 GB .gz full raw dump, which is the supported path going forward. Either is done by Janusz, or by the agent on explicit instruction, into a scratch path outside the repo, and the file can be deleted after import.

Unverified items to check at import time: the exact kaikki licence footer, the Morfeusz-lemma match rate on the synthetic fixture, and the actual size of the derived database.
