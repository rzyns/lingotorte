export type FsaHeader = {
    magic: number;
    version: number;
    impl: number;
    fsaSize: number;
    fsaDataView: DataView;
    epilogueOffset: number;
};
export declare function parseFsaHeader(view: DataView): FsaHeader;
//# sourceMappingURL=header.d.ts.map