# Docker-primary qualification result

Canonical task: **lt-foe.2**. Candidate branch: `work/docker-primary`, based on `147081a`. These are actual synthetic Linux/container/Windows-browser receipts, not native Windows launcher qualification or overall daily-driver acceptance.

## Candidate identity and scope

- Official multi-architecture Node base: `node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32`.
- Runtime image: `lingotorte:docker-primary-candidate`, `sha256:82c3addf8f78643bd8a02192418d938184788b111a4420bbc2dd7120ffb0be28`.
- Contributor image: `lingotorte:docker-primary-contributor`, `sha256:553eb8e0dd0ab0422d96d3cd2d0dbbd62d49145a88bed6c53c2d31cbffd6593b`.
- Parent readback: both image IDs matched `docker image inspect`; running API/web matched the runtime image. Node `v26.7.0`, Linux x64, UID 1000; Python `3.11.2`; ffmpeg `5.1.9-0+deb12u1`. This qualifies amd64, not execution on arm64 or a second contributor machine.
- Image build used only explicitly approved official-image, lockfile npm and Debian Python/ffmpeg downloads. No ASR/model installation, Windows runtime installation, providers, real learner state or private media.
- The image contains an empty `/app/.git` exclusion sentinel for the existing native-config path guard; host Git metadata, canonical Beads, credentials and worktrees are not copied. Package manifest/lockfile and vendored morphology distribution are unchanged.

## Automated execution: parent rerun on final image

Commands use `docker run --rm --init --network none lingotorte:docker-primary-contributor ...`:

