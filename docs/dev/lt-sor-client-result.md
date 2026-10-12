# lt-sor client candidate

## Deviations
- Disjoint client lane only: `apps/web`, `tests/web`, this result and `scratch/lt-sor/client`. Runtime/core tests are another worker's ownership. No publication, Beads change or contract/plan edit.
- Runtime startup seam evolved from historical `onCapability` to current `receiveCapability`; web native-service fixtures use the actual typed callback and keep generated values in closures. Synthetic mock constant is explicitly labeled public mock bytes, not a production capability.

## Discovered edge cases
- JSON/body and transcript hashing awaits require separate ownership checks beyond fetch completion. Snippet WAV-body and DELETE acknowledgements also need checks before another request or Blob promotion.
- Player transfers the operation Blob URL to its own state: an additional original-transport invalidation listener is required to revoke transferred playback, not just the helper's temporary lifecycle.
- URL edit clears pairing and pending input. State choice/CAS ACK queue remains separate from pairing, with browser work preserved.

## Questions for review
- Real-browser A24–A26, independent application reviews and joined full suite remain parent gates. Node/JSDOM is not browser networking proof. Review budget remains the existing two cycles after design correction 1/3; this lane does not reset it.

## Evidence (qualified client lane; not whole-task acceptance)
- Final contributor image `lingotorte:lt-sor-client-qualified2`: `sha256:2acee76a3cb037d1f4044ceeda6d459f67ff854608dabd7bcc34e695ab6f24e8`.
- Fresh `qualified2-web.log`: **375 tests / 17 files passed**, including 46 captured-transport cases, two original red/green regressions and actual Player/Practice continuation ownership tests.
- Fresh `qualified2-types.log` and `qualified2-vite.log`: exit 0. `qualified2-no-network.log`: **5 tests / 2 files passed**. `qualified2-privacy.log`: `ok:true`, 54 scanned runtime files (reference-product marker scan only, not a comprehensive secret/egress/security scan).
- All checks use `docker run --rm --init --network none`, with no host mounts, models, provider calls, private media, real state or existing preview use. Build/install occurs inside the contributor image only.
- `qualified2-source-hashes.json` binds all 30 files under `apps/web` + `tests/web`; `qualified2-source-readback.json` proves 30 exact image matches and expected workspace package symlinks. These are client-source identity receipts, not a claim the concurrently edited runtime bytes are final.
- `git diff --check -- apps/web tests/web` passed. Whole joined suite intentionally deferred to parent after the runtime lane joins.
- Reproduce: build `docker build --target contributor -t lingotorte:lt-sor-client-qualified2 .`, then image-only commands `node node_modules/vitest/vitest.mjs run tests/web`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vite/bin/vite.js build --config vite.config.ts`, `node node_modules/vitest/vitest.mjs run tests/no-network`, `node scripts/check-privacy-boundaries.mjs` under the same network-none run flags.

## Preserved intermediate evidence
- `scratch/lt-sor/client/red-test.log`: original client emitted `/api/status` before pairing and accepted a path-bearing base. Both new regression assertions failed for real fetch calls, not environment errors.
- `green1-web.log`: 19 fixture/ownership failures, 307 passes; preserved raw. `green1-types.log` preserved. Corrected explicit pairing/UUID fixtures without loosening behavioral assertions.
- `green2-web.log`: 366 tests/17 files passed. `green2-types.log`: two test-only TypeScript errors subsequently corrected. Later changes require fresh qualification.

## Current source inventory
- `pairedTransport.ts`: exact origin validation; captured Docker page origin; explicit memory-only owner; forced Authorization, omit credentials, redirect error/cors; response/401 owner fences; callback invalidation/revocation.
- `model.ts`: status/state connect; queued PUT state with expectedRevision and durable ACK; embedded subtitle list/extract create/poll/import; local ASR, Scribe, YouTube create/poll and imported transcript commit/word timings. Fixture-media read remains unauthenticated and separate.
- `sourceAudioSnippet.ts`: same captured owner for POST job, GET poll, UUID-only GET WAV, DELETE-before-Blob; post-await checks; playback URL revocation on owner loss. No API capability in audio URLs.
- `app.ts`: masked explicit Settings pairing/disconnect, generic required re-pair message, original-owner guards on service action UI continuations and Player/Practice source audio. No autoplay, microphone or automatic provider enablement.
- No current browser job cancellation/cleanup caller; shared transport envelope supports them for explicit native/synthetic clients only. Restore branch is not integrated; its later frontend/API consumption remains lt-2t4 work.

## Private browser pairing handoff (not browser qualification)
- Current detached runtime helper invocation, only in an operator-controlled interactive terminal and an already-authorized **disposable synthetic** project: `docker compose -p <disposable-project> exec -it api node scripts/pair-local.ts`. Do not run this through captured tool stdout, a recording terminal, logs or a capability screenshot. The helper has no output-file or public HTTP delivery path. Its live runtime qualification belongs to the runtime worker/parent, not this client receipt.
- Settings now displays the captured exact page HTTP origin when configured with `/`; pair/connect uses that displayed value explicitly. Paste into the masked session input, click Connect, and verify the input is empty. Reload/endpoint edit/disconnect/401 requires fresh private pairing.
- For injected fake-runner browser qualification, reuse the typed `startLingotorteLocalService(config, { receiveCapability(value) { ... } })` seam from the passing native web fixtures. Keep the value in the fixture's private closure and fill the masked browser field without logging/returning it; return only origin/close/fake effect oracles. This lane supplies no public bootstrap or dynamic token in a receipt. A complete real-browser fake-runner kit has not been exercised here.

## Lane summary
- Deviations: two ownership/interface notes; no normative contract relaxation.
- Most likely revisit: browser fake-runner kit and real A24–A26 qualification.
- Edge cases: awaited body/hash/DELETE fences, transferred Blob revocation, separate state-choice/CAS authority.
- First handoff read: this result and `qualified2-source-hashes.json`.
- No commit, push, Beads write/closure, provider/model/real-state or deployment action performed.
