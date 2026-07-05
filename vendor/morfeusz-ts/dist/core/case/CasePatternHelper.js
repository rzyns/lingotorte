// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
import { CaseHandling } from "../../core/types.js";
import { CaseConverter } from "./CaseConverter.js";
import { isLemmaOnlyLower, isLemmaOnlyTitle, isOrthOnlyLower, isOrthOnlyTitle } from "../deserialization/compression.js";
export class CasePatternHelper {
    conv;
    constructor(conv) {
        this.conv = conv;
    }
    // For now, implement a simple check: verify orth matches desired case according to policy.
    checkOrthCaseMatches(orth, pattern, handling) {
        switch (handling) {
            case CaseHandling.IGNORE_CASE:
                return this.conv.toLower(orth) === this.conv.toLower(pattern);
            case CaseHandling.STRICTLY_CASE_SENSITIVE:
                return orth === pattern;
            case CaseHandling.CONDITIONALLY_CASE_SENSITIVE:
            default:
                return this.conv.toLower(orth) === this.conv.toLower(pattern);
        }
    }
    applyLemmaCase(lemma, groupTypeByte) {
        if (isLemmaOnlyLower(groupTypeByte))
            return this.conv.toLower(lemma);
        if (isLemmaOnlyTitle(groupTypeByte))
            return this.conv.toTitle(lemma);
        return lemma;
    }
    orthCaseCategory(groupTypeByte) {
        if (isOrthOnlyLower(groupTypeByte))
            return "lower";
        if (isOrthOnlyTitle(groupTypeByte))
            return "title";
        return "any";
    }
    orthMatches(groupTypeByte, orth, handling) {
        const cat = this.orthCaseCategory(groupTypeByte);
        if (handling === CaseHandling.IGNORE_CASE || cat === "any")
            return true;
        if (handling === CaseHandling.STRICTLY_CASE_SENSITIVE) {
            if (cat === "lower")
                return orth === this.conv.toLower(orth);
            if (cat === "title")
                return orth === this.conv.toTitle(orth);
            return true;
        }
        // CONDITIONALLY_CASE_SENSITIVE: permissive for now
        return true;
    }
}
//# sourceMappingURL=CasePatternHelper.js.map