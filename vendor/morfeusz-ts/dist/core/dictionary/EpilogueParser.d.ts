export interface DictEpilogue {
    /** Tagset identifier, e.g. "pl.sgjp.sgjp-2026.02.23" */
    tagsetId: string;
    /** Full copyright notice */
    copyright: string;
    /** Segmentor/version identifier */
    segmentorId: string;
    /** tagId → tag string (e.g. 613 → "subst:sg:nom:m1") */
    tags: Map<number, string>;
    /** nameId → name string (e.g. 53 → "nazwa_pospolita") */
    names: Map<number, string>;
    /** labelsId → comma-separated label string (e.g. 448 → "pot.,zool.") */
    labels: Map<number, string>;
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
export declare function parseEpilogue(dv: DataView, epilogueOffset: number): DictEpilogue;
//# sourceMappingURL=EpilogueParser.d.ts.map