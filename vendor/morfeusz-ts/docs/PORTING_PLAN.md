# Morfeusz2 → TypeScript Port Plan

This plan outlines a phased approach to re-implement Morfeusz2 (morphological analyzer/generator) in pure TypeScript, covering architecture, data strategy, milestones, and testing.

## Goals

- Pure TypeScript implementation (Node and browser-friendly).
- Preserve the public API semantics from C++ (`Morfeusz`, `ResultsIterator`, `IdResolver`, `MorphInterpretation`, and options enums).
- Load existing `.dict` files without native bindings (via `ArrayBuffer` parsing), with an option to embed a default dictionary.
- Reasonable performance and memory usage for large texts.

## Public API (TS)

- `class Morfeusz` with methods equivalent to C++:
    - `analyse(text: string): ResultsIterator`
    - `analyseToArray(text: string): MorphInterpretation[]`
    - `generate(lemma: string): MorphInterpretation[]`
    - `generateWithTag(lemma: string, tagId: number): MorphInterpretation[]`
    - Options: `setCharset`, `getCharset`, `setAggl`, `getAggl`, `setPraet`, `getPraet`, `setCaseHandling`, `getCaseHandling`, `setTokenNumbering`, `getTokenNumbering`, `setWhitespaceHandling`, `getWhitespaceHandling`, `setDebug`
    - Dictionary/runtime: `setDictionary(name: string)`, `getIdResolver()`, `getAvailableAgglOptions()`, `getAvailablePraetOptions()`
    - Metadata: `getDictID()`, `getDictCopyright()`
- `ResultsIterator` with `hasNext()`, `peek()`, `next()`.
- `IdResolver` with `getTag(id)`, `getTagId(str)`, `getName(id)`, `getNameId(str)`, `getLabelsAsString(id)`, `getLabels(id)`, counts APIs.
- Enums: `Charset`, `TokenNumbering`, `CaseHandling`, `WhitespaceHandling`, `MorfeuszUsage`.
- Types: `MorphInterpretation` (startNode, endNode, orth, lemma, tagId, nameId, labelsId) with helpers.

## Architecture (TS Modules)

- `src/core/charset/`: `CharsetConverter`, `UTF8CharsetConverter`, one-byte converters, `TextReader`.
- `src/core/case/`: `CaseConverter`, `CasePatternHelper`.
- `src/core/fsa/`: generic `FSA<T>`, `State<T>`, backends for `simple`, `cfsa1`, `cfsa2`; constants and deserializer interface.
- `src/core/deserialization/`: endian and binary readers, `InterpsGroupsReader`, `MorphDeserializer`, `InterpretedChunksDecoder`.
- `src/core/segrules/`: segmentation rules FSA, options types, loader.
- `src/core/dictionary/`: `Dictionary` structure, loader from `.dict`, `DictionariesRepository` with search paths.
- `src/core/model/`: `MorphInterpretation`, `InterpretedChunk`, `InterpsGroup`, `InflexionGraph`.
- `src/morfeusz/`: `Environment`, `MorfeuszImpl`, `ResultsIteratorImpl`.
- `src/index.ts`: public exports.

## Data Strategy (Dictionaries)

- Support loading `.dict` files at runtime using `fs` in Node; for browser, allow `ArrayBuffer` via `fetch` or a pre-bundled asset.
- Implement dictionary search paths akin to C++ (`Morfeusz.dictionarySearchPaths` as a string[]). Default to `morfeusz2/dict` from this repo for dev (`sgjp-*`, `polimorf-*`).
- Provide an option to embed a default dictionary as a generated TS file exporting `Uint8Array` (for environments without filesystem). Keep behind a build flag to avoid bloated bundles by default.

## Phased Milestones

1. Foundations (Types + Scaffolding)

- Define enums/types mirroring C++ headers.
- Implement `MorphInterpretation`, `ResultsIterator` interface, and TS `Morfeusz` facade delegating to `MorfeuszImpl`.
- Implement minimal `TextReader` (UTF-8 path), whitespace handling, token numbering logic.
- Implement no-dictionary path: treat all tokens as `ign` or `sp`, enabling basic flow and iterator behavior.

2. Charset + Case

- Implement `UTF8CharsetConverter` and table-based converters for ISO-8859-2, CP1250, CP852.
- Implement `CaseConverter` and `CasePatternHelper`; wire up option `CaseHandling` in `Environment`.

3. Binary + FSA Core

- Implement endian-aware readers: `readInt8/16/24/32`, `readString`, `slice`, offset math.
- Implement `FSA<T>` and `State<T>` APIs, plus `simple`, `cfsa1`, `cfsa2` backends (from `*_impl.hpp`).
- Implement `Deserializer<T>` interface and `MorphDeserializer` for `InterpsGroupsReader` length-prefixed payload.
- Implement `InterpsGroupsReader` iteration API consistent with usage in `MorfeuszImpl`.

4. Dictionary + Tagset + Segrules

- Implement `Dictionary` loader from `.dict` `ArrayBuffer`, setting fields (id, copyright, idResolver, separators, segrules map, defaults, options).
- Implement `IdResolverImpl` and tag/name/labels indexing.
- Implement `SegrulesFSA` and `SegrulesOptions` parsing/selection.
- Implement `DictionariesRepository` with `getDictionary(name, processorType)` and search paths; validate analyzer/generator compatibility.

5. Analyzer Algorithm

- Port `MorfeuszImpl` analysis path:
    - `processOneWord`, `doProcessOneWord`, `processInterpsGroup`, `processInterpretedChunk`.
    - `InterpretedChunk`, `InflexionGraph` with path collection and weak path logic.
    - Whitespace handling (`KEEP`, `APPEND`, `SKIP`) and `ign` fallback with separators splitting.
- Implement `InterpretedChunksDecoder` to produce `MorphInterpretation` from accepted paths.
- Implement `ResultsIteratorImpl` streaming interface.

6. Generator Path

- Implement `generate(lemma)` and `generate(lemma, tagId)` using generator environment, homonym parsing, tag filtering.
- Shared options management across analyzer/generator envs.

7. Packaging + CLI + Browser

- Expose ESM/CJS builds; optional small CLI (`analyse`/`generate`) for debugging.
- Browser example using embedded dictionary or fetched asset.

## Testing Strategy

- Use `vitest`.
- Unit tests per module: charset conversions, endian readers, FSA transitions (with tiny synthetic automata), interps deserialization.
- Integration tests:
    - Without dictionaries: whitespace/ign handling, token numbering.
    - With real dictionaries: compare a subset of analyse/generate outputs for known inputs using the provided `sgjp-*`/`polimorf-*` files.
- Snapshot tests for `IdResolver` mappings and available options.
- Performance sanity checks on medium texts.

## Risks/Mitigations

- FSA formats: Carefully mirror C++ `*_impl.hpp`; create minimal fixtures and cross-check offsets.
- Browser FS: Prefer `ArrayBuffer` inputs and document bundling option for default dictionary.
- Memory: Minimize string copies; prefer slicing views and codepoint iteration.

## Rough Estimates

- Foundations + Charset/Case: 2–3 days
- FSA + Binary parsing: 3–5 days
- Dictionary + Tagset + Segrules: 3–4 days
- Analyzer + Decoder + Iterator: 4–6 days
- Generator + Polishing + Tests: 3–5 days

## Next Steps

- Scaffold `src/` module layout and public exports.
- Implement Milestone (1) end-to-end with basic iterator and `ign`/`sp` handling.
- Decide default dictionary strategy for dev (use local `.dict` files by default).
