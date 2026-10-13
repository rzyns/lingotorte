// lt-aur.1 — dirty transcript approval regressions (synthetic, offline, JSDOM).
// Block → Apply → inspect → Approve. No providers, no network, no real stores.
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSavedOccurrenceSourceContext } from '../../packages/domain/src/sourceContext.ts';
import {
  approveTranscriptTrack,
  createAppModel,
  createCorrectedTranscriptVersion,
  generateLocalAsrDraft,
  importFixtureMediaAndSubtitles,
  makeFakeLocalAsrProvider,
  saveSentenceFromCue,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';
import { withNoNetwork } from '../no-network/networkTrap';

const APPROVE = 'Approve transcript for study';
const APPLY = 'Create corrected transcript version';

async function draftModel(): Promise<AppModel> {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(
    model,
    'fixtures/media/synthetic-polish-dialogue.webm',
    'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
    'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
  );
  await generateLocalAsrDraft(model, makeFakeLocalAsrProvider({
    engine: 'synthetic', modelName: 'synthetic-asr', language: 'pl',
    segments: [
      { startMs: 0, endMs: 1500, text: 'Cześć świecie.', words: [
        { wordIndex: 0, text: 'Cześć', charStart: 0, charEnd: 5, startMs: 0, endMs: 600 },
        { wordIndex: 1, text: 'świecie.', charStart: 6, charEnd: 14, startMs: 600, endMs: 1500 },
      ] },
      { startMs: 1500, endMs: 3000, text: 'Druga kwestia.' },
    ],
  }));
  model.view = 'library';
  return model;
}

function track(model: AppModel, id = model.targetTrackId!) { return model.store.getSubtitleTrack(id)!; }
function firstWord(model: AppModel) { return model.store.listTranscriptWordTimingsForCue(model.cues[0]!.id)[0]!; }

type Field = 'cueText' | 'cueStart' | 'cueEnd' | 'wordText' | 'wordStart' | 'wordEnd';
const FIELDS: Field[] = ['cueText', 'cueStart', 'cueEnd', 'wordText', 'wordStart', 'wordEnd'];

/** Writes a pending edit into model state exactly as the editor stores it; `revert` writes the persisted values. */
function setPending(model: AppModel, field: Field, revert = false): void {
  const cue = model.cues[0]!;
  const word = firstWord(model);
  const lc = model.transcriptLifecycle;
  if (field === 'cueText') lc.pendingCueEdits[cue.id] = revert ? cue.text : 'Zmieniony tekst.';
  if (field === 'cueStart' || field === 'cueEnd') {
    lc.pendingCueTimingEdits[cue.id] = { startMs: cue.startMs + (!revert && field === 'cueStart' ? 100 : 0), endMs: cue.endMs + (!revert && field === 'cueEnd' ? 100 : 0) };
  }
  if (field.startsWith('word')) {
    lc.pendingWordTimingEdits[word.id] = {
      text: !revert && field === 'wordText' ? 'Hej' : word.text,
      startMs: word.startMs + (!revert && field === 'wordStart' ? 50 : 0),
      endMs: word.endMs + (!revert && field === 'wordEnd' ? 50 : 0),
    };
  }
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  return dom;
}
function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
  expect(found, text).toBeTruthy();
  return found!;
}
function input(name: string): HTMLInputElement | HTMLTextAreaElement {
  const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
  expect(el, name).toBeTruthy();
  return el!;
}
const FIELD_INPUT: Record<Field, string> = {
  cueText: 'transcript-correction-cue-1', cueStart: 'transcript-correction-cue-1-start-ms', cueEnd: 'transcript-correction-cue-1-end-ms',
  wordText: 'transcript-word-timing-cue-1-word-0-text', wordStart: 'transcript-word-timing-cue-1-word-0-start-ms', wordEnd: 'transcript-word-timing-cue-1-word-0-end-ms',
};
const FIELD_VALUE: Record<Field, string> = { cueText: 'Zmieniony tekst.', cueStart: '100', cueEnd: '1600', wordText: 'Hej', wordStart: '50', wordEnd: '650' };
async function settle(predicate: () => boolean): Promise<void> {
  await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 5_000, interval: 5 });
}

describe('lt-aur.1 direct model approval path', () => {
  for (const field of FIELDS) {
    it(`refuses direct approval while ${field} is dirty and leaves the track unapproved`, async () => {
      const { value: model, networkAttempts } = await withNoNetwork(draftModel);
      const before = track(model);
      setPending(model, field);
      expect(() => approveTranscriptTrack(model, before.id)).toThrow(/pending transcript edits/i);
      expect(track(model)).toEqual(before);
      expect(track(model).qualityReport?.approvedAt).toBeUndefined();
      expect(networkAttempts).toEqual([]);
    });
    it(`permits explicit approval after ${field} is reverted to persisted values`, async () => {
      const model = await draftModel();
      setPending(model, field, true);
      expect(approveTranscriptTrack(model, model.targetTrackId!, '2026-10-12T00:00:00.000Z').transcriptStatus).toBe('approved');
    });
  }
  it('still approves a clean track (existing callers unchanged)', async () => {
    const model = await draftModel();
    expect(approveTranscriptTrack(model, model.targetTrackId!).transcriptStatus).toBe('approved');
  });
});

