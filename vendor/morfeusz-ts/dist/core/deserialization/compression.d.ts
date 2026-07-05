export declare const CompressionFlags: {
    readonly ORTH_ONLY_LOWER: 128;
    readonly ORTH_ONLY_TITLE: 64;
    readonly LEMMA_ONLY_LOWER: 32;
    readonly LEMMA_ONLY_TITLE: 16;
    readonly PREFIX_CUT_MASK: 15;
};
export declare function hasCompressedOrthCasePatterns(byte: number): boolean;
export declare function isOrthOnlyLower(byte: number): boolean;
export declare function isOrthOnlyTitle(byte: number): boolean;
export declare function isLemmaOnlyLower(byte: number): boolean;
export declare function isLemmaOnlyTitle(byte: number): boolean;
export declare function hasCompressedPrefixCut(byte: number): boolean;
export declare function getPrefixCutLength(byte: number): number;
//# sourceMappingURL=compression.d.ts.map