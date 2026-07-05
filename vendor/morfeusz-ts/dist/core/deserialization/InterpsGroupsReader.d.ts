export interface InterpsGroup {
    type: number;
    ptr: number;
    size: number;
}
/**
 * A lightweight view/iterator over interpretations group payload attached to accepting FSA states.
 * For now, store raw view boundaries; actual decode can happen in a separate decoder.
 */
export declare class InterpsGroupsReader {
    private _view;
    private _start;
    private _size;
    private _iter;
    update(view: DataView, startOffset: number, size: number): void;
    getView(): DataView;
    hasNext(): boolean;
    getNext(): InterpsGroup;
}
//# sourceMappingURL=InterpsGroupsReader.d.ts.map