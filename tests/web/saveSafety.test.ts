import { afterEach, expect, it, vi } from 'vitest';
import { createAppModel, connectLocalService, saveModelToLocalService, importFixtureMediaAndSubtitles, resolveLocalServiceConnection, setLocalServiceBaseUrl, setLocalServiceAutosave, persistIfLocalServiceAutosaveEnabled, restoreBrowserMediaHandle } from '../../apps/web/src/model';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';

const revision = `sha256:${'1'.repeat(64)}`;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
afterEach(() => vi.unstubAllGlobals());
async function dirtyModel() {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
  return model;
}

it('preserves dirty nonempty browser work when connecting to different durable content', async () => {
  const model = await dirtyModel(); const prior = model.store.snapshot();
  const remote = await dirtyModel(); remote.store.putMediaAsset({ ...remote.currentMedia!, title: 'remote' });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { ok: true, config: {} } : { ok: true, snapshot: remote.store.snapshot(), revision })));
  expect((await connectLocalService(model)).ok).toBe(false);
  expect(model.store.snapshot()).toEqual(prior);
  expect(model.localService.lastMessage).toMatch(/choose|confirm/i);
});

it('does not discard an edit made while connect awaits its snapshot', async () => {
  const model = createAppModel(); const waiting = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/api/status') ? Promise.resolve(response({ config: {} })) : waiting.promise));
  const connecting = connectLocalService(model);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const edited = await dirtyModel(); model.store.replaceSnapshot(edited.store.snapshot());
  waiting.resolve(response({ snapshot: createEmptyLocalStoreSnapshot(), revision }));
  await connecting;
  expect(model.store.snapshot()).toEqual(edited.store.snapshot());
  expect(model.localService.lastMessage).toMatch(/choose|confirm/i);
});

it('does not report newer browser edits saved by an older durable acknowledgement', async () => {
  const model = await dirtyModel();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: createEmptyLocalStoreSnapshot(), revision })));
  await connectLocalService(model);
  const waiting = deferred<Response>(); vi.stubGlobal('fetch', vi.fn(() => waiting.promise));
  const saving = saveModelToLocalService(model);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  model.store.putMediaAsset({ ...model.currentMedia!, title: 'new edit' });
  waiting.resolve(response({ ok: true, revision, savedAt: '2026-01-01T00:00:00.000Z' }));
  await saving;
  expect(model.localService.lastMessage).toMatch(/unsaved|pending/i);
});

it('treats unsaved deletion of all previously loaded browser content as dirty on reconnect', async () => {
  const model = createAppModel(); const remote = await dirtyModel();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: remote.store.snapshot(), revision })));
  expect((await connectLocalService(model)).ok).toBe(true);
  model.store.replaceSnapshot(createEmptyLocalStoreSnapshot());
  expect((await connectLocalService(model)).ok).toBe(false);
  expect(model.store.snapshot()).toEqual(createEmptyLocalStoreSnapshot());
  expect(model.localService.syncState).toBe('choice');
});

async function connectEmpty(model: ReturnType<typeof createAppModel>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: createEmptyLocalStoreSnapshot(), revision })));
  expect((await connectLocalService(model)).ok).toBe(true);
}

it('serializes manual and autosave requests using each preceding durable acknowledgement', async () => {
  const model = await dirtyModel(); await connectEmpty(model);
  const first = deferred<Response>(); const second = deferred<Response>();
  const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  vi.stubGlobal('fetch', fetchMock); setLocalServiceAutosave(model, true);
  const saving = saveModelToLocalService(model);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  model.store.putMediaAsset({ ...model.currentMedia!, title: 'newest edit' });
  persistIfLocalServiceAutosaveEnabled(model);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(model.localService.lastSavedAt).toBeNull();
  const nextRevision = `sha256:${'2'.repeat(64)}`;
  first.resolve(response({ ok: true, revision: nextRevision, savedAt: '2026-01-01T00:00:00.000Z' }));
  expect((await saving).ok).toBe(false);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const next = JSON.parse(fetchMock.mock.calls[1]![1].body);
  expect(next.expectedRevision).toBe(nextRevision);
  expect(Object.values(next.snapshot.mediaAssets)).toEqual([expect.objectContaining({ title: 'newest edit' })]);
  second.resolve(response({ ok: true, revision: `sha256:${'3'.repeat(64)}`, savedAt: '2026-01-01T00:00:01.000Z' }));
  await vi.waitFor(() => expect(model.localService.syncState).toBe('saved'));
});

it('makes conflicts terminal for autosave and never silently retries or loads remote state', async () => {
  const model = await dirtyModel(); await connectEmpty(model); const before = model.store.snapshot();
  const fetchMock = vi.fn(async () => response({ ok: false, error: 'Durable state changed. Reconnect and choose a state.' }, 409));
  vi.stubGlobal('fetch', fetchMock);
  expect((await saveModelToLocalService(model)).ok).toBe(false);
  expect(model.localService.syncState).toBe('conflict');
  setLocalServiceAutosave(model, true); persistIfLocalServiceAutosaveEnabled(model);
  expect((await saveModelToLocalService(model)).ok).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(model.store.snapshot()).toEqual(before);
  expect(model.localService.lastSavedAt).toBeNull();
});

