# Lingotorte persistence audit — why reload loses everything (2026-10-13)

**Symptom:** reload the page → no media, no transcript, no saved items; must re-import / re-link.
**Verdict:** working as designed, and the design has *five* independent gates that all have to be open before anything survives a reload. On this machine (Windows host, Docker stack, browser at `http://127.0.0.1:5173`) the probe shows zero of them are open.

Evidence labels: `[observed]` live probe in the running app · `[code]` file:line · `[inferred]`.

---

## Live probe `[observed]`

Run from the page's own origin:

| Probe | Result | Meaning |
|---|---|---|
| `GET /api/health` | 200 | Docker stack is up; Vite preview proxies `/api` → `api:5174` |
| `GET /api/status` | **401** | Service is reachable but **this tab is not paired** |
| `GET http://127.0.0.1:5174/api/health` | fetch error | API port isn't published to the host (by design, `compose.yaml`) |
| `indexedDB.databases()` | `[]` | Handle store has **never been written** — no persistent file handle exists |
| `localStorage` | 0 keys | Nothing browser-side is persisted at all |
| `isSecureContext` / `showOpenFilePicker` | true / function | Persistent handles *would* work on this origin |

---

## The five gates `[code]`

The browser app holds **all** learner state in memory (`AppModel`). There is no localStorage, no IndexedDB snapshot, no service-worker cache — `grep localStorage|indexedDB apps/web/src/*.ts` finds only the handle store. State survives a reload only if every one of these is true:

### Gate 1 — The local service must be paired, *every page load*
- Pairing secret lives in process memory only: `pairedTransport.ts:1` "Pairing authority is process memory only, never part of the serializable app model."
- The Settings view says it outright: *"Reload requires fresh pairing."* (`app.ts:4366`).
- Nothing calls `connectLocalService` on boot. The only caller is the Settings "Connect local service" button (`app.ts:4379`). `main.ts` just builds an empty model and renders.
- So on reload the sequence is: Settings → paste capability → Connect → (possibly resolve a "Keep browser work / Load service state" choice) → hydrated. Skip any step → empty app.

### Gate 2 — The capability is only obtainable from a private Linux terminal
- `privateDelivery.ts:12` and `:44`: `if (process.platform !== 'linux' …) throw failure()`. The native (`tty`) delivery mode **cannot run on Windows at all**; the Docker `socket` mode works but the capability is read with `docker compose … exec -it api node scripts/pair-local.ts` in an interactive terminal (`docker-runbook.md:41`), and it **rotates on every service restart** (`:44`).
- The runbook forbids storing it anywhere ("never … browser persistent storage"), so the app can't remember it for you by policy.

### Gate 3 — Something must actually send the save
- Default `autosaveEnabled: false` (`model.ts:175`), and it's reset to `false` on every pairing (`model.ts:203`). The checkbox state itself is in-memory, so it's off again after reload.
- Without autosave, only the Settings "Save state now" button writes to SQLite (`app.ts:4394`).
- Net effect: even when paired, saving a word in the Player does nothing durable unless you went to Settings first and ticked Autosave *this session*.

### Gate 4 — The media file itself must be relinkable
Media bytes never go to the service; only metadata does. Which import path you used decides whether playback can come back:

| Import path | `originalPath` stored | After reload (once state is hydrated) |
|---|---|---|
| **Import local media** (`<input type=file>`) | `blob:http://…` (`model.ts:1273-1284`) | `needsMediaRelink()` → true (`model.ts:1154`); blob URLs die with the page. **Must re-pick the file**; relink matches by content SHA-256, so it does recover the record. |
| **Import persistent media handle** (`showOpenFilePicker`) | `browser-file-handle:<name>` | Handle is put in IndexedDB (`model.ts:1409`) and restored after hydration (`model.ts:440`, `:1415`). Usually needs one permission click. |
| **Load synthetic fixture** | `/fixtures/…` URL | Plays immediately. |

