// lt-192.4 S3 / N13: pure GET Range selection (RFC 9110 §14). HEAD never calls selectRange (routes/library tests).
import { describe, expect, it } from 'vitest';
import { selectRange } from '../../apps/local-service/src/managedMedia.ts';

const ETAG = `"sha256-${'a'.repeat(64)}"`;
const SIZE = 1000;
const pick = (range: string | undefined, ifRange?: string) => selectRange(range, ifRange, ETAG, SIZE);

describe('lt-192.4 selectRange', () => {
  const rows: [string | undefined, string | undefined, ReturnType<typeof pick>][] = [
    [undefined, undefined, { kind: 'full' }],
    ['bytes=0-99', undefined, { kind: 'partial', start: 0, end: 99 }],
    ['bytes=100-', undefined, { kind: 'partial', start: 100, end: 999 }],
    ['bytes=-100', undefined, { kind: 'partial', start: 900, end: 999 }],
    ['bytes=-1000', undefined, { kind: 'partial', start: 0, end: 999 }],
    ['bytes=-5000', undefined, { kind: 'partial', start: 0, end: 999 }],
    ['bytes=999-', undefined, { kind: 'partial', start: 999, end: 999 }],
    ['bytes=990-5000', undefined, { kind: 'partial', start: 990, end: 999 }],
    ['bytes=1000-', undefined, { kind: 'unsatisfiable' }],
    ['bytes=1000-1001', undefined, { kind: 'unsatisfiable' }],
    ['bytes=-0', undefined, { kind: 'unsatisfiable' }],
    ['bytes=5-4', undefined, { kind: 'full' }],
    ['bytes=999-0', undefined, { kind: 'full' }],
    // 30-digit numerals: BigInt, never a lossy Number/parseInt.
    [`bytes=${'9'.repeat(30)}-`, undefined, { kind: 'unsatisfiable' }],
    [`bytes=0-${'9'.repeat(30)}`, undefined, { kind: 'partial', start: 0, end: 999 }],
    [`bytes=-${'9'.repeat(30)}`, undefined, { kind: 'partial', start: 0, end: 999 }],
    [`bytes=${'0'.repeat(29)}5-${'0'.repeat(28)}10`, undefined, { kind: 'partial', start: 5, end: 10 }],
    [`bytes=${'1'.repeat(30)}-${'1'.repeat(29)}`, undefined, { kind: 'full' }],
    // Unit is case-insensitive.
    ['BYTES=0-0', undefined, { kind: 'partial', start: 0, end: 0 }],
    ['Bytes=1-2', undefined, { kind: 'partial', start: 1, end: 2 }],
    // Multi-range, other unit, invalid syntax: ignored -> 200.
    ['bytes=0-1,5-6', undefined, { kind: 'full' }],
    ['bytes=0-1, 5-6', undefined, { kind: 'full' }],
    ['items=0-1', undefined, { kind: 'full' }],
    ['bytes=', undefined, { kind: 'full' }],
    ['bytes=-', undefined, { kind: 'full' }],
    ['bytes=a-b', undefined, { kind: 'full' }],
    ['bytes=1.5-2', undefined, { kind: 'full' }],
    ['bytes=+1-2', undefined, { kind: 'full' }],
    ['bytes 0-1', undefined, { kind: 'full' }],
    ['0-1', undefined, { kind: 'full' }],
    // If-Range: only the exact strong ETag keeps the range.
    ['bytes=0-1', ETAG, { kind: 'partial', start: 0, end: 1 }],
    ['bytes=0-1', `W/${ETAG}`, { kind: 'full' }],
    ['bytes=0-1', '"sha256-other"', { kind: 'full' }],
    ['bytes=0-1', 'Sat, 31 Oct 2026 00:00:00 GMT', { kind: 'full' }],
    ['bytes=5000-', '"sha256-other"', { kind: 'full' }],
  ];
  it.each(rows)('Range %s If-Range %s', (range, ifRange, expected) => {
    expect(pick(range, ifRange)).toEqual(expected);
  });
  it('clamped values are safe integers below the size', () => {
    const big = 2 ** 52;
    const result = selectRange(`bytes=-${'9'.repeat(30)}`, undefined, ETAG, big);
    expect(result).toEqual({ kind: 'partial', start: 0, end: big - 1 });
    expect(Number.isSafeInteger((result as { end: number }).end)).toBe(true);
    expect(selectRange(`bytes=${big - 1}-${'9'.repeat(30)}`, undefined, ETAG, big)).toEqual({ kind: 'partial', start: big - 1, end: big - 1 });
  });
});
