import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';

async function manifest(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      for (const [name, hash] of Object.entries(await manifest(path))) result[`${entry.name}/${name}`] = hash;
    } else result[entry.name] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return result;
}

describe('request authenticity real dispatch regression', () => {
  it('denies unpaired private reads and job insertion before effects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-sor-'));
    let capability = '';
    const service = await startLingotorteLocalService({ host: '127.0.0.1', port: 0,
      databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'),
      modelCacheDir: join(root, 'models'), allowOnlineProviders: false },
      { receiveCapability: (value: string) => { capability = value; } });
    try {
      const before = await manifest(root);
      const statuses: number[] = [];
      for (const path of ['/api/status', '/api/state']) statuses.push((await fetch(`${service.origin}${path}`)).status);
      statuses.push((await fetch(`${service.origin}/api/jobs`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'noop' }) })).status);
      expect(statuses).toEqual([401, 401, 401]);
      expect(await manifest(root)).toEqual(before);
      expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const authorized = await fetch(`${service.origin}/api/jobs`, { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${capability}` },
        body: JSON.stringify({ kind: 'noop' }) });
      expect(authorized.status).toBe(201);
      expect((await authorized.json()).job.status).toBe('completed');
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });
});
