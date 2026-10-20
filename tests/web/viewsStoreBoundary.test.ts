import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// lt-5lb.9: views and ui go through named model.ts helpers, never `model.store`
// (docs/architecture/data-model-and-storage.md, "View store boundary").
const roots = ['../../apps/web/src/views', '../../apps/web/src/ui'].map((dir) => fileURLToPath(new URL(dir, import.meta.url)));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

it('views and ui never read or write through model.store', () => {
  const files = roots.flatMap(sourceFiles);
  expect(files.length).toBeGreaterThan(10);
  const offenders = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return /\bmodel\s*\.\s*store\b/.test(text) ? [file] : [];
  });
  expect(offenders).toEqual([]);
});
