import type { InterpsGroupsReader } from "./InterpsGroupsReader.js";
import type { MorphInterpretation, IdResolver } from "../types.js";
import { readCString } from "../binary/readers.js";

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
export function decodeGeneratorPayload(
	lemmaKey: string,
	reader: InterpsGroupsReader,
	ids: IdResolver
): MorphInterpretation[] {
	const results: MorphInterpretation[] = [];

	while (reader.hasNext()) {
		const g = reader.getNext();
		const dv = reader.getView();
		let ptr = g.ptr; // content starts at g.ptr (no compression byte for generator)
		const end = g.ptr + g.size;

		while (ptr < end) {
			// 1. Lemma disambiguation suffix (NUL-terminated)
			const { value: disambig, next: p1 } = readCString(dv, ptr);
			ptr = p1;
			if (ptr >= end) break;

			// 2. orthSuffixToCut (2 bytes big-endian)
			if (ptr + 2 > end) break;
			const orthSuffixToCut = dv.getUint16(ptr, false);
			ptr += 2;
			if (ptr >= end) break;

			// 3. orthSuffixToAdd (NUL-terminated)
			const { value: orthSuffixToAdd, next: p2 } = readCString(dv, ptr);
			ptr = p2;

			// 4. tagId (2 bytes BE), nameId (1 byte), labelsId (2 bytes BE)
			if (ptr + 5 > end) break;
			const tagId = dv.getUint16(ptr, false);
			ptr += 2;
			const nameId = dv.getUint8(ptr);
			ptr++;
			const labelsId = dv.getUint16(ptr, false);
			ptr += 2;

			// Construct orth from lemmaKey
			const stemEnd = Math.max(0, lemmaKey.length - orthSuffixToCut);
			const orth = lemmaKey.slice(0, stemEnd) + orthSuffixToAdd;

			// Lemma = lemmaKey + ":" + disambig (or just lemmaKey if disambig is empty)
			const lemma = disambig ? lemmaKey + ":" + disambig : lemmaKey;

			results.push({
				startNode: 0,
				endNode: 0,
				orth,
				lemma,
				tagId,
				tag: ids.getTag(tagId),
				nameId,
				name: ids.getName(nameId),
				labelsId,
				labels: ids.getLabelsAsString(labelsId)
			});
		}
	}

	if (results.length === 0) {
		return [
			{
				startNode: 0,
				endNode: 0,
				orth: lemmaKey,
				lemma: lemmaKey,
				tagId: 0,
				tag: "ign",
				nameId: 0,
				name: "",
				labelsId: 0,
				labels: ""
			}
		];
	}
	return results;
}
