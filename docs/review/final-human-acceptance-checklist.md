# Final human-acceptance checklist (`lt-4ct`)

This file lists the checks Janusz performs himself before accepting the qualified local daily-driver candidate. Automated tests and the real-browser harness can't cover them, or Janusz chose to confirm them personally. Gate `lt-4ct` closes only after he explicitly accepts the exact candidate revision. Acceptance doesn't authorize rollout, real-data copying, providers, push or deployment.

Run every check with synthetic or owned test media, on an isolated store (for example a fresh Docker volume), never against real learner state.

Each item records its source issue and what automation already proved.

## Media identity and relink (`lt-n31`)

Automated evidence:
- `tests/web/lt-n31Relink.test.ts`
- Real-browser batch run 4, receipt `docs/dev/browser-qual-batch-plan.md`: relink-01/02/03 PASS, relink-04 OBSERVED.

Files in the batch were supplied over CDP, so the browser's native file chooser and permission prompt were never driven.

- [ ] **Persistent media handle permission prompt.**
  1. Use **Library → Import persistent media handle** and pick a synthetic or owned video through the native file chooser.
  2. Reload the page, or close and reopen the browser.
  3. Confirm the browser asks to grant access to the file again.
  4. Grant access: the same media plays with its subtitle track and saved occurrences intact, with no new media item.
  5. Deny access: the app shows a visible relink message and doesn't silently import a replacement.
- [ ] **Renamed file with identical content relinks automatically.** Copy the media file under a new name, then reselect the copy. It must attach to the existing media item, with the same track selection and saved anchors, without asking. (Janusz endorsed this behaviour on 2026-10-13.)
- [ ] **Same filename, different content asks first.** Pick a different file with the original filename.
  - The app must offer **Import as new media** or **Cancel**.
  - **Cancel** changes nothing.
  - **Import as new media** creates a separate media item and leaves the original untouched.

## Coverage the qualification lanes did not exercise

These are recorded limits of the automated and harness evidence. They are not known defects.

- [ ] **Edge.** All real-browser runs used Chrome. Repeat the persistent-handle check above in Edge if it is the daily browser.
- [ ] **Private-LAN origin.** Runs used the loopback secure context. If the app will be opened from another device on the trusted LAN over plain HTTP, confirm the experience there. Browsers withhold persistent file handles and some APIs outside secure contexts, so the fallback relink path should appear instead.
- [ ] **Hard stop during restore commit.** Harness run 4 stopped the service in-process during a commit, and the app correctly showed *outcome unknown* without resending the commit. Optionally repeat this on an isolated store with `docker kill` on the service container mid-commit, then reconnect and confirm the state matches the readback.

## Sign-off

| Field | Value |
|---|---|
| Candidate revision | _to be filled when `lt-3kk` produces the candidate packet_ |
| Checks completed | |
| Disposition | accept / repair / defer |
| Date | |
