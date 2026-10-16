# Synthetic gloss fixture (lt-foe.3.2)

`synthetic-wiktextract.jsonl` is hand-written and **synthetic**. It imitates the line shape of the
Wiktextract raw dump (kaikki.org) but every gloss is invented (marked `(synthetic)`); it contains no
Wiktionary text. Edge cases: non-Polish lines, a redirect line, an entry without senses, senses
without glosses / tagged `no-gloss`, form-of senses, one lemma with several POS, an uppercase
diacritic lemma (`Żółw`), a multi-element glosses path, an unknown POS and one malformed JSON line.
Tests build a `.gz` copy at runtime; no compressed fixture is committed.

`synthetic-gloss-route.jsonl` (lt-foe.3.3) is equally synthetic. It also reproduces unresolved form-of rows:
`witajka` has a NOUN gloss plus an INTJ sense tagged form-of whose target is a multi-word phrase with no
entry, and `synthfoa` is a form-of whose target `synthfoo` has no entry. Lookup returns their own gloss text
(`via:'form-of-text'`).
