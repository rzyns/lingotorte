import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeExportIntegrity, sha256HexBytes, type LearnerExportContent } from '@lingotorte/domain';

const encoder = new TextEncoder();
const oracle = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

const byteCases = [
  { name: 'empty', bytes: new Uint8Array() },
  { name: 'abc', bytes: encoder.encode('abc') },
  { name: 'UTF-8 and lone surrogate', bytes: encoder.encode('Zażółć gęślą jaźń 😀\u0000\ud800') },
  { name: 'all byte values', bytes: Uint8Array.from({ length: 256 }, (_, i) => i) },
  ...[55, 56, 63, 64, 65, 127, 128, 129, 1_000_000].map((length) => ({
    name: `${length} bytes`,
    bytes: Uint8Array.from({ length }, (_, i) => (i * 31 + 17) & 255),
  })),
];

describe('shared portable full SHA-256', () => {
  it.each(byteCases)('matches independent Node and Web Crypto for $name', async ({ bytes }) => {
    const expected = oracle(bytes);
    expect(sha256HexBytes(bytes)).toBe(expected);
    expect(sha256HexBytes(bytes.slice().buffer)).toBe(expected);
    expect(sha256HexBytes(bytes)).toMatch(/^[0-9a-f]{64}$/);
    const subtle = await webcrypto.subtle.digest('SHA-256', bytes.slice().buffer);
    expect(Buffer.from(subtle).toString('hex')).toBe(expected);
  });

  it('preserves subarray offset/length, empty views and caller ownership', () => {
    const backing = new Uint8Array([90, 91, 0, 255, 128, 92, 93]);
    const before = backing.slice();
    const view = backing.subarray(2, 5);
    expect(sha256HexBytes(view)).toBe(oracle(view));
    expect(sha256HexBytes(view)).not.toBe(oracle(backing));
    expect(sha256HexBytes(backing.subarray(4, 4))).toBe(oracle(new Uint8Array()));
    expect(backing).toEqual(before);
    view[0] = 42;
    expect(sha256HexBytes(view)).toBe(oracle(view));
  });

  it('rejects untrusted non-byte input rather than skipping or coercing a digest', () => {
    for (const input of [undefined, null, 'abc', [97, 98, 99], {}, new DataView(new ArrayBuffer(3))]) {
      expect(() => sha256HexBytes(input as Uint8Array)).toThrow(TypeError);
    }
  });

  it('retains exact empty and canonical UTF-8 export digests', () => {
    const empty: LearnerExportContent = {
      savedItems: [], savedOccurrences: [], reviewCards: [], reviewCardStates: [],
      reviewEvents: [], practiceAttempts: [], sourceContexts: [],
    };
    expect(computeExportIntegrity(empty)).toEqual({
      algorithm: 'sha256-per-record', rootHash: `sha256:${oracle('')}`, recordCount: 0,
    });
    const item = {
      id: 'canonical-item', kind: 'lexeme' as const, language: 'pl', displayText: 'Zażółć 😀',
      createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z',
    };
    // Explicit independently ordered canonical bytes: no production canonicalizer in the oracle.
    const canonical = '{"createdAt":"2026-10-12T00:00:00.000Z","displayText":"Zażółć 😀","id":"canonical-item","kind":"lexeme","language":"pl","updatedAt":"2026-10-12T00:00:00.000Z"}';
    const integrity = computeExportIntegrity({ ...empty, savedItems: [item] });
    expect(integrity).toEqual({
      algorithm: 'sha256-per-record', rootHash: `sha256:${oracle(canonical)}`, recordCount: 1,
    });
    expect(computeExportIntegrity({ ...empty, savedItems: [{ ...item, displayText: 'changed' }] }).rootHash)
      .not.toBe(integrity.rootHash);
  });
});
