import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makeGlossService, validateGlossRequest } from '../../apps/local-service/src/gloss.ts';
import { withNoNetwork } from './networkTrap';

// lt-foe.3.3: the gloss service opens and queries only a local SQLite file; missing DB re-checks stay local too.
vi.setConfig({ testTimeout: 60_000 });
const repo = resolve(import.meta.dirname, '../..');
const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

describe('lt-foe.3.3 gloss lookup without network', () => {
  it('opens, resolves (lemma, form-of, alternative) and re-checks a missing DB with zero network attempts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ltfoe33-nn-')); roots.push(root);
    const dbPath = join(root, 'glosses-pl.sqlite');
    const built = spawnSync(process.execPath, [join(repo, 'scripts/import-glosses.ts'), '--input', join(repo, 'tests/fixtures/gloss/synthetic-gloss-route.jsonl'),
      '--output', dbPath, '--dump-date', '2026-10-03'], { encoding: 'utf8' });
    expect(built.status).toBe(0);
    const request = validateGlossRequest({ language: 'pl', queries: [{ lemma: 'dom' }, { lemma: 'domu' }, { lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'mama', upos: 'NOUN' }] }] });
    const live = makeGlossService({ dbPath });
    const missing = makeGlossService({ dbPath: join(root, 'absent.sqlite') });
    const { value, networkAttempts } = await withNoNetwork(async () => [await live.lookup(request), await missing.lookup(request)]);
    expect(value[0]!.status).toBe('available');
    expect(value[1]).toEqual({ status: 'unavailable', reason: 'not-installed' });
    expect(networkAttempts).toEqual([]);
    live.close();
  });
});
