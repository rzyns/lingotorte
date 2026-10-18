# ADR-0001 — Subtitle parsing is a runtime-agnostic module; file I/O and hashing are adapters

Status: **Accepted** (`lt-2se.3`; Lane A implementation and Docker receipts below)
Date: 2026-10-17 · Author: Code Architect · Beads: `lt-2se`, `lt-2se.1`, `lt-2se.2`, `lt-2se.3`
Plan: `docs/plan/architecture-deepening-plan.md` §1

## Context

`@lingotorte/subtitles` (`packages/subtitles/src/import.ts`) exposes `parseSrt(path, …)`, `parseVtt(path, …)`, `parseAss(path, …)` and `importSubtitle({ path, … })`. Each reads the file with `readLocalSubtitle` and hashes cue text with `sha256Text`, both from `@lingotorte/storage`, which imports `node:fs` and `node:crypto` (`packages/storage/src/mediaHelpers.ts:1-3`). File reading and hashing are therefore part of the parser's **interface**, and the package cannot be loaded by the browser.

The browser app responded by carrying a second parser in `apps/web/src/model.ts:820-1165` (`parseBrowserSrtText`, `parseBrowserAssTextBody` and ~15 helpers) with byte-identical regular expressions. The two copies have drifted: the Node parser rejects a VTT file without a `WEBVTT` header (`import.ts:403-405`), the browser accepts it (`model.ts:1090`); the browser copy cannot set `transcriptStatus`/`transcriptSourceKind`/`provenance`. UI copy classifies parser failures by regex-matching the error **message** (`model.ts:1369-1375`).

Deletion test on the browser copy: if the package were importable from the browser, the copy would vanish with nothing reappearing elsewhere — it is a pass-through.

## Decision

1. Parsing is a pure module: `parseSubtitleText(text, format, options?): SubtitleCueDraft[]` in `packages/subtitles/src/parse.ts`, importing only domain types and the relocated `normalizeCueText` from `@lingotorte/domain`. A test asserts the file has no `node:` or `@lingotorte/storage` import.
2. Failures are typed: `SubtitleParseError extends TypeError` with `code`, `format`, `blockIndex`. Message strings stay identical to today's so existing `toThrow(/…/)` tests hold; callers switch to `code`.
3. Two adapters satisfy the seam: the Node adapter (`import.ts`, same exported names) reads the file and hashes with `node:crypto`; the browser adapter (inside `model.ts`) reads `File.text()` and hashes with `crypto.subtle`/portable SHA-256. The browser copy of the parser is deleted.
4. Resolved drift (D-A2): the `WEBVTT` header is **optional** for `format === 'vtt'` in both runtimes.
5. Preserve existing ASS/SSA overlap compatibility (approved on `lt-2se.2`): `options: { allowAssOverlap?: boolean }` defaults to false. Only the browser adapter opts in, preserving its previous overlapping-dialogue imports for both `.ass` and `.ssa`. The Node adapter is unchanged and remains strict; SRT/VTT always enforce non-overlap, even with this option. ASS timing, required-header and nonempty-text validation still run. This explicit policy belongs in the one shared parser, not in a duplicated browser implementation.

## Alternatives considered

- **Leave both copies, add a shared test fixture to keep them aligned.** Rejected: keeps two implementations of one interface; drift already happened once.
- **Move the parser to `@lingotorte/domain`.** Rejected: domain holds types/factories/guards; a 400-line parser would make it the new catch-all.
- **New package `@lingotorte/subtitle-core`.** Rejected for now: requires `npm install`/lockfile changes outside the authorised scope; `packages/subtitles` already has the right name and no browser-incompatible code once `parse.ts` exists.

## Consequences

- One parser, one robustness suite; browser imports gain the status/provenance overrides.
- `packages/subtitles/package.json` still lists `@lingotorte/storage` for the Node adapter; the browser imports `parse.ts` directly, so the dependency is harmless at runtime (Vite tree-shakes by import path). If a bundler ever complains, splitting the package is the follow-on.
- `apps/local-service/src/server.ts:661` (embedded-subtitle extraction) is unaffected: it keeps calling `importSubtitle`.

## Outcome

- `lt-2se.1` merged as `125980e30152eded25b2d697efb5eb7a80f713a3` (parser core and Node adapter; reviewed tip `133ed2876d775c7580e9c37f5727949353a78ae0`).
- `lt-2se.2` merged as `e47a3e9d5855a1cbd0e8a33689faabf2f47b0275` (browser adapter and ASS/SSA compatibility; tip `cc7eb995ef9f267238f88145140287556894ab2e`).
- `apps/web/src/model.ts`: **4,399 → 4,185 lines**, **214 fewer**, measured from the A1 merge to the A2 merged tree. The duplicate parser sections are deleted; the browser uses the shared core. This satisfies Janusz's approved structural-deletion criterion in plan §1.4, replacing the original ≥300-line estimate, not a claim of ≥300 lines removed.

Docker contributor verification for `lt-2se.3` used source base `c918704d13fe6a9db6a94aa586acdafb348b411d`, tag `lingotorte:verify-lt-2se3`, image ID `sha256:dd663d687ef467d7239bd2595147dfa88d9858ec51114dcbcb689310a8f45531`. The image built successfully with `docker build --target contributor -t lingotorte:verify-lt-2se3 .`. Each check below ran sequentially in the foreground as `docker run --rm --init --network none lingotorte:verify-lt-2se3 <command>`, without host, media or learner-state mounts and with providers disabled by the image default.

| Command inside contributor image | Actual result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run` | Exit 0; **121 files passed, 1 skipped; 1,940 tests passed, 1 skipped**; 30.84 s |
| `node node_modules/typescript/bin/tsc --noEmit` | Exit 0; no diagnostics (including no e2e baseline errors) |
| `node node_modules/vite/bin/vite.js build --config vite.config.ts` | Exit 0; 62 modules transformed; build completed |
| `node scripts/check-privacy-boundaries.mjs` | Exit 0; `ok: true`, 111 files scanned |
| `node node_modules/vitest/vitest.mjs run tests/no-network` | Exit 0; **3 files / 6 tests passed** |

Actual logs are retained locally under the operator's Hermes scratch directory (`$TMPDIR`): `lt-2se3-build.log`, `lt-2se3-vitest.log`, `lt-2se3-typecheck.log`, `lt-2se3-vite.log`, `lt-2se3-privacy.log`, `lt-2se3-no-network.log`. These are Docker receipts, not host-suite results. The privacy scan checks runtime reference-product markers; the no-network suite covers its exercised intercepted flows, not every possible browser/subprocess path. Independent Lane A specification/quality review and the gate's merge/closure are recorded separately by the coordinator; this implementation receipt does not assert their completion.
