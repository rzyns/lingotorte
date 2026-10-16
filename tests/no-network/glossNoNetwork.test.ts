import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
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
    const latePath = join(root, 'late.sqlite');
    let now = 1_000_000;
    const late = makeGlossService({ dbPath: latePath, clock: () => now });
    const { value, networkAttempts } = await withNoNetwork(async () => {
      const first = await live.lookup(request);
      const before = await late.lookup(request);
      copyFileSync(dbPath, latePath);
      now += 30_001;
      const after = await late.lookup(request);
      return { first, before, after };
    });
    expect(networkAttempts).toEqual([]);
    expect(value.before).toEqual({ status: 'unavailable', reason: 'not-installed' });
    for (const res of [value.first, value.after]) {
      if (res.status !== 'available') throw new Error(`expected available, got ${res.status}`);
      expect(res.results.map(r => [r.via, r.lemma, r.formOf])).toEqual([['lemma', 'dom', undefined], ['form-of', 'dom', 'domu'], ['alternative', 'mama', undefined]]);
    }
    live.close(); late.close();
  });
});
