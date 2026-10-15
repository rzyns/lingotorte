# lt-fnl — reload persistence qualification, 2026-10-15

**Result: PASS.** Steps 1–4 passed in Chrome. The degraded path in Firefox also passed. Two follow-up bugs were filed (see Findings).

- **Run by:** Janusz. He did not implement the lt-ddy children, which satisfies the issue's requirement for a non-implementer.
- **Script:** `docs/dev/lt-ddy-reload-qualification-script.md`.
- **Recorded by:** the agent, from Janusz's report on 2026-10-15. Evidence label: `[observed]`, by the human tester.

## Build

| Item | Value |
|---|---|
| Commit | `8260f89` |
| Image ID (`lingotorte:local`) | `sha256:c3c6a73cbecdc9e043fdc8d3b91111494c7271a519a1a427051687f543fe18b9` |
| Compose project | `lt-ddy-qual`, isolated volumes |
| Origin | `http://127.0.0.1:5173` |
| Media folder | a scratch copy of the synthetic fixture only |
| Online providers | disabled (`allowOnlineProviders:false`, `apiKeyPresent:false`) |

API startup line, as reported:

```
{"ok":true,"service":"lingotorte-local-service","origin":"http://127.0.0.1:5173","config":{"host":"0.0.0.0","port":5174,"databasePath":"[local-sqlite]","scratchDir":"[local-scratch]","modelCacheDir":"[local-model-cache]","defaultAsrModelName":"base","allowOnlineProviders":false},"providers":{"elevenLabsScribe":{"onlineProvidersAllowed":false,"apiKeyPresent":false,"ready":false}}}
```

Browser versions were not recorded. **Deviation:** Firefox was run in an InPrivate/private window.

## Results

| Step | Browser | Result |
|---|---|---|
| 1. Unpaired: save → F5 → state, transcript, cards and video restored without opening Settings | Chrome | **pass**. See finding F1: the picker import ignored the subtitle files, so the fallback import was used for subtitles. |
| 1. Degraded path | Firefox | **pass**. State restored. "Choose media again" showed "This browser does not support persistent file handles…". That is expected, because Firefox has no `showOpenFilePicker` in any mode. See finding F2. |
| 2. Paired: autosave → F5 → no Keep/Load prompt | Chrome | **pass** |
| 3. Divergence: Keep → save advances; Load → service state wins and survives F5 | Chrome | **pass** (both runs) |
| 4. `restart api` → disconnected, cache still restores on F5, pairing forgotten | Chrome | **pass** |
| 5. `down -v`; media folder holds only the original file | — | not explicitly reported |

## Cache readback (no capability stored)

Console snippet output, which lists names and keys only:

```
{"dbs":["lingotorte-handle-store","lingotorte-remembered-pairing","lingotorte-snapshot-cache"],
 "cacheKeys":["schemaVersion","savedAt","snapshot","currentMediaId","targetTrackId","nativeTrackId","localService","lastAcked"],
 "snapshotKeys":["mediaAssets","mediaObservations","subtitleTracks","cues","transcriptWordTimings","savedItems","savedOccurrences","reviewCards","reviewCardStates","reviewEvents","practiceAttempts","learnerAudit","exportJobs","providerPolicies","importJobs","importJobEvents"]}
```

How these fields are defined in the code (`[code]`, `apps/web/src/browserSnapshotCache.ts:45-46,107-108`):

- `localService` is `{ baseUrl, autosaveEnabled }`.
- `lastAcked` is `{ baseUrl, serialized snapshot }`.

None of the cache record keys holds a pairing capability. The remembered pairing lives in its own database (`lingotorte-remembered-pairing`), as required by contract lt-z41.

## Findings

- **F1 (bug):** "Choose video (recommended — stays linked after reload)" imports only the video and ignores the subtitle files selected beside it.
  - Seen by Janusz in Chrome.
  - In the code, `views/library.ts` passes only `mediaHandle` to `importBrowserLocalFileHandles`.
  - Impact: a learner who uses the recommended path gets no transcript.
- **F2 (minor):** in Firefox, the relink screen's "Choose media again" is a dead end: it only shows an error.
  - Fix direction: without `showOpenFilePicker`, that button should open the file input or go to Library → Add media.

Both findings are filed as follow-up issues; neither is fixed here, as the issue requires.

## Outcome

Steps 3–6 of the lt-fnl acceptance pass in Chrome, and the degraded path passes in Firefox.

The lt-ddy epic still has one optional child open: lt-ddy.1, a P3 "Clear this browser's cached state" button.
