// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
import { MorfeuszProcessorType } from "./const.js";
import { FILESYSTEM_PATH_SEPARATOR } from "./const.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
export class DictionariesRepository {
    static packageDictionaryPath = fileURLToPath(new URL("../../../morfeusz2/dict", import.meta.url));
    static dictionarySearchPaths = [
        ".",
        "morfeusz2/dict",
        DictionariesRepository.packageDictionaryPath,
        "/usr/share/morfeusz2/dictionaries"
    ]; // includes vendored package dictionaries and the system install path
    static getDictionaryFilename(name, processorType) {
        const suffix = processorType === MorfeuszProcessorType.ANALYZER ? "-a" : "-s";
        return `${name}${suffix}.dict`;
    }
    static async tryToLoadDictionary(name, processorType) {
        const filename = this.getDictionaryFilename(name, processorType);
        for (const dir of this.dictionarySearchPaths) {
            const filepath = join(dir, filename);
            try {
                const bytes = await readFile(filepath);
                return {
                    name,
                    processorType,
                    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
                };
            }
            catch {
                // continue
            }
        }
        return null;
    }
}
//# sourceMappingURL=DictionariesRepository.js.map