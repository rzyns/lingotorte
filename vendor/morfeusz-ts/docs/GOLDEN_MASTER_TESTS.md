# Golden Master Test Suite — Spec

## Goal

Validate the TypeScript port against the upstream C++ `morfeusz_analyzer` as the source
of truth. Tests are "golden master" style: fixture data is generated offline by running
the real CLI, committed to the repo, and the test suite compares the TS output against it.

This gives regression coverage across the full tokenization / FSA walk / decode pipeline
without needing the C++ library at test-run time.

---

## Current Blockers

Before the full golden master suite can assert tag _strings_, the `IdResolver` must be
implemented (parses the dict epilogue to map `tagId → "subst:sg:nom:m1"` etc.).
The epilogue is the data appended to the CFSA1/CFSA2 FSA payload and is currently a
`// TODO` in `Dictionary.ts`.

Until then, golden master tests can assert on:

- **lemma** (already works)
- **tagId** (numeric, already in `MorphInterpretation`)
- **nameId** and **labelsId** (numeric)

Phase 2 (after `IdResolver`) adds:

- **tag string** (e.g. `"subst:sg:nom:m1"`)
- **name string** (e.g. `"nazwa_pospolita"`)

---

## Architecture

```
test/fixtures/golden/          fixture directory (committed)
  sgjp-a/                      one subdir per dict
    kot.json
    psa.json
    w.json
    ...

scripts/generate-golden.ts     fixture generator (run locally, requires morfeusz2)
test/golden.test.ts            vitest test that loads fixtures and compares
```

---

## Fixture Format

Each fixture file is `<word>.json`:

```jsonc
{
	"word": "kot",
	"dict": "sgjp",
	"generatedAt": "2026-03-02T21:00:00Z",
	"generatedBy": "morfeusz_analyzer 1.99.12",
	"results": [
		{
			"orth": "kot",
			"lemma": "kot:Sm1",
			"tag": "subst:sg:nom:m1",
			"name": "nazwa_pospolita",
			"labels": ["pot.", "środ."],
			"tagId": null,
			"nameId": null,
			"labelsId": null
		}
	]
}
```

`tagId`/`nameId`/`labelsId` are `null` until `IdResolver` is implemented; once it is,
re-run the generator to fill them in.

---

## Generator Script (`scripts/generate-golden.ts`)

```
Usage: pnpm tsx scripts/generate-golden.ts [word...] [--all] [--dict sgjp]
Requires: morfeusz_analyzer on PATH
```

### Steps

1. For each word in the list (or the constant `WORD_LIST` if `--all`):
    - Run: `echo "<word>" | morfeusz_analyzer`
    - Parse the output (see format below)
    - Write `test/fixtures/golden/<dict>/<word>.json`
2. Print summary.

### Parsing `morfeusz_analyzer` output

Output format (one `[...]` block per input word):

```
[0,1,kot,kot:Sm1,subst:sg:nom:m1,nazwa_pospolita,pot.,środ.
 0,1,kot,kot:Sm2,subst:sg:nom:m2,nazwa_pospolita,_]
```

- Split the block on `\n ` (newline + space) to get individual interpretation lines
- Strip leading `[` / trailing `]`
- Split each line on `,` — first 5 fields are startNode, endNode, orth, lemma, tag; field 5 is name; remaining fields (if any) are labels
- Labels: if the single token is `_`, labels = `[]`; otherwise use as-is (may contain `|` for multi-value)

---

## Word List

Systematically covers every relevant inflectional pattern in SGJP:

### Core word forms (dictionary headwords)

| Category        | Words                                        |
| --------------- | -------------------------------------------- |
| Nouns m1        | kot, pies, mężczyzna, chłopiec, stół         |
| Nouns m2        | kret, szczur                                 |
| Nouns m3        | stół, dom, samochód                          |
| Nouns f         | kobieta, matka, córka, rzeka, noc            |
| Nouns n         | okno, miasto, dziecko, morze                 |
| Adj             | dobry, duży, stary, nowy, czerwony           |
| Verbs imperf    | robić, czytać, pisać, mówić                  |
| Verbs perf      | zrobić, napisać, powiedzieć                  |
| Verbs irregular | być, mieć, iść, wiedzieć                     |
| Prepositions    | w, z, na, po, do, od, przy, przed, przez, za |
| Conjunctions    | i, ale, że, bo, lub, oraz                    |
| Pronouns        | ja, ty, on, ona, ono, my, wy, się            |
| Adverbs         | dobrze, szybko, bardzo, już, też             |
| Numerals        | jeden, dwa, trzy, pięć, sto, tysiąc          |

### Inflected forms (not headwords — tests FSA walk + suffix cut)

| Form     | Expected lemma stem |
| -------- | ------------------- |
| psa      | pies                |
| psu      | pies                |
| kota     | kot                 |
| kotów    | kot                 |
| kobiety  | kobieta             |
| kobiecie | kobieta             |
| okna     | okno                |
| dobrego  | dobry               |
| dobremu  | dobry               |
| czyta    | czytać              |
| pisał    | pisać               |
| idę      | iść                 |
| jest     | być                 |
| ma       | mieć                |

### Diacritics

