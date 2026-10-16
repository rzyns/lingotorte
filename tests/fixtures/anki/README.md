# Anki export fixtures (lt-dxo)

Synthetic only. `synthetic-anki-input.json` holds fake saved items/occurrences (one archived, one dictionary-suggested meaning, HTML/tab/newline edge cases). `synthetic-anki-expected.txt` is the golden Anki text-import output (LF line endings) produced by `buildAnkiTextExport(buildAnkiExportPlan(...).notes)`; any change must be reviewed by hand.
