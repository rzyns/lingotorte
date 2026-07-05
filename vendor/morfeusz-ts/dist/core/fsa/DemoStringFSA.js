import { InterpsGroupsReader } from "../deserialization/InterpsGroupsReader.js";
class State {
    node;
    deser;
    constructor(node, deser) {
        this.node = node;
        this.deser = deser;
    }
    value;
    valueSize = 0;
    isSink() {
        return this.node.children.size === 0 && !this.node.accepting;
    }
    isAccepting() {
        return this.node.accepting;
    }
    proceedToNext(fsa, c) {
        const demo = fsa;
        const next = this.node.children.get(c);
        if (!next) {
            // move to a non-accepting sink
            this.node = { children: new Map(), accepting: false };
            this.value = undefined;
            this.valueSize = 0;
            return;
        }
        this.node = next;
        if (this.node.accepting && this.node.payload) {
            // Construct view: [size(2 bytes BE)] + payload
            const size = this.node.payload.length;
            const buf = new ArrayBuffer(2 + size);
            const view = new DataView(buf);
            view.setUint16(0, size, false);
            new Uint8Array(buf, 2).set(this.node.payload);
            const out = new InterpsGroupsReader();
            const consumed = this.deser.deserialize(view, 0, out);
            this.value = out;
            this.valueSize = consumed;
        }
        else {
            this.value = undefined;
            this.valueSize = 0;
        }
    }
    getValue() {
        if (!this.isAccepting() || this.value === undefined)
            throw new Error("not accepting");
        return this.value;
    }
    getValueSize() {
        return this.valueSize;
    }
}
export class DemoStringFSA {
    deser;
    root = { children: new Map(), accepting: false };
    constructor(entries, deser) {
        this.deser = deser;
        for (const { word, payload } of entries) {
            let node = this.root;
            for (const cp of word.split("").map((ch) => ch.codePointAt(0))) {
                if (!node.children.has(cp))
                    node.children.set(cp, {
                        children: new Map(),
                        accepting: false
                    });
                node = node.children.get(cp);
            }
            node.accepting = true;
            node.payload = payload;
        }
    }
    getInitialState() {
        return new State(this.root, this.deser);
    }
}
//# sourceMappingURL=DemoStringFSA.js.map