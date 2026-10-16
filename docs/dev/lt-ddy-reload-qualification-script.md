# lt-fnl — reload persistence check (session script)

**Who runs it:** Janusz. The issue asks for someone who didn't implement the persistence work; Janusz qualifies and the agent doesn't. The agent records the results and writes the report `docs/dev/lt-ddy-reload-qualification-<date>.md`.

**Before you start**
- Firefox isn't installed on this machine. Steps marked **(Firefox)** need it, or we record them as not run.
- Use a fresh Docker project with its own volumes. Never use your real study data.
- The whole run takes about 20–30 minutes.
- At each **Record** line, either tell the agent what you saw, or paste the output of the console snippet at the end of this script.

## 0. Start a fresh stack (PowerShell, from the repo)

```powershell
cd C:\Users\jmdzi\workspace\lingotorte
git pull
$scratch = "$env:LOCALAPPDATA\lingotorte-qual-media"
New-Item -ItemType Directory -Force $scratch | Out-Null
Copy-Item .\fixtures\media\synthetic-polish-dialogue.webm $scratch
$env:LINGOTORTE_MEDIA_DIR = $scratch
$env:LINGOTORTE_BIND_HOST = '127.0.0.1'
$env:LINGOTORTE_WEB_PORT = '5173'
$env:LINGOTORTE_PUBLIC_ORIGINS = 'http://127.0.0.1:5173'
docker compose -p lt-ddy-qual up -d --build api web
git rev-parse --short HEAD
docker image inspect lingotorte:local --format '{{.Id}}'
```

**Record:** the commit, the image ID, and your Chrome version (from `chrome://version`).

You'll need these files from `fixtures\`:
- video: `media\synthetic-polish-dialogue.webm`
- subtitles: `subtitles\synthetic-polish-dialogue.target.srt` and `subtitles\synthetic-polish-dialogue.native.srt`

## 1. Not paired: everything survives a reload

Use a fresh Chrome profile or a Guest window, at `http://127.0.0.1:5173`. Don't open Settings at any point in this step.

1. Library → **Choose video (recommended — stays linked after reload)** → pick the `.webm`.
   - **Possible gap:** in the code, this button imports only the video and ignores the two subtitle fields. If the Player shows no transcript afterwards, note it as a finding. Then use **Pick a video for this session only** (under *Import copy for this session only*) with the video and both `.srt` files, then **Import local media**, so the rest of the step can still run.
2. Player → click a word → type a meaning → **Save**. Then **Save sentence…** on a line → type a meaning → **Save**.
3. Review should show 2 cards.
4. Press **F5**.

**Expect:**
- Both saved items, the transcript and both Review cards are still there.
- The video plays. In Chrome, allow at most one permission click (**Reconnect**). If you used *Import copy*, you should instead see the "Choose media again" screen naming the file.
- The banner says *"Restored from this browser's cache; not yet confirmed by the local service."*

**Record:** what you saw, plus the console snippet output. It lists the browser databases and the keys of the cached record. The agent checks that no pairing secret appears in them.

**(Firefox)** Repeat with **Import copy for this session only**. After F5 you should see the relink screen naming the file, not an error.

## 2. Paired: no Keep/Load prompt when nothing changed

1. In a separate PowerShell window, run:
   ```powershell
   docker compose -p lt-ddy-qual exec -it api node scripts/pair-local.ts
   ```
   Don't paste the code it prints anywhere except Settings.
2. Settings → select `/` → paste the code → tick **Remember this pairing on this device until the service restarts** → **Connect local service**.
3. Leave the **Autosave** checkbox alone; it's on by default. Save one more word in the Player. A toast appears, and Settings shows the service saved it.
4. Press **F5**.

**Expect:**
- The page restores from the cache and reconnects by itself.
- No *"Keep browser work / Load service state"* prompt appears.
- Settings ends on *"Connected to local service and loaded durable state."* (or similar), with no unsaved banner.

**Record:** what you saw, and any Keep/Load prompt.

## 3. Changes made while disconnected: Keep/Load appears

1. Settings → **Disconnect local service**.
2. Save a word in the Player. The banner should read *"Changes not yet saved to the local service — connect in Settings to save"*.
3. Press **F5**, then Settings → **Connect local service**. Pair again if it asks.

**Expect:** *"Browser work differs from durable state. Choose Keep browser work or Load service state…"*

4. Click **Keep browser work**, then **Save state now** (or **Save now** in the banner). The save succeeds, and the word you added while disconnected is still in Saved.
5. Second run: repeat 1–3, then click **Load service state (discard browser edits)**. The word you added while disconnected disappears. Press F5: it's still gone, because the browser cache now holds the service's state.

**Record:** both outcomes.

## 4. Service restart

1. Run `docker compose -p lt-ddy-qual restart api`.
2. In the open tab, do something that talks to the service, such as saving a word.

**Expect:**
- The tab shows that it's disconnected or needs pairing again.
- After F5, the browser cache still restores your work.
- The remembered pairing is gone: it asks you to pair again.

**Record:** what you saw.

## 5. Clean up

```powershell
docker compose -p lt-ddy-qual down -v
Get-ChildItem $scratch    # should list only synthetic-polish-dialogue.webm
```

**Record:** confirm that the media folder holds only the original file.

## Console snippet (DevTools → Console on the app tab)

It prints database names and record keys only, never values:

```js
(async () => {
  const dbs = (await indexedDB.databases()).map(d => d.name);
  const open = n => new Promise((r, j) => { const q = indexedDB.open(n); q.onsuccess = () => r(q.result); q.onerror = j; });
  const db = await open('lingotorte-snapshot-cache');
  const rec = await new Promise(r => { const g = db.transaction('snapshots').objectStore('snapshots').get('current'); g.onsuccess = () => r(g.result); });
  console.log(JSON.stringify({ dbs, cacheKeys: rec ? Object.keys(rec) : null, snapshotKeys: rec?.snapshot ? Object.keys(rec.snapshot) : null }));
})();
```
