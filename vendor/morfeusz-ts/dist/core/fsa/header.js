import { readInt32 } from "../binary/readers.js";
import { MAGIC_NUMBER, VERSION_NUM_OFFSET, IMPLEMENTATION_NUM_OFFSET, FSA_DATA_SIZE_OFFSET, FSA_DATA_OFFSET } from "./const.js";
export function parseFsaHeader(view) {
    const magic = readInt32(view, 0) >>> 0;
    if (magic !== MAGIC_NUMBER) {
        throw new Error(`Invalid FSA magic: 0x${magic.toString(16)}`);
    }
    const version = view.getUint8(VERSION_NUM_OFFSET);
    const impl = view.getUint8(IMPLEMENTATION_NUM_OFFSET);
    const fsaSize = readInt32(view, FSA_DATA_SIZE_OFFSET);
    const fsaDataStart = FSA_DATA_OFFSET;
    const fsaDataEnd = fsaDataStart + fsaSize;
    const fsaDataView = new DataView(view.buffer, view.byteOffset + fsaDataStart, fsaSize);
    const epilogueOffset = fsaDataEnd;
    return { magic, version, impl, fsaSize, fsaDataView, epilogueOffset };
}
//# sourceMappingURL=header.js.map