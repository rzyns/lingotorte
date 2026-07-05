import type { FSA, State as IState } from "./FSA.js";
import type { Deserializer } from "./FSA.js";
export declare class DemoStringFSA<T> implements FSA<T> {
    private readonly deser;
    private readonly root;
    constructor(entries: Array<{
        word: string;
        payload: Uint8Array;
    }>, deser: Deserializer<T>);
    getInitialState(): IState<T>;
}
//# sourceMappingURL=DemoStringFSA.d.ts.map