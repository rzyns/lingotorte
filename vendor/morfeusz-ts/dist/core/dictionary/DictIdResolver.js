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
export class DictIdResolver {
    epilogue;
    tagById;
    nameById;
    labelById;
    // Reverse maps (built lazily)
    _tagByStr = null;
    _nameByStr = null;
    _labelByStr = null;
    constructor(epilogue) {
        this.epilogue = epilogue;
        this.tagById = epilogue.tags;
        this.nameById = epilogue.names;
        this.labelById = epilogue.labels;
    }
    getTagsetId() {
        return this.epilogue.tagsetId;
    }
    getTag(tagId) {
        return ceilLookup(this.tagById, tagId) ?? `tag${tagId}`;
    }
    getTagId(tag) {
        if (!this._tagByStr) {
            // Reverse: storedId → binary N where ceil(N) = storedId.
            // The simplest correct inverse: N = storedId - 1 (may collide at gaps, but
            // we only need one canonical value per string for encoding purposes).
            this._tagByStr = new Map([...this.tagById.entries()].map(([storedId, t]) => [
                t,
                storedId - 1
            ]));
        }
        return this._tagByStr.get(tag) ?? -1;
    }
    getName(nameId) {
        return ceilLookup(this.nameById, nameId) ?? "";
    }
    getNameId(name) {
        if (!this._nameByStr) {
            this._nameByStr = new Map([...this.nameById.entries()].map(([storedId, n]) => [
                n,
                storedId - 1
            ]));
        }
        return this._nameByStr.get(name) ?? -1;
    }
    getLabelsAsString(labelsId) {
        if (labelsId === 0)
            return "";
        return ceilLookup(this.labelById, labelsId) ?? "";
    }
    getLabels(labelsId) {
        const s = this.getLabelsAsString(labelsId);
        if (!s)
            return new Set();
        return new Set(s
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean));
    }
    getLabelsId(labelsStr) {
        if (!this._labelByStr) {
            this._labelByStr = new Map([...this.labelById.entries()].map(([storedId, l]) => [
                l,
                storedId - 1
            ]));
        }
        return this._labelByStr.get(labelsStr) ?? -1;
    }
    getTagsCount() {
        return this.tagById.size;
    }
    getNamesCount() {
        return this.nameById.size;
    }
    getLabelsCount() {
        return this.labelById.size;
    }
}
/**
 * Ceiling lookup: find the entry with the smallest stored_id >= binaryId + 1.
 * Scans forward at most 20 ids to skip gaps (gap runs in SGJP are short).
 */
function ceilLookup(idMap, binaryId) {
    let storedId = binaryId + 1;
    const max = storedId + 20;
    while (!idMap.has(storedId) && storedId <= max)
        storedId++;
    return idMap.get(storedId);
}
//# sourceMappingURL=DictIdResolver.js.map