Two further catches:
- The handle store has **one key** — `'current-media-handle'` (`model.ts:1373`). Only the *last* handle is kept. With two or more videos, every switch to an older one is a relink.
- Handle restoration runs **only inside `connectLocalService`** (`model.ts:440`; comment in `main.ts:9-11`). So Gate 1 blocks Gate 4 even though IndexedDB itself needs no service.

### Gate 5 — Hydration must choose the service snapshot
- After connect, if the browser model is "dirty" vs the service snapshot you get a three-way choice banner (`model.ts:424-430`). Fine in principle, but on a fresh reload the browser is empty, so it's a no-op — *unless* you imported something before pairing, in which case you must pick "Load service state (discard browser edits)" and lose what you just imported, or "Keep browser work" and lose what was saved. Easy to pick wrong.

---

## Why this feels broken as a daily driver `[inferred]`

Every one of those gates is a reasonable *security* decision for a multi-tenant LAN deployment: capability not persisted, rotation on restart, explicit save acknowledgement, no media bytes leaving the machine. Stacked together for a single user on their own laptop they add up to: **the default experience is amnesia, and the path to persistence is a 6-step ritual through Settings that you have to repeat after every reload and every `docker compose restart`.** Nothing in the Player tells you this; the only hint is a generic "Browser changes are unsaved" banner.

---

## Options, cheapest first

### A. Make the ritual survivable (no security change) — ~1 day
1. **Browser-side snapshot cache.** On every `markUnsavedBrowserEdits`, write `model.store.snapshot()` + `currentMedia.id` to IndexedDB (not localStorage — snapshots will exceed 5 MB). On boot, hydrate from it *before* rendering. This alone fixes "nothing is saved" for saved items, cards, transcripts. The service remains the durable/portable store; the cache is a crash buffer.
2. **Restore the media handle on boot, independent of the service.** Call `restoreBrowserMediaHandle` from `main.ts` after step 1, not only inside `connectLocalService`. Needs a user gesture for `requestPermission` → show the existing relink placeholder with a single "Reconnect <filename>" button.
3. **Store one handle per media id**, keyed by `media.id`, not a single `'current-media-handle'`.
4. **Autosave default on** once paired; persist the checkbox (it's a preference, not a secret).
5. **Make "Import persistent media handle" the primary button** and demote `<input type=file>` to a fallback for non-FSA browsers — it's the only import path that can come back after reload.

### B. Make pairing survive a reload (small, deliberate security relaxation) — ~half a day
- Keep the capability in `sessionStorage` (cleared when the tab closes, not on reload), or in IndexedDB with an explicit "Remember this pairing on this device" checkbox. Auto-connect on boot when present; fall back to the Settings flow on 401.
- Rotation-on-restart stays; you'd re-pair after `docker compose restart`, not after every F5.
- Worth a one-line entry in `DECISIONS.md` since it amends the "never browser persistent storage" rule in the runbook. For a single-user laptop that rule is costing more than it protects.

### C. Stop treating the browser as the source of truth — bigger, cleaner — days
- Service streams media: add a `/api/media/:id` range-request route reading from the `/media` bind mount. Then `originalPath` is a stable container path, there is no blob/handle dance, and the Library can list every imported file. The Docker stack already mounts `/media` read-only, so the plumbing is half there.
- Browser becomes a thin client that autosaves on every mutation.

**Recommendation:** do A1–A3 now (they're pure UX, zero policy change, and A1 alone kills the symptom), decide B as a conscious `DECISIONS.md` entry, park C until the Library redesign from the UX audit.

---

## Side notes found on the way
- `.env` in the repo root holds a live-looking `ELEVENLABS_API_KEY`. It is git-ignored, but it was readable by this audit; rotate it if it was ever shared and consider moving it to a secrets store.
- The `LINGOTORTE_DATA_DIR` in `.env` points at a Linux home path (`/home/openclaw/…`) — a leftover from the WSL era; harmless under Docker but confusing.
- Settings view: the "Session capability" field is `type=password` and clears on input — correct for secrecy, but it means a typo costs a full round-trip to the terminal. Consider a "Paste from clipboard" button.
