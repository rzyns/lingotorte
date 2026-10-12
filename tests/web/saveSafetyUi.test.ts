import { pairedModel, SYNTHETIC_CAPABILITY } from './pairingFixture.ts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { rerenderApp } from '../../apps/web/src/app';
import { connectLocalService, importFixtureMediaAndSubtitles, saveModelToLocalService, persistIfLocalServiceAutosaveEnabled, setLocalServiceAutosave } from '../../apps/web/src/model';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';

const revision = `sha256:${'1'.repeat(64)}`;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
  for (const key of ['document', 'window', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'MutationObserver'] as const) vi.stubGlobal(key, dom.window[key]);
  vi.stubGlobal('requestAnimationFrame', () => 0);
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });
async function dirtyModel() {
  const model = pairedModel();
  await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
  return model;
}
function click(label: string) { const button = [...document.querySelectorAll('button')].find(b => b.textContent === label)!; expect(button).toBeTruthy(); button.click(); }

it.each(['Keep browser work', 'Load service state (discard browser edits)', 'Cancel connection'])('exposes explicit %s choice without silently replacing or saving', async label => {
  const model = await dirtyModel(); model.view = 'settings'; const prior = model.store.snapshot();
  const remote = await dirtyModel(); remote.store.putMediaAsset({ ...remote.currentMedia!, title: 'remote' });
  const fetchMock = vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: remote.store.snapshot(), revision }));
  vi.stubGlobal('fetch', fetchMock); rerenderApp(model); (document.getElementById('local-service-capability') as HTMLInputElement).value = SYNTHETIC_CAPABILITY; click('Connect local service');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Keep browser work'));
  expect(model.store.snapshot()).toEqual(prior);
  expect((document.querySelector('[data-local-service-save]') as HTMLButtonElement).disabled).toBe(true);
  click(label);
  expect(model.store.snapshot()).toEqual(label.startsWith('Load') ? remote.store.snapshot() : prior);
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(model.localService.lastSavedAt).toBeNull();
  expect(document.body.textContent).toContain(label.startsWith('Keep') ? 'Browser work kept' : label.startsWith('Load') ? 'explicit confirmation' : 'cancelled');
});

it('re-confirms form edits after comparison instead of discarding them on the first Load click', async () => {
  const model = await dirtyModel(); model.view = 'settings'; const prior = model.store.snapshot();
  const remote = await dirtyModel(); remote.store.putMediaAsset({ ...remote.currentMedia!, title: 'remote' });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: remote.store.snapshot(), revision })));
  await connectLocalService(model); rerenderApp(model);
  model.transcriptLifecycle.pendingCueEdits[model.cues[0]!.id] = 'new draft';
  click('Load service state (discard browser edits)');
  expect(document.body.textContent).toContain('Confirm your choice again'); expect(model.store.snapshot()).toEqual(prior);
  click('Load service state (discard browser edits)'); expect(model.store.snapshot()).toEqual(remote.store.snapshot());
});

it('observes autosave pending and failure outside Settings without claiming durable completion', async () => {
  const model = await dirtyModel(); model.view = 'library';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: createEmptyLocalStoreSnapshot(), revision })));
  await connectLocalService(model); rerenderApp(model); setLocalServiceAutosave(model, true);
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  persistIfLocalServiceAutosaveEnabled(model);
  await vi.waitFor(() => expect(document.body.textContent).toContain('waiting for durable SQLite acknowledgement'));
  expect(model.localService.lastSavedAt).toBeNull();
  finish(response({ ok: false, error: 'SQLite save failed; browser work remains unsaved.' }, 500));
  await vi.waitFor(() => expect(document.body.textContent).toContain('SQLite save failed'));
  expect(document.querySelector('[data-local-service-sync]')!.classList.contains('error')).toBe(true);
  expect(model.localService.lastSavedAt).toBeNull();
});

it('shows conflict and disables Save until explicit reconnect comparison', async () => {
  const model = await dirtyModel(); model.view = 'settings';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: createEmptyLocalStoreSnapshot(), revision })));
  await connectLocalService(model); rerenderApp(model);
  vi.stubGlobal('fetch', vi.fn(async () => response({ ok: false, error: 'Durable state changed. Reconnect and choose which state to keep.' }, 409)));
  await saveModelToLocalService(model);
  expect(document.body.textContent).toContain('Reconnect and choose');
  expect((document.querySelector('[data-local-service-save]') as HTMLButtonElement).disabled).toBe(true);
});
