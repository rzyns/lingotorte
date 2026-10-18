import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importFixtureMediaAndSubtitles, setPracticeMode, setExportImportConfirmReplace, connectLocalService, previewRestoreManifest, previewDurableRestore } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { LocalStore, ExportService } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import { pairedModel } from './pairingFixture';
import { captureSentence } from '../helpers/capture';
import { synchronizePracticeSnippet, synchronizeSourceRangeSnippet } from '../../apps/web/src/ui/snippets';

let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
  Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s } });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); dom.window.close(); });
async function fixture() {
  const model = pairedModel();
  await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
  return model;
}
function button(text: string) { return [...document.querySelectorAll('button')].find(b => b.textContent === text)!; }
describe('lt-5lb.1 error feedback and focus continuity', () => {
  it.each(['practice', 'range'] as const)('%s audio failure is visible, generic, recoverable and clean returns focus', async kind => {
    const model = await fixture();
    if (kind === 'practice') {
      await captureSentence(model, model.cues[0]!);
      model.view = 'practice'; setPracticeMode(model, 'audio-recall');
    } else model.player.sourceRange = { startMs: 100, endMs: 1000 };
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    rerenderApp(model);
    const state = kind === 'practice' ? synchronizePracticeSnippet(model) : synchronizeSourceRangeSnippet(model);
    state.mediaPath = '/synthetic/movie.webm';
    // Bind the synthetic audio to the actual renderer-owned context.
    if (kind === 'practice') synchronizePracticeSnippet(model); else synchronizeSourceRangeSnippet(model);
    state.objectUrl = 'blob:synthetic'; state.status = 'ready'; state.message = 'Source audio ready.';
    rerenderApp(model);
    const selector = kind === 'practice' ? '.practice-audio-recall' : '[data-testid="source-range-panel"]';
    const audio = document.querySelector(`${selector} audio`)!;
    audio.dispatchEvent(new dom.window.Event('error'));
    expect(document.querySelector(selector)?.textContent).toContain('Source audio could not be played. Prepare it again or clean browser audio.');
    expect(document.querySelector(selector)?.textContent).not.toContain('blob:synthetic');
    expect(state.status).toBe('failed');
    const clean = button('Clean browser audio'); clean.focus(); clean.click();
    expect(document.querySelector(`${selector} audio`)).toBeNull();
    expect(document.activeElement?.id).toBe(kind === 'practice' ? 'practice-audio-prepare' : 'source-range-audio-prepare');
  });
  it('cue groups are not interactive ancestors; mouse and row keyboard still seek but children do not', async () => {
    const model = await fixture(); rerenderApp(model);
    const row = document.querySelector<HTMLElement>('.cue-row')!;
    expect(row.getAttribute('role')).toBe('group');
    expect(document.querySelector('.cue-row[role="button"] button')).toBeNull();
    model.player.currentTimeMs = 777;
    row.querySelector<HTMLButtonElement>('.cue-actions button')!.click();
    expect(model.player.currentTimeMs).toBe(777);
    for (const key of ['Enter', ' ']) {
      const current = document.querySelector<HTMLElement>('.cue-row')!;
      current.focus(); current.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      expect(model.player.currentTimeMs).toBe(model.cues[0]!.startMs);
    }
    model.player.currentTimeMs = 777; document.querySelector<HTMLElement>('.cue-row')!.click();
    expect(model.player.currentTimeMs).toBe(model.cues[0]!.startMs);
  });
  it('sentence builder add/remove/reset hands focus to a surviving token or submit', async () => {
    const model = await fixture(); await captureSentence(model, model.cues[0]!);
    model.view = 'practice'; setPracticeMode(model, 'sentence-builder'); rerenderApp(model);
    const add = document.querySelector<HTMLButtonElement>('.sentence-builder-token--pool')!;
    add.focus(); add.click();
    expect(document.activeElement?.classList.contains('sentence-builder-token--pool')).toBe(true);
    const remove = document.querySelector<HTMLButtonElement>('.sentence-builder-token--ordered')!;
    remove.focus(); remove.click();
    expect(document.activeElement?.classList.contains('sentence-builder-token--pool')).toBe(true);
    button('Reset sentence').click();
    expect(document.activeElement?.classList.contains('sentence-builder-token--pool')).toBe(true);
  });
  it.each(['practice', 'range'] as const)('%s asynchronous prepare success/failure retains owned focus but does not steal moved focus', async kind => {
    for (const outcome of ['success', 'failure', 'moved'] as const) {
      const model = await fixture();
      model.localService.status = 'connected';
      model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
      model.transcriptLifecycle.localAsrMediaPath = '/synthetic/movie.webm';
      if (kind === 'practice') {
        await captureSentence(model, model.cues[0]!); model.view = 'practice'; setPracticeMode(model, 'audio-recall');
      } else model.player.sourceRange = { startMs: 100, endMs: 1000 };
      rerenderApp(model);
      if (kind === 'practice') {
        const state = synchronizePracticeSnippet(model); state.mediaPath = '/synthetic/movie.webm'; synchronizePracticeSnippet(model); rerenderApp(model);
      }
      let release!: (response: Response) => void;
      const pending = new Promise<Response>(resolve => { release = resolve; });
      const id = '00000000-0000-4000-8000-000000000001';
      const responses = [
        new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: id, url: `/api/snippets/${id}`, mimeType: 'audio/wav' } } })),
        new Response(new Blob(['synthetic'], { type: 'audio/wav' })), new Response(null, { status: 204 }),
      ];
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-result');
      vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => pending).mockImplementation(async () => responses.shift()!));
      const prepare = button('Prepare audio for practice'); prepare.focus(); prepare.click();
      const statusId = kind === 'practice' ? 'practice-audio-status' : 'source-range-audio-status';
      expect(document.activeElement?.id).toBe(statusId);
      if (outcome === 'moved') document.getElementById(kind === 'practice' ? 'practice-answer' : 'source-range-media-path')!.focus();
      release(outcome === 'failure' ? new Response('synthetic failure', { status: 500 }) : new Response(JSON.stringify({ job: { id: 'synthetic-job' } }), { status: 201 }));
      await vi.waitFor(() => expect(document.getElementById(statusId)?.textContent).toMatch(outcome === 'failure' ? /failed/i : /ready/i));
      expect(document.activeElement?.id).toBe(outcome === 'moved' ? (kind === 'practice' ? 'practice-answer' : 'source-range-media-path') : statusId);
      if (outcome !== 'failure') { button('Clean browser audio').click(); expect(document.activeElement?.id).toBe(kind === 'practice' ? 'practice-audio-prepare' : 'source-range-audio-prepare'); }
    }
  });
  it('restore preview, invalid input, session apply and pending resume have explicit successors', async () => {
    const model = await fixture(); model.view = 'export-import'; rerenderApp(model);
    button('Preview restore').click(); expect(document.activeElement?.id).toBe('restore-error');
    const wire = JSON.stringify(model.exportService.buildManifest());
    model.exportImport.manifestJson = wire; rerenderApp(model); button('Preview restore').click();
    expect(document.activeElement?.id).toBe('restore-preview');
    setExportImportConfirmReplace(model, true);
    model.exportImport.acknowledgedWarnings = model.exportImport.preview!.warnings.map(w => w.kind);
    rerenderApp(model); button('Restore now').click();
    expect(model.exportImport.lastError).toBeNull();
    expect(document.activeElement?.id).toBe('restore-receipt');
    expect(model.store.snapshotPendingRestoreIntent()).not.toBeNull();
    button('Preview pending session restore for durable save').click();
    expect(document.activeElement?.id).toBe('restore-preview');
  });
  it('split, merge, corrected version and offset report their outcomes with focus after real rerenders', async () => {
    const model = await fixture(); model.view = 'library';
    const track = model.store.getSubtitleTrack(model.targetTrackId!)!;
    model.store.putSubtitleTrack({ ...track, transcriptStatus: 'draft' }); rerenderApp(model);
    const split = button('Split line 1'); split.focus(); split.click();
    expect(document.activeElement?.id).toBe('transcript-lifecycle-status');
    await vi.waitFor(() => expect(model.transcriptLifecycle.lastMessage).toContain('into a corrected version'));
    expect(document.activeElement?.id).toBe('transcript-lifecycle-status');
    const merge = button('Merge line 1 with next'); merge.focus(); merge.click();
    await vi.waitFor(() => expect(model.transcriptLifecycle.lastMessage).toContain('Merged line'));
    expect(document.activeElement?.id).toBe('transcript-lifecycle-status');
    const corrected = button('Create corrected transcript version'); corrected.focus(); corrected.click();
    await vi.waitFor(() => expect(model.transcriptLifecycle.lastMessage).toBe('Corrected transcript version created'));
    expect(document.activeElement?.id).toBe('transcript-lifecycle-status');
    button('Apply offset to all cues').click(); expect(document.activeElement?.id).toBe('library-error');
    const offset = document.getElementById('track-offset-ms') as HTMLInputElement; offset.value = '100';
    const apply = button('Apply offset to all cues'); apply.focus(); apply.click();
    await vi.waitFor(() => expect(model.transcriptLifecycle.lastMessage).toContain('Applied +100ms'));
    expect(document.activeElement?.id).toBe('transcript-lifecycle-status');
  });
  it.each(['success', 'failure', 'moved'] as const)('durable restore %s focuses its asynchronous outcome only while focus is owned', async outcome => {
    const db = SqliteLocalPersistence.open(':memory:'); db.saveStore(new LocalStore());
    let release!: (response: Response) => void;
    let committed!: Response;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const json = (body: unknown) => new Response(JSON.stringify(body));
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (path === '/api/status') return json({ ok: true, config: {} });
      if (path === '/api/state') return json({ ok: true, ...db.loadVersionedSnapshot(), restoreCapability: 'active-audit-restore-v1' });
      if (path === '/api/restore/preview') return json({ ok: true, ...db.previewRestore(body.manifest, body.mode, body.expectedRevision, body.learnerAudit) });
      if (path === '/api/restore/commit') { committed = json({ ok: true, ...db.commitRestore(body) }); return pending; }
      throw new Error('Unexpected synthetic route');
    }));
    try {
      const model = pairedModel(); await connectLocalService(model); model.view = 'export-import';
      previewRestoreManifest(model, JSON.stringify(new ExportService(new LocalStore(), 'synthetic').buildManifest()));
      setExportImportConfirmReplace(model, true); await previewDurableRestore(model);
      model.exportImport.acknowledgedWarnings = model.exportImport.preview!.warnings.map(w => w.kind);
      rerenderApp(model); const apply = button('Restore now'); expect(apply.disabled).toBe(false); apply.focus(); apply.click();
      expect(document.activeElement?.id).toBe('restore-preview');
      await vi.waitFor(() => expect(committed).toBeDefined());
      if (outcome === 'moved') { const outside = document.createElement('input'); outside.id = 'outside-focus'; document.body.appendChild(outside); outside.focus(); }
      release(outcome === 'failure' ? new Response('{}', { status: 500 }) : committed);
      await vi.waitFor(() => expect(outcome === 'failure' ? model.exportImport.lastError : model.exportImport.lastRestore).toBeTruthy());
      expect(document.activeElement?.id).toBe(outcome === 'moved' ? 'outside-focus' : outcome === 'failure' ? 'restore-error' : 'restore-receipt');
    } finally { db.close(); }
  });
  it.each(['browser', 'service', 'cancel'] as const)('local service %s choice focuses the resulting status', async choice => {
    const model = await fixture(); const remote = await fixture();
    vi.stubGlobal('fetch', vi.fn(async (input: string) => new Response(JSON.stringify(input.endsWith('/api/status')
      ? { ok: true, config: {} }
      : { ok: true, snapshot: remote.store.snapshot(), revision: `sha256:${'1'.repeat(64)}` }))));
    await connectLocalService(model); expect(model.localService.syncState).toBe('choice');
    model.view = 'settings'; rerenderApp(model);
    const labels = { browser: 'Keep browser work', service: 'Load service state (discard browser edits)', cancel: 'Cancel connection' };
    button(labels[choice]).click(); expect(document.activeElement?.id).toBe('local-service-status');
    expect(model.localService.syncState).not.toBe('choice');
    expect([...document.querySelectorAll('button')].some(b => b.textContent === 'Keep browser work')).toBe(false);
  });
});
