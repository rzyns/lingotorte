export const CompressionFlags = {
    ORTH_ONLY_LOWER: 0x80,
    ORTH_ONLY_TITLE: 0x40,
    LEMMA_ONLY_LOWER: 0x20,
    LEMMA_ONLY_TITLE: 0x10,
    PREFIX_CUT_MASK: 0x0f
};
export function hasCompressedOrthCasePatterns(byte) {
    return ((byte &
        (CompressionFlags.ORTH_ONLY_LOWER |
            CompressionFlags.ORTH_ONLY_TITLE)) !==
        0);
}
export function isOrthOnlyLower(byte) {
    return (byte & CompressionFlags.ORTH_ONLY_LOWER) !== 0;
}
export function isOrthOnlyTitle(byte) {
    return (byte & CompressionFlags.ORTH_ONLY_TITLE) !== 0;
}
export function isLemmaOnlyLower(byte) {
    return (byte & CompressionFlags.LEMMA_ONLY_LOWER) !== 0;
}
export function isLemmaOnlyTitle(byte) {
    return (byte & CompressionFlags.LEMMA_ONLY_TITLE) !== 0;
}
export function hasCompressedPrefixCut(byte) {
    return ((byte & CompressionFlags.PREFIX_CUT_MASK) !==
        CompressionFlags.PREFIX_CUT_MASK);
}
export function getPrefixCutLength(byte) {
    return byte & CompressionFlags.PREFIX_CUT_MASK;
}
//# sourceMappingURL=compression.js.map