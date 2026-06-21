# Lingotorte local runbook

Status: V1 local-only developer/user runbook. This document describes how to run and inspect the current local baseline without enabling providers, cloud sync, AnkiConnect, live Lingopie inspection, public sharing, or any external account mutation.

## Scope and safety posture

Lingotorte currently runs as a local Vite/TypeScript web app over synthetic fixtures:

- media fixture: `fixtures/media/synthetic-polish-dialogue.webm`
- target subtitles: `fixtures/subtitles/synthetic-polish-dialogue.target.srt`
- native subtitles: `fixtures/subtitles/synthetic-polish-dialogue.native.srt`
- fixture provenance: [`../../fixtures/README.md`](../../fixtures/README.md)

The fixture set is synthetic/local and contains no Lingopie media, subtitles, screenshots, catalog data, account data, private API payloads, branding, tokens, or private examples. Product boundaries remain governed by [`../review/safety-privacy-boundary-review.md`](../review/safety-privacy-boundary-review.md).

## Prerequisites

- Node.js and npm matching the lockfile environment.
- A checkout of this repo.
- The npm cache already populated if running in no-network/offline mode.

Do not install new packages from the network during V1 acceptance unless Janusz separately authorizes that exact package-manager network action.

## Dependency setup

Preferred command for a fresh local checkout or worktree:

```bash
npm ci --offline --no-audit --no-fund
```

If this fails because the local npm cache is missing required packages, stop and request/record explicit approval before using a networked install. Do not silently fall back to `npm install` or registry access during local acceptance.

Generated dependency/build directories such as `node_modules/` and `dist/` are local artifacts and should not be committed.

## Validation commands

Run these from the repo root:

```bash
npm test
npm run test:no-network
npm run build
npm run typecheck
npm run scan:privacy
python3 validate_final_bundle.py
git diff --check
```

For V1 acceptance also run a conservative tracked-file secret scan and a committed-range whitespace check after committing. If `validate_final_bundle.py` is run while generated dependency docs are present under `node_modules/`, remove generated local artifacts first or run validation in a clean repo-only state.

## Local dev server

Start the app on loopback only:

```bash
npm run dev -- --host 127.0.0.1
```

Use the localhost URL printed by Vite, commonly `http://127.0.0.1:5173/`. Treat the dev server as a tracked local process. Stop it after browser smoke and record the log/PID in the external acceptance packet.

## Browser smoke script

Use WSL Edge DevTools when available. Regular browser tooling is an acceptable fallback if Edge DevTools is unavailable.

1. Open the local Vite URL.
2. Verify the shell loads without fatal console errors.
3. Verify the footer/status says local-only / providers disabled.
4. Open **Library**.
5. Click **Load synthetic fixture**.
6. Verify the app returns to **Player** and shows:
   - video/player stage;
   - transcript panel;
   - synthetic target cue text;
   - native cue text;
   - cue navigation controls;
   - loop and speed controls.
7. In the transcript, use **Show tokens** on a cue and verify a token preview appears.
8. Save at least one sentence through **Save sentence**.
9. Open **Saved** and verify **My Sentences** or **My Vocab** shows local source context.
10. Create a review card from a saved item, then open **Review**.
11. Reveal/rate the due card and verify review bucket/status changes locally.
12. Open **Practice**, submit or skip a local attempt, and verify feedback appears.
13. Open **Export / Import**, click **Generate local export**, and verify the privacy-warning summary appears.
14. Open **Settings** and verify provider/sync/Anki/ASR states remain disabled.
15. Inspect console and network requests after navigation and interactions.

Acceptable network traffic during dev smoke is limited to loopback/local dev-server traffic, `data:`/`blob:` URLs, and Vite internals. Any request to an external host is a V1 blocker.

## Known V1 limitations

- The app is a local fixture-backed baseline, not a packaged desktop/mobile product.
- The plain browser UI does not expose arbitrary local file pickers yet; it imports the synthetic fixture through the Library view.
- Export currently generates and previews a local learner-state manifest and file path; it does not write a manifest file to disk.
- The export path remains a placeholder until a user-chosen local export/download workflow is designed.
- Providers, AnkiConnect, cloud sync, live Lingopie inspection, generated subtitles/ASR, pronunciation/shadowing, and public sharing remain disabled or out of scope unless separately approved.
