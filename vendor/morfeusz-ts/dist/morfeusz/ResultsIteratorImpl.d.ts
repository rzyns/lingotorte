import type { ResultsIterator, MorphInterpretation } from "../core/types.js";
export declare class ResultsIteratorImpl implements ResultsIterator {
    private readonly items;
    private idx;
    constructor(items: MorphInterpretation[]);
    hasNext(): boolean;
    peek(): MorphInterpretation;
    next(): MorphInterpretation;
}
//# sourceMappingURL=ResultsIteratorImpl.d.ts.map