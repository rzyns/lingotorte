// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.

import type { Deserializer } from "../fsa/FSA.js";
import type { FSA } from "../fsa/FSA.js";
import { MorphDeserializer } from "../deserialization/MorphDeserializer.js";
import { InterpsGroupsReader } from "../deserialization/InterpsGroupsReader.js";
import { parseFsaHeader, type FsaHeader } from "../fsa/header.js";
import { SimpleFSA, CFSA1, CFSA2 } from "../fsa/FSA.js";
import { parseEpilogue, type DictEpilogue } from "./EpilogueParser.js";

export class Dictionary {
	readonly buffer: DataView;
	readonly deserializer: Deserializer<InterpsGroupsReader>;
	readonly header: FsaHeader;
	readonly epilogue: DictEpilogue;

	constructor(buf: ArrayBuffer) {
		this.buffer = new DataView(buf);
		this.deserializer = new MorphDeserializer();
		this.header = parseFsaHeader(this.buffer);
		this.epilogue = parseEpilogue(this.buffer, this.header.epilogueOffset);
	}

	createFSA<T>(deserializer: Deserializer<T>, outFactory: () => T): FSA<T> {
		switch (this.header.impl) {
			case 0:
				return new SimpleFSA<T>(
					this.header.fsaDataView,
					deserializer,
					outFactory
				);
			case 1:
				return new CFSA1<T>(
					this.header.fsaDataView,
					deserializer,
					outFactory
				);
			case 2:
				return new CFSA2<T>(
					this.header.fsaDataView,
					deserializer,
					outFactory
				);
			default:
				throw new Error(`Unknown FSA impl: ${this.header.impl}`);
		}
	}
}