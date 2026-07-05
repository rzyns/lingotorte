import { Charset } from "../../core/types.js";

export interface CharsetConverter {
	next(it: { s: string; i: number }): number | null;
	append(cp: number, out: string[]): void;
	fromUTF8(input: string): string;
	toUTF8(input: string): string;
}

export class UTF8CharsetConverter implements CharsetConverter {
	static instance: UTF8CharsetConverter = new UTF8CharsetConverter();
	private constructor() {}

	next(it: { s: string; i: number }): number | null {
		if (it.i >= it.s.length) return null;
		const cp = it.s.codePointAt(it.i)!;
		it.i += cp > 0xffff ? 2 : 1;
		return cp;
	}

	append(cp: number, out: string[]): void {
		out.push(String.fromCodePoint(cp));
	}

	fromUTF8(input: string): string {
		return input;
	}

	toUTF8(input: string): string {
		return input;
	}
}

/**
 * Simple 1-byte converter using a codepoint table of length 256.
 */
export class OneByteCharsetConverter implements CharsetConverter {
	private readonly table: number[];
	private readonly reverse: Map<number, number>;

	constructor(table: number[]) {
		if (table.length !== 256)
			throw new Error("table must have 256 entries");
		this.table = table.slice(0, 256);
		this.reverse = new Map<number, number>();
		for (let i = 0; i < 256; i++) this.reverse.set(this.table[i], i);
	}

	next(it: { s: string; i: number }): number | null {
		if (it.i >= it.s.length) return null;
		const byte = it.s.charCodeAt(it.i++) & 0xff;
		return this.table[byte];
	}

	append(cp: number, out: string[]): void {
		const byte = this.reverse.get(cp);
		out.push(String.fromCharCode(byte ?? 0x3f)); // '?' fallback
	}

	fromUTF8(input: string): string {
		const out: string[] = [];
		for (let i = 0; i < input.length; ) {
			const cp = input.codePointAt(i)!;
			i += cp > 0xffff ? 2 : 1;
			this.append(cp, out);
		}
		return out.join("");
	}

	toUTF8(input: string): string {
		const out: string[] = [];
		for (let i = 0; i < input.length; i++) {
			const b = input.charCodeAt(i) & 0xff;
			out.push(String.fromCodePoint(this.table[b]));
		}
		return out.join("");
	}
}

// Minimal ASCII-forward tables for ISO-8859-2, CP1250, CP852.
// For now, fill extended range with Unicode REPLACEMENT CHARACTER or identity mapping; can be extended later.
const asciiForward = (() => {
	const t = new Array<number>(256).fill(0xfffd);
	for (let i = 0; i < 128; i++) t[i] = i;
	// naive identity for 128..255 (not accurate but non-crashing placeholder until full tables are added)
	for (let i = 128; i < 256; i++) t[i] = i;
	return t;
})();

export function getCharsetConverter(charset: Charset): CharsetConverter {
	switch (charset) {
		case Charset.UTF8:
			return UTF8CharsetConverter.instance;
		case Charset.ISO8859_2:
		case Charset.CP1250:
		case Charset.CP852:
			return new OneByteCharsetConverter(asciiForward);
		default:
			return UTF8CharsetConverter.instance;
	}
}