| Command inside image | Real result |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **36 files / 1,017 tests passed**, exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit` | Exit 0 |
| `node node_modules/vite/bin/vite.js build --config vite.config.ts` | Exit 0; 32 modules transformed |
| `node node_modules/vitest/vitest.mjs run tests/no-network` | **2 files / 5 tests passed**, exit 0 |
| `node scripts/check-privacy-boundaries.mjs` | **49 files**, `ok: true`, exit 0 |
| `docker compose ... config --quiet` and `git diff --check` | Exit 0 |

The implementer also reported the wildcard-bind regression failing against the original guard, then passing after the change, and a focused **34 tests / 5 files** run. Those are implementer receipts; the full final-image run above was independently executed by the parent. Existing JSDOM `HTMLMediaElement.play()` warnings do not establish browser playback; real browser evidence follows separately. npm dependency vulnerability findings were reported during the build; no dependency upgrade/audit repair is claimed here.

## Actual container and persistent-state journey

Isolated Compose project: `lingotorte-docker-qa`, using only the checked-in synthetic media fixture directory. No existing Docker project/store was adopted. The API is unpublished, attached only to the internal `private` network. The web entry point is attached to `private` plus normal `ingress` and was temporarily published at port **15173**, first on host loopback and then on all interfaces for the same-host private-address check. No firewall/router/DNS configuration was changed.

A real published-port check caught an implementation defect: web on the internal-only Docker network returned connection refused from Windows despite container startup. Adding a normal ingress network to **web only** fixed the host connection. Unpublished API isolation is retained. The web process is not an outbound-network sandbox; the API internal network is.

1. Actual HTTP `/api/health`, `/api/status`, HTML and built JS were served through the web entry point; status advertised Linux native paths, service bind `0.0.0.0`, providers disabled, no provider key present.
2. A Windows Chromium browser explicitly connected using service URL `/`. It loaded the synthetic fixture, then imported the explicit checked-in WebM and target/native subtitle files through ordinary file inputs. Imported video decoded to readyState **4**, duration **2.008 seconds**, and advanced to **0.585709 seconds** with `paused: false` through the player button. Bringing the harness tab to the foreground was necessary for media readiness; the initial hidden-tab observation was not counted as playback.
3. The browser saved a sentence and explicitly saved SQLite state. API readback contained **2 media assets, 4 subtitle tracks, 8 cues, 1 saved item and 2 saved occurrences**. This is nonempty learner state, not merely an empty snapshot write.
4. `docker compose -p lingotorte-docker-qa stop api web` completed in **0.8984754999983124 seconds** against a 30-second grace period. API exited **0** through its existing SIGTERM close handler; web exited **143** (terminated by SIGTERM, not SIGKILL). Both stopped, neither was OOM-killed. The test does not exercise stopping during an active ASR/ffmpeg job.
5. Restart reused the same isolated named state volume. The **entire serialized snapshot was exactly equal** to the saved snapshot. `PRAGMA integrity_check` on `/state/state.db` returned **`ok`** after restart. A preliminary integrity command named the wrong filename and failed to open it; that was an operator-command error, not a database failure. The corrected actual configured path was inspected before the successful check.
6. Reloading the Windows browser and reconnecting restored the saved sentence and its **two occurrences**. Browser object URLs/handles are not persistent backend paths, and relinking after restart is not claimed.
7. The same Windows browser opened the host's **private IPv4 address**, connected and hydrated the same sentence. All observed service requests stayed on that origin's `/api/` routes, not the remote client's own `localhost`. The LAN HTTP origin was `isSecureContext: false`. This proves same-host access through the private address, not second-machine firewall reachability. An explicitly allowed synthetic hostname (`docker-check.local`) also returned API health via `curl --resolve`, without changing DNS/hosts.
8. Docker mount inspection showed `/media` as an explicit bind with `RW: false`; the synthetic WebM was readable (1,685 bytes), and a write probe failed with **EROFS / errno 30**. SQLite, scratch and model cache were separate named volumes, not Windows bind-mounted database directories.

Windows browser identity: `HeadlessChrome/145.0.0.0`, platform `Windows NT 10.0; Win64; x64`. This is a real Windows Chromium harness session, **not an Edge-specific qualification or a human usability signoff**. Detailed synthetic observations were saved in the browser workspace as `docker-browser-playback-confirmed.json`, `docker-browser-restart-hydrate.json` and `docker-browser-lan-routing.json`; raw private-address evidence is kept local, not committed.

## Dependency/policy amendment

Independent read-only graph review **PASS**, `deleg_4cdcbdfb/task-1`. Parent canonical readback verified exactly eight blocking-edge replacements from `lt-13v` to `lt-foe.2` on `lt-13i`, `lt-3wr`, `lt-3xg`, `lt-8hh`, `lt-f5h`, `lt-n31`, `lt-q3d` and `lt-sor`; only `lt-c0r` moved from `lt-foe` to `lt-5lb` and became deferred. All unrelated edges/statuses/claims/acceptance fields were preserved. The graph had **64 records / 93 blocking edges**, acyclic, at this readback. Historic native-Windows failures and exhausted allowances remain intact.

The request-authenticity contract now explicitly requires a LAN/proxy-compatible revision before its separate implementation, preserving protected reads/writes, pairing/capabilities, exact authority/origin checks, provider gates and zero-side-effect rejection. This runtime does not claim authentication or secure private-data/multi-user operation.

## Qualification limits and finish gates

- This is a trusted-network **contributor/development baseline**, not public production serving; Vite preview is not a public production-server endorsement.
- User-owned real media/state were never used or migrated. Persistent File System Access browser handles may be unavailable over plain LAN HTTP; ordinary file inputs worked.
- Transcript dirty approval, request authenticity, restore/relink, practice and remaining daily-driver/human gates are not repaired or closed by Docker qualification.
- No native Windows launcher repair/retry, ASR model download, provider call, hosted/persistent deployment, main merge, PR or release was performed.
- Independent specification/quality verdicts, final cleanup and exact Git remote-readback receipts are recorded in the final canonical issue notes rather than inferred from successful tests.
- Cleanup: parent ran `docker compose -p lingotorte-docker-qa down --volumes`. Label-scoped container, volume and network readbacks were all empty. Only this synthetic QA project was removed; verified images remain cached. No service was left running as a persistent rollout.
