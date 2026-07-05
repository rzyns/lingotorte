import { MorfeuszProcessorType } from "./const.js";
export type DictionaryData = {
    name: string;
    processorType: MorfeuszProcessorType;
    buffer: ArrayBuffer;
};
export declare class DictionariesRepository {
    private static readonly packageDictionaryPath;
    static dictionarySearchPaths: string[];
    static getDictionaryFilename(name: string, processorType: MorfeuszProcessorType): string;
    static tryToLoadDictionary(name: string, processorType: MorfeuszProcessorType): Promise<DictionaryData | null>;
}
//# sourceMappingURL=DictionariesRepository.d.ts.map