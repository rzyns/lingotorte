# lt-3wr — mature cards remain eligible when due

Status: implemented and container-tested candidate; awaiting parent spec/quality review. No commit, push, issue closure, merge or deployment.

## Cause and correction

Baseline `efbc05a91e0f6cba86ded027b90ee7fbc69baac1` already had correct service-side eligibility: `ReviewService.listDueCards` excludes suspended/deleted cards and cards with future due dates, regardless of interval length. Its FSRS-state buckets include overdue mature review cards. The web projection moved these cards into `mastered`, but automatic selection and learner progress omitted that bucket. Both automatic review and practice use `pickNextDueCard`.

The correction keeps the presentation buckets disjoint, includes mastered cards in automatic selection and due totals, and preserves existing FSRS-state priority (new, learning, relearning, review) plus earliest-due ordering within each state. The new-card projection also excludes mastered-labelled cards to avoid double counting an unusual imported mature/new state. No FSRS state, event, storage format or backend scheduler change is needed. Review empty-state copy now states that all cards, including mastered cards, return when scheduled; the configuration comment documents that guarantee.

Changed paths:

- `apps/web/src/model.ts`
- `apps/web/src/app.ts`
- `apps/web/src/uiTypes.ts`
- `tests/web/matureDue.test.ts`
- `docs/dev/lt-3wr-mature-due-result.md`

## Regression evidence

Tests were written and executed before production edits. The initial ten tests ran against the baseline production source in image `lingotorte:lt-3wr-red`: **8 failed, 2 passed**, exit 1. The backend accepted an overdue scheduledDays=30 review card, and the web mastered bucket contained it, but automatic selection returned null; both real JSDOM-rendered automatic review/practice prompts were missing. Three other mature FSRS states exposed the same omission, the mature/new case exposed duplicate presentation membership, and the future-card UI test failed only on the old empty-state copy (future-card eligibility/count assertions already passed). Suspended/deleted checks passed before the fix.

The same ten tests pass after the fix; one additional mixed mature/ordinary ordering and non-mutation test also passes: **11 passed**, exit 0. Coverage includes scheduledDays=30 overdue and future cards, exact due instant, all four FSRS states, unique counts/membership, automatic review/practice without manually selecting Mastered, suspended/deleted exclusion, state-priority and earliest-due preservation. Synthetic fixtures only; network trap checks exercised flows, with no attempted calls.

## Exact candidate and verification

Contributor image ID:

`sha256:9ebcef75101f3ad43eecaedc8792054c500344e723b368707ec6b86a18b1e291`

Built directly from this assigned worktree using the existing pinned official Node Dockerfile and lockfile. No host dependency installation, source/state/media mounts, published ports or Compose changes. Every verification container used `--rm --init --network none`; source and dependencies were baked into the image. Existing preview/stacks were not altered. Candidate-container running readback was empty after verification.

SHA256 host/image comparison of **265 application build-input files**, including new tests: exact match, zero mismatches. Complete inventory is in the scratch `source-binding.json` receipt. Changed executable-source hashes:

| Path | SHA256 |
| --- | --- |
| `apps/web/src/model.ts` | `8ee8e88356595324ceddc5fd092ba4d98838404a1bd64ff26de6d65f8bae2ea9` |
| `apps/web/src/app.ts` | `17bbf55cdb0d30f540329b8f22de516a4045bd6dd7ec3e700b6042630801d7e0` |
| `apps/web/src/uiTypes.ts` | `dcaf5a31b0aba4cbe6c20492f7684fa4c13d3e6696ef024b04396ce740d9be5b` |
| `tests/web/matureDue.test.ts` | `f3821216d4956df2dfc386ceec35df8852c6e1dc0c1d852a6f049c9a4ad7bc68` |

Reproducible commands (replace image tag with the immutable ID above for exact reruns):

```sh
docker build --target contributor -t lingotorte:lt-3wr-candidate .
docker run --rm --init --network none lingotorte:lt-3wr-candidate node node_modules/vitest/vitest.mjs run tests/web/matureDue.test.ts
docker run --rm --init --network none lingotorte:lt-3wr-candidate node node_modules/vitest/vitest.mjs run
docker run --rm --init --network none lingotorte:lt-3wr-candidate node node_modules/typescript/bin/tsc --noEmit
docker run --rm --init --network none lingotorte:lt-3wr-candidate node node_modules/vite/bin/vite.js build --config vite.config.ts
docker run --rm --init --network none lingotorte:lt-3wr-candidate node node_modules/vitest/vitest.mjs run tests/no-network
docker run --rm --init --network none lingotorte:lt-3wr-candidate node scripts/check-privacy-boundaries.mjs
```

Observed candidate results:

- Full suite: **1200 passed, 1 skipped**, 51 passed files and 1 skipped file; exit 0. Existing `tests/core/privateDelivery.test.ts` is the skipped file; no skip was introduced by this change.
- Typecheck: exit 0.
- Production build: exit 0, 34 modules transformed.
- Dedicated no-network suite: **5 passed**, 2 files; exit 0.
- Privacy marker scanner: `ok: true`, **59 files**; exit 0. This is a reference-product runtime marker scan, not comprehensive secret/egress/security proof.
- `git diff --check`: exit 0.

Raw receipts live under the configured Hermes scratch directory's task-owned `lt-3wr/`: `red-build.log`, `red-tests.log`, `green-build.log`, `green-regression.log`, `qualification.log`, `source-binding.json`, and `bind_source.py`. The terminal unexpectedly supplied `/tmp` as TMPDIR for the first command; those two logs were immediately relocated into configured Hermes scratch and removed from the transient location. Subsequent commands used the explicit configured scratch path.

## Boundaries and remaining review

This is Linux container execution plus JSDOM UI evidence, not a new real-browser or native-Windows qualification. No real learner data, private media discovery, provider/model use, host installs or persistent rollout. No edits to storage/domain/local-service server/shared manifests/Beads exports/shared implementation notes. FSRS backend eligibility was traced and tested but did not require modification. Independent parent spec then quality review remains outstanding; zero review-correction cycles consumed.