describe('lt-aur.1 UI and handler approval path', () => {
  let dom: ReturnType<typeof setupDom>;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { dom.window.close(); });

  function type(name: string, value: string) {
    const el = input(name);
    el.value = value;
    el.dispatchEvent(new dom.window.Event('input'));
  }

  for (const field of FIELDS) {
    it(`blocks the Approve button and handler while ${field} is dirty, with a visible explanation`, async () => {
      const model = await draftModel();
      rerenderApp(model);
      const draftId = model.targetTrackId!;
      type(FIELD_INPUT[field], FIELD_VALUE[field]);
      const approve = button(APPROVE);
      expect(approve.disabled).toBe(true);
      expect(document.querySelector('.transcript-approval-gate')?.textContent).toContain(APPLY);
      approve.click();
      approve.disabled = false; // bypass the attribute: the handler itself must refuse
      approve.click();
      expect(track(model, draftId).transcriptStatus).toBe('draft');
      expect(track(model, draftId).qualityReport?.approvedAt).toBeUndefined();
    });
  }

  it('re-enables approval after an edit is reverted in the editor, and approves explicitly', async () => {
    const model = await draftModel();
    rerenderApp(model);
    const original = input(FIELD_INPUT.cueText).value;
    type(FIELD_INPUT.cueText, 'Inny tekst.');
    expect(button(APPROVE).disabled).toBe(true);
    type(FIELD_INPUT.cueText, original);
    expect(button(APPROVE).disabled).toBe(false);
    button(APPROVE).click();
    expect(track(model).transcriptStatus).toBe('approved');
  });

  it('Apply creates an immutable corrected version whose displayed content and identity match the approved track', async () => {
    const { value: model, networkAttempts } = await withNoNetwork(async () => {
      const m = await draftModel();
      rerenderApp(m);
      const parentId = m.targetTrackId!;
      const parentBefore = { track: track(m, parentId), cues: m.store.listCuesForTrack(parentId), words: m.store.listTranscriptWordTimingsForTrack(parentId) };
      type(FIELD_INPUT.cueText, 'Poprawiona kwestia.');
      type(FIELD_INPUT.cueEnd, '1400');
      type(FIELD_INPUT.wordText, 'Hej');
      button(APPLY).click();
      await settle(() => m.targetTrackId !== parentId);
      const childId = m.targetTrackId!;
      expect(track(m, childId)).toMatchObject({ transcriptStatus: 'correcting', provenance: { parentTrackId: parentId, parentTrackSha256: parentBefore.track.contentSha256 } });
      // displayed accepted content == persisted child content
      const childCues = m.store.listCuesForTrack(childId);
      expect(input(FIELD_INPUT.cueText).value).toBe(childCues[0]!.text);
      expect(childCues[0]).toMatchObject({ text: 'Poprawiona kwestia.', endMs: 1400 });
      expect(input(FIELD_INPUT.cueEnd).value).toBe(String(childCues[0]!.endMs));
      expect(input(FIELD_INPUT.wordText).value).toBe('Hej');
      expect(button(APPROVE).disabled).toBe(false);
      button(APPROVE).click();
      expect(track(m, childId).transcriptStatus).toBe('approved');
      expect(m.store.listCuesForTrack(childId)).toEqual(childCues);
      // parent bytes/IDs unchanged, not approved
      expect(track(m, parentId)).toEqual(parentBefore.track);
      expect(m.store.listCuesForTrack(parentId)).toEqual(parentBefore.cues);
      expect(m.store.listTranscriptWordTimingsForTrack(parentId)).toEqual(parentBefore.words);
      return m;
    });
    expect(model.transcriptLifecycle.pendingCueEdits).toEqual({});
    expect(networkAttempts).toEqual([]);
  });

  it('failed Apply with empty cue text keeps the edit unresolved, selects no new version and does not approve', async () => {
    const model = await draftModel();
    rerenderApp(model);
    const parentId = model.targetTrackId!;
    const tracksBefore = Object.keys(model.store.snapshot().subtitleTracks).length;
    type(FIELD_INPUT.cueText, '   ');
    button(APPLY).click();
    await settle(() => Boolean(model.importError));
    expect(model.targetTrackId).toBe(parentId);
    expect(Object.keys(model.store.snapshot().subtitleTracks)).toHaveLength(tracksBefore);
    expect(Object.values(model.transcriptLifecycle.pendingCueEdits)).toEqual(['   ']);
    expect(button(APPROVE).disabled).toBe(true);
    expect(() => approveTranscriptTrack(model, parentId)).toThrow(/pending transcript edits/i);
    expect(track(model, parentId).transcriptStatus).toBe('draft');
  });

  it('rejected word edit Apply leaves no partial corrected version selected or approvable', async () => {
    const model = await draftModel();
    rerenderApp(model);
    const parentId = model.targetTrackId!;
    const tracksBefore = Object.keys(model.store.snapshot().subtitleTracks).length;
    type(FIELD_INPUT.wordEnd, '0'); // end <= start → rejected
    button(APPLY).click();
    await settle(() => Boolean(model.importError));
    expect(model.targetTrackId).toBe(parentId);
    expect(Object.keys(model.store.snapshot().subtitleTracks)).toHaveLength(tracksBefore);
    expect(Object.keys(model.transcriptLifecycle.pendingWordTimingEdits)).toHaveLength(1);
    expect(button(APPROVE).disabled).toBe(true);
    expect(Object.values(model.store.snapshot().subtitleTracks).filter((t) => t.transcriptStatus === 'approved' && t.transcriptSourceKind === 'manual-edit')).toEqual([]);
  });

  it('stale Apply: an edit made while Apply is pending is retained and blocks approval', async () => {
    const model = await draftModel();
    rerenderApp(model);
    const parentId = model.targetTrackId!;
    type(FIELD_INPUT.cueText, 'Pierwsza poprawka.');
    button(APPLY).click();
    // still pending: direct approval must refuse
    expect(() => approveTranscriptTrack(model, parentId)).toThrow(/pending transcript edits|correction is pending/i);
    type(FIELD_INPUT.wordText, 'Nowsze');
    await settle(() => model.transcriptLifecycle.lastMessage !== null || Boolean(model.importError));
    await vi.waitFor(() => expect(Object.values(model.transcriptLifecycle.pendingWordTimingEdits).map((e) => e.text)).toEqual(['Nowsze']), { timeout: 5_000, interval: 5 });
    const shown = model.targetTrackId!;
    expect(() => approveTranscriptTrack(model, shown)).toThrow(/pending transcript edits/i);
    expect(button(APPROVE).disabled).toBe(true);
    expect(Object.values(model.store.snapshot().subtitleTracks).some((t) => t.transcriptStatus === 'approved' && t.transcriptSourceKind === 'local-asr')).toBe(false);
  });

  it('a stale Approve handler for a no-longer-selected track does not approve it', async () => {
    const model = await draftModel();
    rerenderApp(model);
    const draftId = model.targetTrackId!;
    const approve = button(APPROVE);
    model.targetTrackId = Object.values(model.store.snapshot().subtitleTracks).find((t) => t.id !== draftId && t.role === 'target')!.id;
    approve.click();
    expect(track(model, draftId).transcriptStatus).toBe('draft');
  });

  it('blocks split/merge while edits are dirty instead of silently discarding them', async () => {
    const model = await draftModel();
    rerenderApp(model);
    const parentId = model.targetTrackId!;
    type(FIELD_INPUT.cueText, 'Niezastosowana zmiana.');
    const split = button('Split cue 1');
    expect(split.disabled).toBe(true);
    split.disabled = false;
    split.click();
    // Negative check: give any (wrongly) started split a chance to land; a fixed wait can only under-detect, never fail spuriously.
    await new Promise((r) => setTimeout(r, 20));
    expect(model.targetTrackId).toBe(parentId);
    expect(Object.values(model.transcriptLifecycle.pendingCueEdits)).toEqual(['Niezastosowana zmiana.']);
  });
});