it.each(['failure', 'missing-ack'])('does not claim durable completion for %s', async (kind) => {
  const model = await dirtyModel(); await connectEmpty(model); const before = model.store.snapshot();
  vi.stubGlobal('fetch', vi.fn(async () => kind === 'failure' ? response({ ok: false, error: 'SQLite save failed.' }, 500) : response({ ok: true })));
  expect((await saveModelToLocalService(model)).ok).toBe(false);
  expect(model.localService.status).toBe('error'); expect(model.localService.lastSavedAt).toBeNull();
  expect(model.store.snapshot()).toEqual(before);
});

it('revokes pending connect ownership on URL edit and on reconnect, including stale errors', async () => {
  const model = createAppModel(); const first = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/api/status') ? Promise.resolve(response({ config: {} })) : first.promise));
  const old = connectLocalService(model);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  setLocalServiceBaseUrl(model, 'http://new-service:5174');
  const current = { ...model.localService };
  first.resolve(response({ snapshot: (await dirtyModel()).store.snapshot(), revision }));
  expect((await old).ok).toBe(false); expect(model.currentMedia).toBeNull(); expect(model.localService).toEqual(current);
  const stale = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/api/status') ? Promise.resolve(response({ config: {} })) : stale.promise));
  const reconnecting = connectLocalService(model);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await connectEmpty(model); const final = { ...model.localService };
  stale.resolve(response({ ok: false, error: 'stale error' }, 500));
  expect((await reconnecting).ok).toBe(false); expect(model.localService).toEqual(final);
});

it('does not let a save acknowledgement or queued save mutate a reconnected owner', async () => {
  const model = await dirtyModel(); await connectEmpty(model);
  const waiting = deferred<Response>(); const fetchMock = vi.fn(() => waiting.promise); vi.stubGlobal('fetch', fetchMock);
  const saving = saveModelToLocalService(model); const queued = saveModelToLocalService(model);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await connectEmpty(model); const final = { ...model.localService };
  waiting.resolve(response({ ok: true, revision: `sha256:${'2'.repeat(64)}`, savedAt: '2026-01-01T00:00:00.000Z' }));
  expect((await saving).ok).toBe(false); expect((await queued).ok).toBe(false);
  expect(model.localService).toEqual(final); expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(['browser', 'service', 'cancel'] as const)('requires explicit %s choice and re-confirms edits made after comparison', async (choice) => {
  const model = await dirtyModel(); const remote = await dirtyModel(); remote.store.putMediaAsset({ ...remote.currentMedia!, title: 'remote' });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: remote.store.snapshot(), revision })));
  await connectLocalService(model); const prior = model.store.snapshot();
  expect((await saveModelToLocalService(model)).ok).toBe(false); expect(fetch).toHaveBeenCalledTimes(2);
  model.transcriptLifecycle.pendingCueEdits[model.cues[0]!.id] = 'pending form draft';
  if (choice !== 'cancel') {
    expect(resolveLocalServiceConnection(model, choice).ok).toBe(false);
    expect(model.store.snapshot()).toEqual(prior); expect(model.localService.lastMessage).toMatch(/Confirm.*again/);
  }
  resolveLocalServiceConnection(model, choice);
  expect(model.store.snapshot()).toEqual(choice === 'service' ? remote.store.snapshot() : prior);
  expect(model.localService.lastSavedAt).toBeNull();
  if (choice === 'service') expect(model.transcriptLifecycle.pendingCueEdits).toEqual({});
  else expect(Object.values(model.transcriptLifecycle.pendingCueEdits)).toEqual(['pending form draft']);
});

it('fences browser-handle restoration after a media-owner change during getFile', async () => {
  const model = await dirtyModel(); const waiting = deferred<File>();
  const handle = { name: 'synthetic.webm', getFile: vi.fn(() => waiting.promise) };
  vi.stubGlobal('lingotorteHandleStore', { open: async () => ({ get: async () => handle }) });
  const createURL = vi.fn(() => 'blob:stale'); vi.stubGlobal('URL', class extends URL { static createObjectURL = createURL; });
  const restoring = restoreBrowserMediaHandle(model);
  await vi.waitFor(() => expect(handle.getFile).toHaveBeenCalledTimes(1));
  model.currentMedia = { ...model.currentMedia!, title: 'new owner' };
  model.browserLocalMedia = { ...model.browserLocalMedia, sourceLabel: 'new context' }; const browser = model.browserLocalMedia;
  waiting.resolve(new File(['synthetic'], 'synthetic.webm'));
  expect(await restoring).toBe(false); expect(model.browserLocalMedia).toBe(browser); expect(createURL).not.toHaveBeenCalled();
});
