import type { Sha256Digest } from './types';

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${key} must be a non-empty string`);
  }
  return value;
}

export function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${key} must be a finite number`);
  }
  return value;
}

export function requireSha256(record: Record<string, unknown>, key: string): Sha256Digest {
  const value = requireString(record, key);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(`${key} must be a sha256:<64 hex> digest`);
  }
  return value as Sha256Digest;
}

export function requireArray(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new TypeError(`${key} must be an array`);
  }
  return value;
}

export function requireNonNegativeInteger(record: Record<string, unknown>, key: string): number {
  const value = requireNumber(record, key);
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${key} must be a non-negative integer`);
  }
  return value;
}
