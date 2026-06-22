import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppModel, importFixtureMediaAndSubtitles, saveModelToLocalService, connectLocalService, saveSentenceFromCue, setLocalServiceAutosave } from '../../apps/web/src/model';
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

describe('web model local-service sync', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('saves learner state to the loopback service and hydrates a fresh model from SQLite', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    await saveSentenceFromCue(model, model.cues[0]!);

    const saved = await saveModelToLocalService(model, service.origin);
    expect(saved.ok).toBe(true);
    expect(model.localService.status).toBe('connected');

    const fresh = createAppModel();
    const connected = await connectLocalService(fresh, service.origin);

    expect(connected.ok).toBe(true);
    expect(fresh.localService.status).toBe('connected');
    expect(fresh.currentMedia?.id).toBe(model.currentMedia?.id);
    expect(fresh.cues.map((cue) => cue.text)).toEqual(model.cues.map((cue) => cue.text));
    expect(Object.values(fresh.store.snapshot().savedItems).map((item) => item.displayText)).toContain('Cześć, to jest lokalny test.');
  });

  it('autosaves supported study-state changes after a service connection', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    await connectLocalService(model, service.origin);
    setLocalServiceAutosave(model, true);

    await saveSentenceFromCue(model, model.cues[0]!);
    for (let i = 0; i < 20 && !model.localService.lastSavedAt; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const fresh = createAppModel();
    await connectLocalService(fresh, service.origin);
    expect(Object.values(fresh.store.snapshot().savedItems).map((item) => item.displayText)).toContain('Cześć, to jest lokalny test.');
  });
});
