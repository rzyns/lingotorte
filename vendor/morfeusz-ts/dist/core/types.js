export var Charset;
(function (Charset) {
    Charset[Charset["UTF8"] = 11] = "UTF8";
    Charset[Charset["ISO8859_2"] = 12] = "ISO8859_2";
    Charset[Charset["CP1250"] = 13] = "CP1250";
    Charset[Charset["CP852"] = 14] = "CP852";
})(Charset || (Charset = {}));
export var TokenNumbering;
(function (TokenNumbering) {
    TokenNumbering[TokenNumbering["SEPARATE_NUMBERING"] = 201] = "SEPARATE_NUMBERING";
    TokenNumbering[TokenNumbering["CONTINUOUS_NUMBERING"] = 202] = "CONTINUOUS_NUMBERING";
})(TokenNumbering || (TokenNumbering = {}));
export var CaseHandling;
(function (CaseHandling) {
    CaseHandling[CaseHandling["CONDITIONALLY_CASE_SENSITIVE"] = 100] = "CONDITIONALLY_CASE_SENSITIVE";
    CaseHandling[CaseHandling["STRICTLY_CASE_SENSITIVE"] = 101] = "STRICTLY_CASE_SENSITIVE";
    CaseHandling[CaseHandling["IGNORE_CASE"] = 102] = "IGNORE_CASE";
})(CaseHandling || (CaseHandling = {}));
export var WhitespaceHandling;
(function (WhitespaceHandling) {
    WhitespaceHandling[WhitespaceHandling["SKIP_WHITESPACES"] = 301] = "SKIP_WHITESPACES";
    WhitespaceHandling[WhitespaceHandling["APPEND_WHITESPACES"] = 302] = "APPEND_WHITESPACES";
    WhitespaceHandling[WhitespaceHandling["KEEP_WHITESPACES"] = 303] = "KEEP_WHITESPACES";
})(WhitespaceHandling || (WhitespaceHandling = {}));
export var MorfeuszUsage;
(function (MorfeuszUsage) {
    MorfeuszUsage[MorfeuszUsage["ANALYSE_ONLY"] = 401] = "ANALYSE_ONLY";
    MorfeuszUsage[MorfeuszUsage["GENERATE_ONLY"] = 402] = "GENERATE_ONLY";
    MorfeuszUsage[MorfeuszUsage["BOTH_ANALYSE_AND_GENERATE"] = 403] = "BOTH_ANALYSE_AND_GENERATE";
})(MorfeuszUsage || (MorfeuszUsage = {}));
export const MorphInterpretation = {
    createIgn(startNode, endNode, orth, lemma) {
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
    createWhitespace(startNode, endNode, orth) {
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
export class MorfeuszException extends Error {
}
//# sourceMappingURL=types.js.map