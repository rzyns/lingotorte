export { Charset, TokenNumbering, CaseHandling, WhitespaceHandling, MorfeuszUsage, type MorphInterpretation, MorphInterpretation as MorphInterpretationHelpers, type ResultsIterator, type IdResolver, MorfeuszException } from "./core/types.js";
export { ResultsIteratorImpl } from "./morfeusz/ResultsIteratorImpl.js";
export { MorfeuszImpl } from "./morfeusz/MorfeuszImpl.js";
export type { CharsetConverter } from "./core/charset/CharsetConverter.js";
export { UTF8CharsetConverter, OneByteCharsetConverter, getCharsetConverter } from "./core/charset/CharsetConverter.js";
export { CaseConverter } from "./core/case/CaseConverter.js";
export { CasePatternHelper } from "./core/case/CasePatternHelper.js";
export * as BinaryReaders from "./core/binary/readers.js";
export { type Deserializer, type State as FSAState, SimpleFSA, CFSA1, CFSA2 } from "./core/fsa/FSA.js";
export { InterpsGroupsReader } from "./core/deserialization/InterpsGroupsReader.js";
export { MorphDeserializer } from "./core/deserialization/MorphDeserializer.js";
export { InterpsGroupsDecoder } from "./core/deserialization/InterpsGroupsDecoder.js";
export { DemoStringFSA } from "./core/fsa/DemoStringFSA.js";
export { DictionariesRepository } from "./core/dictionary/DictionariesRepository.js";
export { Dictionary } from "./core/dictionary/Dictionary.js";
export { MorfeuszProcessorType } from "./core/dictionary/const.js";
export { MAGIC_NUMBER, FSA_DATA_OFFSET, FSA_DATA_SIZE_OFFSET, IMPLEMENTATION_NUM_OFFSET, VERSION_NUM_OFFSET } from "./core/fsa/const.js";
export { parseFsaHeader, type FsaHeader } from "./core/fsa/header.js";
//# sourceMappingURL=index.d.ts.map