import type { InterpsGroupsReader } from "./InterpsGroupsReader.js";
import type { MorphInterpretation, IdResolver } from "../types.js";
/**
 * Decode a generator FSA payload.
 *
 * Generator format (completely different from analyser):
 * Each group's content begins directly with the first interp (no compression byte,
 * no preLoopByte). Each interp encodes:
 *
 *   [lemmaDisambig NUL-terminated string]  — e.g. "Sm1", "Sm2", ""
 *   [orthSuffixToCut 2 bytes big-endian]   — chars to remove from end of lemmaKey
 *   [orthSuffixToAdd NUL-terminated string] — chars to append after trimming
 *   [tagId  2 bytes big-endian]
 *   [nameId 1 byte]
 *   [labelsId 2 bytes big-endian]
 *
 * Result fields:
 *   orth  = lemmaKey.slice(0, lemmaKey.length - orthSuffixToCut) + orthSuffixToAdd
 *   lemma = lemmaKey + (disambig ? ":" + disambig : "")
 */
export declare function decodeGeneratorPayload(lemmaKey: string, reader: InterpsGroupsReader, ids: IdResolver): MorphInterpretation[];
//# sourceMappingURL=GeneratorDecoder.d.ts.map