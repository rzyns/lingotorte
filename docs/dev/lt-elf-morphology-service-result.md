# lt-elf result: local Morfeusz morphology service

- Base: `main` ed37dd6, branch `work/lt-elf-morfeusz-service`. Changes are uncommitted.
- Contract: `docs/dev/lt-elf-morphology-service-contract.md`.
- Image (after the review fixes): contributor target `lingotorte:lt-elf2`, id `sha256:809d01eab0eb3c0e03bfd9711069e97474dda46b208d4ed5a68608cdae6f5524` (removed after the run). All runs used `--network none`.

## Licence and dictionary check

- `vendor/morfeusz-ts`: BSD-2-Clause, with an IPI PAN NOTICE that covers the SGJP dictionaries under BSD-2.
- `morfeusz2/dict/sgjp-a.dict` (10.3 MB) is git-tracked and included by `.dockerignore` (`!vendor/**`).
- `DictionariesRepository` reads only local paths (`fs.readFile`), with no network.

## Acceptance → tests

| Clause | Evidence |
|---|---|
| Polish fixtures | `tests/core/morphologyService.test.ts` "analyzes Polish fixtures": kobieta/NOUN, czyta→czytać/VERB, książki (książka/NOUN reading present), punctuation PUNCT/certain, number NUM |
| Ambiguous | the same test: `mamy` → mieć + mama readings, `ambiguous:true`, `possible`, warning `ambiguous-tokens` |
| Unknown | the same test: `xqzvbrt` (Morfeusz `ign`) → `X`, `unknown:true`, possible ≤0.35, warning `unknown-tokens` |
| Known minor classes (review blocker 1) | "treats real but unclassified words…": `się`, `nie` → PART, `zażółć` → zażółcić/VERB `Mood=Imp`, all `unknown:false` with confidence >0.35; `—`, `„` → PUNCT; no `unknown-tokens` warning. Old code: red (się → X/unknown) |
| Ranking and case dedupe (review blocker 2) | "never truncates the common lemma…": `Książki` → książka/NOUN primary, no case-duplicate `Książka`; `Warszawie` → warszawa/NOUN, `ambiguous:false`, no alternatives. Old code: red (Książki primary was the proper noun Książka, and książka was dropped by the cap) |
| Unsupported language | "typed unsupported-language" (`en`) |
| Malformed/oversized → 400/413 fixed codes, no echo | "rejects malformed and oversized input": 11 rows, 413 at >16 KiB, malformed JSON 400 |
| Service off | "runtime capability" (`mode:'disabled'` → `unavailable/disabled`); client test maps network failure, 404, 401, non-2xx and bad JSON |
| Dictionary/adapter load failure | "typed unavailable when the adapter/dictionary fails to load": loader called once, no path leak, `/api/status` shows `unavailable` |
| Adapter throw | "maps adapter throws to typed error": `analysis-failed`, no input/stack/message |
| Safe request boundary | "admits the route…": missing/wrong bearer 401, foreign/null origin 403, GET 405, text/plain 415. The route was added to the `requestAdmissionMatrix` 7-fault × route oracle and to the `capturedTransport` allowlist row |
| No external calls | "makes no external network calls": `withNoNetwork` trap, 0 attempts. The whole suite ran with `--network none` |
| Runtime capability | `/api/status.language.morphology` (`state` not-loaded/loading/available/unavailable) |
| Client fallback typing | `tests/web/morphologyClient.test.ts` (4 tests) |

## Commands (Docker, `--network none`)

| Command | Result |
|---|---|
| focused: `npx vitest run` on morphologyService, morphologyClient, requestAdmissionMatrix, capturedTransport | morphologyService, morphologyClient, requestAdmissionMatrix, capturedTransport, p3Adapters: 5 files, 79 tests passed, exit 0 |
| full `npx vitest run` ×3 | each run: 67 files passed, 1 skipped; 1379 tests passed, 1 skipped; exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `vite build` | exit 0 |
| `node scripts/check-privacy-boundaries.mjs` | ok, 65 files, exit 0 |
| `vitest run tests/no-network` | 5 tests passed, exit 0 |

The earlier run of requestRuntime and localService also passed (12 + 11 tests).

## Limitations

- The primary reading is not context-disambiguated. Lowercase (common) lemmas are ranked before capitalised proper-name lemmas, so a sentence about the village Książki still gets książka/NOUN first; the proper-name readings stay as alternatives. Proper nouns are not mapped to `PROPN`.
- The ranking, case dedupe, `part`/`impt` mapping and `ign`-based unknown live in the shared `makeMorfeuszMorphologyAdapter`, so they also change that adapter's output for its other callers (the existing `p3Adapters` tests still pass).
- Confidence values are adapter heuristics, not calibrated probabilities.
- `requestRuntime`'s 930-row seeded oracle and lt-2t4 A22 were not extended to this route. The route is stateless and owns no worker. No real-browser A24–A26 run was done for this route, so those rows are **OPEN** for it.
- The dictionary loads at service start (~10 MB in memory). Load failure is permanent until restart, by design.
- There is no operator environment variable to disable the route; only `runtime.morphology.mode` exists.
