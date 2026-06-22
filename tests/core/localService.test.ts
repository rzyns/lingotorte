import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeMediaAsset } from '../../packages/domain/src';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';

const fingerprint = 'sha256:1111111111111111111111111111111111111111111111111111111111111111' as const;

async function makeTempConfig() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-local-service-'));
  return {
    root,
    config: {
      host: '127.0.0.1',
      port: 0,
      databasePath: join(root, 'state.db'),
      scratchDir: join(root, 'scratch'),
      modelCacheDir: join(root, 'models'),
      allowOnlineProviders: false,
    },
  } as const;
}

describe('Lingotorte loopback local service', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('refuses non-loopback bind hosts before opening a server', async () => {
    const { root, config } = await makeTempConfig();
    cleanups.push(() => rm(root, { recursive: true, force: true }));

    await expect(startLingotorteLocalService({ ...config, host: '0.0.0.0' })).rejects.toThrow(/loopback/i);
  });

  it('serves health and redacted status on loopback', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    expect(service.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const health = await fetch(`${service.origin}/api/health`).then((response) => response.json());
    expect(health).toMatchObject({ ok: true, service: 'lingotorte-local-service' });

    const status = await fetch(`${service.origin}/api/status`).then((response) => response.json());
    expect(status.ok).toBe(true);
    expect(status.config.host).toBe('127.0.0.1');
    expect(status.config.databasePath).toBe('[local-sqlite]');
    expect(JSON.stringify(status)).not.toContain(root);
  });

  it('persists a LocalStoreSnapshot through the HTTP state API and SQLite restart', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => rm(root, { recursive: true, force: true }));

    const snapshot = createEmptyLocalStoreSnapshot();
    const media = makeMediaAsset({
      title: 'HTTP persisted media',
      originalPath: 'fixtures/media/synthetic-polish-dialogue.webm',
      contentSha256: fingerprint,
      durationMs: 2000,
      container: 'webm',
      sizeBytes: 1024,
      privacyLabel: 'synthetic',
    });
    snapshot.mediaAssets[media.id] = media;

    const saveResponse = await fetch(`${service.origin}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    expect(saveResponse.status).toBe(200);
    await service.close();

    const restarted = await startLingotorteLocalService(config);
    cleanups.push(() => restarted.close());
    const loaded = await fetch(`${restarted.origin}/api/state`).then((response) => response.json());

    expect(loaded.snapshot.mediaAssets[media.id]).toEqual(media);
  });

  it('creates, reads, and cancels local jobs without external side effects', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'waiting', payload: { label: 'test job' } }),
    }).then((response) => response.json());
    expect(created.job).toMatchObject({ kind: 'waiting', status: 'queued' });

    const read = await fetch(`${service.origin}/api/jobs/${created.job.id}`).then((response) => response.json());
    expect(read.job.id).toBe(created.job.id);

    const cancelled = await fetch(`${service.origin}/api/jobs/${created.job.id}/cancel`, { method: 'POST' }).then((response) => response.json());
    expect(cancelled.job.status).toBe('cancelled');
  });

  it('cleans declared scratch artifacts without touching paths outside the scratch root', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const scratchFile = join(config.scratchDir, 'temporary-artifact.txt');
    const outsideFile = join(root, 'outside.txt');
    await writeFile(scratchFile, 'scratch');
    await writeFile(outsideFile, 'outside');

    const result = await fetch(`${service.origin}/api/artifacts/cleanup`, { method: 'POST' }).then((response) => response.json());

    expect(result).toMatchObject({ ok: true });
    expect(result.deletedFiles).toBeGreaterThanOrEqual(1);
    await expect(stat(scratchFile)).rejects.toThrow();
    await expect(stat(outsideFile)).resolves.toBeTruthy();
  });
});
