# 2026-07-19 merge + deploy receipt — accepted LDM4 B7 to main, Node 26 compatibility fixes

Generated: `2026-07-19T14:49:06Z`
Operator: Janusz via Cowork (Claude) chat session; explicit "Yes, please!" to "merge + deploy" after the 2026-07-19 status revalidation.
Workspace: primary checkout `/home/openclaw/workspace/lingotorte` (`main`); worktree `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish` (`lingotorte/m1-daily-driver-polish`).

## What was authorized and done

1. **Fast-forward merge of the accepted LDM4 B7 work to `main`**: `28c942a` → `bad4bd9` (docs revalidation) → `b74327c` → `d04d63a`. Preflight: clean worktree, ancestor check, no `package.json`/`package-lock.json` changes (no `npm ci` needed).
2. **Service restart exposed a latent Node upgrade breakage** (not caused by the merge): the linuxbrew Node had been upgraded to 26.5.0 (only version left in the Cellar) while the services kept running from a pre-upgrade process since 2026-07-06. On restart, `lingotorte-local-service.service` failed with `ERR_MODULE_NOT_FOUND` (extensionless relative TS imports), then `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` (parameter properties; Node 26.5 has no transform-types mode). Even the previously deployed `28c942a` could not have booted under this Node.
3. **Fix-forward commits on `lingotorte/m1-daily-driver-polish`** (local, reversible, tested — within the DECISIONS.md autonomous lane):
   - `b74327c` — explicit `.ts` extensions on 37 extensionless relative imports across 14 files in `packages/*` (tsconfig already had `allowImportingTsExtensions`).
   - `d04d63a` — six parameter-property constructors converted to explicit fields (`SavedOccurrenceService`, `PracticeService`, `RestoreService`, `ExportService`, `ReviewScheduler`, `ReviewService`); no behavior change.
4. **Deploy**: `main` fast-forwarded to `d04d63a`; `systemctl --user reset-failed` + restart of `lingotorte-local-service.service` and `lingotorte-web.service`.

## Validation

Worktree gates at `d04d63a`: strip-mode import smoke loads all six node-side package graphs under plain `node`; `node --check` parses `server.ts`; `npm run typecheck` 0 errors; `test:no-network` 5 passed; `scan:privacy` ok (44 files); `npm test` 26 files / 231 passed / 4 skipped (known audio-recall jsdom skips); `vite build` ok; `git diff --check` clean.

Post-deploy: both units `active`; `GET /api/health` ok; `GET /api/status` ok with schemaVersion 7, snapshot present, migrations 1..7; web UI HTTP 200.

## Boundaries preserved

- No push to any remote was performed (`origin/lingotorte/m1-daily-driver-polish` remains at `28c942a`, `origin/main` at `eee1a5c`); push remains a separate pending decision.
- No PR/release/public exposure, no provider calls, no learner-state mutation, no model downloads, no new dependencies installed.

## Follow-ups

1. Push of the updated branch (now `d04d63a` + this receipt commit) — awaiting Janusz.
2. Next batch selection (B7 browser UI wiring / B6 snippets / B4 benchmark) — awaiting Janusz.
3. Consider pinning Node (e.g. brew `node@LTS`) or adding a boot smoke to the runbook so future brew upgrades can't silently strand the services (any restart would have failed since the upgrade).
