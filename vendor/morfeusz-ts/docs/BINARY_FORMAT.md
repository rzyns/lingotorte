# Morfeusz2 `.dict` Binary Format

This document captures everything discovered during the TypeScript port about the
internal binary format of Morfeusz2 `.dict` files. It is intended to save future
readers from having to re-derive this by reverse-engineering the C++ source or
binary.

---

## Table of Contents

1. [File Overview](#1-file-overview)
2. [FSA Walk](#2-fsa-walk)
3. [Payload Group Framing](#3-payload-group-framing)
4. [Analyser Payload — Group Types](#4-analyser-payload--group-types)
    - [Critical Distinction: g.type vs groupTypeByte](#critical-distinction-gtype-vs-grouptypebyte)
    - [0xa0 groups — ORTH_ONLY_LOWER](#0xa0-groups--orth_only_lower-bit7)
    - [0x50 groups — ORTH_ONLY_TITLE](#0x50-groups--orth_only_title-bit6)
    - [0x00 groups — per-interp case](#0x00-groups--per-interp-case)
    - [Per-interp field layout summary](#per-interp-field-layout-summary)
5. [Lemma Construction (Analyser)](#5-lemma-construction-analyser)
6. [Case Handling](#6-case-handling)
    - [FSA walk and lowercase fallback](#fsa-walk-and-lowercase-fallback)
    - [readCasePattern encoding](#readcasepattern-encoding)
    - [groupMatchesOrth semantics](#groupmatchesorth-semantics)
7. [Generator Payload Format](#7-generator-payload-format)
8. [Epilogue — Tag / Name / Labels Tables](#8-epilogue--tag--name--labels-tables)
    - [Epilogue structure](#epilogue-structure)
    - [Table format](#table-format)
    - [ID encoding — the ceiling rule](#id-encoding--the-ceiling-rule)
9. [Key File Locations](#9-key-file-locations)

---

## 1. File Overview

A `.dict` file is divided into two regions:

```
[FSA data ...][epilogue data]
               ^
               offset read from file header (epilogueOffset)
```

The header contains the `epilogueOffset` field. Everything before it is the
serialised Finite-State Automaton. Everything from that offset onward is the
epilogue.

There are two dict variants per dictionary:

- `sgjp-a.dict` — analyser FSA (keyed on inflected form → lemma+tag)
- `sgjp-s.dict` — generator FSA (keyed on lemma → inflected forms)

Both files use the same epilogue structure but the payload encoding inside the
FSA is completely different (see §4 vs §7).

---

## 2. FSA Walk

The FSA maps a **byte sequence** to a payload. All input strings must be encoded
as **UTF-8 bytes** for traversal — use `new TextEncoder().encode(word)` in JS.

The payload at an accepting FSA state is accessed via the `InterpsGroupsReader`
and contains one or more groups of morphological interpretations.

### Lowercase fallback

If the FSA does not accept `word`, retry with `word.toLowerCase()`. Record
`orthForLemma = word.toLowerCase()` for later lemma stem computation (§5).
The original case of `word` is still used for group-level case matching (§6).

This is the mechanism that allows analysing "Warszawa" (title case) — the FSA
stores the lowercase form "warszawa"; the case information is recovered from
the group flags and per-interp patterns.

---

## 3. Payload Group Framing

The payload for any accepted word is a sequence of **groups**. Each group is
framed as:

```
[outer_type  1 byte ]
[size        2 bytes big-endian]
[content     `size` bytes      ]
```

The `InterpsGroupsReader.getNext()` method returns:

```ts
{ type: number,  // the outer_type byte
  ptr:  number,  // byte offset of content[0] inside the DataView
  size: number } // length of content in bytes
```

> **⚠ Critical:** `g.type` (the outer frame byte, e.g. `0x1b`) is **completely
> different** from `content[0]` (the groupTypeByte, e.g. `0xa0`). Almost all
> meaningful flags are in `content[0]`, not `g.type`. The original C++ code
> routes on `g.type` for framing but on `content[0]` for decoding. Confusing
> `g.type` with `content[0]` is the most common source of bugs.

---

## 4. Analyser Payload — Group Types

The first byte of content (`groupTypeByte = dv.getUint8(g.ptr)`) controls the
encoding of all interps within the group.

### Critical Distinction: g.type vs groupTypeByte

```
group frame:  [outer_type=0x1b][size=0x00 0x1d][content...]
                                                ^-- g.ptr
content:      [groupTypeByte=0xa0][suffixToCut ...][...]
               ^-- g.ptr, NOT g.type
```

Never use `g.type` for decoding interps.

### Flag bits in groupTypeByte

| Bit | Mask | Meaning                                                                 |
| --- | ---- | ----------------------------------------------------------------------- |
| 7   | 0x80 | ORTH_ONLY_LOWER: stems stored lowercase; no per-interp orth case        |
| 6   | 0x40 | ORTH_ONLY_TITLE: stems stored title-case; no per-interp orth case       |
| 5+4 | 0x30 | When **neither** bit is set: per-interp lemma case pattern is in stream |
| 3–0 | 0x0f | field0 nibble (see §5); `0xf` means "read explicit byte"                |

Common groupTypeByte values:

- `0xa0` = bit7+bit5 → ORTH_ONLY_LOWER + no lemma case in stream (field0=0)
- `0x50` = bit6+bit4 → ORTH_ONLY_TITLE + no lemma case in stream (field0=0)
- `0x00` = no flags → per-interp orth case + per-interp lemma case

### 0xa0 groups — ORTH_ONLY_LOWER (bit7)

Content layout:

```
[groupTypeByte=0xa0]  ← g.ptr
[interp 1 ...]
[interp 2 ...]
...
```

`ptr` starts at `g.ptr + 1` (no preLoopByte).

Each interp (no per-interp orth case byte; group-level stemCase = "lower"):

```
[suffixToCut  1 byte            ]
[suffixToAdd  NUL-terminated str]
[tagId        2 bytes big-endian]
[nameId       1 byte            ]
[labelsId     2 bytes big-endian]
```

These groups are **always included** in the matched set regardless of the input's
case (the 0x80 flag means the stems are stored lowercase, not that input must be
lowercase).

### 0x50 groups — ORTH_ONLY_TITLE (bit6)

Same layout as 0xa0 except groupStemCase = "title".

These groups match **only** when the input orth is title-case (first character
uppercase, remaining characters lowercase). They represent proper-noun entries.

### 0x00 groups — per-interp case

Content layout:

```
[groupTypeByte=0x00]  ← g.ptr
[preLoopByte       ]  ← g.ptr + 1 (always present; purpose unclear, typically 0x00)
[interp 1 ...]
[interp 2 ...]
...
```

`ptr` starts at `g.ptr + 2`.

Each interp has a per-interp orth case pattern **and** a per-interp lemma case
pattern in the byte stream:

```
[orth case pattern  (CasePattern, 1–N bytes)]
[field0             (see §5)                ]
[suffixToCut        1 byte                  ]
[suffixToAdd        NUL-terminated str      ]
[lemma case pattern (CasePattern, 1–N bytes)]
[tagId              2 bytes big-endian      ]
[nameId             1 byte                  ]
[labelsId           2 bytes big-endian      ]
```

The stemCase for lemma construction comes from the **orth** case pattern, not the
lemma case pattern. The lemma case pattern is read but currently unused (it
controls the output casing of the lemma field, which is generally already encoded
in the suffixToAdd string).

### Per-interp field layout summary

| Field       | Size                    | Present when                                                   |
| ----------- | ----------------------- | -------------------------------------------------------------- |
| orth case   | 1–N bytes (CasePattern) | `(groupTypeByte & 0xc0) === 0`                                 |
| field0      | nibble or 1 byte        | always                                                         |
| suffixToCut | 1 byte                  | always                                                         |
| suffixToAdd | NUL-str                 | always                                                         |
| lemma case  | 1–N bytes (CasePattern) | `(groupTypeByte & 0x30) === 0 && (groupTypeByte & 0x40) === 0` |
| tagId       | 2 bytes BE              | always                                                         |
| nameId      | 1 byte                  | always                                                         |
| labelsId    | 2 bytes BE              | always                                                         |

---

## 5. Lemma Construction (Analyser)

Given: input word `orthForLemma` (the word used to walk the FSA — may be
lowercased if fallback was used), per-interp fields, and `stemCase`:

```
field0     = nibble (bits 3–0 of groupTypeByte), OR an explicit byte if nibble == 0xf
prefixToCut = field0
stemEnd    = max(prefixToCut, orthForLemma.length - suffixToCut)
rawStem    = orthForLemma.slice(prefixToCut, stemEnd)
casedStem  = applyCase(rawStem, stemCase)
lemma      = casedStem + suffixToAdd
```

Note: `prefixToCut` is how many leading characters to discard from the input
when constructing the lemma stem. For most entries this is 0.

---

## 6. Case Handling

### FSA walk and lowercase fallback

Always try the exact input first. If the FSA rejects it, retry with
`word.toLowerCase()`. Track `orthForLemma`:

- Exact hit → `orthForLemma = word`
- Lowercase hit → `orthForLemma = word.toLowerCase()`

The original `word` is still passed to `InterpsGroupsDecoder.decode` as `orth`
for group-level case filtering.

### readCasePattern encoding

A CasePattern is a variable-length sequence starting with one byte:

| type byte | total bytes consumed | meaning                         |
| --------- | -------------------- | ------------------------------- |
| `0x00`    | 1                    | "lower" — stem stored lowercase |
| `0x01`    | 2                    | "title" — first char uppercase  |
| `0x02`    | 2 + `data[1]`        | "none" — complex mixed case     |
| other     | 1                    | "none" — treat as no transform  |

### groupMatchesOrth semantics

The `groupTypeByte` determines whether a group's interps are included in results:

| groupTypeByte bits 7+6 | Included when                                            |
| ---------------------- | -------------------------------------------------------- |
| `10` (0x80) — LOWER    | **Always** — these stems are just stored lowercase       |
| `01` (0x40) — TITLE    | Input is title-case only (proper nouns)                  |
| `00` (0x00) — neither  | Always included; per-interp orth case patterns handle it |

The 0x80 flag (`0xa0`) does **not** mean "input must be lowercase" — it means
the stem in the binary is stored in lowercase form. These groups always match.

---

## 7. Generator Payload Format

> **Warning:** The generator payload format is completely different from the
> analyser. Do not attempt to reuse `InterpsGroupsDecoder` for generator output.

When walking the generator FSA with a lemma key, each group's content encodes
a list of generated inflected forms. There is **no groupTypeByte** — content
starts directly with the first interp.

Each interp:

```
[lemmaDisambig   NUL-terminated str     ]  e.g. "Sm1", "Sm2", ""
[orthSuffixToCut 2 bytes big-endian     ]  chars to remove from end of lemmaKey
[orthSuffixToAdd NUL-terminated str     ]  chars to append after trimming
[tagId           2 bytes big-endian     ]
[nameId          1 byte                 ]
[labelsId        2 bytes big-endian     ]
```

> **⚠ Important:** `orthSuffixToCut` is **2 bytes** (uint16 BE), not 1.
> Using 1 byte here shifts all subsequent fields by 1 and produces completely
> wrong output. This was the last major parsing bug in the generator path.

Result construction:

```
orth  = lemmaKey.slice(0, lemmaKey.length - orthSuffixToCut) + orthSuffixToAdd
lemma = lemmaKey + (lemmaDisambig ? ":" + lemmaDisambig : "")
```

The `tagId`, `nameId`, `labelsId` use the same ceiling-rule lookup as the
analyser (§8).

### Difference between analyser and generator roles

| Path      | FSA key        | Result orth        | Result lemma           |
| --------- | -------------- | ------------------ | ---------------------- |
| Analyser  | inflected form | input word (as-is) | constructed string     |
| Generator | lemma          | constructed string | input + ":" + disambig |

---

## 8. Epilogue — Tag / Name / Labels Tables

### Epilogue structure

```
[mystery prefix   4 bytes                ]  (skip)
[tagsetId         NUL-terminated str     ]
[copyright        NUL-terminated str     ]
[segmentorId      NUL-terminated str     ]
[tag count header 4 bytes                ]  (skip: count + padding, use sentinel instead)
[tag table        (entry × N) + sentinel ]
[name table       (entry × M) + sentinel ]
[labels table     (entry × K) + sentinel ]
```

### Table format

Each table is a sequence of `(string, id)` pairs, terminated by a sentinel with
an empty string:

```
Entry: [NUL-terminated str][storedId 2 bytes big-endian]
Sentinel: ["" NUL][0x00 0x00]
```

The tables are 1-indexed (storedId ≥ 1). storedId=0 is the sentinel marker.

The first tag entry is always `("ign", 1)` and the second is `("sp", 2)`.

### ID encoding — the ceiling rule

> **This is the most non-obvious part of the entire format and took significant
> effort to discover.**

The binary tagId/nameId/labelsId fields in the FSA payload do **not** store a
`storedId` directly. The rule is:

```
storedId = smallest storedId in the table that is ≥ (binaryId + 1)
```

In other words:

- When there are no gaps: `storedId = binaryId + 1` (simple +1 offset)
- When `binaryId + 1` falls on a gap: skip forward to the next valid storedId

**Why this matters:** The SGJP tagset has gaps in its stored IDs (e.g., ids 150,
152, 252, 576–577, 599–605 are absent from both `sgjp-a.dict` and `sgjp-s.dict`).

Example:

- `binaryId=148` → `storedId=149` → `"conj"` ✓ (no gap, simple +1)
- `binaryId=149` → `storedId=151` → `"depr:pl:nom.acc.voc:m2"` ✓ (gap at 150, ceiling skips to 151)
- `binaryId=616` → `storedId=617` → `"subst:sg:gen.acc:m1"` ✓ (no gap at 617)

The gap ids in the SGJP tag table (both dicts, up to id=700):
`150, 152, 252, 576, 577, 599, 600, 601, 602, 603, 604, 605`

The same ceiling rule applies to nameId and labelsId lookups.

**Lookup implementation** (see `DictIdResolver.ts`):

```ts
function ceilLookup(
	idMap: Map<number, string>,
	binaryId: number
): string | undefined {
	let storedId = binaryId + 1;
	const max = storedId + 20; // gap runs in SGJP are short
	while (!idMap.has(storedId) && storedId <= max) storedId++;
	return idMap.get(storedId);
}
```

**What doesn't work:**

- Simple `+1` offset: fails when `binaryId + 1` is a gap
- Positional array (0-indexed into sorted entries): fails because the gaps
  accumulate — by position 616 there are 12 gaps before it, so positional[616]
  maps to storedId ~629, not 617

**Special case:** `binaryId=0` with tagId means "ign" (`binaryId + 1 = 1 = "ign"`).
`binaryId=0` with labelsId means "no labels" (return `""`), handled separately
before the ceiling lookup.

---

## 9. Key File Locations

| File                                               | Purpose                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/core/deserialization/InterpsGroupsDecoder.ts` | Analyser group decoding (case flags, lemma construction)               |
| `src/core/deserialization/GeneratorDecoder.ts`     | Generator payload decoding (completely different format)               |
| `src/core/deserialization/InterpsGroupsReader.ts`  | Iterates over framed groups in a payload                               |
| `src/core/dictionary/EpilogueParser.ts`            | Parses the epilogue (tag/name/labels tables)                           |
| `src/core/dictionary/DictIdResolver.ts`            | Ceiling-rule id→string lookup backed by parsed epilogue                |
| `src/core/dictionary/Dictionary.ts`                | Loads a `.dict` file; exposes epilogue + FSA                           |
| `src/morfeusz/MorfeuszImpl.ts`                     | Top-level analyser/generator entry points                              |
| `test/golden.test.ts`                              | Golden master tests: 104 fixtures, containment + tag string assertions |
| `test/generate-real.test.ts`                       | Generator path tests including the gap-tag edge case                   |

### Reference ground truth

The C++ CLI tools can be used to verify output at any time:

```sh
# Analyser
echo "psa" | morfeusz_analyzer --dict sgjp --dict-dir /usr/share/morfeusz2/dictionaries

# Generator
echo "kot" | morfeusz_generator --dict sgjp --dict-dir /usr/share/morfeusz2/dictionaries
```

Dictionary files: `/usr/share/morfeusz2/dictionaries/sgjp-a.dict` (analyser),
`/usr/share/morfeusz2/dictionaries/sgjp-s.dict` (generator).
