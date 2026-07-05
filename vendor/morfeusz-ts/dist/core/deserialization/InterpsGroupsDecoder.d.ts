import type { InterpsGroupsReader } from "./InterpsGroupsReader.js";
import type { MorphInterpretation, IdResolver } from "../types.js";
import { CaseHandling } from "../types.js";
export declare class InterpsGroupsDecoder {
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
    decode(orth: string, reader: InterpsGroupsReader, ids: IdResolver, handling?: CaseHandling, orthForLemma?: string): MorphInterpretation[];
}
//# sourceMappingURL=InterpsGroupsDecoder.d.ts.map