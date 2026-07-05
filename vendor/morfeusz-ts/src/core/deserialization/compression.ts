export const CompressionFlags = {
	ORTH_ONLY_LOWER: 0x80,
	ORTH_ONLY_TITLE: 0x40,
	LEMMA_ONLY_LOWER: 0x20,
	LEMMA_ONLY_TITLE: 0x10,
	PREFIX_CUT_MASK: 0x0f
} as const;

export function hasCompressedOrthCasePatterns(byte: number): boolean {
	return (
		(byte &
			(CompressionFlags.ORTH_ONLY_LOWER |
				CompressionFlags.ORTH_ONLY_TITLE)) !==
		0
	);
}
export function isOrthOnlyLower(byte: number): boolean {
	return (byte & CompressionFlags.ORTH_ONLY_LOWER) !== 0;
}
export function isOrthOnlyTitle(byte: number): boolean {
	return (byte & CompressionFlags.ORTH_ONLY_TITLE) !== 0;
}
export function isLemmaOnlyLower(byte: number): boolean {
	return (byte & CompressionFlags.LEMMA_ONLY_LOWER) !== 0;
}
export function isLemmaOnlyTitle(byte: number): boolean {
	return (byte & CompressionFlags.LEMMA_ONLY_TITLE) !== 0;
}
export function hasCompressedPrefixCut(byte: number): boolean {
	return (
		(byte & CompressionFlags.PREFIX_CUT_MASK) !==
		CompressionFlags.PREFIX_CUT_MASK
	);
}
export function getPrefixCutLength(byte: number): number {
	return byte & CompressionFlags.PREFIX_CUT_MASK;
}
