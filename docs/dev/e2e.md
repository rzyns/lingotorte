# Browser smoke tests (Playwright, lt-42o)

Chromium-only smoke tests for the core learner tasks live in `apps/web/e2e/`:

| Spec | Covers |
| --- | --- |
| `import.spec.ts` | A1 Library → Load synthetic fixture; A2 upload fixture media + target/native `.srt` through the file inputs → Player has video duration > 0 and ≥ 1 cue row |
| `collect.spec.ts` | B1 click a word → "Save a word" form → Meaning → Save occurrence → listed in Saved; B2 real mouse drag-select across two words opens the "Save a phrase" form and saves nothing |
| `review.spec.ts` | C save a word → Review shows one new due card → Show answer → Rate good → empty state, New count 0. No in-page clock hook is exposed, so this asserts the visible state change |
| `reload.spec.ts` | D after the snapshot cache (IndexedDB) holds the save, `page.reload()` → saved item and transcript present without opening Settings |

Every test gets a fresh browser context (clean IndexedDB) and a no-egress fixture (`support.ts`): any page request whose origin is not the stack's web origin (blob:/data: excepted) fails the test; each test logs `[no-egress] … allowlist=[…] observed=[…]`. No data-testid attributes were added; specs use existing ids, roles, visible text and classes.

## Run (Docker, primary)

```sh
npm run e2e                 # all specs
npm run e2e -- review       # extra args go to `playwright test`
```

`scripts/run-e2e.mjs` uses a disposable Compose project `lt-e2e` (override with `LINGOTORTE_E2E_PROJECT`): it builds `api`, `web` (image `lingotorte:e2e`) and the `e2e` runner (`lingotorte:e2e-runner`, Dockerfile target `e2e` FROM the pinned `mcr.microsoft.com/playwright:v1.62.0-noble` digest), starts the stack, runs the specs, then always runs `down -v --remove-orphans`. Only Docker is needed on the host; the host checkout's `node_modules` are not used.

- Media: this checkout's `fixtures/media` only, read-only, as for any synthetic rehearsal.
- Origin enrollment: for this project only, `LINGOTORTE_PUBLIC_ORIGINS=http://web:4173` and `LINGOTORTE_WEB_ALLOWED_HOSTS=web` are set by the wrapper environment. Defaults in `compose.yaml` are unchanged and host protection is not weakened. The web port is still published to `127.0.0.1:${LINGOTORTE_E2E_HOST_PORT:-5193}`, but that origin is not an enrolled public origin; nothing in the run uses it.
- Network: the `e2e` service is attached only to the internal `private` network (no internet egress).
- Failures write a screenshot plus `error-context.md` to `apps/web/e2e/artifacts/<test>/` (bind-mounted from the host; gitignored and excluded from the Docker context).
- Typical time: ~25 s with warm images (~70 s with a rebuild); the specs themselves take ~10 s.

## Run against an already-running stack (host fallback)

Requires `npm ci` on the host and a Chromium 1234 cache (`npx playwright install chromium` downloads it if missing). Start a stack whose enrolled origin is what the browser will use, e.g. per `docker-runbook.md` with `LINGOTORTE_PUBLIC_ORIGINS=http://127.0.0.1:5173` and `LINGOTORTE_WEB_ALLOWED_HOSTS=127.0.0.1`, then:

```sh
LINGOTORTE_E2E_BASE_URL=http://127.0.0.1:5173 npm run e2e:host
```

Use a disposable project: the specs save words into the browser and may write learner state. Never run them against a stack holding real learner state.

## Not wired into `npm test`

Vitest only includes `tests/**/*.test.ts`, so it never picks up `apps/web/e2e/*.spec.ts`. The Docker run needs image builds and exceeds the ~60 s budget on a cold cache, so `npm run e2e` stays separate. `tsc --noEmit` type-checks the e2e sources (they live under `apps/`).

## Out of scope

Providers, pairing (needs a private TTY), real media. Bumping `@playwright/test` requires bumping the runner image tag and digest in the Dockerfile to the same version.
