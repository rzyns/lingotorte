# Docker-primary implementation notes

## Deviations

Docker replaces the native-Windows critical path under fresh user authority; historical Windows evidence stays frozen. The final published-port check required a second, normal ingress network on the web service because Docker's internal-only network did not make the published port reachable. API stays internal-only; the web process is not an outbound sandbox.

## Discovered edge cases

- The service rejects non-loopback bind hosts and the browser defaults to a same-machine backend URL; both need explicit Docker/LAN adaptations.
- Plain HTTP on a LAN hostname is not necessarily a browser secure context. Standard file inputs remain available, but persistent File System Access handles may not be.
- The existing native-config exclusion resolves `/app/.git`; the image provides an empty sentinel directory, not copied host Git metadata. The image-only build preserves that existing guard without refactoring it.
- The Windows Chromium harness initially kept the tab hidden, delaying media decode. Bringing it to the foreground produced actual readyState 4 and advancing playback; a pending play promise was not counted as success.
- The base Node image is not locally cached. Exact image/npm/Debian Python+ffmpeg downloads were explicitly approved through the user UI; no ASR/model or host installation.

## Questions for review

- Verify replacement of only Windows-qualification dependency edges; preserve all remaining product/security gates and native history.
- Keep the finish line actual container stop/restart and browser use, not a new general-purpose native diagnostic harness.

## lt-8hh save-safety implementation

### Deviations
- Content-addressed SHA-256 CAS instead of a new revision column: the entire normalized durable snapshot (including append-only event projections) is checked inside SQLite `BEGIN IMMEDIATE`. Equal content is an equivalent revision; no migration is needed and v1–v8 definitions/checksums remain untouched.

### Discovered edge cases
- Pending connect/save responses and queued saves must lose browser authority on URL change or reconnect. Media-handle restoration also checks owner/context after each await.
- Transcript form drafts are not yet durable snapshot content; they block automatic replacement and prevent a save acknowledgement being advertised as saving those drafts.
- A service may commit a request before the browser loses its acknowledgement. The browser reports failure, preserves its work and revision, and a later changed-content retry conflicts instead of blindly overwriting.
- Server jobs use a separate in-memory job map; extraction returns draft import results and never writes the durable snapshot. Only HTTP state PUT is a runtime snapshot writer.

### Questions for review
- Parent owns sequential specification/quality review and publication. No request-authentication, restore, cloud sync, deployment or real-browser qualification is claimed here.

### Summary
- One reversible design deviation: content-addressed revision rather than a schema change.
- Revisit only if equal-content/ABA states must be distinguished or very large snapshots make hashing prohibitive.
- Four async/durability edge cases documented above and covered by bounded synthetic tests.
- Read `docs/dev/lt-8hh-save-safety-result.md` first for candidate identity and exact results.
- No commits, pushes, Beads writes, real-state or provider actions in this delegated lane.

## lt-192.2 synthetic recovery rehearsal (B)

Pointer: `docs/dev/lt-192.2-recovery-rehearsal-result.md`. Test only; no product change.

### Deviations
- §6.4 expected reconnect readback to settle a lost ack. Instead, current reconnect raises the Keep/Load choice: its comparison is order-sensitive, so identical content is not recognised. The test asserts content identity by readback, with no pending bundles, then chooses Load service state; it does not retry. Revisit when C changes acknowledgement or retry.
- §6.2 practice attempts update FSRS, so each also records a review event. The removed item therefore leaves two audit-only review events, not one.

### Discovered edge cases
- The service and the browser serialize the same learner state in different record orders. Fixture comparisons need key-order-independent equality.
- The candidate revision after the first bundle (`rev:n+1`) is reissued by the rolled-back store for a different state, as §2.5 predicted.
- The first browser PUT after a stale choice is a bundle PUT, and it already gets 409. No learner state is sent.

### Questions for review
- Should C make lost-ack readback recognise identical committed state, or is an explicit Load service state after readback the intended UX?

## Completed product evidence

Final-image parent rerun passed 1,017 tests / 36 files, types, build, no-network 5 and privacy scan 49. Real Windows Chromium import/play/save plus nonempty SQLite exact-snapshot restart/integrity and private-address same-origin hydration passed; API exit 0, web SIGTERM exit 143, stop under one second. See `docs/dev/docker-qualification-result.md` for limitations and identity. Only isolated QA containers/volumes/networks were removed; readback showed none remaining. Reviews/publication remain tracked in canonical `lt-foe.2`, not this notes file.

## lt-192.3 server-owned shared mutations (C)

Pointer: `docs/dev/lt-192.3-shared-mutations-result.md`; contract `docs/architecture/adr-0004-server-owned-learner-operations.md`.

### Deviations
- The fence turns on at the first applied operation, not at upgrade. Upgraded or never-operated databases keep whole-document semantics, so old-client imports still work there.
- Old clients that add vocabulary rows outside operations after activation get a visible `409 operation-owned-rows` (work kept, Restore (merge) offered). Rows are never dropped silently.
- `lt1922RecoveryRehearsal` seeds through the unpaired document path. Its lost-ack reconnect is now recognised as content-identical, which answers the lt-192.2 open question.

### Discovered edge cases
- A tab id kept only in sessionStorage is copied by "Duplicate tab". A Web Lock on the id is required before adopting it.
- Connecting/pairing flushes the outbox, so measurements of "sent on Save" must count per operation id, not per window.
- A dedup capture changes no rows. Its receipt must still carry the canonical item/occurrence/card images.
- Windows Python text-mode writes CRLF. Normalise touched files to LF before hashing or reporting.

### Questions for review
- Should old clients ever be allowed to add vocabulary through the document path after activation, e.g. via an explicit restore-merge only? Current answer: no.

### Independent-review corrections (R1-R6)
- Restore preview/commit keep strict revision CAS; operation-gap rebasing applies to document saves only.
- The document fence rebases a differing operation-owned row only when it equals a stored authoritative image since the basis (`operation_owned_row.history_json`); anything else is `409`. `saveSnapshot` uses the same fence.
- Wire validation types every id/span/time/text/meaning-source before execution; token spans must equal `captureTokenSpan` (the `cueWordTokens` segmentation). The subtitle-overlay capture path was the one browser path that used a different index; it now uses the same helper.
- Dedup drafts stay open in the outbox (`draftReview`) until explicitly resolved; Save is not "all saved" meanwhile.
- Re-review R3: "Use my meaning" is a single outbox `handoff` transaction (add replacement, then resolve the draft's meaning); meaning and notes resolve separately (`draftResolved`), so applying the meaning keeps the notes draft open until "Keep saved notes". Edge: the replacement add is issued before the original's put, so a withheld/failed add never commits a resolved original.
- Edge: a CDP quota override in a long-lived Playwright context reported active but did not refuse IndexedDB writes; a fresh context did. The actual-quota proof uses a fresh context.
- Edge: Player capture failures were only written to `importError` (rendered on Library/relink screens); they now also toast.
