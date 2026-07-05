// Ported from Morfeusz2 (https://morfeusz.sgjp.pl/)
// Copyright © 2014, Institute of Computer Science, Polish Academy of Sciences.
// Original BSD 2-Clause License applies. See NOTICE for details.
export class ResultsIteratorImpl {
    items;
    idx = 0;
    constructor(items) {
        this.items = items;
    }
    hasNext() {
        return this.idx < this.items.length;
    }
    peek() {
        if (!this.hasNext())
            throw new RangeError("Iterator exhausted");
        return this.items[this.idx];
    }
    next() {
        if (!this.hasNext())
            throw new RangeError("Iterator exhausted");
        return this.items[this.idx++];
    }
}
//# sourceMappingURL=ResultsIteratorImpl.js.map