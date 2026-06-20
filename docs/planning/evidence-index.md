# Lingotorte Evidence Index

Status: final planning bundle evidence map; planning only, not implementation approval.

This file normalizes provenance for the final Lingotorte planning bundle and repairs the challenge-review concern that project boundaries must not be downgraded to mere recommendations. It cross-links the parent artifacts and defines how later implementation agents should treat each evidence class.

## Normalized evidence labels

Use these labels in implementation tasks and follow-up docs:

| Label | Meaning | Adoption strength |
|---|---|---|
| `PROJECT-CONSTRAINT` | Boundary or requirement stated by Janusz/project workspace files such as `AGENTS.md`, `README.md`, or mission docs. | Binding unless Janusz explicitly changes it. |
| `MISSION-REQUIREMENT` | Required deliverable/quality bar from mission briefs. | Binding for this planning bundle and downstream task specs. |
| `SANITIZED-LIVE-UI` | Observed visible product mechanics from read-only Lingopie UI inspection; no raw private vocabulary/account dumps. | Usable as UX/product reference only; not permission to copy styling/copy/assets or mutate account state. |
| `PUBLIC-DOC` | Public Lingopie/help/blog/marketing documentation summarized by parent artifacts. | Planning taxonomy only unless revalidated with durable quote/date before implementation/legal claims. |
| `OSS-DOC-SOURCE` | Public OSS repository/docs/source observations in parent artifacts. | Candidate substrate evidence only; revalidate license/version/source before code reuse. |
| `PRELIMINARY-RESEARCH` | The initial consolidated research artifact and derived workspace docs. | Useful grounding; re-check for decisions with legal, license, or dependency impact. |
| `DESIGN-RECOMMENDATION` | Synthesis choice derived from evidence and project goals. | Default plan, not a user decision unless explicitly accepted. |
| `OPEN-DECISION` | Choice intentionally left to Janusz or a future spike. | Do not silently resolve in implementation tasks. |

## Required source reading order

The final planning bundle was synthesized after reading these files in the required order:

1. `../../AGENTS.md` — `PROJECT-CONSTRAINT`: local/owned media, no proprietary copying, no DRM/circumvention, read-only inspection, evidence labels, privacy by default, artifact-centered design.
2. `../../README.md` — `PROJECT-CONSTRAINT` / workspace index and screenshot caveats.
3. `../mission/hermes-war-room-mission-statement.md` — `MISSION-REQUIREMENT`: planning-only mission, deliverable expectations, hard boundaries, defaults.
4. `../mission/lingopie-war-room-brief.md` — `MISSION-REQUIREMENT`: lane decomposition, quality gates, hypotheses.
5. `../research/preliminary-grounding-research.md` — `PRELIMINARY-RESEARCH`: product decomposition, architecture sketch, MVP cut, OSS seeds.
6. `../research/live-ui-inventory.md` — `SANITIZED-LIVE-UI`: visible UI mechanics and privacy caveats.

## Parent artifact inventory

| Task | Artifact | Final-bundle role | Evidence depth | Carry-forward caveat |
|---|---|---|---|---|
| `t_2a58c7ca` | `product-behavior-spec.md` | Feature behavior, UI states, edge cases, persistence needs, acceptance criteria. | Local artifact content verified by parent metadata. | Many items are `DESIGN-RECOMMENDATION`; keep observed vs recommended mechanics separate. |
| `t_3a3c8051` | `evidence-cartography.md` | Source inventory, reusable evidence IDs, feature-behavior matrix, behavior-to-data anchors. | Local artifact content and parent hash/line metadata. | Treat public/OSS facts as planning hypotheses unless revalidated with retrieval dates, versions, and license-source hashes. |
| `t_a6fb090d` | `local-first-architecture-data-model.md` | Architecture, SQLite/data model, invariants, privacy gates, migrations, feature tests. | Local artifact content with parent sha256. | Strong design input; not executable code or dependency approval. |
| `t_add618d0` | `language-srs-practice-plan.md` | Language adapters, saved objects, FSRS, practice modes, Anki export, source-context preservation. | Local artifact content and parent verification metadata. | Human decisions remain open for target-language priority, Anki role, online strictness, Mastered threshold. |
| `t_d69719f4` | `independent-challenge-review.md` | Must-fix list, safety/provenance repairs, final synthesis gates. | Local artifact content with parent sha256. | `BLOCK` applied to synthesis readiness before repairs, not to the local-first product direction. |

## Feature-to-evidence trace matrix

