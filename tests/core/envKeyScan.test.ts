import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { findEnvKeys } from '../../scripts/env-key-scan.mjs';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });
async function root(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'lt-env-scan-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
  return dir;
}

it('flags a non-empty credential in .env without returning its value (lt-wvm)', async () => {
  const value = 'synthetic-not-a-real-key-123';
  const findings = await findEnvKeys(await root({ '.env': `LINGOTORTE_PORT=5174\nELEVENLABS_API_KEY=${value}\n` }));
  expect(findings).toEqual([{ file: '.env', variable: 'ELEVENLABS_API_KEY' }]);
  expect(JSON.stringify(findings)).not.toContain(value);
});

it('flags quoted, exported and suffixed .env.* credentials', async () => {
  const findings = await findEnvKeys(await root({ '.env.local': 'export GITHUB_TOKEN="x"\nDB_PASSWORD=\'y\'\n' }));
  expect(findings).toEqual([{ file: '.env.local', variable: 'GITHUB_TOKEN' }, { file: '.env.local', variable: 'DB_PASSWORD' }]);
});

it('flags case-insensitive and *_KEY names', async () => {
  const findings = await findEnvKeys(await root({ '.env': 'openai_apikey=a\nAWS_ACCESS_KEY=b\nSIGNING_KEY=c\n' }));
  expect(findings.map((f: { variable: string }) => f.variable)).toEqual(['openai_apikey', 'AWS_ACCESS_KEY', 'SIGNING_KEY']);
});

it('accepts placeholders, comments and non-secret settings', async () => {
  const findings = await findEnvKeys(await root({
    '.env.example': '# ELEVENLABS_API_KEY=sk_example\nELEVENLABS_API_KEY=\nLINGOTORTE_DATA_DIR=/state\nOTHER_SECRET="" # placeholder\n',
    'not-env.txt': 'ELEVENLABS_API_KEY=whatever\n',
  }));
  expect(findings).toEqual([]);
});
