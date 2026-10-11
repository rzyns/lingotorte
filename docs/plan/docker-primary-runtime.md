# Docker-primary runtime — authorized replacement scope

Build a reproducible Linux Docker runtime and contributor environment for Lingotorte.
Use Docker Compose, an explicitly mounted media directory, and Linux-native persistent state.
The main technical uncertainty is graceful stop/restart and browser/API routing across the container boundary, not Windows console delivery.

## 1. Decisions already made by Janusz

- Docker is the primary runtime/contributor path across agents, machines and humans. Janusz reports the original app was written and running in WSL; historical Linux operation is context, not acceptance of current bytes.
- Mandatory loopback-only binding is removed. Trusted private-LAN access and container-interface binding are supported. This is not authorization for public-internet exposure, router/firewall changes, hosted deployment or multi-user security claims.
- Mount one explicitly selected media folder read-only at `/media`. Backend paths are container-native (`/media/...`); browser file handles remain playback-only. Do not discover private media or mount home directories, credentials, Docker sockets or the canonical Beads store.
- Keep persistent SQLite state in a named Linux-native volume; use distinct app-owned scratch and model-cache locations. Never silently migrate an existing learner store.
- Keep providers disabled. Installing Python/ffmpeg in the image is not ASR/model installation or provider authorization.
- The user explicitly approved downloading official `node:26.7.0-bookworm-slim`, npm packages fixed by the existing lockfile, and Debian python3/ffmpeg during image builds only. No Windows runtime installation.

## 2. Replacement and retained obligations

The required runtime milestone becomes canonical Beads `lt-foe.2`. Native Windows `lt-c0r` / `lt-a46` / `lt-13v` and their frozen diagnostic handoffs are retained as optional historical/native-support work, not the next critical-path actions. Do not launch, repair, close, reset allowances or overwrite their artifacts. Replace only the live Windows-qualification blocking edges on downstream product issues with `lt-foe.2`, after independent graph review. Preserve every unrelated dependency, status, claim and acceptance obligation.

The Docker baseline must prove its own source/runtime/dependency identity, automated suite, actual startup and persistence, graceful stop/reopen/restart, and a real-browser synthetic journey. It does not repair pending transcript approval, request-authenticity, restore, relink or review/practice defects. In particular, permissive LAN binding is not authentication, and same-origin routing/CORS is not authorization. The existing request-authenticity issue remains required; its loopback-specific design premises need a separately recorded LAN-compatible revision, not silent deletion of its protections.

Old requirements for same-machine loopback binding or native-Windows console/helper/Job Object qualification do not apply to the new Docker runtime. Provider consent, redaction, synthetic validation, source identity, media rights, non-destructive state handling, independent review and final human acceptance do apply.

## 3. Mechanical implementation

- Dockerfile with versioned official Node base (bind digest if practical), lockfile installation, image-only Python/ffmpeg, explicit source exclusions and non-root execution. Separate reusable verification and runtime targets where useful.
- Compose backend and web processes started directly with Node, not the old npm child launcher. Backend listens on the container interface; only the web/API entry point need be published to the host. Use a same-origin `/api` proxy so a browser on another LAN machine does not target its own localhost backend.
- Make the service bind host configurable without loopback refusal while retaining absolute-path, mutable-root and provider checks. Update the misleading loopback-only UI description. Add regressions for the new behavior and same-origin service selection.
- Supply contributor run/test/typecheck/build commands, explicit read-only media bind configuration, state-volume behavior, logs/stop/reset recipes and Windows/Linux path examples. Do not advertise Vite as a public production server.
- Qualify one isolated Compose project with fresh synthetic media/state and separate host ports; remove only that project's containers/volumes after receipts. Never use global Docker pruning or mutate existing stacks.

## 4. Verification and review

Acceptance: full Linux `npm test`, typecheck, build, no-network and privacy-marker checks with exact results; service health/status with providers off and Linux path policy; actual UI assets; synthetic state PUT and exact readback; SIGTERM graceful container exit without timeout/SIGKILL; SQLite integrity and same values after restart; explicit read-only synthetic media mount; separate real-browser fixture import/playback, service connection, save/reload and API routing evidence. Report unsupported browser APIs (e.g. secure-context-only persistent handles over plain LAN HTTP) honestly.

Independent specification review precedes independent quality review. At most three review-driven correction cycles for this issue; ordinary bounded test/edit work is not a renewed Windows retry. Publish only reviewed owned paths on `work/docker-primary`, verify exact remote readback, and record evidence in the primary canonical Beads store. No main merge, PR, release or persistent deployment is implied.
