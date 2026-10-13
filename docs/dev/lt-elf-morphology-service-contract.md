# lt-elf: local Morfeusz morphology service contract

Status: **for review before UI wiring** (lt-e8z). Implementation: `apps/local-service/src/morphology.ts`, route in `server.ts`, admission in `requestAdmission.ts`, client in `apps/web/src/morphologyClient.ts`.

## Scope

- The route reuses the existing vendored adapter `makeMorfeuszMorphologyAdapter()` (`packages/language/src/adapters.ts`). That adapter runs `@rzyns/morfeusz-ts` 1.0.4 (BSD-2-Clause, `vendor/morfeusz-ts/LICENSE`, `NOTICE`) on the tracked SGJP dictionary `vendor/morfeusz-ts/morfeusz2/dict/sgjp-a.dict`. The SGJP dictionary is IPI PAN data under the same BSD-2 terms. `.dockerignore` admits `vendor/**`, so the dictionary is in the contributor image. The tests load it there with `--network none`.
- No new dictionary, download, provider, online LLM or translation was added. The browser heuristic (`resolveLocalAdapters`, `model.ts`) is unchanged.

## Route

`POST /api/language/morphology`. It is the only new route, and its methods are `POST` plus CORS `OPTIONS`.

### Admission

The route uses the same `admit()` gate as every learner route:

- exact Host authority
- exact allowed Origin; a foreign origin or `null` gets 403
- `Authorization: Bearer <paired capability>`; a missing or wrong capability gets 401 `Pair again.`
- `Content-Type: application/json; charset=utf-8` only, otherwise 415; no `Content-Encoding`
- JSON object body only, otherwise 400
- preflight must include `authorization, content-type`

These changes were made:

- `routeMethods()`: `/api/language/morphology → ['POST']`.
- `ROUTE_BODY_LIMITS`: **16 KiB** body cap for this route (413), enforced both on the Content-Length check and on the streamed body. The gate-wide 5 MiB cap still applies to all other routes.
- `pairedTransport.ts` client allowlist: `language/morphology` was added.
- The route is synchronous, owns no worker, and writes no state. It does not touch SQLite, the scratch directory or jobs. A paused job worker does not affect it.

### Request

```json
{ "language": "pl", "tokens": ["Kobieta", "czyta", "mamy", "."] }
```

- The body has exactly the keys `language` and `tokens`. Any other key set gets `invalid-envelope`.
- `language`: `/^[a-z]{2,3}$/`. A well-formed language other than `pl` gets 200 `{status:'unavailable', reason:'unsupported-language'}`. A malformed value gets 400 `invalid-language`.
- `tokens`: an array of 1–**64** strings. Each string has 1–**64** code points and contains no whitespace or control characters. The caller tokenizes, typically with the existing whitespace tokenizer.

### Validation errors

Validation errors return HTTP 400 `{ok:false, error:<code>}`. The code is one of `invalid-envelope | invalid-language | invalid-tokens | too-many-tokens | token-too-long`. Input is never echoed. A non-validation exception while validating returns HTTP 200 `{status:'error', code:'internal'}` instead of `invalid-envelope`. Malformed JSON gets the gate-level 400 `Request rejected.`, and an oversized body gets 413.

### Response (HTTP 200, discriminated on `status`)

```ts
type MorphologyResponse =
  | { status: 'available'; engine: 'morfeusz2-sgjp';
      analyses: { tokenIndex: number; lemma: string; upos: string;          // UD UPOS; 'X' = unclassified (see unknown)
                  morph: { key: string; value: string }[];                  // ≤16 features, whitelisted UD keys
                  confidence: { kind: 'certain'|'probable'|'possible'; value: number }; // value in [0,1]
                  ambiguous: boolean; unknown: boolean;
                  alternatives: { lemma: string; upos: string }[] }[];      // ≤3, distinct lemma/POS
      warnings: ('ambiguous-tokens'|'unknown-tokens')[] }
  | { status: 'unavailable'; reason: 'disabled'|'adapter-load-failed'|'unsupported-language' }
  | { status: 'error'; code: 'analysis-failed'|'internal' };
```

Semantics:

- There is one analysis per token, in request order, with `tokenIndex` equal to the array index.
- **Unknown.** `unknown:true` is set only on Morfeusz's own no-reading signal: zero readings, or only `ign` readings. Such a token gets `upos:'X'`, `alternatives:[]` and confidence `possible` capped at 0.35, and its lemma is the lowercased surface, not a real lemma. A word that Morfeusz does read is **known**, even when its tag maps to `X` or a minor class: `się` and `nie` (`part`/`qub`) are `PART`, and the imperative `zażółć` (`impt`) is `zażółcić`/`VERB` with `Mood=Imp`, all at normal confidence.
- **Reading order and deduplication.** Readings are first deduplicated on (lowercased base lemma, UPOS). Proper-name lemmas that differ from a common lemma only in letter case (`Warszawa:Sf` vs `warszawa`, `Książka:Sf` vs `książka`) collapse into one reading that keeps the lowercase spelling. Proper nouns are **not** mapped to `PROPN`. Readings with a lowercase lemma are then ranked before capitalised (proper-name) lemmas, with Morfeusz order otherwise kept. The ≤3 cap applies after this ranking, so a common-lemma reading can never be truncated behind proper names. So `Książki` → książka/NOUN primary (proper-name readings such as `Książek` follow as alternatives), and `Warszawie` → warszawa/NOUN with no alternatives and `ambiguous:false`.
- **Ambiguous.** `ambiguous:true` means at least one alternative has a lemma/POS pair that differs from the primary reading. Case syncretism within one lemma/POS is **not** ambiguity, and neither is a lemma that differs only in letter case. Confidence is then capped at `possible` ≤0.55. The primary reading is **not disambiguated by context**: it is the first reading after the ranking above. For example, `mamy` → mieć/VERB with alternative mama/NOUN.
- Unambiguous words get `probable` (0.72 or 0.92, from the adapter). Punctuation (including `—`, `–`, `„`, `”` and quotes/brackets) and symbols get `certain` with `PUNCT`/`SYM`, and numbers get `NUM`.
- `warnings` contains fixed codes only, with no free text.
- Lemmas are bounded to 64 code points. No adapter notes, raw tags, run refs, hashes, paths or stacks are returned.

### Unavailable vs error

- The adapter loads once, lazily: `morphology.warm()` runs at service start, then a one-token probe reads the dictionary from local files. If loading fails, the state is permanently `unavailable` until restart, every request returns `adapter-load-failed`, and the loader is not retried.
- If the adapter throws during analysis, the response is `{status:'error', code:'analysis-failed'}`. A result-shaping failure returns `internal`. The message and stack are discarded.

## Runtime capability

`GET /api/status` (paired) gets a new field:

```json
"language": { "morphology": { "languages": ["pl"], "engine": "morfeusz2-sgjp", "state": "not-loaded|loading|available|unavailable" } }
```

`LocalServiceRuntime.morphology = { mode?: 'enabled'|'disabled', loadAdapter? }`. The `disabled` mode reports `unavailable` and never loads. This is an injection seam for tests and operators; there is no environment variable yet.

## Client (`apps/web/src/morphologyClient.ts`)

`requestLocalMorphology(transport, language, tokens, fetchImpl?) → ClientMorphologyResult`. It does not throw for service failures. It maps them as follows:

- no transport or 401 → `unavailable/not-paired`
- fetch rejection → `unavailable/service-unreachable`
- 404 (older service without the route) → `unavailable/service-unreachable`
- other non-2xx → `error/rejected`
- non-JSON, or any shape outside this contract (unknown enum, count mismatch, confidence outside [0,1], free-text warning) → `error/invalid-response`
- out-of-bounds input → `error/invalid-request`, with no egress

`parseMorphologyResponse` is a pure, strict parser.

**Fallback guidance for lt-e8z:**

- Use service analyses only when `status==='available'`. Anything else falls back to the existing browser heuristic, unchanged.
- Always show the low-confidence and ambiguity warnings: `confidence.kind==='possible'`, `ambiguous`, `unknown`.
- Never present the primary reading of an ambiguous token as certain. Offer the alternatives.
- `/api/status` `language.morphology.state` can gate the attempt, but the per-request result is authoritative.
- Do not persist service output as a provider blob. Map it into the existing typed analysis fields.

## Privacy

- Processing is local only, with no network. The proof is a `withNoNetwork` trap around load and analysis, and the Docker tests run with `--network none`.
- Tokens are learner text. They are processed in memory, not logged, not stored and not echoed in errors.
- Responses are `cache-control: no-store` (set by the gate).
