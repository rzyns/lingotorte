# LDM6 configurable local ASR model (`base` default) batch manifest

Generated: `2026-07-21T11:39:44Z`
Preflight task: `t_1b8ea424`
Authorizing instruction: Janusz's 2026-07-21 Cowork authorization captured in the trusted Kanban task body
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Branch: `lingotorte/m1-daily-driver-polish`
Preflight start HEAD: `d4b39df29f15d030ca003965e83451d9791d3198`
Remote boundary: local commits only; no push without a fresh human gate

## Artifact navigation

Role: operational
Review scope: ASR model-default behavior, configuration validation, browser/service authority, status redaction, fake-only tests, validation, and human-gate routing

Derived from:

- `PLAN.md`
  - B4 is complete as a dependency and owned-media quality proof; provider/model-download/public actions remain gated.
- `PLAN-STATUS.md`
  - The B4 row records the 2026-07-21 benchmark recommendation: `base` int8 CPU for Polish daily use and `tiny` for smoke/fallback.
- `DECISIONS.md` section 5
  - The approved benchmark compared `tiny` and `base` on owned Polish media; both remain draft-only inputs to correction/approval.
- `docs/dev/b4-asr-quality-benchmark-2026-07-21.md`
  - Two independent runs support the `base` daily-use recommendation while keeping `tiny` as the fast smoke/fallback tier.
- `docs/dev/local-runbook.md`
  - The service is loopback-only, model/cache artifacts remain outside Git, provider calls stay gated, and Node 26.5 strip-only constraints bind the node-executed graph.

Supported by:

- Kanban task `t_1b8ea424`
  - Active preflight/readback task that produces and commits this manifest.
- Janusz's 2026-07-21 authorization in the task body
  - Authorizes this local, reversible, fake-tested configuration slice only; it does not authorize a model download, live ASR run, provider call, push, PR, deployment, service restart, or public action.

Feeds:

- Kanban task `t_56b91753` (`LDM6-01`)
  - Implementation of the configurable local ASR model default.
- Kanban task `t_300286cc` (`LDM6-02`)
  - Independent read-only implementation review.
- Kanban task `t_86394367` (`LDM6-03`)
  - QA integration validation and durable receipt.
- Kanban task `t_679f3cab` (`LDM6-04`)
  - Final packet and human decision gate.

Verified by:

- Live Git preflight on the intended branch and worktree.
- Source-document, code, test, and package-script readback with SHA-256/line evidence below.
- Exact-scope manifest commit and post-commit path/hash/SHA comment on `t_1b8ea424`.

## Preflight readback

Live workspace state immediately before writing this manifest:

