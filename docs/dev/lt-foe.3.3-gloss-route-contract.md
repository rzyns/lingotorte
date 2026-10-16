# lt-foe.3.3: local gloss route contract

Status: **for review before UI wiring** (lt-foe.3.4). Implementation: `apps/local-service/src/gloss.ts`, route in `server.ts`, admission in `requestAdmission.ts`, client in `apps/web/src/glossClient.ts`. Data: the derived Polish gloss SQLite from `scripts/import-glosses.ts` (lt-foe.3.2, DECISIONS §16a), read through `packages/language/src/glossStore.ts`.

## Scope

- Read-only lookups in a local SQLite file. No download, provider, online translation or LLM. The route never writes the gloss DB, SQLite state, scratch or jobs.
- Mirrors the lt-elf morphology contract (`lt-elf-morphology-service-contract.md`) for admission, bounds, codes and discriminated responses.

## Route and admission

`POST /api/language/gloss`; methods `POST` plus CORS `OPTIONS`. Same `admit()` gate as every learner route (exact Host, exact Origin, `Bearer` capability → 401, JSON content type only → 415, JSON object body → 400, preflight requires `authorization, content-type`).

- `routeMethods()`: `/api/language/gloss → ['POST']`.
- `ROUTE_BODY_LIMITS`: **16 KiB** (413), Content-Length and streamed.
- `pairedTransport.ts` allowlist: `language/(?:morphology|gloss)`.

## Request

```json
{ "language": "pl", "maxSenses": 3,
  "queries": [ { "lemma": "mieć", "upos": "VERB", "alternatives": [ { "lemma": "mama", "upos": "NOUN" } ] } ] }
```

- Keys exactly `language`, `queries`, optional `maxSenses`. Anything else → `invalid-envelope`. `maxSenses`: integer 1–5, default 3; otherwise `invalid-max-senses`.
- `language`: `/^[a-z]{2,3}$/` (else `invalid-language`). Well-formed non-`pl` → 200 `unavailable/unsupported-language`.
- `queries`: array of 1–**16** (`invalid-queries` / `too-many-queries`). Each query has exactly `lemma`, optional `upos` (`/^[A-Z]{1,5}$/`), optional `alternatives` (array of 0–**3** `{lemma, upos?}`, typically Morfeusz alternatives).
- `lemma` (query and alternative): string, no control characters, no leading/trailing whitespace, only single internal spaces; 1–**64** code points (longer → `lemma-too-long`).

## Validation errors

HTTP 400 `{ok:false, error}` with `invalid-envelope | invalid-max-senses | invalid-language | invalid-queries | too-many-queries | lemma-too-long`. Input is never echoed. A non-validation throw during validation → 200 `{status:'error', code:'internal'}`. Malformed or non-object JSON → gate 400 `Request rejected.`; oversized → 413.

## Response (HTTP 200, discriminated on `status`)

```ts
type GlossResponse =
  | { status: 'available';
      source: { id; name; licence; url; attribution; dumpDate };          // attribution = GLOSS_ATTRIBUTION verbatim
      results: { queryIndex: number; found: boolean;
                 via: 'lemma' | 'form-of' | 'alternative' | null;
                 lemma: string;            // lemma whose glosses are returned (form-of hop target, else the queried/alternative lemma)
                 upos: string | null;      // UPOS of the first returned sense; query/alt upos when found:false
                 formOf?: string;          // the queried form (hop source) when a form-of hop occurred
                 senses: Sense[];          // ≤ maxSenses
                 otherReadings: { lemma: string; upos: string | null; via: 'lemma' | 'form-of'; formOf?: string; senses: Sense[] }[] }[] }
  // Sense = { gloss: string; pos: string; upos: string | null; tags: string[] }
  | { status: 'unavailable'; reason: 'not-installed' | 'disabled' | 'unsupported-language' | 'invalid-dictionary' }
  | { status: 'error'; code: 'lookup-failed' | 'internal' };
```

- One result per query, in order, `queryIndex` = array index.
- **No entry** is a query-level state, not a route state: `found:false, via:null, senses:[]`, `lemma` = the query lemma.
- `via` says how the chosen lemma was reached; `formOf` is present **iff** a form-of hop occurred: required with `via:'form-of'`, allowed with `via:'alternative'` (the alternative itself was an inflected form), absent with `via:'lemma'`/`null`. Example: `domu` → `{via:'form-of', lemma:'dom', formOf:'domu'}`. Same rule inside `otherReadings` (`via` there is only `lemma|form-of`).
- Gloss text is ≤500 code points (importer cap). No paths, SQL, hashes or import timestamps are returned (`inputSha256`, `importedAt`, counts stay server-side).

### Resolution rule (deterministic)

1. Look up the primary `{lemma, upos}` with `glossStore.lookup` (direct glosses first, ordered matching-UPOS first; otherwise one form-of hop).
2. Keep the primary when it is found and the query has no `upos`, or some returned sense has that `upos` → `via` = store's `lemma`/`form-of`.
3. Otherwise walk `alternatives` in request order; take the **first** alternative that is found and has a sense matching its own `upos` → `via:'alternative'`. When the primary was not found at all, an alternative without `upos` that is found also qualifies.
4. Otherwise return the primary unchanged (found with mismatched POS, or `found:false`).

