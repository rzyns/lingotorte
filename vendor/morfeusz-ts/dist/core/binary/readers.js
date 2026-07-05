export function readInt8(view, offset) {
    return view.getUint8(offset);
}
export function readInt16(view, offset) {
    return view.getUint16(offset, false); // big-endian
}
export function readInt24(view, offset) {
    const b0 = view.getUint8(offset);
    const b1 = view.getUint8(offset + 1);
    const b2 = view.getUint8(offset + 2);
    return (b0 << 16) | (b1 << 8) | b2;
}
export function readInt32(view, offset) {
    return view.getUint32(offset, false); // big-endian
}
export function readCString(view, offset) {
    let i = offset;
    const bytes = [];
    while (true) {
        const b = view.getUint8(i++);
        if (b === 0)
            break;
        bytes.push(b);
    }
    const s = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    return { value: s, next: i };
}
export function slice(view, offset, length) {
    const buf = view.buffer.slice(view.byteOffset + offset, view.byteOffset + offset + length);
    return new DataView(buf);
}
//# sourceMappingURL=readers.js.map