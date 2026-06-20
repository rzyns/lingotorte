import { asRecord, requireNonNegativeInteger, requireSha256, requireString } from './guards';
import type { SavedOccurrenceSourceContext } from './types';

function validateRange(value: unknown, label: string, startKey: string, endKey: string): Readonly<{ start: number; end: number }> {
  const record = asRecord(value, label);
  const start = requireNonNegativeInteger(record, startKey);
  const end = requireNonNegativeInteger(record, endKey);
  if (end <= start) {
    throw new TypeError(`${label}.${endKey} must be greater than ${label}.${startKey}`);
  }
  return { start, end };
}

function validateTokenSpan(value: unknown): SavedOccurrenceSourceContext['tokenSpan'] {
  const record = asRecord(value, 'tokenSpan');
  const startToken = requireNonNegativeInteger(record, 'startToken');
  const endToken = requireNonNegativeInteger(record, 'endToken');
  if (endToken <= startToken) {
    throw new TypeError('tokenSpan.endToken must be greater than tokenSpan.startToken');
  }
  return { startToken, endToken };
}

export function validateSavedOccurrenceSourceContext(input: unknown): SavedOccurrenceSourceContext {
  const record = asRecord(input, 'saved occurrence source context');
  const timeRangeMs = validateRange(record.timeRangeMs, 'timeRangeMs', 'start', 'end');
  const charSpan = validateRange(record.charSpan, 'charSpan', 'start', 'end');
  return {
    mediaId: requireString(record, 'mediaId'),
    mediaPath: requireString(record, 'mediaPath'),
    mediaFingerprint: requireSha256(record, 'mediaFingerprint'),
    subtitleTrackId: requireString(record, 'subtitleTrackId'),
    cueId: requireString(record, 'cueId'),
    timeRangeMs,
    tokenSpan: validateTokenSpan(record.tokenSpan),
    charSpan,
  };
}
