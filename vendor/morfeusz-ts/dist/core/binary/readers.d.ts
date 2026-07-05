export declare function readInt8(view: DataView, offset: number): number;
export declare function readInt16(view: DataView, offset: number): number;
export declare function readInt24(view: DataView, offset: number): number;
export declare function readInt32(view: DataView, offset: number): number;
export declare function readCString(view: DataView, offset: number): {
    value: string;
    next: number;
};
export declare function slice(view: DataView, offset: number, length: number): DataView;
//# sourceMappingURL=readers.d.ts.map