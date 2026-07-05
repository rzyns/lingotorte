export enum Charset {
	UTF8 = 11,
	ISO8859_2 = 12,
	CP1250 = 13,
	CP852 = 14
}

export enum TokenNumbering {
	SEPARATE_NUMBERING = 201,
	CONTINUOUS_NUMBERING = 202
}

export enum CaseHandling {
	CONDITIONALLY_CASE_SENSITIVE = 100,
	STRICTLY_CASE_SENSITIVE = 101,
	IGNORE_CASE = 102
}

export enum WhitespaceHandling {
	SKIP_WHITESPACES = 301,
	APPEND_WHITESPACES = 302,
	KEEP_WHITESPACES = 303
}

export enum MorfeuszUsage {
	ANALYSE_ONLY = 401,
	GENERATE_ONLY = 402,
	BOTH_ANALYSE_AND_GENERATE = 403
}

export interface MorphInterpretation {
	startNode: number;
	endNode: number;
	orth: string;
	lemma: string;
	tagId: number;
	/** Resolved tag string (e.g. "subst:sg:nom:m1"). Empty string when IdResolver is stub. */
	tag: string;
	nameId: number;
	/** Resolved name string (e.g. "nazwa_pospolita"). Empty string when IdResolver is stub. */
	name: string;
	labelsId: number;
	/** Resolved labels string (e.g. "pot.,środ."). Empty string when IdResolver is stub. */
	labels: string;
}

export const MorphInterpretation = {
	createIgn(
		startNode: number,
		endNode: number,
		orth: string,
		lemma: string
	): MorphInterpretation {
		return {
			startNode,
			endNode,
			orth,
			lemma,
			tagId: 0,
			tag: "ign",
			nameId: 0,
			name: "",
			labelsId: 0,
			labels: ""
		};
	},
	createWhitespace(
		startNode: number,
		endNode: number,
		orth: string
	): MorphInterpretation {
		return {
			startNode,
			endNode,
			orth,
			lemma: orth,
			tagId: 1,
			tag: "sp",
			nameId: 0,
			name: "",
			labelsId: 0,
			labels: ""
		};
	}
};

export interface IdResolver {
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

export interface ResultsIterator {
	hasNext(): boolean;
	peek(): MorphInterpretation;
	next(): MorphInterpretation;
}

export class MorfeuszException extends Error {}
