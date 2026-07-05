// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
/**
 * A lightweight view/iterator over interpretations group payload attached to accepting FSA states.
 * For now, store raw view boundaries; actual decode can happen in a separate decoder.
 */
export class InterpsGroupsReader {
    _view = null;
    _start = 0;
    _size = 0;
    _iter = 0;
    update(view, startOffset, size) {
        this._view = view;
        this._start = startOffset;
        this._size = size;
        this._iter = 0;
    }
    getView() {
        if (!this._view)
            throw new Error("reader not initialized");
        return this._view;
    }
    hasNext() {
        return this._iter < this._size;
    }
    getNext() {
        if (!this._view)
            throw new Error("reader not initialized");
        if (!this.hasNext())
            throw new RangeError("end of groups");
        const off = this._start + this._iter;
        // If there aren't enough bytes for type+size, fall back to single-byte groups (demo payloads)
        if (this._iter + 3 > this._size) {
            const b = this._view.getUint8(off);
            this._iter += 1;
            return { type: b, ptr: off, size: 1 };
        }
        const type = this._view.getUint8(off);
        const size = this._view.getUint16(off + 1, false);
        const contentStart = off + 3; // after type+size
        // Validate size; fallback for legacy demo payloads without type/size framing
        if (contentStart + size > this._start + this._size) {
            // Fallback: treat single byte as a group
            const b = this._view.getUint8(off);
            this._iter += 1;
            return { type: b, ptr: off, size: 1 };
        }
        this._iter += 3 + size;
        return { type, ptr: contentStart, size };
    }
}
//# sourceMappingURL=InterpsGroupsReader.js.map