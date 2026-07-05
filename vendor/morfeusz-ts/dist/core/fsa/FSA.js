// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
// A minimal generic FSA interface and a concrete SimpleFSA implementation
// matching morfeusz "simple" FSA layout used in .dict files.
class SimpleFsaState {
    offset;
    sink = false;
    accepting = false;
    value;
    valueSize = 0;
    constructor(offset) {
        this.offset = offset;
    }
    isSink() {
        return this.sink;
    }
    isAccepting() {
        return this.accepting;
    }
    proceedToNext(fsa, c) {
        fsa.proceedToNextInternal(this, c);
    }
    getValue() {
        if (!this.accepting)
            throw new Error("not accepting");
        return this.value;
    }
    getValueSize() {
        return this.valueSize;
    }
    setNext(offset) {
        this.sink = false;
        this.accepting = false;
        this.offset = offset;
        this.valueSize = 0;
    }
    setNextAccepting(offset, value, size) {
        this.sink = false;
        this.accepting = true;
        this.offset = offset;
        this.value = value;
        this.valueSize = size;
    }
    setSink() {
        this.sink = true;
        this.accepting = false;
        this.valueSize = 0;
    }
}
export class SimpleFSA {
    view;
    deserializer;
    outFactory;
    isTransducer;
    static ACCEPTING_FLAG = 0x80;
    static TRANSITIONS_NUM_MASK = 0x7f;
    constructor(view, deserializer, outFactory, isTransducer = false) {
        this.view = view;
        this.deserializer = deserializer;
        this.outFactory = outFactory;
        this.isTransducer = isTransducer;
    }
    getInitialState() {
        return new SimpleFsaState(0);
    }
    proceedToNextInternal(state, c) {
        if (state.isSink())
            return;
        const from = state.offset >>> 0;
        let transitionsTableOffset = 1; // skip stateData byte
        if (state.isAccepting())
            transitionsTableOffset += state.getValueSize();
        const stateData = this.view.getUint8(from);
        const transitionsNum = stateData & SimpleFSA.TRANSITIONS_NUM_MASK;
        const inc = this.isTransducer ? 5 : 4;
        const labelToFind = c & 0xff;
        let foundPos = -1;
        let pos = from + transitionsTableOffset;
        for (let i = 0; i < transitionsNum; i++, pos += inc) {
            const label = this.view.getUint8(pos);
            if (label === labelToFind) {
                foundPos = pos;
                break;
            }
        }
        if (foundPos < 0) {
            state.setSink();
            return;
        }
        const offset = ((this.view.getUint8(foundPos + 1) << 16) |
            (this.view.getUint8(foundPos + 2) << 8) |
            this.view.getUint8(foundPos + 3)) >>>
            0;
        const nextPtr = offset;
        const nextStateData = this.view.getUint8(nextPtr);
        const nextAccepting = (nextStateData & SimpleFSA.ACCEPTING_FLAG) !== 0;
        if (nextAccepting) {
            const out = this.outFactory();
            const consumed = this.deserializer.deserialize(this.view, nextPtr + 1, out);
            state.setNextAccepting(nextPtr, out, consumed);
        }
        else {
            state.setNext(nextPtr);
        }
    }
}
// CFSA1 (Compressed FSA 1): label short-coding and variable-size relative offsets.
class CFsa1State {
    offset;
    sink = false;
    accepting = false;
    value;
    valueSize = 0;
    constructor(offset) {
        this.offset = offset;
    }
    isSink() {
        return this.sink;
    }
    isAccepting() {
        return this.accepting;
    }
    proceedToNext(fsa, c) {
        fsa.proceedToNextInternal(this, c);
    }
    getValue() {
        if (!this.accepting)
            throw new Error("not accepting");
        return this.value;
    }
    getValueSize() {
        return this.valueSize;
    }
    setNext(offset) {
        this.sink = false;
        this.accepting = false;
        this.offset = offset;
        this.valueSize = 0;
    }
    setNextAccepting(offset, value, size) {
        this.sink = false;
        this.accepting = true;
        this.offset = offset;
        this.value = value;
        this.valueSize = size;
    }
    setSink() {
        this.sink = true;
        this.accepting = false;
        this.valueSize = 0;
    }
}
export class CFSA1 {
    view;
    deserializer;
    outFactory;
    static ACCEPTING_FLAG = 0x80;
    static TRANSITIONS_NUM_MASK = 0x7f;
    static OFFSET_SIZE_MASK = 0x03;
    static INITIAL_ARRAY_STATE_OFFSET = 257;
    initialPtr; // offset where state 0 begins within view
    label2Short; // length >= 256
    constructor(view, deserializer, outFactory) {
        this.view = view;
        this.deserializer = deserializer;
        this.outFactory = outFactory;
        // First 257 bytes are popular-char mapping
        const mapLen = Math.min(257, this.view.byteLength);
        this.label2Short = new Uint8Array(mapLen);
        for (let i = 0; i < mapLen; i++)
            this.label2Short[i] = this.view.getUint8(i);
        this.initialPtr = CFSA1.INITIAL_ARRAY_STATE_OFFSET;
    }
    getInitialState() {
        return new CFsa1State(0);
    }
    readStateData(ptr) {
        const first = this.view.getUint8(ptr);
        let next = ptr + 1;
        let transitions = first & CFSA1.TRANSITIONS_NUM_MASK;
        const accepting = (first & CFSA1.ACCEPTING_FLAG) !== 0;
        if (transitions === CFSA1.TRANSITIONS_NUM_MASK) {
            transitions = this.view.getUint8(next);
            next += 1;
        }
        return { next, accepting, transitions };
    }
    readTransition(ptr) {
        const b = this.view.getUint8(ptr);
        const offsetSize = b & CFSA1.OFFSET_SIZE_MASK; // 0..3 bytes
        const shortLabel = b >> 2; // 0..63
        return { next: ptr + 1, shortLabel, offsetSize };
    }
    readOffset(ptr, size) {
        switch (size) {
            case 0:
                return { next: ptr, offset: 0 };
            case 1:
                return { next: ptr + 1, offset: this.view.getUint8(ptr) };
            case 2:
                return {
                    next: ptr + 2,
                    offset: this.view.getUint16(ptr, false)
                };
            case 3: {
                const b0 = this.view.getUint8(ptr);
                const b1 = this.view.getUint8(ptr + 1);
                const b2 = this.view.getUint8(ptr + 2);
                return { next: ptr + 3, offset: (b0 << 16) | (b1 << 8) | b2 };
            }
            default:
                throw new Error(`Invalid offset size: ${size}`);
        }
    }
    proceedToNextInternal(state, c) {
        if (state.isSink())
            return;
        let curr = this.initialPtr + state.offset;
        // Read header of current state
        const sd = this.readStateData(curr);
        curr = sd.next;
        if (state.isAccepting())
            curr += state.getValueSize();
        const shortWanted = this.label2Short[c & 0xff] ?? 0;
        let found = false;
        let td_short = 0;
        let td_offsetSize = 0;
        let transPtr = curr;
        for (let i = 0; i < sd.transitions; i++) {
            const t = this.readTransition(transPtr);
            transPtr = t.next;
            if (t.shortLabel === shortWanted) {
                if (t.shortLabel === 0) {
                    const label = this.view.getUint8(transPtr);
                    transPtr += 1;
                    if (label === (c & 0xff)) {
                        found = true;
                        td_short = t.shortLabel;
                        td_offsetSize = t.offsetSize;
                        break;
                    }
                    const ro = this.readOffset(transPtr, t.offsetSize);
                    transPtr = ro.next; // skip unmatched
                }
                else {
                    found = true;
                    td_short = t.shortLabel;
                    td_offsetSize = t.offsetSize;
                    break;
                }
            }
            else {
                if (t.shortLabel === 0)
                    transPtr += 1; // skip explicit label
                const ro = this.readOffset(transPtr, t.offsetSize);
                transPtr = ro.next;
            }
        }
        if (!found) {
            state.setSink();
            return;
        }
        if (td_short === 0) {
            // explicit label was already consumed; transPtr currently at start of offset
        }
        const ro2 = this.readOffset(transPtr, td_offsetSize);
        const targetPtr = ro2.next + ro2.offset;
        // Read target state's header to decide acceptance and deserialize if needed
        const sdh = this.readStateData(targetPtr);
        if (sdh.accepting) {
            const out = this.outFactory();
            const consumed = this.deserializer.deserialize(this.view, sdh.next, out);
            const off = targetPtr - this.initialPtr;
            state.setNextAccepting(off, out, consumed);
        }
        else {
            const off = targetPtr - this.initialPtr;
            state.setNext(off);
        }
    }
}
// CFSA2 (Variable-length offset list with flags per transition)
class CFsa2State {
    offset;
    sink = false;
    accepting = false;
    value;
    valueSize = 0;
    constructor(offset) {
        this.offset = offset;
    }
    isSink() {
        return this.sink;
    }
    isAccepting() {
        return this.accepting;
    }
    proceedToNext(fsa, c) {
        fsa.proceedToNextInternal(this, c);
    }
    getValue() {
        if (!this.accepting)
            throw new Error("not accepting");
        return this.value;
    }
    getValueSize() {
        return this.valueSize;
    }
    setNext(offset) {
        this.sink = false;
        this.accepting = false;
        this.offset = offset;
        this.valueSize = 0;
    }
    setNextAccepting(offset, value, size) {
        this.sink = false;
        this.accepting = true;
        this.offset = offset;
        this.value = value;
        this.valueSize = size;
    }
    setSink() {
        this.sink = true;
        this.accepting = false;
        this.valueSize = 0;
    }
}
export class CFSA2 {
    view;
    deserializer;
    outFactory;
    static HAS_REMAINING_FLAG = 0x80;
    static ACCEPTING_FLAG = 0x40;
    static LAST_FLAG = 0x20;
    static OFFSET_MASK = 0x7f;
    static FIRST_BYTE_OFFSET_MASK = 0x1f;
    constructor(view, deserializer, outFactory) {
        this.view = view;
        this.deserializer = deserializer;
        this.outFactory = outFactory;
    }
    getInitialState() {
        return new CFsa2State(0);
    }
    passThroughOffset(ptr) {
        // Move past variable-length offset bytes starting at ptr
        let p = ptr;
        while (this.view.getUint8(p) & CFSA2.HAS_REMAINING_FLAG)
            p++;
        return p + 1;
    }
    readOffset(ptr) {
        const first = this.view.getUint8(ptr);
        let res = first & CFSA2.FIRST_BYTE_OFFSET_MASK;
        const accepting = (first & CFSA2.ACCEPTING_FLAG) !== 0;
        const last = (first & CFSA2.LAST_FLAG) !== 0;
        let p = ptr;
        if (first & CFSA2.HAS_REMAINING_FLAG) {
            p++;
            let b = this.view.getUint8(p);
            while (b & CFSA2.HAS_REMAINING_FLAG) {
                res = (res << 7) + (b & CFSA2.OFFSET_MASK);
                p++;
                b = this.view.getUint8(p);
            }
            res = (res << 7) + (b & CFSA2.OFFSET_MASK);
        }
        return { next: p + 1, offset: res >>> 0, accepting, last };
    }
    proceedToNextInternal(state, c) {
        if (state.isSink())
            return;
        let curr = state.offset;
        // If current is accepting, skip its payload (valueSize known from previous step)
        if (state.isAccepting())
            curr += state.getValueSize();
        // Walk transition list: [label][flags/offset bytes] ...
        while (true) {
            if (curr >= this.view.byteLength) {
                state.setSink();
                return;
            }
            const label = this.view.getUint8(curr);
            curr += 1;
            const ro = this.readOffset(curr);
            if (label === (c & 0xff)) {
                const targetPtr = ro.next + ro.offset;
                if (ro.accepting) {
                    const out = this.outFactory();
                    const consumed = this.deserializer.deserialize(this.view, targetPtr, out);
                    state.setNextAccepting(targetPtr, out, consumed);
                }
                else {
                    state.setNext(targetPtr);
                }
                return;
            }
            else {
                // Not matching; if this was last transition, sink
                if (ro.last) {
                    state.setSink();
                    return;
                }
                // Otherwise skip to next transition entry
                curr = ro.next;
            }
        }
    }
}
//# sourceMappingURL=FSA.js.map