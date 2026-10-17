# ADR-0001 — Subtitle parsing is a runtime-agnostic module; file I/O and hashing are adapters

Status: **Proposed** (set to Accepted by `lt-2se.3` with merge hashes in Outcome)
Date: 2026-10-17 · Author: Code Architect · Beads: `lt-2se`, `lt-2se.1`, `lt-2se.2`, `lt-2se.3`
Plan: `docs/plan/architecture-deepening-plan.md` §1

## Context

`@lingotorte/subtitles` (`packages/subtitles/src/import.ts`) exposes `parseSrt(path, …)`, `parseVtt(path, …)`, `parseAss(path, …)` and `importSubtitle({ path, … })`. Each reads the file with `readLocalSubtitle` and hashes cue text with `sha256Text`, both from `@lingotorte/storage`, which imports `node:fs` and `node:crypto` (`packages/storage/src/mediaHelpers.ts:1-3`). File reading and hashing are therefore part of the parser's **interface**, and the package cannot be loaded by the browser.

The browser app responded by carrying a second parser in `apps/web/src/model.ts:820-1165` (`parseBrowserSrtText`, `parseBrowserAssTextBody` and ~15 helpers) with byte-identical regular expressions. The two copies have drifted: the Node parser rejects a VTT file without a `WEBVTT` header (`import.ts:403-405`), the browser accepts it (`model.ts:1090`); the browser copy cannot set `transcriptStatus`/`transcriptSourceKind`/`provenance`. UI copy classifies parser failures by regex-matching the error **message** (`model.ts:1369-1375`).

Deletion test on the browser copy: if the package were importable from the browser, the copy would vanish with nothing reappearing elsewhere — it is a pass-through.

## Decision

1. Parsing is a pure module: `parseSubtitleText(text, format): SubtitleCueDraft[]` in `packages/subtitles/src/parse.ts`, importing only types from `@lingotorte/domain`. A test asserts the file has no `node:` or `@lingotorte/storage` import.
2. Failures are typed: `SubtitleParseError extends TypeError` with `code`, `format`, `blockIndex`. Message strings stay identical to today's so existing `toThrow(/…/)` tests hold; callers switch to `code`.
3. Two adapters satisfy the seam: the Node adapter (`import.ts`, same exported names) reads the file and hashes with `node:crypto`; the browser adapter (inside `model.ts`) reads `File.text()` and hashes with `crypto.subtle`/portable SHA-256. The browser copy of the parser is deleted.
4. Resolved drift (D-A2): the `WEBVTT` header is **optional** for `format === 'vtt'` in both runtimes.

## Alternatives considered

- **Leave both copies, add a shared test fixture to keep them aligned.** Rejected: keeps two implementations of one interface; drift already happened once.
- **Move the parser to `@lingotorte/domain`.** Rejected: domain holds types/factories/guards; a 400-line parser would make it the new catch-all.
- **New package `@lingotorte/subtitle-core`.** Rejected for now: requires `npm install`/lockfile changes outside the authorised scope; `packages/subtitles` already has the right name and no browser-incompatible code once `parse.ts` exists.

## Consequences

- One parser, one robustness suite; browser imports gain the status/provenance overrides.
- `packages/subtitles/package.json` still lists `@lingotorte/storage` for the Node adapter; the browser imports `parse.ts` directly, so the dependency is harmless at runtime (Vite tree-shakes by import path). If a bundler ever complains, splitting the package is the follow-on.
- `apps/local-service/src/server.ts:661` (embedded-subtitle extraction) is unaffected: it keeps calling `importSubtitle`.

## Outcome

_Filled in by `lt-2se.3`: merge hashes for `lt-2se.1`/`lt-2se.2`, `model.ts` line count before/after, Docker vitest counts._