**Other readings.** `otherReadings` = the query's alternatives, in request order, that are found and whose `(lemma, upos)` differs from the chosen result's `(lemma, upos)`; deduped by `(lemma, upos)`; at most `GLOSS_MAX_ALTERNATIVES` (3); empty array when none. Each carries up to `maxSenses` senses; when the alternative names a UPOS that some sense has, only those senses are returned and `upos` is that UPOS, otherwise `upos` is the first sense's. Motivation (real-DB probe): Morfeusz gives `Cześć` primary `cześć/NOUN` (“reverence, honor”) with alternative `cześć/INTJ`; the primary rule keeps the NOUN, and `otherReadings` surfaces the greeting. The chosen result is unaffected.

Pinned edge: primary found with mismatched POS + an alternative **without** `upos` → the primary is kept (rule 3 only lets upos-less alternatives win when the primary was not found); the alternative appears in `otherReadings`.

Examples (synthetic fixture): `mieć/VERB` (no entry) + alt `mama/NOUN` → `mama`, alternative. `stać/VERB` (only a NOUN gloss) + alt `stanąć/VERB` → `stanąć`, alternative; with no matching alternative it stays `stać` via lemma with the NOUN sense. `domu` → `dom` via form-of (`formOf:'domu'`). `cześć/NOUN` + alt `cześć/INTJ` → NOUN result with an INTJ other reading.

## Lifecycle and state

- `gloss.warm()` opens the store at service start; the open store is cached and closed on service close.
- **Missing DB** (`not-installed`) or **invalid DB** (`invalid-dictionary`, e.g. not SQLite, wrong `format_version`, bad source table) are re-checked on later requests at most once per **30 s** (`GLOSS_RECHECK_MS`, injectable clock), so an operator can install the DB without restarting.
- **Once open, the store is not re-opened**, even if the file is replaced: restart the service after a re-import. The store opens the file **read-only** (`DatabaseSync(..., {readOnly:true})`; a 0444 file works, tested where chmod is effective).
- If `source()` fails on an open store (lookup or status), the store is closed and dropped, state becomes `invalid-dictionary`, and the 30 s re-check applies; status and lookup agree.
- **Disabled** (`LINGOTORTE_GLOSS=disabled`, or runtime `mode:'disabled'`): every request → `unavailable/disabled`; the DB is never opened.
- Store `lookup` throw → `error/lookup-failed`; source read throw → `unavailable/invalid-dictionary` (above). `error/internal` remains for unexpected validation throws. Messages and stacks are discarded; nothing is logged.

## Runtime capability

`GET /api/status` → `language.gloss`:

```json
{ "languages": ["pl"], "state": "available|not-installed|disabled|invalid-dictionary",
  "source": { "id": "...", "dumpDate": "YYYY-MM-DD", "attribution": "..." } }
```

`source` only when available. No paths. The state reflects the last check; the per-request result is authoritative.

## Configuration

`LocalServiceRuntime.gloss = { dbPath?, mode?, openStore?, clock? }`. `startFromCli` sets `dbPath` from `glossDbPathFromEnv` (`LINGOTORTE_GLOSS_DB_PATH`, default `<data dir>/glosses-pl.sqlite`; compose sets `/dictionary/glosses-pl.sqlite`) and `mode` from `LINGOTORTE_GLOSS`. An invalid configured path degrades to `not-installed` instead of blocking startup.

## Client (`apps/web/src/glossClient.ts`)

`requestLocalGloss(transport, language, queries, fetchImpl?, maxSenses?)` never throws for service failures. `maxSenses` (integer 1–5) is validated locally, sent when given, and bounds the parsed sense counts.

- no transport or 401 → `unavailable/not-paired`; fetch rejection or 404 → `unavailable/service-unreachable`; other non-2xx → `error/rejected`
- non-JSON or any shape outside this contract (unknown enum, count/index mismatch, found/senses inconsistency, >5 senses, gloss >500, non-https source URL, missing attribution) → `error/invalid-response`
- out-of-bounds input (incl. bad `maxSenses`) → `error/invalid-request`, no egress
- Failure mapping is line-for-line identical to `morphologyClient.ts` (not-paired / service-unreachable / 404 / rejected / invalid-response). Only intentional difference: the top-level object guard also rejects arrays explicitly (morphology rejects them one line later via the `status` check — same outcome).

**Guidance for lt-foe.3.4:** show several senses; label `via:'alternative'` and `via:'form-of'` (show `formOf`); always show `source.attribution` with a link to `source.url` when glosses are displayed; treat any non-available result as "no meaning available" without failing the word panel.

## Privacy

Local processing only; `tests/no-network/glossNoNetwork.test.ts` traps network primitives around open, lookup and a missing-DB re-check, and Docker verification runs `--network none`. Lemmas are learner-derived text: processed in memory, not logged, not stored, not echoed in errors. Responses are `cache-control: no-store` (gate).
