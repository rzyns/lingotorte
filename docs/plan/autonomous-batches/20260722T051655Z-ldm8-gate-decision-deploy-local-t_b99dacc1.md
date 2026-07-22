# LDM8 gate decision — deploy locally

Generated: `2026-07-22T05:16:55Z` (`2026-07-22T01:16:55-04:00`)
Gate task: `t_b99dacc1`
Human disposition: option 5, `deploy locally`
Accepted packet: `docs/plan/autonomous-batches/20260721T233201Z-ldm8-b6-visual-snippet-range-ui-human-gate-packet-t_b99dacc1.md`
Reviewed implementation: `0922c733a55f6d02193049a6ece68313ce27d751`
Packet commit deployed: `25b926ffdeb8215f57edc571f6130da319cf551e`

## Decision and authority

Janusz selected the packet's loopback-only local-deploy option. This authorized a fresh local preflight, fast-forward rollout to the primary checkout, restart of the two Lingotorte user services, and bounded health/browser verification. It did not authorize a push, PR, merge to a remote branch, release, public/non-loopback exposure, provider action, private-media selection, real ffmpeg execution, model download, or another local batch.

## Preflight

- Worktree `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish` was clean at `25b926ffdeb8215f57edc571f6130da319cf551e`, five commits ahead of its tracking branch.
- Primary checkout `/home/openclaw/workspace/lingotorte` was clean on `main` at `f1fcd29f102af5ae6f15b47481854fb0130ebda6`; that commit was an ancestor of the deployment target (`0 behind / 5 ahead`), so a fast-forward was available.
- The five-commit delta changed no dependency manifest or lockfile; `npm ci` was not required.
- `systemd-analyze --user verify` passed for `lingotorte-local-service.service`, `lingotorte-web.service`, and `lingotorte.target`. Both running units already pointed at `/home/openclaw/workspace/lingotorte` and bound only to loopback ports `5174` and `5173`.
- Fresh target gates passed: TypeScript typecheck; no-network tests (2 files / 5 tests); focused B6 tests (2 files / 39 tests); privacy scan (`ok=true`, 45 files); Vite build; `git diff --check`.

## Local rollout

1. Fast-forwarded the primary checkout from `f1fcd29f102af5ae6f15b47481854fb0130ebda6` to `25b926ffdeb8215f57edc571f6130da319cf551e` with `git merge --ff-only lingotorte/m1-daily-driver-polish`.
2. Restarted only `lingotorte-local-service.service` and `lingotorte-web.service` at `2026-07-22T01:09:51-04:00`.
3. Created no systemd/config/dependency changes and made no provider, media, model, or learner-state request.

## Verification

- Both services were `active/running` after restart, with systemd main PIDs `1574033` and `1574034`; their working directory was `/home/openclaw/workspace/lingotorte`.
- Child processes were the expected `node apps/local-service/src/server.ts` and repo-local Vite process.
- `ss` showed only `127.0.0.1:5174` and `127.0.0.1:5173` for the two services.
- `GET /api/health` returned `ok=true`; `GET /api/status` returned redacted path labels and schema version 7; the web root returned HTTP 200 with title `Lingotorte Local Study`.
- The served `src/app.ts` contained the deployed B6 controls: `Use transcript selection`, `Loop selected range`, and `Prepare source audio`.
- An isolated headless Edge `152.0.4148.0` smoke loaded only the synthetic fixture. Both source-range sliders became enabled; keyboard ArrowRight changed the start from `0` to `10` ms; visible Start/End/Duration updated to `0:00.01`, `0:01.00`, and `0:00.99`; `Loop selected range` changed the display from `Active loop: none` to `Active loop 0:00.01–0:01.00`.
- The browser smoke reported no runtime exceptions and only `http://127.0.0.1:5173` resource origins. It deliberately left the local service disconnected and did not prepare source audio, run ffmpeg, access private media, use a microphone, or call a provider.
- The temporary headless browser/profile was removed and debug listener `127.0.0.1:9226` was absent afterward. Both Lingotorte services remained active; health stayed OK and the web root stayed HTTP 200.

## Residual note and boundaries

The pre-existing local-service environment still reports provider gate/readiness booleans in redacted `/api/status`; this deployment did not change that environment or invoke a provider. No push, PR, release, public exposure, private-media smoke, model action, destructive learner/media action, or next-batch authorization occurred.
