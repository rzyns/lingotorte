# lt-dxo — Local Anki file export

Scope approved by Janusz (recorded on `lt-dxo`): `.apkg` is the primary/default format, a `.txt` Anki text-import file is the alternative. Export-only: no AnkiConnect, no live Anki collection, no AnkiWeb. Lingotorte remains the canonical review state (DECISIONS §10, §16; safety review "Anki/export boundary").

## Pieces

| Piece | File |
|---|---|
| Pure mapper + `.txt` writer | `packages/domain/src/ankiExport.ts` |
| `.apkg` builder, validator, route constants | `apps/local-service/src/ankiPackage.ts` |
| Route `POST /api/export/anki` | `apps/local-service/src/server.ts` (admission/pairing as every `/api` route; body limit 4 MiB in `ROUTE_BODY_LIMITS`) |
| Client | `apps/web/src/ankiExportClient.ts` (paired transport only) |
| UI | "Export to Anki" group in `apps/web/src/views/exportImport.ts` |

The browser computes the note rows (so the client's current state is what is exported); the local service only turns them into SQLite + zip, because the browser has no SQLite. The `.txt` is built entirely in the browser.

## What is exported

Per non-archived saved item (archived items are excluded and counted in the UI):

- **Word** — `displayText`.
- **Context** — the item's *earliest* saved occurrence (by `createdAt`, then `id`): the current cue text with the occurrence's `sourceContext.charSpan` wrapped in `<b>` (the app's saves reference the cue and never store `contextBefore`/`contextAfter`). If the cue is no longer in the store or the span does not fit the cue text, it falls back to `contextBefore + <b>selectionText</b> + contextAfter` (just the bold selection when those are absent). Earliest = the sentence the learner first met it in, and it does not change when later occurrences are saved.
- **Meaning** — if present.
- **Notes** — if present.
- **Attribution** — `DICTIONARY_ATTRIBUTION` only when `meaningSource.kind === 'dictionary-suggested'`.
- **Tags** — `lingotorte` + item kind (`word`/`phrase`/`sentence`).
- **GUID** — `lt` + first 20 hex chars of `sha256("lingotorte-anki:" + savedItem.id)`. Stable across exports, so re-importing updates the same notes; the raw UUID is not exposed.

All learner text is HTML-escaped (`& < > " '`) before `<b>`/`<br>`/`<small>` are added; tabs become spaces, line breaks become `<br>`, other control characters are dropped. No raw tab/newline ever reaches a field.

**Not exported:** media/audio, media names/paths, timestamps, cue/track ids, hashes, review history/FSRS state, any id other than the GUID. Notes are ordered by `createdAt`, then `id`.

## `.apkg` mapping

Legacy `collection.anki2` (schema 11: `col`, `notes`, `cards`, `revlog`, `graves`), packed in a STORED (uncompressed) zip with CRC32 and a fixed 1980-01-01 timestamp (entries `collection.anki2`, `media` = `{}`). The SQLite file is written to a private `anki-*` temp dir under the service's run scratch dir and removed in `finally`.

- One notetype **Lingotorte** (stable id `1760000000001`), fields `Word, Meaning, Context, Notes, Attribution`, sort field Word.
  - **Recognition** (ord 0): front `Word` + small Context; back Meaning, Notes, Attribution.
  - **Production** (ord 1): front `{{#Meaning}}{{Meaning}}{{/Meaning}}` (empty → Anki generates no card); back Word + Context + Notes + Attribution.
- Deck **Lingotorte** (stable id `1760000000002`); optional `deckName` overrides the name.
- Cards: ord 0 for every note, ord 1 only when Meaning is non-empty; all new, in the Lingotorte deck. `revlog` is empty.
- `notes.sfld` = stripped Word; `notes.csum` = int of first 8 hex chars of SHA-1 of the stripped sort field; `flds` joined by `\x1f`; `usn = -1`.

Validation (`validateAnkiExportRequest`): body `{notes, deckName?}` only; each note has exactly the 7 mapper keys; GUID `^lt[0-9a-f]{20}$`, unique; Word non-empty; every field a string ≤ 20 000 chars with no tab/newline/control chars; ≤ 8 tags matching `^[a-z0-9_-]{1,32}$`; 1–5000 notes. Errors → `400 {ok:false,error:<code>}`; body > 4 MiB → 413. Success → `200 application/octet-stream`, `Content-Disposition: attachment; filename="lingotorte.apkg"`, `no-store`.

## `.txt` mapping (Anki 2.1.55+ text import)

Headers: `#separator:tab`, `#html:true`, `#notetype:Basic (optional reversed card)`, `#deck:Lingotorte`, `#guid column:1`, `#tags column:5`, `#columns:GUID	Front	Back	Add Reverse	Tags`. LF line endings.
Uses Anki's **built-in** `Basic (optional reversed card)` notetype, so it works without the `.apkg`:

- Front = Word, plus `<br><small>Context</small>` when there is a context.
- Back = Meaning, `<small>Notes</small>`, `<small>Attribution</small>` (joined with `<br><br>`); with no meaning: `<small>Notes</small>` or an em dash.
- Add Reverse = `y` only when there is a meaning (→ reverse/production card).

## UI and privacy

"Export to Anki" shows note/card/archived counts and these warnings: the file is unencrypted and contains saved words/phrases, context sentences from your subtitles, meanings and notes; importing and syncing in Anki uploads them to AnkiWeb (Ankitects) — Lingotorte never syncs; no media/file names/timestamps/review history; Lingotorte stays the source of truth and Anki reviews do not flow back; re-import updates the same notes by stable ID; the CC BY-SA dictionary notice when any exported meaning is dictionary-suggested. Both buttons require an explicit acknowledgement checkbox. `Download Anki package (.apkg)` (`data-anki-export="apkg"`) needs the paired local service and is otherwise disabled with a pointer to `Download Anki text file (.txt)` (`data-anki-export="txt"`). Errors are shown in place with fixed, redacted messages. Settings now reads "Anki: local file export (.apkg / .txt) under Export / Import; AnkiConnect and AnkiWeb sync: disabled".

## Evidence and what remains UNQUALIFIED

Qualified by `tests/core/ltdxoAnkiExport.test.ts` (mapper, `.txt` golden `tests/fixtures/anki/synthetic-anki-expected.txt`, `.apkg` readback with `node:sqlite` + CRC checks, determinism, route validation/admission) and `tests/web/ltdxoAnkiExportUi.test.ts`.

**UNQUALIFIED:** importing either file into a real Anki desktop. That is a human check for Janusz in a throwaway Anki profile (import `.apkg`, import `.txt`, re-import to confirm notes update rather than duplicate, confirm no production card for meaning-less notes). The csum/sfld normalisation approximates Anki's `stripHTMLMedia`; Anki recomputes them on "Check Database" if they ever differ.
