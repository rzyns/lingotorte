// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
import { CaseHandling } from "../types.js";
import { readCString } from "../binary/readers.js";
/**
 * Read the first byte of a CasePattern to determine the stem-case transform, then
 * skip all bytes consumed by that pattern and return { stemCase, next }.
 *
 * Format (CasePatternHelper::deserializeOneCasePattern):
 *   type=0x00  → 1 byte  → ORTH_LOWER / no restriction (keep lowercase)
 *   type=0x01  → 2 bytes → ORTH_TITLE (first char uppercase, rest lowercase)
 *   type=0x02  → 2 + count bytes → per-character mixed case (complex; treat as none)
 *   any other  → 1 byte  → treat as none
 */
function readCasePattern(dv, ptr) {
    const b = dv.getUint8(ptr);
    if (b === 0x00)
        return { stemCase: "lower", next: ptr + 1 };
    if (b === 0x01)
        return { stemCase: "title", next: ptr + 2 };
    if (b === 0x02)
        return { stemCase: "none", next: ptr + 2 + dv.getUint8(ptr + 1) };
    return { stemCase: "none", next: ptr + 1 };
}
/** Skip a CasePattern without reading its meaning. */
function skipCasePattern(dv, ptr) {
    return readCasePattern(dv, ptr).next;
}
/**
 * Apply a stem-case transform to a raw stem string.
 * Uses simple Unicode-aware toUpperCase/toLowerCase.
 */
function applyCase(stem, sc) {
    if (sc === "lower")
        return stem.toLowerCase();
    if (sc === "title" && stem.length > 0) {
        // Capitalize first grapheme cluster; lowercase the rest.
        // Simple approach: toUpperCase first char, toLowerCase remainder.
        // Good enough for Polish (no multi-codepoint graphemes in initial position).
        return stem[0].toUpperCase() + stem.slice(1).toLowerCase();
    }
    return stem;
}
/**
 * groupTypeByte flags (content[0] of each group):
 *   bit7 (0x80): ORTH_ONLY_LOWER  — no per-interp orth case; stem is always lowercase
 *   bit6 (0x40): ORTH_ONLY_TITLE  — no per-interp orth case; stem is always title-case
 *   bit5 (0x20): no per-interp lemma case pattern in stream
 *   bit4 (0x10): no per-interp lemma case pattern in stream
 *   bits3-0:     nibble; if 0xf → read 1 explicit field0 byte; else field0 = nibble
 */
