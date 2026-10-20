import { captureSentence } from '../helpers/capture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppModel, pairLocalService, importFixtureMediaAndSubtitles, saveModelToLocalService, connectLocalService, setLocalServiceAutosave } from '../../apps/web/src/model';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';

async function makeTempConfig() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-web-service-sync-'));
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

async function startPrivateService(config: Parameters<typeof startLingotorteLocalService>[0]) {
  let capability = '';
  const service = await startLingotorteLocalService(config, { receiveCapability(value) { capability = value; } });
  return { ...service, pair(model: ReturnType<typeof createAppModel>) { pairLocalService(model, capability, service.origin); } };
}

describe('web model local-service sync', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('preserves a stale browser writer and reports a real SQLite/API revision conflict', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startPrivateService(config);
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
    const seed = createAppModel(); service.pair(seed);
    await importFixtureMediaAndSubtitles(seed, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    expect((await saveModelToLocalService(seed, service.origin)).ok).toBe(true);
    const first = createAppModel(); const stale = createAppModel(); service.pair(first); service.pair(stale);
    await connectLocalService(first, service.origin); await connectLocalService(stale, service.origin);
    await captureSentence(first, first.cues[0]!);
    expect((await saveModelToLocalService(first)).ok).toBe(true);
    stale.store.putMediaAsset({ ...stale.currentMedia!, title: 'unsaved stale edit' }); const prior = stale.store.snapshot();
    expect((await saveModelToLocalService(stale)).ok).toBe(false);
    expect(stale.localService.syncState).toBe('conflict'); expect(stale.store.snapshot()).toEqual(prior);
    expect(stale.localService.lastSavedAt).toBeNull();
    const durable = createAppModel(); service.pair(durable); await connectLocalService(durable, service.origin);
    expect(durable.store.snapshot()).toEqual(first.store.snapshot());
  });

  it('reports a lost acknowledgement honestly even when SQLite committed, then conflicts on retry', async () => {
    const { root, config } = await makeTempConfig(); const service = await startPrivateService(config);
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
    const model = createAppModel(); service.pair(model);
    await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    await connectLocalService(model, service.origin);
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // lt-584.5 (C4): transcript bundles are PUT first and acknowledged; only the learner-state acknowledgement is lost.
      if (!(String(input).endsWith('/api/state') && init?.method === 'PUT')) return realFetch(input, init);
      const reply = await realFetch(input, init);
      expect(reply.status).toBe(200);
      await reply.json(); // actual server commit; only delivery to the caller is lost
      throw new TypeError('Acknowledgement lost; browser save unverified.');
    }));
    try {
      expect((await saveModelToLocalService(model)).ok).toBe(false);
      expect(model.localService.lastSavedAt).toBeNull(); expect(model.localService.lastMessage).toContain('Local service unreachable');
    } finally { vi.unstubAllGlobals(); }
    const durableModel = createAppModel(); service.pair(durableModel); await connectLocalService(durableModel);
    const durable = { snapshot: durableModel.store.snapshot() };
    expect(durable.snapshot).toEqual(model.store.snapshot());
    expect((await saveModelToLocalService(model)).ok).toBe(false);
    expect(model.localService.syncState).toBe('conflict'); expect(model.localService.lastSavedAt).toBeNull();
  });

  it('saves learner state to the loopback service and hydrates a fresh model from SQLite', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startPrivateService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const model = createAppModel(); service.pair(model);
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    await captureSentence(model, model.cues[0]!);

    const saved = await saveModelToLocalService(model, service.origin);
    expect(saved.ok).toBe(true);
    expect(model.localService.status).toBe('connected');

    const fresh = createAppModel(); service.pair(fresh);
    const connected = await connectLocalService(fresh, service.origin);

    expect(connected.ok).toBe(true);
    expect(fresh.localService.status).toBe('connected');
    expect(fresh.currentMedia?.id).toBe(model.currentMedia?.id);
    expect(fresh.cues.map((cue) => cue.text)).toEqual(model.cues.map((cue) => cue.text));
    expect(Object.values(fresh.store.snapshot().savedItems).map((item) => item.displayText)).toContain('Cześć, to jest lokalny test.');
  });

  it('autosaves supported study-state changes after a service connection', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startPrivateService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const model = createAppModel(); service.pair(model);
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    await connectLocalService(model, service.origin);
    setLocalServiceAutosave(model, true);

    await captureSentence(model, model.cues[0]!);
    for (let i = 0; i < 20 && !model.localService.lastSavedAt; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const fresh = createAppModel(); service.pair(fresh);
    await connectLocalService(fresh, service.origin);
    expect(Object.values(fresh.store.snapshot().savedItems).map((item) => item.displayText)).toContain('Cześć, to jest lokalny test.');
  });
});
