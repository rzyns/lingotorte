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

## Completed product evidence

Final-image parent rerun passed 1,017 tests / 36 files, types, build, no-network 5 and privacy scan 49. Real Windows Chromium import/play/save plus nonempty SQLite exact-snapshot restart/integrity and private-address same-origin hydration passed; API exit 0, web SIGTERM exit 143, stop under one second. See `docs/dev/docker-qualification-result.md` for limitations and identity. Only isolated QA containers/volumes/networks were removed; readback showed none remaining. Reviews/publication remain tracked in canonical `lt-foe.2`, not this notes file.
