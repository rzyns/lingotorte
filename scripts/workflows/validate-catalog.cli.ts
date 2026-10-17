// lt-5lb.5: `node scripts/workflows/validate-catalog.cli.ts` — schema, cross-reference, provenance and
// freshness checks over docs/workflows. Exit 1 with one line per finding.
import { fileURLToPath } from 'node:url';
import { validateCatalog } from './catalog.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const findings = validateCatalog(root);
if (findings.length) {
  for (const f of findings) console.error(`${f.file}: ${f.message}`);
  console.error(`${findings.length} finding(s)`);
  process.exit(1);
}
console.log('workflow catalog valid');
