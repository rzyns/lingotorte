import type { Deserializer } from "../fsa/FSA.js";
import type { FSA } from "../fsa/FSA.js";
import { InterpsGroupsReader } from "../deserialization/InterpsGroupsReader.js";
import { type FsaHeader } from "../fsa/header.js";
import { type DictEpilogue } from "./EpilogueParser.js";
export declare class Dictionary {
    readonly buffer: DataView;
    readonly deserializer: Deserializer<InterpsGroupsReader>;
    readonly header: FsaHeader;
    readonly epilogue: DictEpilogue;
    constructor(buf: ArrayBuffer);
    createFSA<T>(deserializer: Deserializer<T>, outFactory: () => T): FSA<T>;
}
//# sourceMappingURL=Dictionary.d.ts.map