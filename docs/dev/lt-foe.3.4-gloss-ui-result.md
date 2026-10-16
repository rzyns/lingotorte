# lt-foe.3.4 — gloss UI result

Evidence label: implementation + JSDOM tests (`tests/web/ltfoe34GlossUi.test.ts`); live check pending.

## What the word-analysis panel shows

The panel heading is "Word analysis". For a selected word, `#morphology-detail` holds an `h4` with the surface, the grammar fields, and a
`section#morphology-meanings` whose heading is an `h5` "Meanings" (`#morphology-meanings-heading`). The `h5` is one level below the detail's `h4`.
Meanings are only requested for service-analysed tokens, and only when the app is paired with the local service.

| `data-meanings-state` | Visible text |
|---|---|
| `loading` | Looking up meanings… |
| `available` | Up to 3 senses (`ul.morphology-meanings-list`). Character senses are listed last. Then "Source: Wiktionary (CC BY-SA)", the route line (e.g. "from dom (domu → dom)", "read as mama (noun)"), "(grammar note)" on form-of-text senses, and an "Other readings" list (`ul.morphology-other-readings`) |
| `no-entry` | No dictionary entry for “{surface}”. |
| `not-installed` | No dictionary is installed in the local service. |
| `disabled` | Dictionary lookups are turned off in the local service. |
| `invalid` | The installed dictionary could not be read. |
| `unsupported` | The local dictionary does not support this language. |
| `not-paired` | Meanings need the local service (pair in Settings). |
| `unavailable` | Meanings are unavailable right now. |

Accessibility: `#morphology-status` (`role=status`, `aria-live=polite`) is the panel's only live region. The per-state
`p.morphology-meanings-status` has no role, so nothing is announced twice. Gloss answers never move focus.

## Meaning pre-fill

For a single-word lexeme capture, the app pre-fills Meaning with a shortened first sense. Parentheticals are removed, the text is cut at `;` when long, and it is capped at 120 characters.
The hint reads "Suggested from Wiktionary — edit freely." (`#selection-meaning-hint`). An unedited suggestion is saved with
`meaningSource: { kind: 'dictionary-suggested', glossSourceId, dumpDate }`; an edited one is saved as `learner`. Phrase and sentence captures are never pre-filled.
If capture opens while the panel's lookup for the same word is still running, it awaits that request and does not send a second one.
It then fills only if the selection is unchanged, the learner has typed nothing, and the media/track context still matches.

## Credits (Settings)

`#settings-credits` (`h3` "Credits"):

- When the paired service reports `language.gloss.state = available` with a valid source, it shows the domain constant
  `DICTIONARY_ATTRIBUTION` (DECISIONS §16a), plus a link to the CC BY-SA 4.0 licence (`data-credit="dictionary"`). Text supplied by the service is never rendered.
- Otherwise it shows "No dictionary installed." (`data-credit="no-dictionary"`).
- The capability is cleared when the service URL changes, on re-pairing, and on 401 (pairing lost).

## Export attribution notice — one-way format bump

If any saved item has `meaningSource.kind === 'dictionary-suggested'`, the export manifest gets the privacy warning
`{ kind: 'contains-dictionary-text', severity: 'info' }`. Its message is `DICTIONARY_TEXT_NOTICE` (attribution + CC BY-SA 4.0 URL).
`ExportService.buildManifest` is the single producer. The browser path (`exportLearnerState`) goes through it, and so does the service path.

**Compatibility:** older app builds validate `privacyWarnings[].kind` against a closed set. They therefore **reject** exports that
contain `contains-dictionary-text`, the same way they reject the v10 `meaningSource` field. This is a one-way bump: new builds read old
exports, but old builds cannot restore exports made after a dictionary suggestion was saved.

## Harness hooks

- `#morphology-meanings[data-meanings-state]`, `.morphology-meanings-status`, `#morphology-meanings-heading`
- `#selection-meaning-hint`, `#settings-credits [data-credit]`, `.credits-attribution`
- `scripts/qualification/browser-batch/dom-journey.mjs` reports `meaningsState`, and `live-batch.py` accepts any defined state.

## Live check

TBD by coordinator.