| Word    | Note                        |
| ------- | --------------------------- |
| żółw    | all three Polish diacritics |
| źródło  | ź, ó                        |
| ścieżka | ś, ę, ż                     |
| łódź    | ł, ó, ź                     |
| środa   | ś, ó                        |
| ółów    | pathological: starts with ó |

### Case variants (tests case-sensitivity handling)

| Input    | Expected behaviour                                              |
| -------- | --------------------------------------------------------------- |
| kot      | returns kot:Sm1, kot:Sm2, kota                                  |
| Kot      | should return proper-noun forms if any; fallback to kot\* forms |
| KOT      | fallback to all forms (no case match)                           |
| Warszawa | returns both lowercase and proper-noun forms                    |
| warszawa | returns common-noun form only                                   |
| WARSZAWA | fallback: all forms                                             |

### Absent from dictionary

| Word   | Expected behaviour |
| ------ | ------------------ |
| qwerty | ign result only    |
| xyzzy  | ign result only    |
| aaabbb | ign result only    |

### Long / compound

| Word              | Note                        |
| ----------------- | --------------------------- |
| przeczytałbym     | verb + conditional suffix   |
| nieprzyzwyczajony | long adjective              |
| biało-czerwony    | compound (if dict supports) |

---

## Test File (`test/golden.test.ts`)

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MorfeuszImpl } from "../src/morfeusz/MorfeuszImpl.js";
import { DictionariesRepository } from "../src/core/dictionary/DictionariesRepository.js";
import { MorfeuszProcessorType } from "../src/core/dictionary/const.js";
import { MorfeuszUsage } from "../src/core/types.js";

const FIXTURES_DIR = new URL("./fixtures/golden/sgjp-a", import.meta.url)
	.pathname;

type GoldenResult = {
	orth: string;
	lemma: string;
	tag: string;
	name: string;
	labels: string[];
	tagId: number | null;
	nameId: number | null;
	labelsId: number | null;
};
type GoldenFixture = { word: string; dict: string; results: GoldenResult[] };

const fixtureFiles = existsSync(FIXTURES_DIR)
	? readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"))
	: [];

describe("Golden master — MorfeuszImpl vs morfeusz_analyzer", () => {
	let m: MorfeuszImpl | null = null;

	beforeAll(async () => {
		const found = await DictionariesRepository.tryToLoadDictionary(
			"sgjp",
			MorfeuszProcessorType.ANALYZER
		);
		if (!found) return;
		m = new MorfeuszImpl("sgjp", MorfeuszUsage.ANALYSE_ONLY);
		await m.load();
	});

	for (const file of fixtureFiles) {
		const fixture: GoldenFixture = JSON.parse(
			readFileSync(join(FIXTURES_DIR, file), "utf-8")
		);

		describe(`"${fixture.word}"`, () => {
			it("produces at least one non-ign result when word is in dict", () => {
				if (!m) return;
				const results = m.analyseToArray(fixture.word);
				const nonIgn = results.filter((r) => r.tagId !== 0);
				if (fixture.results.length > 0) {
					expect(nonIgn.length).toBeGreaterThan(0);
				}
			});

			it("TS output contains every lemma the C++ returns", () => {
				if (!m) return;
				const results = m.analyseToArray(fixture.word);
				const tsLemmas = new Set(results.map((r) => r.lemma));
				for (const expected of fixture.results) {
					expect(
						tsLemmas.has(expected.lemma),
						`missing lemma "${expected.lemma}" (tag: ${expected.tag})`
					).toBe(true);
				}
			});

			const hasTagIds = fixture.results.some((r) => r.tagId !== null);
			it.skipIf(!hasTagIds)(
				"TS output contains every tagId the C++ returns",
				() => {
					if (!m) return;
					const results = m.analyseToArray(fixture.word);
					const tsTagIds = new Set(results.map((r) => r.tagId));
					for (const expected of fixture.results) {
						if (expected.tagId === null) continue;
						expect(
							tsTagIds.has(expected.tagId),
							`missing tagId ${expected.tagId} (${expected.tag})`
						).toBe(true);
					}
				}
			);
		});
	}
});
```

---

## Assertion strategy: containment, not equality

The TS port currently returns **all** interpretations encoded in the dict, including
ones the C++ filters via case-pattern matching (e.g. title-case-only entries for
lowercase input). Therefore tests use **set containment**:

> Every interpretation the C++ returns for word W **must appear** in the TS output.
> The TS may additionally return case-variant interps the C++ filtered.

Once we implement the same case-filtering as the C++ (tracking `nameId=65` proper-noun
rules etc.), we can tighten to exact equality.

---

## Phases

| Phase   | Blocker                        | Assertions                       |
| ------- | ------------------------------ | -------------------------------- |
| 1 (now) | none                           | lemma containment, non-ign check |
| 2       | `IdResolver` (epilogue parser) | + tagId containment              |
| 3       | case-filter parity             | exact result-set equality        |

---

## Running

```bash
# Generate all fixtures (requires morfeusz_analyzer on PATH):
pnpm tsx scripts/generate-golden.ts --all

# Run golden tests only:
pnpm test test/golden.test.ts

# Run full suite (golden + unit):
pnpm test
```
