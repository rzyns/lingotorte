// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
import { readCString } from "../binary/readers.js";
/**
 * Read a sentinel-terminated table of [NUL-string][2-byte BE id] entries.
 * Terminates on empty-string + id=0 sentinel.
 */
function readTable(dv, ptr) {
    const map = new Map();
    while (ptr < dv.byteLength) {
        const { value: s, next } = readCString(dv, ptr);
        if (next + 1 >= dv.byteLength)
            break;
        const id = dv.getUint16(next, false /* big-endian */);
        ptr = next + 2;
        if (s === "" && id === 0)
            break; // sentinel
        map.set(id, s);
    }
    return { entries: map, next: ptr };
}
/**
 * Parse the Morfeusz2 dictionary epilogue.
 *
 * Layout (offsets are relative to epilogueOffset):
 *   +0  : 4 bytes — mystery/version prefix (skipped)
 *   +4  : tagset_id string (NUL-terminated)
 *   ...  : copyright string (NUL-terminated)
 *   ...  : segmentor_id string (NUL-terminated)
 *   ...  : 4 bytes — tag count + padding (skipped; we use sentinel detection)
 *   ...  : tag table — (str NUL 2B-id)* + sentinel("",0)
 *   ...  : names table — same format
 *   ...  : labels table — same format
 *
 * @param dv              DataView over the FULL dict file buffer
 * @param epilogueOffset  Byte offset from dv start to the epilogue section
 */
export function parseEpilogue(dv, epilogueOffset) {
    // Guard: if epilogue extends past the buffer (synthetic test dicts have no epilogue),
    // return empty tables.
    if (epilogueOffset + 8 > dv.byteLength) {
        return {
            tagsetId: "",
            copyright: "",
            segmentorId: "",
            tags: new Map(),
            names: new Map(),
            labels: new Map()
        };
    }
    let ptr = epilogueOffset + 4; // skip mystery prefix
    const { value: tagsetId, next: p1 } = readCString(dv, ptr);
    ptr = p1;
    const { value: copyright, next: p2 } = readCString(dv, ptr);
    ptr = p2;
    const { value: segmentorId, next: p3 } = readCString(dv, ptr);
    ptr = p3;
    ptr += 4; // skip tag-count + padding before tag table
    const { entries: tags, next: p4 } = readTable(dv, ptr);
    ptr = p4;
    const { entries: names, next: p5 } = readTable(dv, ptr);
    ptr = p5;
    const { entries: labels } = readTable(dv, ptr);
    return { tagsetId, copyright, segmentorId, tags, names, labels };
}
//# sourceMappingURL=EpilogueParser.js.map