import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createAppModel,
  importFixtureMediaAndSubtitles,
  saveSentenceFromCue,
  createReviewCardForSavedItem,
  setReviewBucketAsOf,
  setView,
  submitPracticeAttempt,
  setExportImportAcknowledgedWarning,
  setExportImportConfirmOverwrite,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { withNoNetwork } from '../../tests/no-network/networkTrap';

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as unknown as typeof CSS;
  return dom;
}

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

async function createPracticeModel() {
  return await withNoNetwork(async () => {
    const m = createAppModel();
    await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
    const firstCue = m.cues[0]!;
    const item = await saveSentenceFromCue(m, firstCue);
    if (!item) throw new Error('Expected saved item');
    const occurrence = m.savedOccurrenceService.listOccurrencesForItem(item.id)[0];
    if (!occurrence) throw new Error('Expected saved occurrence');
    const card = createReviewCardForSavedItem(m, item, occurrence, 'recognition');
    const asOf = new Date('2026-06-21T12:00:00.000Z');
    setReviewBucketAsOf(m, asOf);
    return { model: m, item, occurrence, firstCue, card };
  });
}

function renderPractice(m: ReturnType<typeof createAppModel>) {
  setView(m, 'practice');
  rerenderApp(m);
}

function renderExportImport(m: ReturnType<typeof createAppModel>) {
  setView(m, 'export-import');
  rerenderApp(m);
}

describe('P6 frontend local practice attempts', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('shows the practice view with a due card prompt and source context', async () => {
    const { value: { model, firstCue } } = await createPracticeModel();
    renderPractice(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Practice');
    expect(app.textContent).toContain('Your answer');
    expect(app.textContent).toContain('Submit attempt');
    expect(app.textContent).toContain(firstCue.text);
    expect(app.textContent).toContain(mediaPath);
    expect(app.textContent).toContain('Replay source cue');
  });

  it('submits a correct typed-input practice attempt via the UI and updates state', async () => {
    const { value: { model, card } } = await createPracticeModel();
    renderPractice(model);

    const input = document.querySelector('#practice-answer') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    input!.value = 'Cześć, to jest lokalny test.';
    input!.dispatchEvent(new dom.window.Event('input'));
    renderPractice(model);

    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Submit attempt');
    expect(submitBtn).toBeTruthy();
    submitBtn!.click();
    renderPractice(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('pass');

    const attempts = model.store.listPracticeAttemptsForCard(card.id);
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[attempts.length - 1]!.result).toBe('pass');
  });

  it('submits a skipped attempt when the skip button is clicked', async () => {
    const { value: { model, card } } = await createPracticeModel();
    renderPractice(model);

    const skipBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Skip');
    expect(skipBtn).toBeTruthy();
    skipBtn!.click();
    renderPractice(model);

    const attempts = model.store.listPracticeAttemptsForCard(card.id);
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[attempts.length - 1]!.result).toBe('skipped');
  });

  it('replays the source cue in the player view', async () => {
    const { value: { model, firstCue } } = await createPracticeModel();
    renderPractice(model);

    const replayBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Replay source cue'));
    expect(replayBtn).toBeTruthy();
    replayBtn!.click();

    expect(model.view).toBe('player');
    expect(model.player.activeCueId).toBe(firstCue.id);
    expect(model.player.currentTimeMs).toBe(firstCue.startMs);
  });

  it('records a typed-input fail for a wrong answer and shows feedback', async () => {
    const { value: { model, card } } = await createPracticeModel();
    renderPractice(model);

    const input = document.querySelector('#practice-answer') as HTMLInputElement | null;
    input!.value = 'wrong answer';
    input!.dispatchEvent(new dom.window.Event('input'));
    renderPractice(model);

    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Submit attempt');
    submitBtn!.click();
    renderPractice(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('fail');
    const attempts = model.store.listPracticeAttemptsForCard(card.id);
    expect(attempts[attempts.length - 1]!.result).toBe('fail');
  });

  it('has zero network activity during the practice flow', async () => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model } = (await createPracticeModel()).value;
      renderPractice(model);
      submitPracticeAttempt(model, 'Cześć, to jest lokalny test.', model.review.bucketAsOf);
      rerenderApp(model);
      return model;
    });
    expect(networkAttempts).toHaveLength(0);
  });
});

