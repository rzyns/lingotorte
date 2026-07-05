import { CaseHandling } from "../../core/types.js";
import { CaseConverter } from "./CaseConverter.js";
export declare class CasePatternHelper {
    private readonly conv;
    constructor(conv: CaseConverter);
    checkOrthCaseMatches(orth: string, pattern: string, handling: CaseHandling): boolean;
    applyLemmaCase(lemma: string, groupTypeByte: number): string;
    orthCaseCategory(groupTypeByte: number): "lower" | "title" | "any";
    orthMatches(groupTypeByte: number, orth: string, handling: CaseHandling): boolean;
}
//# sourceMappingURL=CasePatternHelper.d.ts.map