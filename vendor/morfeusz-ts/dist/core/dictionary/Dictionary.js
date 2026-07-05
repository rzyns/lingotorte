// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
import { MorphDeserializer } from "../deserialization/MorphDeserializer.js";
import { InterpsGroupsReader } from "../deserialization/InterpsGroupsReader.js";
import { parseFsaHeader } from "../fsa/header.js";
import { SimpleFSA, CFSA1, CFSA2 } from "../fsa/FSA.js";
import { parseEpilogue } from "./EpilogueParser.js";
export class Dictionary {
    buffer;
    deserializer;
    header;
    epilogue;
    constructor(buf) {
        this.buffer = new DataView(buf);
        this.deserializer = new MorphDeserializer();
        this.header = parseFsaHeader(this.buffer);
        this.epilogue = parseEpilogue(this.buffer, this.header.epilogueOffset);
    }
    createFSA(deserializer, outFactory) {
        switch (this.header.impl) {
            case 0:
                return new SimpleFSA(this.header.fsaDataView, deserializer, outFactory);
            case 1:
                return new CFSA1(this.header.fsaDataView, deserializer, outFactory);
            case 2:
                return new CFSA2(this.header.fsaDataView, deserializer, outFactory);
            default:
                throw new Error(`Unknown FSA impl: ${this.header.impl}`);
        }
    }
}
//# sourceMappingURL=Dictionary.js.map