describe('P6 frontend export / import local learner state', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('generates a local export and shows record counts plus privacy warnings', async () => {
    const { value: { model } } = await createPracticeModel();
    renderExportImport(model);

    const exportBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Generate local export');
    expect(exportBtn).toBeTruthy();
    exportBtn!.click();
    renderExportImport(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Export ready:');
    expect(app.textContent).toContain('records');
    expect(app.textContent).toContain('privacy');
  });

  it('previews a valid manifest and shows counts and warnings', async () => {
    const { value: { model } } = await createPracticeModel();
    const { manifest } = model.exportService.exportToFile('/tmp/lingotorte');
    const manifestJson = JSON.stringify(manifest);

    // Clear local state so restore is safe
    const clean = createAppModel();
    renderExportImport(clean);

    const textarea = document.querySelector('#import-manifest') as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();
    textarea!.value = manifestJson;
    const previewBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Preview restore');
    expect(previewBtn).toBeTruthy();
    previewBtn!.click();
    renderExportImport(clean);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Restore preview');
    expect(app.textContent).toContain('Restore now');
    expect(app.textContent).toContain('savedItems:');
  });

  it('refuses restore without acknowledging privacy warnings', async () => {
    const { value: { model } } = await createPracticeModel();
    const { manifest } = model.exportService.exportToFile('/tmp/lingotorte');
    const manifestJson = JSON.stringify(manifest);

    const clean = createAppModel();
    renderExportImport(clean);

    const textarea = document.querySelector('#import-manifest') as HTMLTextAreaElement | null;
    textarea!.value = manifestJson;
    const previewBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Preview restore');
    previewBtn!.click();
    renderExportImport(clean);

    const restoreBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Restore now');
    expect(restoreBtn).toBeTruthy();
    restoreBtn!.click();
    renderExportImport(clean);

    const app = document.getElementById('app')!;
    expect(app.textContent).toMatch(/warning|acknowledged/i);
  });

  it('round-trips learner state after acknowledging warnings and confirming overwrite', async () => {
    const { value: { model } } = await createPracticeModel();
    const { manifest } = model.exportService.exportToFile('/tmp/lingotorte');
    const manifestJson = JSON.stringify(manifest);

    const clean = createAppModel();
    renderExportImport(clean);

    const textarea = document.querySelector('#import-manifest') as HTMLTextAreaElement | null;
    textarea!.value = manifestJson;
    const previewBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Preview restore');
    previewBtn!.click();
    renderExportImport(clean);

    // Acknowledge all warnings and confirm restore directly in the model; then rerender once.
    const preview = clean.exportImport.preview;
    expect(preview).toBeTruthy();
    for (const warning of preview!.warnings) {
      setExportImportAcknowledgedWarning(clean, warning.kind, true);
    }
    setExportImportConfirmOverwrite(clean, true);
    renderExportImport(clean);

    const restoreBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Restore now');
    expect(restoreBtn).toBeTruthy();
    expect(restoreBtn!.disabled).toBe(false);
    restoreBtn!.click();
    renderExportImport(clean);

    const restoredItems = Object.values(clean.store.snapshot().savedItems);
    expect(restoredItems.length).toBeGreaterThan(0);
  });

  it('has zero network activity during export and restore preview', async () => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { value: { model } } = await createPracticeModel();
      renderExportImport(model);
      const { manifest } = model.exportService.exportToFile('/tmp/lingotorte');
      const clean = createAppModel();
      clean.restoreService.preview(manifest);
      return clean;
    });
    expect(networkAttempts).toHaveLength(0);
  });
});
