# Independent Model Review Summary

Reviewed commit: `bcd74c5c7d909402a9f129c713cd9afd9cff6dec`
Review packet: `reviews/2026-06-20-independent-model-reviews/review-packet.txt`
Review packet SHA-256: `8f73725d39a6283f7ac6860a133f1309fc404a743c4cbb607fd51ac6083b9e30`

## Verdict table

| Reviewer | Requested label | Route | Passed | Blocking concerns | Suggestions | Summary |
|---|---|---|---:|---:|---:|---|
| `gpt-5.5-default` | gpt-5.5 (default) | `hermes invocation failed before raw artifact` | False | 1 | 0 | Failed closed due to runner exception. |
| `kimi-k2.7-code` | kimi-k2.7-code | `hermes invocation failed before raw artifact` | False | 1 | 0 | Failed closed due to runner exception. |
| `m3` | M3 | `hermes invocation failed before raw artifact` | False | 1 | 0 | Failed closed due to runner exception. |
| `opus-4.8-claude` | Opus 4.8 via home-grown Claude integration | `claude -p --model claude-opus-4-8 --effort high --output-format json --no-session-persistence --allowedTools '' --max-turns 1 --max-budget-usd 8 < prompt` | True | 0 | 8 | This is a coherent, safety-conscious planning/documentation bundle for a local-first, privacy-preserving Lingopie-like learning app. The IP/privacy/DRM boundaries are explicit and consistently propagated (owned/local media default, online providers opt-in with no-network tests, no proprietary copying or account mutation, no DRM circumvention), evidence is labeled and provenance-disciplined (public-doc vs sanitized-live-UI vs OSS-candidate vs recommendation, with license/adoption claims correctly downgraded to revalidate-before-use), and the final/spec/architecture/product/review/plan deliverables agree with each other via a documented crosswalk and challenge-review repair map. Implementability is strong: milestones P0-P8 with fixtures, acceptance criteria, dependency/license-provenance gates, and preserved open human decisions. Manifest hashes cross-check against the file manifest, and the helper scripts perform only local file IO with no exfiltration or external mutation. No blocking security, logic, or compatibility issues were found; the only items are non-blocking hygiene notes (a stale 'not a git repository' claim and dual manifests with implicit-only linkage) and process suggestions (wire the existing validator into CI). Passed. |

## Blocking concerns by reviewer

### gpt-5.5-default
- **security_concerns:**
  - None
- **logic_errors:**
  - None
- **compatibility_concerns:**
  - Runner exception: OSError: [Errno 7] Argument list too long: 'hermes'

### kimi-k2.7-code
- **security_concerns:**
  - None
- **logic_errors:**
  - None
- **compatibility_concerns:**
  - Runner exception: OSError: [Errno 7] Argument list too long: 'hermes'

### m3
- **security_concerns:**
  - None
- **logic_errors:**
  - None
- **compatibility_concerns:**
  - Runner exception: OSError: [Errno 7] Argument list too long: 'hermes'

### opus-4.8-claude
- **security_concerns:**
  - None
- **logic_errors:**
  - None
- **compatibility_concerns:**
  - None

## Documentation gaps and suggestions

### gpt-5.5-default
- **documentation_gaps:**
  - None
- **suggestions:**
  - None

### kimi-k2.7-code
- **documentation_gaps:**
  - None
- **suggestions:**
  - None

### m3
- **documentation_gaps:**
  - None
- **suggestions:**
  - None

### opus-4.8-claude
- **documentation_gaps:**
  - docs/planning/artifact-manifest.json carries a stale claim: "no_commit_reason": "Workspace <local-workspace>/lingotorte is not a git repository." The packet metadata shows the workspace IS now a git repository at commit bcd74c5, so this note is outdated (non-blocking historical artifact).
  - Two artifact manifests coexist with different scopes (docs/planning/artifact-manifest.json = 7-item parent bundle, task t_3b47cd94; docs/final/artifact-manifest.json = 15-item split-path bundle). Their relationship is implied by docs/planning/documentation-index.md but not cross-referenced inside either manifest, which could briefly confuse a future agent.
  - docs/planning/artifact-manifest.json's verification block (e.g. challenge_repairs_MF_1_to_MF_7: true, bad_local_markdown_links: []) is self-asserted as boolean truth without pointing at the validator (validate_final_bundle.py) that substantiates it; labeling these as self-checks would avoid reading like an authoritative 'verified' stamp.
  - README.md and evidence-index reference local-only evidence outside the workspace (<local-home>/lingopie-*.png screenshots and <local-home>/lingopie-local-clone-investigation.md). The non-distributable policy is stated in evidence-index.md, but README's 'Source provenance' section could restate that these paths are intentionally outside the durable bundle.
- **suggestions:**
  - Run validate_final_bundle.py and update_manifest.py in CI (or a pre-commit hook) so the final-bundle hashes, required-file set, feature-term coverage, and local markdown links are continuously enforced rather than verified once at generation time.
  - In docs/research/live-ui-inventory.md (and the expanded copy), the disclosed one-time continue-watching side effect from opening an episode is handled honestly; consider explicitly tagging it as a completed, non-repeatable historical inspection so future readers do not treat live CDP inspection as an ongoing/sanctioned activity.
  - Consider regenerating or pruning docs/planning/artifact-manifest.json so its git/commit assumptions match the now-committed state, keeping the two manifests internally consistent.
  - The behavior-reference and playbook reuse the public-doc and live-UI evidence tables verbatim across several files (evidence-cartography, public-product-cartography, lingopie-behavior-reference); a single canonical evidence source with references would reduce drift risk if any URL/quote is later revalidated.
