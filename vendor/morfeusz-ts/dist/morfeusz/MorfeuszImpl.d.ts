import type { IdResolver, MorphInterpretation } from "../core/types.js";
import { Charset, TokenNumbering, CaseHandling, WhitespaceHandling, MorfeuszUsage } from "../core/types.js";
import { ResultsIteratorImpl } from "./ResultsIteratorImpl.js";
import { MorfeuszProcessorType } from "../core/dictionary/const.js";
export declare class MorfeuszImpl {
    private usage;
    private options;
    private nextNodeNum;
    private idResolver;
    private dictionaryName;
    private dictionary;
    private fsa;
    constructor(dictName: string, usage: MorfeuszUsage);
    clone(): MorfeuszImpl;
    getDictID(): string;
    getDictCopyright(): string;
    analyse(text: string): ResultsIteratorImpl;
    analyseToArray(text: string): MorphInterpretation[];
    generate(lemma: string): MorphInterpretation[];
    generateWithTag(lemma: string, tagId: number): MorphInterpretation[];
    setCharset(charset: Charset): void;
    getCharset(): Charset;
    setAggl(_aggl: string): void;
    getAggl(): string;
    setPraet(_praet: string): void;
    getPraet(): string;
    setCaseHandling(ch: CaseHandling): void;
    getCaseHandling(): CaseHandling;
    strictCase(): this;
    preferMatchingCase(): this;
    ignoreCase(): this;
    setTokenNumbering(tn: TokenNumbering): void;
    getTokenNumbering(): TokenNumbering;
    setWhitespaceHandling(wh: WhitespaceHandling): void;
    getWhitespaceHandling(): WhitespaceHandling;
    setDebug(debug: boolean): void;
    getIdResolver(): IdResolver;
    setDictionary(dictName: string): void;
    getAvailableAgglOptions(): Set<string>;
    getAvailablePraetOptions(): Set<string>;
    private adjustTokensCounter;
    private ensureIsAnalyzer;
    private ensureIsGenerator;
    load(processorType?: MorfeuszProcessorType): Promise<void>;
    isLoaded(): boolean;
    /**
     * Walk the FSA with the given word's UTF-8 bytes.
     * Returns the InterpsGroupsReader at the accepting state, or null on miss.
     */
    private walkFSA;
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
    private recognizePayload;
    private decodePayload;
}
//# sourceMappingURL=MorfeuszImpl.d.ts.map