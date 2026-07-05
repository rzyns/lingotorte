import type { Deserializer } from "../fsa/FSA.js";
import { InterpsGroupsReader } from "./InterpsGroupsReader.js";
/**
 * TS port of MorphDeserializer: reads a 16-bit length and updates the reader with that slice.
 */
export declare class MorphDeserializer implements Deserializer<InterpsGroupsReader> {
    deserialize(view: DataView, offset: number, out: InterpsGroupsReader): number;
}
//# sourceMappingURL=MorphDeserializer.d.ts.map