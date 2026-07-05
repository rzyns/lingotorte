export interface Deserializer<T> {
    deserialize(view: DataView, offset: number, out: T): number;
}
export interface State<T> {
    isSink(): boolean;
    isAccepting(): boolean;
    proceedToNext(fsa: FSA<T>, c: number): void;
    getValue(): T;
    getValueSize(): number;
}
export interface FSA<T> {
    getInitialState(): State<T>;
}
declare class SimpleFsaState<T> implements State<T> {
    offset: number;
    private sink;
    private accepting;
    private value;
    private valueSize;
    constructor(offset: number);
    isSink(): boolean;
    isAccepting(): boolean;
    proceedToNext(fsa: FSA<T>, c: number): void;
    getValue(): T;
    getValueSize(): number;
    setNext(offset: number): void;
    setNextAccepting(offset: number, value: T, size: number): void;
    setSink(): void;
}
export declare class SimpleFSA<T> implements FSA<T> {
    private readonly view;
    private readonly deserializer;
    private readonly outFactory;
    private readonly isTransducer;
    private static readonly ACCEPTING_FLAG;
    private static readonly TRANSITIONS_NUM_MASK;
    constructor(view: DataView, deserializer: Deserializer<T>, outFactory: () => T, isTransducer?: boolean);
    getInitialState(): State<T>;
    proceedToNextInternal(state: SimpleFsaState<T>, c: number): void;
}
declare class CFsa1State<T> implements State<T> {
    offset: number;
    private sink;
    private accepting;
    private value;
    private valueSize;
    constructor(offset: number);
    isSink(): boolean;
    isAccepting(): boolean;
    proceedToNext(fsa: FSA<T>, c: number): void;
    getValue(): T;
    getValueSize(): number;
    setNext(offset: number): void;
    setNextAccepting(offset: number, value: T, size: number): void;
    setSink(): void;
}
export declare class CFSA1<T> implements FSA<T> {
    private readonly view;
    private readonly deserializer;
    private readonly outFactory;
    private static readonly ACCEPTING_FLAG;
    private static readonly TRANSITIONS_NUM_MASK;
    private static readonly OFFSET_SIZE_MASK;
    private static readonly INITIAL_ARRAY_STATE_OFFSET;
    private readonly initialPtr;
    private readonly label2Short;
    constructor(view: DataView, deserializer: Deserializer<T>, outFactory: () => T);
    getInitialState(): State<T>;
    private readStateData;
    private readTransition;
    private readOffset;
    proceedToNextInternal(state: CFsa1State<T>, c: number): void;
}
declare class CFsa2State<T> implements State<T> {
    offset: number;
    private sink;
    private accepting;
    private value;
    private valueSize;
    constructor(offset: number);
    isSink(): boolean;
    isAccepting(): boolean;
    proceedToNext(fsa: FSA<T>, c: number): void;
    getValue(): T;
    getValueSize(): number;
    setNext(offset: number): void;
    setNextAccepting(offset: number, value: T, size: number): void;
    setSink(): void;
}
export declare class CFSA2<T> implements FSA<T> {
    private readonly view;
    private readonly deserializer;
    private readonly outFactory;
    private static readonly HAS_REMAINING_FLAG;
    private static readonly ACCEPTING_FLAG;
    private static readonly LAST_FLAG;
    private static readonly OFFSET_MASK;
    private static readonly FIRST_BYTE_OFFSET_MASK;
    constructor(view: DataView, deserializer: Deserializer<T>, outFactory: () => T);
    getInitialState(): State<T>;
    private passThroughOffset;
    private readOffset;
    proceedToNextInternal(state: CFsa2State<T>, c: number): void;
}
export {};
//# sourceMappingURL=FSA.d.ts.map