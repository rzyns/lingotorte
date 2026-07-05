import { Charset } from "../../core/types.js";
export interface CharsetConverter {
    next(it: {
        s: string;
        i: number;
    }): number | null;
    append(cp: number, out: string[]): void;
    fromUTF8(input: string): string;
    toUTF8(input: string): string;
}
export declare class UTF8CharsetConverter implements CharsetConverter {
    static instance: UTF8CharsetConverter;
    private constructor();
    next(it: {
        s: string;
        i: number;
    }): number | null;
    append(cp: number, out: string[]): void;
    fromUTF8(input: string): string;
    toUTF8(input: string): string;
}
/**
 * Simple 1-byte converter using a codepoint table of length 256.
 */
export declare class OneByteCharsetConverter implements CharsetConverter {
    private readonly table;
    private readonly reverse;
    constructor(table: number[]);
    next(it: {
        s: string;
        i: number;
    }): number | null;
    append(cp: number, out: string[]): void;
    fromUTF8(input: string): string;
    toUTF8(input: string): string;
}
export declare function getCharsetConverter(charset: Charset): CharsetConverter;
//# sourceMappingURL=CharsetConverter.d.ts.map