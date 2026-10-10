import { afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Synthetic inert bytes for injected command runners; never real media or model execution.
const root = mkdtempSync(join(tmpdir(), 'lingotorte-native-fixtures-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
export function nativeFixture(name: string): string {
  const path = join(root, ...name.split('/').filter(Boolean));
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, 'synthetic fixture');
  return path;
}
export function nativeFixtureDirectory(name: string): string {
  const path = join(root, ...name.split('/').filter(Boolean));
  mkdirSync(path, { recursive: true });
  return path;
}
