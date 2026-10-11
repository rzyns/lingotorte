# Docker-primary contributor and private runtime

Docker with a Linux engine and Docker Compose is the primary reproducible path. The original app ran in WSL; direct local development remains available, but native Windows launchers are not prerequisites for this path. No host Node, Python, ffmpeg, npm install, learner-state migration or ASR model download is required.

## Select scope before starting

Use only your own media. Select one **absolute existing directory**, mounted read-only at `/media`. Never mount a home directory, repository, credentials or Docker socket. For a synthetic rehearsal select this checkout's `fixtures/media` directory explicitly instead of private files.

Linux / WSL shell (Docker daemon must be able to access the path):

```sh
export LINGOTORTE_MEDIA_DIR="$(pwd)/fixtures/media"
export LINGOTORTE_BIND_HOST=127.0.0.1 # rehearsal: host-only
export LINGOTORTE_WEB_PORT=5173
```

Windows PowerShell, from the checkout:

```powershell
$env:LINGOTORTE_MEDIA_DIR = (Resolve-Path './fixtures/media').Path
$env:LINGOTORTE_BIND_HOST = '127.0.0.1'
$env:LINGOTORTE_WEB_PORT = '5173'
```

Git Bash with Windows Docker uses an explicit native path, e.g. `export LINGOTORTE_MEDIA_DIR='C:/work/lingotorte/fixtures/media'`. Paths containing spaces are supported. Compose refuses an unset media variable or missing directory; it will not create a folder or silently select private media.

## Build and run

```sh
docker compose -p lingotorte-private config --quiet
docker compose -p lingotorte-private build api web
docker compose -p lingotorte-private up -d api web
docker compose -p lingotorte-private logs --tail 50 api web
```

Open `http://127.0.0.1:5173` with the host-only example. In Settings explicitly connect to `/`: browser API calls use the web origin's `/api` proxy, not the browser machine's localhost. API port 5174 is **not published**. A manually selected absolute service URL is still supported; cross-origin access remains subject to the service's existing narrow CORS policy.

For an explicitly authorized trusted private LAN, set `LINGOTORTE_BIND_HOST=0.0.0.0` (the Compose default), choose the web port, and set `LINGOTORTE_WEB_ALLOWED_HOSTS` to the exact comma-separated hostname(s) used by browsers, for example `lingotorte.local,my-workstation`. Vite continues to enforce its hostname allowlist; IP hosts and localhost follow Vite's built-in rules. Do not disable host protection. Never expose this Vite preview server to the public internet or forward router ports. This is a contributor/private server, not hardened production hosting; LAN binding, CORS and same-origin routing are not authentication or authorization. The separate request-authenticity security work remains outstanding.

Backend media paths are Linux container paths, e.g. `/media/synthetic-polish-dialogue.webm`, **not Windows drive paths**. Browser file handles/object URLs remain playback-only. Persistent browser handles can be unavailable on plain HTTP LAN origins because they require a secure context; ordinary file import still works. Python and ffmpeg are installed only inside the image. ASR libraries/models are not installed and providers remain disabled. The API is attached only to an internal network, preventing its outbound internet access in the default stack. The web proxy also has a normal ingress network so the published port is reachable; this is not an outbound-network sandbox for the web process.

## Contributor verification

Edit on the host, then rebuild the source snapshot. Verification mounts neither host source nor media nor learner state; workspace packages resolve inside `/app`, avoiding ancestor worktree node_modules links.

```sh
docker compose -p lingotorte-private --profile tools build contributor
docker compose -p lingotorte-private --profile tools run --rm --no-deps contributor node node_modules/vitest/vitest.mjs run
docker compose -p lingotorte-private --profile tools run --rm --no-deps contributor node node_modules/typescript/bin/tsc --noEmit
docker compose -p lingotorte-private --profile tools run --rm --no-deps contributor node node_modules/vite/bin/vite.js build --config vite.config.ts
docker compose -p lingotorte-private --profile tools run --rm --no-deps contributor node node_modules/vitest/vitest.mjs run tests/no-network
docker compose -p lingotorte-private --profile tools run --rm --no-deps contributor node scripts/check-privacy-boundaries.mjs
```

The media variable is still required to parse Compose even when running only the contributor profile; using the synthetic directory is sufficient. For strictly network-isolated verification use `docker build --target contributor -t lingotorte:verify .` then `docker run --rm --init --network none lingotorte:verify node node_modules/vitest/vitest.mjs run` (the same direct commands work for other checks). Runtime images bake `/` as the default; contributor images retain the direct localhost development default.

The base is the official multi-architecture Node 26.7.0 Bookworm slim index digest recorded in Dockerfile. Lockfile dependencies install with scripts, audit and fund disabled. Debian package versions follow Bookworm's repositories at build time, so the base/dependency source is pinned but rebuilds are not bit-for-bit identical; retain the qualified image ID when exact runtime bytes matter. Non-root `node` runs both services directly, with Compose init forwarding signals. `.dockerignore` is default-deny plus application inputs, with environment files, Git/Beads/worktrees, databases and caches excluded. An empty image-only `/app/.git` directory is a nativeConfig source-root exclusion sentinel, not copied Git history or a usable Git repository.

## State, stop and reset

State, scratch and model cache use separate Linux-native named volumes at `/state`, `/scratch`, `/models`. They do not overlap media or source. Nothing imports an old learner database. Keep a project name stable to reopen the same volumes; change it to create an isolated synthetic instance.

```sh
docker compose -p lingotorte-private stop # SIGTERM, 30-second grace; Docker kills if timeout expires
docker compose -p lingotorte-private start
docker compose -p lingotorte-private down # containers/network removed, volumes retained
```

Only after explicit confirmation that **this project's** state is disposable:

```sh
docker compose -p lingotorte-private down --volumes
```

This deletes that project's learner state and scratch/model caches, not media. Never use global Docker pruning. Logs are diagnostic; do not publish private payloads. Rebuild after edits, then use `up -d --force-recreate api web` for that project only; do not recreate other stacks. Final runtime qualification still requires real-browser synthetic import/playback/save/reload, graceful exit receipts, SQLite integrity and persistence across restart—not just passing mocked client tests.
