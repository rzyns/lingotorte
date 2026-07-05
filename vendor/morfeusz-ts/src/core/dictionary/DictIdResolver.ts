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
export class DictIdResolver implements IdResolver {
	private readonly tagById: Map<number, string>;
	private readonly nameById: Map<number, string>;
	private readonly labelById: Map<number, string>;

	// Reverse maps (built lazily)
	private _tagByStr: Map<string, number> | null = null;
	private _nameByStr: Map<string, number> | null = null;
	private _labelByStr: Map<string, number> | null = null;

	constructor(private readonly epilogue: DictEpilogue) {
		this.tagById = epilogue.tags;
		this.nameById = epilogue.names;
		this.labelById = epilogue.labels;
	}

	getTagsetId(): string {
		return this.epilogue.tagsetId;
	}

	getTag(tagId: number): string {
		return ceilLookup(this.tagById, tagId) ?? `tag${tagId}`;
	}

	getTagId(tag: string): number {
		if (!this._tagByStr) {
			// Reverse: storedId → binary N where ceil(N) = storedId.
			// The simplest correct inverse: N = storedId - 1 (may collide at gaps, but
			// we only need one canonical value per string for encoding purposes).
			this._tagByStr = new Map(
				[...this.tagById.entries()].map(([storedId, t]) => [
					t,
					storedId - 1
				])
			);
		}
		return this._tagByStr.get(tag) ?? -1;
	}

	getName(nameId: number): string {
		return ceilLookup(this.nameById, nameId) ?? "";
	}

	getNameId(name: string): number {
		if (!this._nameByStr) {
			this._nameByStr = new Map(
				[...this.nameById.entries()].map(([storedId, n]) => [
					n,
					storedId - 1
				])
			);
		}
		return this._nameByStr.get(name) ?? -1;
	}

	getLabelsAsString(labelsId: number): string {
		if (labelsId === 0) return "";
		return ceilLookup(this.labelById, labelsId) ?? "";
	}

	getLabels(labelsId: number): Set<string> {
		const s = this.getLabelsAsString(labelsId);
		if (!s) return new Set();
		return new Set(
			s
				.split(",")
				.map((l) => l.trim())
				.filter(Boolean)
		);
	}

	getLabelsId(labelsStr: string): number {
		if (!this._labelByStr) {
			this._labelByStr = new Map(
				[...this.labelById.entries()].map(([storedId, l]) => [
					l,
					storedId - 1
				])
			);
		}
		return this._labelByStr.get(labelsStr) ?? -1;
	}

	getTagsCount(): number {
		return this.tagById.size;
	}
	getNamesCount(): number {
		return this.nameById.size;
	}
	getLabelsCount(): number {
		return this.labelById.size;
	}
}

/**
 * Ceiling lookup: find the entry with the smallest stored_id >= binaryId + 1.
 * Scans forward at most 20 ids to skip gaps (gap runs in SGJP are short).
 */
function ceilLookup(
	idMap: Map<number, string>,
	binaryId: number
): string | undefined {
	let storedId = binaryId + 1;
	const max = storedId + 20;
	while (!idMap.has(storedId) && storedId <= max) storedId++;
	return idMap.get(storedId);
}