- Git root: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`.
- Branch: `lingotorte/m1-daily-driver-polish`.
- HEAD: `d4b39df29f15d030ca003965e83451d9791d3198` (`docs(b4): add independent second-run corroboration to ASR benchmark`).
- Tracking: `origin/lingotorte/m1-daily-driver-polish` is byte-identical to HEAD; ahead/behind is `0/0`.
- `git status --porcelain=v1 -uall --branch`: clean before this manifest was written.
- No media was opened, no model/cache was read or downloaded, no command runner or provider was invoked, no learner state was changed, and no service, push, PR, release, deployment, or public action was performed during preflight.

Source documents read for this preflight:

| Artifact | SHA-256 | Lines | Scope confirmation |
|---|---:|---:|---|
| `PLAN.md` | `7bf312c0fd25b125ea205ab69a9dfeadd4444ee11b237d18bcc2dafe73dc5854` | 307 | B4 local ASR is a local/offline convenience path; generated output remains draft-only and model downloads/provider/public actions remain gated. |
| `PLAN-STATUS.md` | `2693dd924dfac06b1bc6f8d296fb04f6d4b41f68ea54154dfe1ad34c86d5c7b8` | 151 | B4 is complete; the current recommendation is `base` int8 CPU for Polish daily use and `tiny` for smoke/fallback. |
| `DECISIONS.md` | `6ba00b2be221f63c880cba3d2fd9d7b927bc853db07620cadd6bbdf8af0024cc` | 268 | Section 5 supplies the owned-media tiny/base benchmark gate and requires benchmark outputs to remain correction/approval inputs rather than trusted learner truth. |
| `docs/dev/b4-asr-quality-benchmark-2026-07-21.md` | `8c90a8130f8c1757e567c8d00ebad37ff0bce0b332dd74c0908ae112ce788032` | 60 | Two runs found `base` materially cleaner while still comfortably faster than realtime; `tiny` remains useful as smoke/fallback. No private media path is repeated in this manifest. |
| `docs/dev/local-runbook.md` | `ae270a6c057cad416da8326b52f4d28a7dae387dbcc15f5266e47f65c7913018` | 286 | Documents loopback service operation, local cache/scratch posture, explicit ASR dependencies, provider gates, and Node 26.5 strip-only rules. |

Targeted current-code and test readback:

| Artifact | SHA-256 | Lines | Current behavior relevant to LDM6 |
|---|---:|---:|---|
| `apps/local-service/src/server.ts` | `258fe81bc8529fe27c4fa6577f6fa06f8e40d1fe9530dc4feb5bd63a2f0d3f20` | 1105 | `LocalServiceRuntime.defaultModelName` exists but the CLI never sets it; local payload and public job-summary fallbacks hardcode `tiny`; `/api/status` does not expose an effective ASR default; `configFromEnv()` has no ASR-model env wiring. |
| `apps/web/src/model.ts` | `77b1678bd00f2a501ea84e0a5d27da04456505cc18a509a76585c9f9891b23e3` | 2751 | `makeLocalServiceAsrProvider()` always sends `options.modelName ?? 'tiny'`, duplicating service-default policy in the browser. |
| `apps/web/src/app.ts` | `02251414b3bf62e894c73fc42a101c6f5d35a532c8c7d2c36a78366ac45a51f7` | 3569 | The **Generate local ASR draft** click path passes `modelName: 'tiny'`, so the service runtime default can never govern normal browser jobs. |
| `tests/core/localService.test.ts` | `8bf1098bd74a06f59bfc885b7bfc26969d17c12066e17518099e9df57df7e4c7` | 476 | Uses injectable command runners and temporary service roots; current local-transcription coverage sends explicit `tiny` and status coverage verifies redacted paths but not the effective ASR default. |
| `tests/web/p7TranscriptLifecycleFrontend.test.ts` | `e76c6bd53b04344fbb1ed3f3090f87bd96d28513cf7b964da4541cd466ec2f12` | 432 | Fake-fetch UI coverage currently requires the browser job payload to contain `modelName: 'tiny'`; it is the focused assertion to invert so omission delegates to the service. |
| `package.json` | `f8368a2d041719eaa833e0ce32fcb540a16bc0d9d6aff8aed66036d79f4ffd06` | 47 | Defines the canonical typecheck, Vitest, no-network, privacy-scan, and Vite build commands used by this batch. |

CodeGraph was unavailable because this worktree has no `.codegraph/` index; the preflight used direct source/search readback instead and did not initialize or mutate an index.

## Selected slice and policy decision

**Selection:** make the local-service runtime the single authority for the local faster-whisper model default, configure that authority through `LINGOTORTE_ASR_MODEL`, and set the effective daily-use default to `base`.

The browser will **omit `modelName` for its normal Generate local ASR draft request**. The loopback service will resolve the omitted value from its effective runtime default. This is preferred over duplicating `base` in browser code or adding a new UI selector in this slice:

1. one service-side policy controls CLI, browser, and direct loopback clients;
2. `/api/status` gives operators a read-only way to inspect the effective default;
3. `tiny` remains available as an explicit smoke/fallback override without remaining a hidden default;
4. no new browser-persisted setting, storage migration, model discovery, cache inspection, or availability probe is needed;
5. configuration parsing itself performs no model load or download.

A model-picker UI and service-side cache/availability inventory are deferred. They need separate UX and download-consent semantics and are not required to make the proven `base` recommendation the daily-use default.

## Confirmed LDM6 implementation contract

### 1. Tight model-name contract and effective default

Use one literal-union/readonly-tuple contract rather than an enum or loose arbitrary model string for the service default:

- allowed values, exactly: `tiny`, `base`, `small`, `medium`, `large-v3`;
- daily-use fallback/default: `base`;
- `tiny`: explicit fast smoke/fallback only;
- no TypeScript `enum` because the service runs under Node strip-only mode.

Resolve the effective default once for each service start and use the same resolved value for:

- omitted local-transcription job payloads;
- public local-transcription job summaries;
- `/api/status`.

There must be no remaining hidden `tiny` fallback in those paths. Explicit `tiny` test/smoke requests remain valid.

### 2. Environment wiring and invalid-value behavior

Wire `LINGOTORTE_ASR_MODEL` into `LocalServiceRuntime.defaultModelName` on the CLI startup path before calling `startLingotorteLocalService()`:

- missing or trim-empty value -> `base`, with no warning;
- valid trimmed value from the bounded allowlist -> that exact effective model;
- unsupported value -> `base` plus one warning that names the setting and allowed values but **does not echo, interpolate, hash, or otherwise reproduce the rejected raw value**.

The warning should be deterministic and testable through a pure resolver/result or an injected warning sink. Do not make tests scrape an uncontrolled real service journal. A suitable public warning is semantically equivalent to:

`LINGOTORTE_ASR_MODEL is unsupported; using base. Allowed values: tiny, base, small, medium, large-v3.`

Environment parsing must not instantiate faster-whisper, inspect Hugging Face, touch the model cache, run Python/ffmpeg, make a network request, or download a model. Model execution remains job-triggered only.

Programmatic tests and callers may continue injecting `LocalServiceRuntime.defaultModelName`; the type should be narrowed to the same model-name union when practical. Normalize the no-runtime programmatic case to `base` so direct test/service starts match CLI semantics.

### 3. Job request and summary behavior

For `kind: "local-transcription"`:

- omitted `payload.modelName` -> effective service default;
- explicit allowed `payload.modelName` -> explicit override for that job;
- explicit unsupported model name -> reject with a bounded, raw-value-free validation error rather than running an arbitrary model id or silently substituting another model;
- initial queued job summary and completed/failure status must report the normalized effective/override model name consistently;
- private media, scratch, database, cache, and secret redaction remains unchanged.

Avoid implementing separate fallback literals in `localTranscriptionPayload()` and `payloadSummary()`. Normalize through one helper or normalized payload path so the public summary cannot claim `tiny` while execution uses `base`.

### 4. Browser request behavior

Keep `LocalServiceAsrProviderOptions.modelName` as an optional explicit override seam, but change normal request serialization:

- when `options.modelName` is absent, omit `modelName` from the JSON payload;
- when an explicit option is supplied, serialize it and let the service validate it;
- remove `modelName: 'tiny'` from the app's **Generate local ASR draft** provider construction;
- keep `alignWords: true`, language, explicit absolute-owned-media-path handling, polling, draft import, and correction/approval semantics unchanged.

Do not add a persisted browser default or copy the service allowlist into UI state in this slice. The browser does not need to fetch status before creating a job; the service remains authoritative even for a newly connected client.

### 5. Read-only status exposure

Expose the normalized effective default at:

`GET /api/status` -> `config.defaultAsrModelName`

The value must be one of the bounded allowed names and must match the value used for an omitted-model job in that service process. Keep all existing redactions:

- database/scratch/model-cache paths remain placeholders;
- no environment value, rejected raw value, cache path/content, provider secret, or model availability claim is returned;
- exposing the model name is informational only and must not trigger a model load/download.

### 6. Draft and provider boundaries

This slice changes selection policy only. It must not change:

- local ASR output remaining a draft with `asrDraft`/quality warnings until correction and approval;
- explicit absolute owned-local media-path requirements;
- CPU/int8/device/language defaults;
- ffmpeg/faster-whisper/WhisperX command contracts beyond the selected model argument;
- ElevenLabs Scribe, YouTube captions, provider gates, API-key handling, public-read consent, or no-network behavior;
- learner-state, SQLite schema, transcript approval, exports, backups, snippets, or media persistence.

## Test-first and fake-only contract

LDM6-01 must use deterministic fake/injected seams. Automated tests must not run real ffmpeg, Python, faster-whisper, WhisperX, Hugging Face, model discovery/download, providers, or Janusz's media.

Focused coverage may extend the existing files or add one narrowly named ASR-default test file. At minimum prove:

1. absent/empty env resolution yields `base` without warning;
2. every allowed env value resolves exactly, including explicit `tiny` smoke fallback;
3. unsupported env input resolves to `base`, emits one static/redacted warning, and the warning does not contain the raw rejected value;
4. startup/config resolution invokes no command runner, fetch, provider, cache/model probe, or download path;
5. `/api/status.config.defaultAsrModelName` equals the effective service value and existing path/secret redaction still holds;
6. an omitted job model uses `base` by default in both queued summary and fake runner command/transcript handoff;
7. an injected non-default service runtime (for example `small`) governs an omitted job and status consistently;
8. an explicit allowed job override (especially `tiny`) wins for that job without changing the service default;
9. an unsupported explicit job model is rejected before any command runner call and the response does not echo the raw value or a private path;
10. the normal browser/UI request omits `payload.modelName` while preserving language, media path, and `alignWords: true`;
11. the optional provider-level explicit override still serializes when intentionally supplied;
12. no transcript approval, learner-state mutation, provider call, real media read, or persistent setting is introduced.

Use test-owned temporary directories and synthetic values only. Existing direct explicit-`tiny` command-adapter tests may remain when they specifically prove the fallback tier, but assertions that encode `tiny` as the product default must be changed.

## Node 26.5 strip-only runtime constraints

Every new or edited file reachable from `apps/local-service/src/server.ts` must preserve the 2026-07-19 runbook contract:

- every relative import has an explicit `.ts` extension;
- no TypeScript parameter properties;
- no TypeScript enums outside `.d.ts`;
- no TypeScript namespaces;
- plain Node can parse/import the node-executed graph, not merely `tsc` or Vite.

A string-literal union plus readonly tuple/set is the approved representation for the model allowlist.

## Explicitly out of scope / non-authorized

This manifest and its downstream chain do not authorize:

- any real ASR/ffmpeg/WhisperX execution, model load, cache scan, model download, dependency install, Hugging Face/network access, or benchmark rerun;
- a model picker, automatic model availability detection, automatic fallback after runtime failure, performance-based switching, GPU/CUDA changes, compute/device tuning, VAD tuning, or quality scoring;
- treating `small`, `medium`, or `large-v3` as tested/recommended daily defaults merely because they are allowed configuration values;
- changing local ASR draft/correction/approval gates or auto-approving generated transcripts;
- ElevenLabs/TTS/YouTube/provider expansion, online translation/LLM calls, provider payload logging, or sending media/cues/learner context externally;
- reading/searching Janusz's media folders, using private/account-gated sources, online media download, cookies/browser credentials, protected-stream capture, DRM/circumvention, or Lingopie/proprietary media/data;
- destructive changes to real learner state, local media, browser profiles, providers, model caches, or external apps;
- push, PR, release, package publication, deployment, systemd restart, public exposure/sharing, or the next batch;
- secrets, API keys, private absolute media paths, generated transcripts/media, model/cache/scratch artifacts, or provider payloads in Git.

## Task chain and contracts

| Step | Task id | Assignee | Parent | Contract |
|---|---:|---|---|---|
| LDM6-00 | `t_1b8ea424` | `default` | none | Preflight live branch/docs/code/tests, make the browser/service policy decision, write/verify this manifest, and create an exact-scope local commit. |
| LDM6-01 | `t_56b91753` | `backend-eng` | `t_1b8ea424` | Implement only this configurable-default slice test-first with fake seams; update behavior docs; satisfy Node/runtime/privacy gates; commit exact-scope locally; do not push. |
| LDM6-02 | `t_300286cc` | `reviewer` | `t_56b91753` | Independent read-only review. Return `PASS`, `BLOCK`, or `NEEDS HUMAN DECISION` with exact findings, changed-range evidence, Node/runtime checks, redaction/download/browser-authority checks, and command receipts. Do not fix code. |
| LDM6-03 | `t_86394367` | `qa` | `t_300286cc` | Proceed only after review PASS; run focused/full fake-only integration gates and write a durable receipt with tested HEAD, commands, exit codes, concise results, cleanliness, and SHA-256. No real ASR/model/provider action. |
| LDM6-04 | `t_679f3cab` | `default` | `t_86394367` | Produce and commit the final packet, comment path/hash/SHA/options, then block as the human gate. Never self-authorize acceptance, push, PR, deployment, release, or a next batch. |

If LDM6-02 returns BLOCK, LDM6-03 must defer. LDM6-04 must route a bounded implementation repair -> independent re-review -> QA continuation before presenting acceptance options; it must not treat the original blocked chain as accepted.

## Validation contract

### LDM6-01 focused implementation gates

Run at minimum, recording exact exit codes and concise results:

```bash
git status --porcelain=v1 -uall --branch
npm run typecheck
npm test -- tests/core/localService.test.ts tests/web/p7TranscriptLifecycleFrontend.test.ts
npm run test:no-network
npm run scan:privacy
npm test
npm run build
node --check apps/local-service/src/server.ts
node -e "await import('./apps/local-service/src/server.ts')"
python3 validate_final_bundle.py
git diff --check
git status --porcelain=v1 -uall --branch
```

If focused coverage is placed in another file, the implementation card must comment the exact path and preserve all assertions in the fake-only contract above.

### LDM6-02 independent review gates

The reviewer must verify:

- the local service, not the browser, is the single normal default authority;
- `base` is the no-env/no-runtime default and `tiny` appears only as an allowed explicit smoke/fallback tier or targeted fixture;
- the env and explicit-job allowlist cannot be bypassed through empty/whitespace/arbitrary strings;
- the invalid-env warning and invalid-request response never echo raw rejected input, private paths, cache contents, or secrets;
- status, queued summary, and execution use the same normalized model;
- config/status resolution performs no model/cache/network/runner action;
- browser omission and optional explicit override serialization are both tested;
- generated transcripts remain draft-only and provider/no-network behavior is unchanged;
- tests are synthetic/fake-runner-backed and do not execute real media/model/provider paths;
- changed node-executed code obeys explicit `.ts` imports and contains no parameter properties, enums, or namespaces;
- exact-scope commits contain no secrets, private paths, generated transcripts/media, model/cache/scratch artifacts, or unrelated churn.

### LDM6-03 QA integration gates

Run the full contract exactly unless a command is impossible for a documented environmental reason:

```bash
git status --porcelain=v1 -uall --branch
git log --oneline --decorate -8
git diff --check
npm run typecheck
npm test -- tests/core/localService.test.ts tests/web/p7TranscriptLifecycleFrontend.test.ts
npm run test:no-network
npm run scan:privacy
npm test
npm run build
node --check apps/local-service/src/server.ts
node -e "await import('./apps/local-service/src/server.ts')"
python3 validate_final_bundle.py
git status --porcelain=v1 -uall --branch
```

QA must record command, exit code, concise result, tested HEAD, tracked/untracked cleanliness, privacy/artifact scan result, and receipt SHA-256 under `/home/openclaw/.hermes/artifacts/kanban/t_86394367/`. It must not substitute a live model/media smoke for the required fake-runner coverage.

## Documentation/status update contract

LDM6-01 should update only docs made materially stale by the behavior change:

- `docs/dev/local-runbook.md`
  - document `LINGOTORTE_ASR_MODEL`, allowed values, `base` default, `tiny` smoke/fallback role, invalid-value fallback/warning, status field, no configuration-time download, and explicit model-download/live-run gate;
- `PLAN-STATUS.md`
  - append a B4 follow-up note that the recommended `base` default is implemented on the local branch, with exact implementation commit and limits; do not claim review acceptance, push, or deployment before those gates complete.

Update `PLAN.md` or README only if implementation makes one of their current statements materially false. Do not copy benchmark media paths, raw warnings containing test sentinel values, generated transcripts, or cache details into committed docs.

## Final human-gate contract

`t_679f3cab` is the manual LDM6 decision gate. It must not silently accept, push, open a PR, deploy, release, publish, restart services, or authorize a new batch.

The final packet must include:

1. manifest path/hash and all exact implementation/review/QA commit SHAs;
2. changed files and behavior summary;
3. focused/full command receipts and reviewer/QA verdicts;
4. env/default/override/invalid-input and browser-omission evidence;
5. no-download/no-provider/redaction and Node 26.5 strip-only evidence;
6. known limitations: no model picker, availability probe, runtime auto-fallback, or new quality benchmark;
7. preserved non-authorizations;
8. explicit decision options.

Recommended options:

- `accept local only`;
- `repair` with concrete findings;
- `authorize push` only after a fresh remote/status/secret preflight;
- `authorize PR` only with a fresh exact gate;
- `deploy locally` only with fresh service/runtime preflight and health/status verification;
- `authorize next local batch` while preserving all unrelated gates.

After commenting packet path/hash/SHA/options, LDM6-04 must block with:

`HUMAN-GATE: Lingotorte LDM6 ASR-default packet ready; choose accept, repair, authorize push/PR, deploy locally, or authorize next local batch`

## Handoff note for LDM6-01

Implement the narrow policy seam, not a model-management subsystem: resolve one bounded `LINGOTORTE_ASR_MODEL` value into the service runtime, default it to `base`, use it consistently for omitted jobs/status/summaries, reject unsupported explicit job values before runner execution, and make the browser omit its normal model field. Preserve `tiny` as an explicit smoke override, keep all execution fake-only in tests, and leave model downloads, live media, providers, deployment, and publication blocked.