| Feature area | Primary behavior source | Architecture/data source | Language/SRS source | Safety/provenance gate |
|---|---|---|---|---|
| Local media import | `product-behavior-spec.md` §1 | `local-first-architecture-data-model.md` import pipeline/schema | N/A | Own/local media only; no protected streams. |
| Subtitle/transcript import | Product spec §2 | Architecture subtitle/cue/indexing tables | Token context model | Use explicit subtitle files, embedded tracks, or local generation; no Lingopie subtitle copying. |
| Generated subtitles/alignment | Product spec §3 | Architecture adapter taxonomy and failure modes | ASR/alignment adapter as optional | Spike only; no quality claims until local experiment. |
| Interactive dual subtitles | Product spec §4; live UI inventory player mechanics | Cue identity/alignment model | Token context where target cue is analyzed | Mechanics reference only; do not copy branding/pixels/copy. |
| Synchronized transcript | Product spec §5; live UI inventory read-along panel | Transcript index projections | Token occurrence identity | Search logs must not leak raw cue text by default. |
| Token/word lookup | Product spec §6 | Language analysis tables | Tokenizer + lemma/POS/morph + dictionary adapters | Online lookup providers disabled by default. |
| Phrase selection | Product spec §7 | Saved occurrence model | Phrase lookup and grammar adapters | Persist source context; avoid raw text in external calls unless opted in. |
| Saved words/phrases/sentences | Product spec §8-9; live UI practice inventory | Saved occurrence and learner state tables | Saved learning object contracts | Learner state is local/private and append-only where practical. |
| Sentence explanation | Product spec §10 | Adapter provider policy gates | Sentence explanation adapter | Local first; online LLM is explicit opt-in with per-data-class warning. |
| Listen/loop/speed/cue seek | Product spec §11; live UI player inventory | Media playback and cue identity | Optional shadowing later | No DRM or protected media capture. |
| Progress tracking | Product spec §12; live UI catalog/practice widgets | Review/progress tables | FSRS/review events | Progress is local-owned data, not service sync. |
| Privacy/settings | Product spec §13 | Settings/provider/privacy tables | Adapter consent flags | Must be implemented before any online adapter can be enabled. |
| Backup/sync | Product spec §14 | Backup/sync strategy | Export privacy notes | Default backup excludes media copies unless Janusz chooses otherwise. |
| Accessibility | Product spec §15 | UI acceptance tests | Practice-mode UX | Preserve captions/keyboard operation; do not hide controls behind pointer-only interactions. |
| FSRS flashcards/practice games | Preliminary research and live practice inventory | Review/FSRS tables | Practice modes 1-4 | FSRS library/version must be verified before adoption. |
| Anki export | Preliminary research and OSS seeds | Import/export surfaces | Anki export plan | Export-only by default; AnkiWeb/AnkiConnect sync is a separate opt-in/mutation gate. |
| Pronunciation/shadowing | Public feature family + optional design | Adapter/privacy gates | Optional Mode 5 | Microphone/audio recordings are sensitive; no online scoring without explicit opt-in. |

## Provenance limitations and required revalidation

The current bundle is adequate for planning and implementation task decomposition, not for final legal/license/adoption approval.

Before using third-party code or making an adoption claim, create a small verification artifact with:

- retrieval date and URL;
- exact quote or source line pointer;
- package/repo version or commit;
- license file path/hash;
- decision scope: reference only, dependency, fork, or reimplementation;
- privacy/network behavior if the dependency touches media, subtitles, text, voice, or account data.

Candidate sources requiring revalidation before adoption include `asbplayer`, `subs2srs`, `ts-fsrs`, subtitle parsing libraries, ASR/forced-alignment tools, dictionary/tokenizer stacks, and Anki export libraries.

## Screenshot evidence policy

The existing Lingopie screenshots are outside this workspace and were not inspected by the final synthesis worker. They may contain proprietary UI/account context. Final implementation tasks should rely on sanitized textual observations in `../research/live-ui-inventory.md` unless Janusz explicitly approves a sanitization/copy policy. Do not move, publish, crop, or use screenshots as app assets.

## Evidence-use rules for implementation agents

1. Treat `PROJECT-CONSTRAINT` and `MISSION-REQUIREMENT` as hard gates.
2. Treat `SANITIZED-LIVE-UI` as product-mechanic inspiration only.
3. Treat `PUBLIC-DOC` and `OSS-DOC-SOURCE` as references to revalidate before legal/license/dependency decisions.
4. Treat `DESIGN-RECOMMENDATION` as the default plan, but preserve the evidence label in PRs/tasks.
5. Preserve source context for saved learning objects; never turn video-backed occurrences into free-floating dictionary entries without the source link.
6. Do not claim implementation feasibility for ASR/alignment/pronunciation until local spikes produce measured results.
