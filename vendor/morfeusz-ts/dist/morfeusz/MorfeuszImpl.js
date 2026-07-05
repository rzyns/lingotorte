// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
import { Charset, TokenNumbering, CaseHandling, WhitespaceHandling, MorfeuszUsage, MorphInterpretation as MI, MorfeuszException } from "../core/types.js";
import { ResultsIteratorImpl } from "./ResultsIteratorImpl.js";
import { DictionariesRepository } from "../core/dictionary/DictionariesRepository.js";
import { MorfeuszProcessorType } from "../core/dictionary/const.js";
import { Dictionary } from "../core/dictionary/Dictionary.js";
import { InterpsGroupsReader } from "../core/deserialization/InterpsGroupsReader.js";
import { InterpsGroupsDecoder } from "../core/deserialization/InterpsGroupsDecoder.js";
import { MorphDeserializer } from "../core/deserialization/MorphDeserializer.js";
import { decodeGeneratorPayload } from "../core/deserialization/GeneratorDecoder.js";
import { DictIdResolver } from "../core/dictionary/DictIdResolver.js";
export class MorfeuszImpl {
    usage;
    options = {
        encoding: Charset.UTF8,
        tokenNumbering: TokenNumbering.SEPARATE_NUMBERING,
        whitespaceHandling: WhitespaceHandling.SKIP_WHITESPACES,
        caseHandling: CaseHandling.CONDITIONALLY_CASE_SENSITIVE,
        debug: false
    };
    nextNodeNum = 0;
    idResolver = null; // placeholder until dictionaries are wired
    dictionaryName;
    dictionary = null;
    fsa = null;
    constructor(dictName, usage) {
        this.dictionaryName = dictName;
        this.usage = usage;
    }
    clone() {
        const c = new MorfeuszImpl(this.dictionaryName, this.usage);
        c.options = { ...this.options };
        c.nextNodeNum = this.nextNodeNum;
        c.idResolver = this.idResolver;
        return c;
    }
    getDictID() {
        return this.dictionary ? this.dictionaryName : "default";
    }
    getDictCopyright() {
        return "";
    }
    analyse(text) {
        this.ensureIsAnalyzer();
        this.adjustTokensCounter();
        const items = this.analyseToArray(text);
        return new ResultsIteratorImpl(items);
    }
    analyseToArray(text) {
        this.ensureIsAnalyzer();
        this.adjustTokensCounter();
        const items = [];
        let cursor = 0;
        const pushWhitespace = (ws) => {
            if (this.options.whitespaceHandling ===
                WhitespaceHandling.KEEP_WHITESPACES) {
                items.push(MI.createWhitespace(this.nextNodeNum, this.nextNodeNum + 1, ws));
                this.nextNodeNum += 1;
            }
        };
        const pushWord = (w) => {
            if (!w)
                return;
            const payload = this.recognizePayload(w);
            if (payload) {
                const interps = this.decodePayload(w, payload.reader, payload.orthForLemma);
                for (const it of interps) {
                    items.push({
                        ...it,
                        startNode: this.nextNodeNum,
                        endNode: this.nextNodeNum + 1
                    });
                }
            }
            else {
                items.push(MI.createIgn(this.nextNodeNum, this.nextNodeNum + 1, w, w));
            }
            this.nextNodeNum += 1;
        };
        while (cursor < text.length) {
            const ch = text[cursor];
            if (/\s/.test(ch)) {
                // eslint-disable-next-line prefer-const
                let start = cursor;
                while (cursor < text.length && /\s/.test(text[cursor]))
                    cursor++;
                pushWhitespace(text.slice(start, cursor));
            }
            else {
                // eslint-disable-next-line prefer-const
                let start = cursor;
                while (cursor < text.length && !/\s/.test(text[cursor]))
                    cursor++;
                pushWord(text.slice(start, cursor));
            }
        }
        return items;
    }
    generate(lemma) {
        this.ensureIsGenerator();
        if (/\s/.test(lemma))
            throw new MorfeuszException("Input contains more than one word");
        // The generator FSA is keyed on lemma strings (same FSA-walk logic as analyser).
        // The payload format is different: each interp encodes the generated orth + tag.
        const payload = this.recognizePayload(lemma);
        if (!payload)
            return [MI.createIgn(0, 1, lemma, lemma)];
        return decodeGeneratorPayload(payload.orthForLemma, payload.reader, this.getIdResolver());
    }
    generateWithTag(lemma, tagId) {
        return this.generate(lemma).filter((m) => m.tagId === tagId);
    }
    setCharset(charset) {
        this.options.encoding = charset;
    }
    getCharset() {
        return this.options.encoding;
    }
    setAggl(_aggl) { }
    getAggl() {
        return "";
    }
    setPraet(_praet) { }
    getPraet() {
        return "";
    }
    setCaseHandling(ch) {
        this.options.caseHandling = ch;
    }
    getCaseHandling() {
        return this.options.caseHandling;
    }
    // Convenience methods for case preference
    strictCase() {
        this.setCaseHandling(CaseHandling.STRICTLY_CASE_SENSITIVE);
        return this;
    }
    preferMatchingCase() {
        this.setCaseHandling(CaseHandling.CONDITIONALLY_CASE_SENSITIVE);
        return this;
    }
    ignoreCase() {
        this.setCaseHandling(CaseHandling.IGNORE_CASE);
        return this;
    }
    setTokenNumbering(tn) {
        this.options.tokenNumbering = tn;
        this.nextNodeNum = 0;
    }
    getTokenNumbering() {
        return this.options.tokenNumbering;
    }
    setWhitespaceHandling(wh) {
        this.options.whitespaceHandling = wh;
    }
    getWhitespaceHandling() {
        return this.options.whitespaceHandling;
    }
    setDebug(debug) {
        this.options.debug = debug;
    }
    getIdResolver() {
        if (!this.idResolver) {
            // minimal stub resolver
            this.idResolver = {
                getTagsetId: () => "stub",
                getTag: (id) => id === 0 ? "ign" : id === 1 ? "sp" : `tag${id}`,
                getTagId: (t) => (t === "ign" ? 0 : t === "sp" ? 1 : 2),
                getName: (_id) => "",
                getNameId: (_n) => 0,
                getLabelsAsString: (_id) => "",
                getLabels: (_id) => new Set(),
                getLabelsId: (_s) => 0,
                getTagsCount: () => 2,
                getNamesCount: () => 0,
                getLabelsCount: () => 0
            };
        }
        return this.idResolver;
    }
    setDictionary(dictName) {
        this.dictionaryName = dictName;
    }
    getAvailableAgglOptions() {
        return new Set();
    }
    getAvailablePraetOptions() {
        return new Set();
    }
    adjustTokensCounter() {
        if (this.options.tokenNumbering === TokenNumbering.SEPARATE_NUMBERING) {
            this.nextNodeNum = 0;
        }
    }
    ensureIsAnalyzer() {
        if (this.usage !== MorfeuszUsage.ANALYSE_ONLY &&
            this.usage !== MorfeuszUsage.BOTH_ANALYSE_AND_GENERATE) {
            throw new MorfeuszException("Cannot analyse with given Morfeusz instance.");
        }
    }
    ensureIsGenerator() {
        if (this.usage !== MorfeuszUsage.GENERATE_ONLY &&
            this.usage !== MorfeuszUsage.BOTH_ANALYSE_AND_GENERATE) {
            throw new MorfeuszException("Cannot generate with given Morfeusz instance.");
        }
    }
    async load(processorType) {
        const pt = processorType ??
            (this.usage === MorfeuszUsage.GENERATE_ONLY
                ? MorfeuszProcessorType.GENERATOR
                : MorfeuszProcessorType.ANALYZER);
        const data = await DictionariesRepository.tryToLoadDictionary(this.dictionaryName, pt);
        if (!data)
            throw new MorfeuszException(`Dictionary not found: ${this.dictionaryName} (${pt === MorfeuszProcessorType.ANALYZER ? "analyzer" : "generator"})`);
        this.dictionary = new Dictionary(data.buffer);
        // Create FSA with morph deserializer
        const deser = new MorphDeserializer();
        this.fsa = this.dictionary.createFSA(deser, () => new InterpsGroupsReader());
        // Wire up real tag/name/label resolver from the parsed epilogue
        this.idResolver = new DictIdResolver(this.dictionary.epilogue);
    }
    isLoaded() {
        return !!this.fsa;
    }
    /**
     * Walk the FSA with the given word's UTF-8 bytes.
     * Returns the InterpsGroupsReader at the accepting state, or null on miss.
     */
    walkFSA(word) {
        if (!this.fsa)
            return null;
        const s = this.fsa.getInitialState();
        // The FSA is indexed on raw UTF-8 byte sequences.
        const encoded = new TextEncoder().encode(word);
        for (const byte of encoded) {
            s.proceedToNext(this.fsa, byte);
            if (s.isSink())
                return null;
        }
        if (!s.isAccepting())
            return null;
        return s.getValue();
    }
    /**
     * Try to find FSA payload for `word`.
     *
     * Strategy (mirrors the C++ implementation):
     *   1. Exact match — walk with original word bytes.
     *   2. Lowercase fallback — if no exact hit AND word !== word.toLowerCase(),
     *      walk with the lowercased form. In that case `orthForLemma` is the
     *      lowercase form so lemma stems are computed from it; case-pattern
     *      metadata in each interp then re-applies the correct casing.
     *
     * Returns { reader, orthForLemma } or null when the word is not in the FSA
     * at all (even after lowercasing).
     */
    recognizePayload(word) {
        const exact = this.walkFSA(word);
        if (exact)
            return { reader: exact, orthForLemma: word };
        // Lowercase fallback (handles "KOT", "Warszawa", "BIEGAĆ" etc.)
        const lower = word.toLowerCase();
        if (lower === word)
            return null; // already lowercase — no fallback possible
        const fallback = this.walkFSA(lower);
        if (fallback)
            return { reader: fallback, orthForLemma: lower };
        return null;
    }
    decodePayload(orth, reader, orthForLemma = orth) {
        const decoder = new InterpsGroupsDecoder();
        const ids = this.getIdResolver();
        const res = decoder.decode(orth, reader, ids, this.options.caseHandling, orthForLemma);
        if (res.length === 0)
            return [MI.createIgn(0, 0, orth, orth)];
        return res;
    }
}
//# sourceMappingURL=MorfeuszImpl.js.map