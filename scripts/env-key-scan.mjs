import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Variable names whose non-empty value is treated as a credential. Only
// repository-root .env files are scanned (Docker and npm read only those).
const secretName = /(?:^|_)(?:API_?KEY|ACCESS_KEY|KEY|TOKEN|SECRET|PASSWORD)$/i;
const envFileName = /^\.env(?:\..+)?$/;

/**
 * Report credential-like assignments in env files at `root`. Values are never
 * returned or printed; a finding names only the file and variable (lt-wvm).
 * `.env.example` must contain placeholders only, so a non-empty secret there
 * is a finding too.
 */
export async function findEnvKeys(root) {
  const findings = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !envFileName.test(entry.name)) continue;
    const content = await readFile(join(root, entry.name), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match || !secretName.test(match[1])) continue;
      const value = match[2].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
      if (value !== '') findings.push({ file: entry.name, variable: match[1] });
    }
  }
  return findings;
}
