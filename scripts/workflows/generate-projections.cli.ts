// lt-5lb.5: `node scripts/workflows/generate-projections.cli.ts [--check]` writes (or checks) the generated
// Markdown/Mermaid projections under docs/workflows/generated from the YAML catalog.
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.ts';
import { GENERATED_DIR, renderProjections } from './generate-projections.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const check = process.argv.includes('--check');
const files = renderProjections(loadCatalog(root));
const dir = join(root, GENERATED_DIR);
const existing = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => `${GENERATED_DIR}/${f}`) : [];
const stale: string[] = [];
for (const [path, content] of files) {
  const full = join(root, path);
  const current = existsSync(full) ? readFileSync(full, 'utf8') : null;
  if (current !== content) stale.push(path);
  if (!check) { mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, content); }
}
for (const path of existing) if (!files.has(path)) { stale.push(`${path} (orphan)`); if (!check) unlinkSync(join(root, path)); }
if (check) {
  if (stale.length) { console.error(`generated projections are stale:\n  ${stale.join('\n  ')}\nrun node scripts/workflows/generate-projections.cli.ts`); process.exit(1); }
  console.log(`${files.size} generated files are current`);
} else {
  console.log(`wrote ${files.size} files under ${GENERATED_DIR}${stale.length ? ` (${stale.length} changed)` : ''}`);
}
