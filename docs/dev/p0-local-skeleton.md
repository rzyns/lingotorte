# P0 local skeleton developer notes

## Scope

This skeleton is the narrow P0 foundation for Lingotorte: a Vite/TypeScript web shell, strict TypeScript config, typed domain placeholders, synthetic fixture catalog, and provider-disabled no-network test harness. It deliberately does not implement media import, playback, saved items, FSRS scheduling, online providers, AnkiConnect, sync, deployment, or public release.

## Local commands

```bash
npm ci --offline --no-audit --no-fund
npm run typecheck
npm test
npm run test:no-network
npm run scan:privacy
npm run build
```

For interactive local smoke, start Vite explicitly on loopback:

```bash
npm run dev -- --host 127.0.0.1
```

If the offline cache is missing, stop before using a network package-manager install unless Janusz separately approves that action. See `local-runbook.md` for the V1 browser smoke script.

## Fixture boundary

Fixture provenance is in `fixtures/README.md` and `fixtures/manifest.json`. The media fixture is synthetic local ffmpeg output; subtitle and transcript fixtures are synthetic text authored for this repository. They contain no Lingopie media, subtitles, screenshots, catalog data, private account data, branding, private API payloads, or examples.

## Provider-disabled boundary

`packages/domain/src/providerPolicy.ts` exposes a disabled lookup adapter that returns a typed local unavailable/disabled result. `tests/no-network/networkTrap.ts` patches `fetch`, `XMLHttpRequest`, `WebSocket`, and Node `http`/`https`/`net`/`dns` primitives during provider-disabled tests so any accidental network attempt fails the test.

## Known P0 limits

- No local service process or SQLite store yet; those belong to P1/P4 slices.
- No playable UI flow beyond the shell; player/transcript work belongs to P2/P3.
- No FSRS dependency has been adopted; FSRS remains a P5 dependency-gated decision.
- The current Kanban card specified branch `lingotorte/p0-skeleton-t_caa843c0`; the control packet's general P0.1 naming table uses `lingotorte/implementation-t_caa843c0/p0-skeleton-fixtures`. This implementation follows the current card's explicit branch/worktree and records that fact for review.
