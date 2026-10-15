# Dependency Provenance

This file records third-party dependencies adopted by the Lingotorte project.
A record must exist before a dependency is imported into production or development
code. Records follow the project dependency-provenance template.

---

## jsdom

```yaml
dependency_name: jsdom
package_or_repo: npm package jsdom
intended_slice: P1
why_needed: Provides a headless browser/DOM environment for Vitest web-level tests so UI components can render without a real browser and without network access.
source_url: https://registry.npmjs.org/jsdom/-/jsdom-29.1.1.tgz
retrieval_date_utc: 2026-06-20
exact_version_or_commit: 29.1.1
lockfile_entry_or_hash: sha512-ECi4Fi2f7BdJtUKTflYRTiaMxIB0O6zfR1fX0GXpUrf6flp8QIYn1UT20YQqdSOfk2dfkCwS8LAFoJDEppNK5Q==
license_name_claimed: MIT
license_file_path_or_url: node_modules/jsdom/LICENSE.txt
license_file_sha256: 242d37e7cab25cbafc36cc973ee88f9345fddf066afe4f72b7ac3d9ad4e24cce
local_offline_behavior: Runs entirely in-process in Node.js; no network calls in default test path.
network_behavior_when_disabled: Not used outside the test harness. With network primitives patched, zero outbound network attempts are observed.
privacy_data_classes_processed:
  - none
redistribution_or_export_constraints: MIT permits redistribution with license notice. Project is UNLICENSED application code; jsdom is part of the dev toolchain only.
security_maintenance_notes: Pinned via package-lock.json. Update through npm audit or explicit version bump plus re-verification.
alternatives_considered: happy-dom (lighter but less complete DOM API), playwright test runner (requires browser binaries and network-capable install). jsdom chosen for zero-binary, lockfile-pinned, offline-compatible test environment.
review_status: accepted
review_task_id: t_3760692d
```

## @types/jsdom

```yaml
dependency_name: "@types/jsdom"
package_or_repo: npm package @types/jsdom
intended_slice: P1
why_needed: TypeScript type definitions for jsdom so web tests can compile against DOM types without pulling in browser-specific ambient types into production code.
source_url: https://registry.npmjs.org/@types/jsdom/-/jsdom-28.0.3.tgz
retrieval_date_utc: 2026-06-20
exact_version_or_commit: 28.0.3
lockfile_entry_or_hash: sha512-/HQ2uFoetFTXuye8vzIcHw2z6Fwi7Hi/qcgC+RoS9NCyewiqxhVGqlG+ViGB6lkax481R6dmhf1I7lIGlzJStQ==
license_name_claimed: MIT
license_file_path_or_url: node_modules/@types/jsdom/LICENSE
license_file_sha256: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383
local_offline_behavior: Type definitions only; no runtime behavior and no network calls.
network_behavior_when_disabled: Not used at runtime. No network behavior.
privacy_data_classes_processed:
  - none
redistribution_or_export_constraints: MIT permits redistribution with license notice. Types are dev-only and not shipped in production build.
security_maintenance_notes: Pinned via package-lock.json. Update together with jsdom or when TypeScript/DOM types require it.
alternatives_considered: Inline minimal type stubs (high maintenance), @types/happy-dom (couples to alternative engine). @types/jsdom chosen because it matches the selected jsdom version and is the standard community-maintained types package.
review_status: accepted
review_task_id: t_3760692d
```

## ts-fsrs

