import type { FSA, State as IState } from "./FSA.js";
import type { Deserializer } from "./FSA.js";
import { InterpsGroupsReader } from "../deserialization/InterpsGroupsReader.js";

type Node = {
	children: Map<number, Node>;
	accepting: boolean;
	payload?: Uint8Array; // raw bytes after length prefix
};

class State<T> implements IState<T> {
	constructor(
		private node: Node,
		private readonly deser: Deserializer<T>
	) {}
	private value?: T;
	private valueSize = 0;
	isSink(): boolean {
		return this.node.children.size === 0 && !this.node.accepting;
	}
	isAccepting(): boolean {
		return this.node.accepting;
	}
	proceedToNext(fsa: FSA<T>, c: number): void {
		const demo = fsa as DemoStringFSA<T>;
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
			const out = new InterpsGroupsReader() as unknown as T;
			const consumed = this.deser.deserialize(view, 0, out);
			this.value = out;
			this.valueSize = consumed;
		} else {
			this.value = undefined;
			this.valueSize = 0;
		}
	}
	getValue(): T {
		if (!this.isAccepting() || this.value === undefined)
			throw new Error("not accepting");
		return this.value;
	}
	getValueSize(): number {
		return this.valueSize;
	}
}

export class DemoStringFSA<T> implements FSA<T> {
	private readonly root: Node = { children: new Map(), accepting: false };
	constructor(
		entries: Array<{ word: string; payload: Uint8Array }>,
		private readonly deser: Deserializer<T>
	) {
		for (const { word, payload } of entries) {
			let node = this.root;
			for (const cp of word.split("").map((ch) => ch.codePointAt(0)!)) {
				if (!node.children.has(cp))
					node.children.set(cp, {
						children: new Map(),
						accepting: false
					});
				node = node.children.get(cp)!;
			}
			node.accepting = true;
			node.payload = payload;
		}
	}
	getInitialState(): IState<T> {
		return new State<T>(this.root, this.deser);
	}
}
