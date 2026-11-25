import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addSavedItemToReview,
  addSavedItemsToReview,
  archiveReviewCardsForSavedItem,
  connectLocalService,
  importFixtureMediaAndSubtitles,
  saveSelection,
  setSelection,
} from '../../apps/web/src/model';
import { type LocalStoreSnapshot } from '../../packages/storage/src';
import type { AppModel } from '../../apps/web/src/uiTypes';
import { pairedModel } from './pairingFixture.ts';

const revision = `sha256:${'7'.repeat(64)}`;
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

function stubStateService(initial: LocalStoreSnapshot) {
  let stored = structuredClone(initial);
  const puts: string[] = [];
  const transcriptPuts: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/status')) return jsonResponse({ ok: true, config: {} });
    const transcriptsMatch = /\/api\/media\/([^/]+)\/transcripts$/.exec(url);
    if (transcriptsMatch && (!init?.method || init.method === 'GET')) {
      const mediaId = transcriptsMatch[1]!;
      const tracks: Record<string, { cues: unknown[]; wordTimings: unknown[] }> = {};
      for (const track of Object.values(stored.subtitleTracks)) {
        if (track.mediaId !== mediaId) continue;
        tracks[track.id] = {
          cues: Object.values(stored.cues).filter((c) => c.trackId === track.id),
          wordTimings: Object.values(stored.transcriptWordTimings).filter((w) => w.trackId === track.id),
        };
      }
      return jsonResponse({ ok: true, revision, tracks });
    }
    if (init?.method === 'PUT' && /\/api\/tracks\/[^/]+\/transcript$/.test(url)) {
      transcriptPuts.push(url);
      return jsonResponse({ ok: true, revision, savedAt: '2026-10-14T00:00:00.000Z' });
    }
    if (init?.method === 'PUT' && url.endsWith('/api/state')) {
      const parsed = JSON.parse(String(init.body)) as { snapshot?: LocalStoreSnapshot };
      if (parsed.snapshot) stored = parsed.snapshot;
      puts.push(String(init.body));
      return jsonResponse({ ok: true, revision, savedAt: '2026-10-14T00:00:00.000Z' });
    }
    return jsonResponse({ ok: true, snapshot: stored, revision });
  }));
  return { puts, transcriptPuts };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

async function saveFixtureWord(model: AppModel, wordIndex: number) {
  const cue = model.cues[0]!;
  const word = cue.text.split(/\s+/)[wordIndex]!;
  const charStart = cue.text.indexOf(word);
  setSelection(model, {
    kind: 'lexeme',
    text: word,
    cueId: cue.id,
    tokenStart: wordIndex,
    tokenEnd: wordIndex + 1,
    charStart,
    charEnd: charStart + word.length,
  });
  return (await saveSelection(model))!;
}

async function seedFixtureModel() {
  const model = pairedModel();
  await importFixtureMediaAndSubtitles(
    model,
    'fixtures/media/synthetic-polish-dialogue.webm',
    'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
    'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
  );
  const item = await saveFixtureWord(model, 0);
  return { model, item };
}

afterEach(() => vi.unstubAllGlobals());

describe('lt-5lb.7 addSavedItemToReview no-op persistence and reactivation guards', () => {
  it('returns the existing active card with one cardsFor lookup and zero dirty/autosave side effects', async () => {
    const { model, item } = await seedFixtureModel();
    const firstCard = addSavedItemToReview(model, item, false)!;
    expect(firstCard).not.toBeNull();

    const { puts, transcriptPuts } = stubStateService(model.store.snapshot());
    expect((await connectLocalService(model)).ok).toBe(true);
    await settle();
    expect(model.localService.syncState).toBe('idle');
    expect(puts).toHaveLength(0);
    expect(transcriptPuts).toHaveLength(0);

    const cardsForSpy = vi.spyOn(model.capture, 'cardsFor');
    const reactivateSpy = vi.spyOn(model.capture, 'reactivate');

    const repeated = addSavedItemToReview(model, item);

    expect(repeated?.id).toBe(firstCard.id);
    expect(cardsForSpy).toHaveBeenCalledTimes(1);
    expect(reactivateSpy).not.toHaveBeenCalled();
    await settle();
    expect(model.localService.syncState).toBe('idle');
    expect(puts).toHaveLength(0);
    expect(transcriptPuts).toHaveLength(0);
  });

  it('triggers autosave on genuine reactivation when persist=true, and skips it when persist=false', async () => {
    const { model, item } = await seedFixtureModel();
    const created = addSavedItemToReview(model, item, false)!;
    archiveReviewCardsForSavedItem(model, item.id);
    expect(model.store.getReviewCard(created.id)?.suspendedAt).toBeDefined();

    const { puts, transcriptPuts } = stubStateService(model.store.snapshot());
    expect((await connectLocalService(model)).ok).toBe(true);
    await settle();
    expect(model.localService.syncState).toBe('idle');

    // persist=false reactivates without marking dirty or triggering autosave.
    const quiet = addSavedItemToReview(model, item, false)!;
    expect(quiet.id).toBe(created.id);
    expect(quiet.suspendedAt).toBeUndefined();
    await settle();
    expect(puts).toHaveLength(0);
    expect(model.localService.syncState).toBe('idle');

    // Archive and genuinely reactivate with default persist=true -> triggers one autosave.
    archiveReviewCardsForSavedItem(model, item.id);
    await settle();
    expect(model.localService.syncState).toBe('saved');
    const putsBeforeReactivate = puts.length;

    const reactivated = addSavedItemToReview(model, item)!;
    expect(reactivated.id).toBe(created.id);
    expect(reactivated.suspendedAt).toBeUndefined();
    await settle();
    expect(puts.length - putsBeforeReactivate).toBe(1);
    expect(model.localService.syncState).toBe('saved');
    expect(transcriptPuts).toHaveLength(0);
  });

  it('addSavedItemsToReview skips already-active items and persists once for newly enrolled items only', async () => {
    const { model, item: first } = await seedFixtureModel();
    const second = await saveFixtureWord(model, 2);

    addSavedItemToReview(model, first, false);

    const { puts, transcriptPuts } = stubStateService(model.store.snapshot());
    expect((await connectLocalService(model)).ok).toBe(true);
    await settle();
    expect(model.localService.syncState).toBe('idle');
    expect(puts).toHaveLength(0);

    expect(addSavedItemsToReview(model, [first])).toBe(0);
    await settle();
    expect(puts).toHaveLength(0);
    expect(model.localService.syncState).toBe('idle');

    expect(addSavedItemsToReview(model, [first, second])).toBe(1);
    await settle();
    expect(puts).toHaveLength(1);
    expect(model.localService.syncState).toBe('saved');
    expect(transcriptPuts).toHaveLength(0);
  });
});