```yaml
dependency_name: ts-fsrs
package_or_repo: npm package ts-fsrs
intended_slice: P5
why_needed: Implements the FSRS v6 spaced repetition scheduling algorithm locally so review cards can be scheduled deterministically without network access.
source_url: https://registry.npmjs.org/ts-fsrs/-/ts-fsrs-5.4.0.tgz
retrieval_date_utc: 2026-06-21
exact_version_or_commit: 5.4.0
lockfile_entry_or_hash: |
  package-lock.json resolved: https://registry.npmjs.org/ts-fsrs/-/ts-fsrs-5.4.0.tgz
  integrity: sha512-Gjr6vcUSdqOvrV6M9t/idbBlRAFsvpjUuVWrVwzV8fTMJzOc0FDCt9UfqGMBmYNUx8pnRRM8JaOtd/odvKFiOA==
  local verification: node_modules/ts-fsrs/package.json declares version 5.4.0
  license file hash: 8b83a73dd2894ff553d6de6113064b3ad9dfad3f839837b61f3b183881131d01
  package.json hash: 819f94b88e0d96dc1ad13e434cd80da38940ac8aec1008d2a9436858107a1139
license_name_claimed: MIT
license_file_path_or_url: node_modules/ts-fsrs/LICENSE
license_file_sha256: 8b83a73dd2894ff553d6de6113064b3ad9dfad3f839837b61f3b183881131d01
local_offline_behavior: Pure local computation; deterministic given fixed parameters, clock, and rating. Verified by tests in tests/no-network/p5ReviewNoNetwork.test.ts.
network_behavior_when_disabled: No network calls required; ts-fsrs does not fetch data. Verified under the provider-disabled/no-network harness.
privacy_data_classes_processed:
  - none
redistribution_or_export_constraints: MIT permits redistribution with license notice. Package is a runtime dependency of the local review package only.
security_maintenance_notes: Pinned via package-lock.json. Monitor for FSRS v6 parameter changes; upgrades require re-verification of deterministic recomputation tests.
alternatives_considered: Custom FSRS port (high maintenance and risk of drift from reference algorithm). ts-fsrs chosen because it is a MIT-licensed, widely used TypeScript reference implementation of FSRS v6 with no runtime dependencies.
review_status: accepted
review_task_id: t_e7002e1e
```

## @playwright/test

```yaml
dependency_name: "@playwright/test"
package_or_repo: npm package @playwright/test (pulls playwright and playwright-core at the same version)
intended_slice: lt-42o
why_needed: Real-browser (Chromium) smoke tests of the core learner tasks against the Docker stack (apps/web/e2e). jsdom cannot exercise real media duration, mouse drag-selection or IndexedDB reload.
source_url: https://registry.npmjs.org/@playwright/test/-/test-1.62.0.tgz
retrieval_date_utc: 2026-10-15
exact_version_or_commit: 1.62.0
lockfile_entry_or_hash: |
  @playwright/test 1.62.0 integrity: sha512-9zOJ6ZQRAena31MpOH9VSzIz8Ou3YJ/wtY/eQm5T2uhfhG7/U3COrMS8xOtUrZrp9OgdmzEnIYODye3nY1VqzA==
  playwright 1.62.0 integrity: sha512-Z14dG305dgaLu6foB1TXQagFiW8JfSUIUaUuPaKQ6NtBPKF1P/qXcqfh6c6K/icPqdy37JmjbiBXf6JNg6Sylw==
  playwright-core 1.62.0 integrity: sha512-nsNRyq0r2zsG8AcRHWknc9QRA5XCueC7gWMrs+Gx2tlZn9hcl8zudfh00lhJPY1DE7NmZ6bDsT9g2yey8mXljA==
  runner image: mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07 (Chromium revision 1234 baked in)
license_name_claimed: Apache-2.0
license_file_path_or_url: node_modules/@playwright/test/LICENSE (identical in node_modules/playwright and node_modules/playwright-core)
license_file_sha256: 45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb
local_offline_behavior: Dev-only test runner. Browsers come from the pinned runner image (Docker) or an existing local ms-playwright cache; the contributor image installs with --ignore-scripts, so no browser download happens during npm ci.
network_behavior_when_disabled: The e2e service is attached only to the internal compose network; each spec fails if the page requests any origin other than the stack's web origin. Not imported by application code or the production bundle.
privacy_data_classes_processed:
  - synthetic fixtures only
redistribution_or_export_constraints: Apache-2.0; dev toolchain only, not shipped in the web bundle.
security_maintenance_notes: Pinned exactly (no caret) in package.json and package-lock.json; the runner image tag/digest must be bumped in lockstep with the npm version (browser revision must match).
alternatives_considered: jsdom only (cannot test real media/drag/IndexedDB reload); puppeteer (no test runner, separate browser download). 1.62.0 chosen over 1.64.1 because its Chromium revision 1234 is already in the local cache, enabling the documented host fallback without a download.
review_status: proposed
review_task_id: lt-42o
```