describe('lt-aur.1 saved anchors and save gate', () => {
  it('keeps V1 saved occurrence anchors unchanged/valid and blocks saves from correcting V2', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    const v1 = track(model);
    expect(v1.transcriptStatus).toBe('approved');
    const v1Cue = model.cues[0]!;
    await saveSentenceFromCue(model, v1Cue);
    const occurrence = model.store.listSavedOccurrences()[0]!;
    const occBefore = structuredClone(occurrence);
    const v2 = await createCorrectedTranscriptVersion(model, v1.id, [{ cueId: v1Cue.id, text: 'Zmieniona kwestia V2.' }]);
    await expect(saveSentenceFromCue(model, model.cues[0]!)).rejects.toThrow(/approved transcript/i);
    approveTranscriptTrack(model, v2.track.id);
    const occAfter = model.store.getSavedOccurrence(occurrence.id)!;
    expect(occAfter).toEqual(occBefore);
    expect(() => validateSavedOccurrenceSourceContext(occAfter.sourceContext)).not.toThrow();
    expect(occAfter.sourceContext.subtitleTrackId).toBe(v1.id);
    expect(model.store.getSubtitleTrack(v1.id)).toEqual(v1);
    expect(model.store.getCue(v1Cue.id)).toEqual(v1Cue);
    expect(model.store.getMediaAsset(v1.mediaId)?.contentSha256).toBe(occAfter.sourceContext.mediaFingerprint);
  });
});
