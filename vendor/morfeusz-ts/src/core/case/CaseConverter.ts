// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.

import { CaseHandling } from "../../core/types.js";

export class CaseConverter {
	toLower(s: string): string {
		return s.toLocaleLowerCase("pl-PL");
	}
	toUpper(s: string): string {
		return s.toLocaleUpperCase("pl-PL");
	}
	toTitle(s: string): string {
		if (!s) return s;
		const lower = this.toLower(s);
		// Use Intl.Segmenter to avoid splitting multi-codepoint grapheme clusters.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const Segmenter = typeof Intl !== "undefined" ? (Intl as any).Segmenter : undefined;
		const seg = Segmenter
			? new Segmenter("pl-PL", {
					granularity: "grapheme"
				})
			: null;
		if (seg) {
			const it = seg.segment(lower)[Symbol.iterator]();
			const firstSeg = it.next();
			const first = firstSeg.value?.segment ?? lower[0] ?? "";
			const rest = lower.slice(first.length);
			return first.toLocaleUpperCase("pl-PL") + rest;
		}
		const first = lower[0]?.toLocaleUpperCase("pl-PL") ?? "";
		return first + lower.slice(1);
	}
	equals(a: string, b: string, handling: CaseHandling): boolean {
		switch (handling) {
			case CaseHandling.IGNORE_CASE:
				return this.toLower(a) === this.toLower(b);
			case CaseHandling.STRICTLY_CASE_SENSITIVE:
				return a === b;
			case CaseHandling.CONDITIONALLY_CASE_SENSITIVE:
			default:
				// Placeholder: treat as case-insensitive match preference
				return this.toLower(a) === this.toLower(b) || a === b;
		}
	}
}