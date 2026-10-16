# UI vocabulary (learner-facing copy)

Introduced by `lt-unl`. Applies to learner-facing labels in `apps/web/src`.

**Rule:** no browser API names, hashes, version numbers or token indices outside a `<details>` element. Provenance (content hash, token/char spans, track version, FSRS state, ISO due time) stays one click away inside the existing source-details or scheduling disclosure. Developer and Settings diagnostics may keep technical terms.

| Old | New |
|---|---|
| lexeme | word |
| occurrence (as context) | saved from <video> at <time>; counts read "saved N times" |
| Save occurrence (button) | unchanged text (scripts click it); aria-label "Save word with the video and time it came from" |
| cue N | line N |
| track vN | omitted from the primary line (kept in details) |
| approved / draft chip | Transcript ready / Transcript draft — approve before saving words (short form in rows and chips: Transcript draft) |
| no target track | No transcript yet |
| Study cockpit | Player |
| Transcript co-pilot | Transcript |
| Selection | Save a word or phrase |
| Show tokens / Token preview | Show words / Words in this line |
| Local service (learner labels) | Local storage service |
| browser handle / object URL (learner copy) | "files you choose in the browser", "reconnect" |
| N cards in local deck • state • due ISO | N cards · next due <relative, local time> (state/ISO in details) |
| Choose video (recommended — stays linked after reload) | unchanged (lt-1ur); primary video path, listed first (lt-dlf.12) |
| Choose video (session-copy file input) | Pick a video for this session only (secondary when the persistent picker exists; lt-dlf.12) |

Hero status rail: at most 3 chips — transcript readiness, N saved, N due today. Everything else lives in the collapsed "More study status" footer.
