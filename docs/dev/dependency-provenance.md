# Lingotorte P0 dependency provenance

Generated for Kanban task `work/t_2d53622d` on 2026-06-20. This file records the third-party packages adopted for the P0 local-first skeleton. Dependencies are development/build/test tooling only; the browser app skeleton has no production runtime package dependency and online product providers remain disabled.

All package versions are pinned exactly in `package.json` and `package-lock.json`. The initial dependency install contacted the npm registry to retrieve packages; normal build, typecheck, and test commands run locally after installation.

### typescript

```yaml
dependency_name: typescript
package_or_repo: npm:typescript
intended_slice: P0
why_needed: Strict TypeScript compiler for the P0 typed domain model, test sources, and app skeleton.
source_url: https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz
upstream_url: https://github.com/microsoft/TypeScript.git
retrieval_date_utc: 2026-06-20
exact_version_or_commit: 6.0.3
lockfile_entry_or_hash: package-lock.json entry integrity sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==
license_name_claimed: Apache-2.0
license_file_path_or_url: node_modules/typescript/LICENSE.txt
license_file_sha256: a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47
transitive_dependency_notes: package-lock.json contains 78 node_modules package entries total for this P0 dev toolchain.
local_offline_behavior: Runs locally after npm install; compiler performs no network calls.
network_behavior_when_disabled: Not invoked by provider adapters; provider-disabled tests trap fetch/XMLHttpRequest/WebSocket and Node http/https/net/dns primitives.
privacy_data_classes_processed:
  - none
redistribution_or_export_constraints: Follow Apache-2.0 license for redistributed toolchain copies; Lingotorte app runtime currently has no production dependency on this package.
security_maintenance_notes: Version pinned exactly in package.json/package-lock.json; update only through reviewed dependency-provenance change.
alternatives_considered: Safe P0 default from control packet was Vite + TypeScript + local test runner; no broader framework adopted.
review_status: unreviewed
review_task_id: t_dfdf1dca
```

### vite

```yaml
dependency_name: vite
package_or_repo: npm:vite
intended_slice: P0
why_needed: Local web app build/dev server for the browser-first P0 shell; configured for loopback host only.
source_url: https://registry.npmjs.org/vite/-/vite-8.0.16.tgz
upstream_url: git+https://github.com/vitejs/vite.git (directory: packages/vite)
retrieval_date_utc: 2026-06-20
exact_version_or_commit: 8.0.16
lockfile_entry_or_hash: package-lock.json entry integrity sha512-h9bXPmJichP5fLmVQo3PyaGSDE2n3aPuomeAlVRm0JLmt4rY6zmPKd59HYI4LNW8oTK7tlTsuC7l/m7awx9Jcw==
license_name_claimed: MIT
license_file_path_or_url: node_modules/vite/LICENSE.md
license_file_sha256: 21d9391f0a581d83e5f4faceac10136ef6b90588ef10ef7fb681a228044cc562
transitive_dependency_notes: package-lock.json contains 78 node_modules package entries total for this P0 dev toolchain.
local_offline_behavior: Build runs locally after npm install; dev server binds 127.0.0.1 and no remote provider calls are configured.
network_behavior_when_disabled: Not invoked by provider adapters; provider-disabled tests trap fetch/XMLHttpRequest/WebSocket and Node http/https/net/dns primitives.
privacy_data_classes_processed:
  - none
redistribution_or_export_constraints: Follow MIT license for redistributed toolchain copies; Lingotorte app runtime currently has no production dependency on this package.
security_maintenance_notes: Version pinned exactly in package.json/package-lock.json; update only through reviewed dependency-provenance change.
alternatives_considered: Safe P0 default from control packet was Vite + TypeScript + local test runner; no broader framework adopted.
review_status: unreviewed
review_task_id: t_dfdf1dca
```

### vitest

```yaml
dependency_name: vitest
package_or_repo: npm:vitest
intended_slice: P0
why_needed: Local unit/no-network test runner used by P0 privacy, fixture, schema, and provider-disabled tests.
source_url: https://registry.npmjs.org/vitest/-/vitest-4.1.9.tgz
upstream_url: git+https://github.com/vitest-dev/vitest.git (directory: packages/vitest)
retrieval_date_utc: 2026-06-20
exact_version_or_commit: 4.1.9
lockfile_entry_or_hash: package-lock.json entry integrity sha512-nE3/LEyc0z87uHYLZebqCUOaJr2hdtuPp7BQ4BosVFnfltxgAvMG08NyrSGlPpOUWvR27c5flSmYFTNr78L9GQ==
license_name_claimed: MIT
license_file_path_or_url: node_modules/vitest/LICENSE.md
license_file_sha256: 881d660c26831481b697e39724d4a35c9f86e07b67156d4aeb693a0b39910435
transitive_dependency_notes: package-lock.json contains 78 node_modules package entries total for this P0 dev toolchain.
local_offline_behavior: Runs tests locally after npm install; provider-disabled tests install network traps and fail on attempted network calls.
network_behavior_when_disabled: Not invoked by provider adapters; provider-disabled tests trap fetch/XMLHttpRequest/WebSocket and Node http/https/net/dns primitives.
privacy_data_classes_processed:
  - none
redistribution_or_export_constraints: Follow MIT license for redistributed toolchain copies; Lingotorte app runtime currently has no production dependency on this package.
security_maintenance_notes: Version pinned exactly in package.json/package-lock.json; update only through reviewed dependency-provenance change.
alternatives_considered: Safe P0 default from control packet was Vite + TypeScript + local test runner; no broader framework adopted.
review_status: unreviewed
review_task_id: t_dfdf1dca
```

### @types/node

```yaml
dependency_name: @types/node
package_or_repo: npm:@types/node
intended_slice: P0
why_needed: Node type declarations for local fixture loading, static scanning, and no-network test harness code.
source_url: https://registry.npmjs.org/@types/node/-/node-26.0.0.tgz
upstream_url: https://github.com/DefinitelyTyped/DefinitelyTyped.git (directory: types/node)
retrieval_date_utc: 2026-06-20
exact_version_or_commit: 26.0.0
lockfile_entry_or_hash: package-lock.json entry integrity sha512-vf2YFi1iY9lHGwNJMs01biZFbKJkrZR1T6/MlzjhJLPdntOHLhTrDSnSVcdtvjihi4VQNlrFRIxLsDBlQpAipA==
license_name_claimed: MIT
license_file_path_or_url: node_modules/@types/node/LICENSE
license_file_sha256: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383
transitive_dependency_notes: package-lock.json contains 78 node_modules package entries total for this P0 dev toolchain.
local_offline_behavior: Compile-time declarations only; no runtime behavior and no network calls.
network_behavior_when_disabled: Not invoked by provider adapters; provider-disabled tests trap fetch/XMLHttpRequest/WebSocket and Node http/https/net/dns primitives.
privacy_data_classes_processed:
  - none
redistribution_or_export_constraints: Follow MIT license for redistributed toolchain copies; Lingotorte app runtime currently has no production dependency on this package.
security_maintenance_notes: Version pinned exactly in package.json/package-lock.json; update only through reviewed dependency-provenance change.
alternatives_considered: Safe P0 default from control packet was Vite + TypeScript + local test runner; no broader framework adopted.
review_status: unreviewed
review_task_id: t_dfdf1dca
```
