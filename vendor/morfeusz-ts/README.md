# morfeusz-ts

TypeScript port of Morfeusz2 with FSA backends (Simple, CFSA1, CFSA2), payload decoding, and case-aware analysis.

## Quick Start

```ts
import { MorfeuszImpl, MorfeuszUsage } from "morfeusz-ts";

// Create analyzer and load a dictionary by name
const m = new MorfeuszImpl("sgjp", MorfeuszUsage.ANALYSE_ONLY);
await m.load();

// Prefer matching-case interpretations; fallback to all when none match
m.preferMatchingCase();

// Analyse text; iterator yields MorphInterpretation entries
const it = m.analyse("Ala ma kota");
while (it.hasNext()) console.log(it.next());

// Toggle case policy as needed
m.strictCase(); // only matching-case interpretations
m.ignoreCase(); // accept all interpretations

// Generator example (stubbed until generator is wired)
const gen = new MorfeuszImpl("sgjp", MorfeuszUsage.GENERATE_ONLY);
console.log(gen.generate("kot"));
```

## Case Handling

- `strictCase()`: only returns interpretations that match orth-case flags.
- `preferMatchingCase()`: prefers matching-case; falls back to all if none match.
- `ignoreCase()`: returns all interpretations.

## Dictionaries

Loading real dictionaries is supported. The repository looks for `.dict` files using simple search paths and conventional filenames.

- File naming: analyzer vs generator
    - Analyzer: `<name>-a.dict` (e.g. `sgjp-a.dict`)
    - Generator: `<name>-s.dict` (e.g. `sgjp-s.dict`)

- Default search paths:
    - Current working directory (`.`)
    - `morfeusz2/dict` inside this project

- Custom search paths:
    - Set `DictionariesRepository.dictionarySearchPaths` at startup to include additional directories.

```ts
import { DictionariesRepository } from "morfeusz-ts";

DictionariesRepository.dictionarySearchPaths = [
	"/opt/morfeusz/dicts",
	"/home/user/dicts",
	"./morfeusz2/dict" // keep project default
];
```

- Usage example:

```ts
import { MorfeuszImpl, MorfeuszUsage } from "morfeusz-ts";

const m = new MorfeuszImpl("sgjp", MorfeuszUsage.ANALYSE_ONLY);
await m.load(); // looks for sgjp-a.dict in the configured search paths
console.log(m.analyse("Ala ma kota").next());
```

Troubleshooting:

- If `load()` throws "Dictionary not found", confirm filenames and that the directories are included in `DictionariesRepository.dictionarySearchPaths`.
- Some dictionaries use CFSA2; this backend is implemented and supported.

## Status

- Implemented: FSA backends (SimpleFSA, CFSA1, CFSA2), dictionary header parsing, payload decoder with lemma assembly and case handling; configurable dictionary search paths.
- In progress: Full epilogue parsing, generator wiring, robust IdResolver mappings.

## Attribution

This library is a TypeScript port of [Morfeusz2](https://morfeusz.sgjp.pl/), a morphological
analyzer and generator for Polish, originally developed at the Institute of Computer Science,
Polish Academy of Sciences (IPI PAN).

**Morfeusz2**
Copyright © 2014 by Institute of Computer Science, Polish Academy of Sciences. All rights reserved.
Licensed under the BSD 2-Clause License.

The SGJP and Polimorf dictionary data used by this library are also Copyright © Institute of
Computer Science, Polish Academy of Sciences, and are available under the same BSD 2-Clause terms.

See [NOTICE](./NOTICE) for full attribution details.