function groupMatchesOrth(groupTypeByte, orth) {
    // 0xa0 (bit7=1, bit6=0): stems stored as lowercase (apply "lower" case transform),
    // but no orth restriction — group always contributes to "matched".
    if ((groupTypeByte & 0xc0) === 0x80)
        return true;
    // 0x50 (bit6=1, bit7=0): only title-case orth matches this group.
    if ((groupTypeByte & 0xc0) === 0x40) {
        return (orth.length > 0 &&
            orth[0] === orth[0].toUpperCase() &&
            orth.slice(1) === orth.slice(1).toLowerCase());
    }
    // 0x00: no group-level restriction; per-interp case patterns handle filtering.
    return true;
}
export class InterpsGroupsDecoder {
    /**
     * Decode all interpretations from a payload reader.
     *
     * @param orth         — the original input token (used for case-matching against groups)
     * @param reader       — groups reader positioned at the start of the payload
     * @param _ids         — IdResolver (currently unused; numeric ids returned as-is)
     * @param handling     — case-sensitivity policy
     * @param orthForLemma — the word form to use for lemma stem computation.
     *                       Equals orth for exact FSA hits; equals lowercase(orth) for the
     *                       lowercase-fallback FSA path. Default: orth.
     */
    decode(orth, reader, ids, handling = CaseHandling.CONDITIONALLY_CASE_SENSITIVE, orthForLemma = orth) {
        const matched = [];
        const all = [];
        while (reader.hasNext()) {
            const g = reader.getNext();
            const dv = reader.getView();
            const groupTypeByte = dv.getUint8(g.ptr);
            // Whether per-interp orth case pattern bytes exist (absent when bit7 or bit6 set).
            const hasOrthCase = (groupTypeByte & 0xc0) === 0;
            // Whether this group uses the "547d0 path" in C++ (bit6=1, bit7=0).
            // That path does NOT call decodeEncodedForm so no lemma case bytes in stream.
            const takes547d0 = (groupTypeByte & 0xc0) === 0x40;
            // preLoopByte at content[1] only present when hasOrthCase (groupTypeByte=0x00).
            let ptr = g.ptr + (hasOrthCase ? 2 : 1);
            const end = g.ptr + g.size;
            // Group-level stem-case transform (applies when hasOrthCase=false).
            const groupStemCase = (groupTypeByte & 0xc0) === 0x80
                ? "lower"
                : (groupTypeByte & 0xc0) === 0x40
                    ? "title"
                    : "none";
            // Whether per-interp lemma case pattern bytes exist in stream.
            const hasLemmaCase = !takes547d0 && (groupTypeByte & 0x30) === 0;
            const nibble = groupTypeByte & 0x0f;
            const orthMatches = groupMatchesOrth(groupTypeByte, orth);
            const groupInterps = [];
            while (ptr < end) {
                // 1. Per-interp orth case pattern.
                //    Read the type byte to determine stemCase; skip remaining bytes.
                let stemCase = groupStemCase; // fallback to group-level
                if (hasOrthCase) {
                    const cp = readCasePattern(dv, ptr);
                    stemCase = cp.stemCase;
                    ptr = cp.next;
                    if (ptr >= end)
                        break;
                }
                // 2. field0 (prefixToCut): nibble or explicit byte when nibble==0xf
                let field0 = nibble;
                if (nibble === 0x0f) {
                    if (ptr >= end)
                        break;
                    field0 = dv.getUint8(ptr);
                    ptr++;
                }
                // 3. suffixToCut (1 byte)
                if (ptr >= end)
                    break;
                const suffixToCut = dv.getUint8(ptr);
                ptr++;
                // 4. NUL-terminated suffixToAdd
                if (ptr >= end)
                    break;
                const { value: suffixToAdd, next: afterSuffix } = readCString(dv, ptr);
                ptr = afterSuffix;
                // 5. Lemma case pattern (skip — we don't use it yet)
                if (hasLemmaCase) {
                    if (ptr >= end)
                        break;
                    ptr = skipCasePattern(dv, ptr);
                }
                // 6. tagId[2 BE] + nameId[1] + labelsId[2 BE]
                if (ptr + 5 > end)
                    break;
                const tagId = dv.getUint16(ptr, false);
                ptr += 2;
                const nameId = dv.getUint8(ptr);
                ptr++;
                const labelsId = dv.getUint16(ptr, false);
                ptr += 2;
                // 7. Lemma construction:
                //    raw stem = orthForLemma[field0 .. length - suffixToCut]
                //    apply stemCase transform to raw stem
                //    lemma = casedStem + suffixToAdd
                const prefixToCut = field0;
                const stemEnd = Math.max(prefixToCut, orthForLemma.length - suffixToCut);
                const rawStem = orthForLemma.slice(prefixToCut, stemEnd);
                const lemma = applyCase(rawStem, stemCase) + suffixToAdd;
                groupInterps.push({
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
            all.push(...groupInterps);
            if (orthMatches) {
                matched.push(...groupInterps);
            }
        }
        const results = handling === CaseHandling.IGNORE_CASE
            ? all
            : handling === CaseHandling.STRICTLY_CASE_SENSITIVE
                ? matched
                : /* CONDITIONALLY_CASE_SENSITIVE */ matched.length > 0
                    ? matched
                    : all;
        if (results.length === 0) {
            return [
                {
                    startNode: 0,
                    endNode: 0,
                    orth,
                    lemma: orth,
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
}
//# sourceMappingURL=InterpsGroupsDecoder.js.map