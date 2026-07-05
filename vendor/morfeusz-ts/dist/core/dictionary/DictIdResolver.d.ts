import type { IdResolver } from "../types.js";
import type { DictEpilogue } from "./EpilogueParser.js";
/**
 * IdResolver backed by a parsed DictEpilogue.
 *
 * ## Binary id encoding — ceiling rule
 * The binary stores N; the actual stored id is the smallest stored_id ≥ N+1.
 * When there are no gaps this is simply N+1.  When the id at N+1 is absent
 * (a gap), the next valid stored id is used instead.
 *
 * Verified against morfeusz_analyzer/morfeusz_generator for several words.
 */
export declare class DictIdResolver implements IdResolver {
    private readonly epilogue;
    private readonly tagById;
    private readonly nameById;
    private readonly labelById;
    private _tagByStr;
    private _nameByStr;
    private _labelByStr;
    constructor(epilogue: DictEpilogue);
    getTagsetId(): string;
    getTag(tagId: number): string;
    getTagId(tag: string): number;
    getName(nameId: number): string;
    getNameId(name: string): number;
    getLabelsAsString(labelsId: number): string;
    getLabels(labelsId: number): Set<string>;
    getLabelsId(labelsStr: string): number;
    getTagsCount(): number;
    getNamesCount(): number;
    getLabelsCount(): number;
}
//# sourceMappingURL=DictIdResolver.d.ts.map