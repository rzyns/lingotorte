// lt-192.4 S9 / N27 (JSDOM unit evidence only): the derived playback source gates the stage. A browser-only asset
// whose bytes are stored on the server plays the server copy (no relink placeholder); a `managed:` label is never a
// src; a local object URL plays locally with no network request; missing bytes are honest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSDOM } from 'jsdom';
import { rerenderApp } from '../../apps/web/src/app';
import { mediaAssetNeedsRelink, mediaPlaybackUrl, needsMediaRelink } from '../../apps/web/src/model.ts';
import { playbackSource, MANAGED_BYTES_MISSING, MANAGED_PAIR, MANAGED_UNREACHABLE, MANAGED_NOT_STORED, PAIR_AGAIN_MEDIA, SERVER_COPY_MISSING_NOTE } from '../../apps/web/src/serverMedia.ts';
import { completeStorage, flush, installDom, json, noteStatus, PAGE_ORIGIN, sameOriginModel, scriptedFetch, empty } from './lt1924ClientFixture.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const SHA = 'a'.repeat(64);
let dom: JSDOM;
beforeEach(() => { dom = installDom(); });
afterEach(() => { vi.unstubAllGlobals(); dom.window.close(); });
const stageVideo = () => document.querySelector('.video-stage video') as HTMLVideoElement | null;
const relinkPlaceholder = () => document.querySelector('.video-placeholder-relink');
const serverMessage = () => document.querySelector('.server-media-message')?.textContent ?? null;

describe('lt-192.4 playbackSource (pure table, design §5.5)', () => {
  const base = { mediaId: ID, serverOrigin: PAGE_ORIGIN } as const;
  const rows: [string, Parameters<typeof playbackSource>[0], ReturnType<typeof playbackSource>][] = [
    ['object URL wins over everything', { ...base, objectUrl: 'blob:x', label: `managed:${SHA}`, storage: { state: 'complete', sizeBytes: 1, mimeType: 'video/webm' }, reach: 'paired' }, { kind: 'local', src: 'blob:x' }],
    ['complete + paired same-origin, blob label', { ...base, objectUrl: null, label: 'blob:old', storage: { state: 'complete', sizeBytes: 1, mimeType: 'video/webm' }, reach: 'paired' }, { kind: 'server', src: `${PAGE_ORIGIN}/api/media/${ID}/content` }],
    ['complete + paired, handle label', { ...base, objectUrl: null, label: 'browser-file-handle:a.webm', storage: { state: 'complete', sizeBytes: 1, mimeType: 'video/webm' }, reach: 'paired' }, { kind: 'server', src: `${PAGE_ORIGIN}/api/media/${ID}/content` }],
    ['complete + paired, managed label', { ...base, objectUrl: null, label: `managed:${SHA}`, storage: { state: 'complete', sizeBytes: 1, mimeType: 'video/webm' }, reach: 'paired' }, { kind: 'server', src: `${PAGE_ORIGIN}/api/media/${ID}/content` }],
    ['bytes-missing, blob label', { ...base, objectUrl: null, label: 'blob:old', storage: { state: 'bytes-missing' }, reach: 'paired' }, { kind: 'relink', note: SERVER_COPY_MISSING_NOTE }],
    ['bytes-missing, managed label', { ...base, objectUrl: null, label: `managed:${SHA}`, storage: { state: 'bytes-missing' }, reach: 'paired' }, { kind: 'message', text: MANAGED_BYTES_MISSING }],
    ['none, blob label', { ...base, objectUrl: null, label: 'blob:old', storage: { state: 'none' }, reach: 'paired' }, { kind: 'relink' }],
    ['unknown + unpaired, handle label', { mediaId: ID, objectUrl: null, label: 'browser-file-handle:a.webm', reach: 'unpaired' }, { kind: 'relink' }],
    ['none + paired, managed label', { ...base, objectUrl: null, label: `managed:${SHA}`, storage: { state: 'none' }, reach: 'paired' }, { kind: 'message', text: MANAGED_NOT_STORED }],
    ['unknown + unpaired, managed label', { mediaId: ID, objectUrl: null, label: `managed:${SHA}`, reach: 'unpaired' }, { kind: 'message', text: MANAGED_PAIR }],
    ['unknown + unreachable, managed label', { mediaId: ID, objectUrl: null, label: `managed:${SHA}`, reach: 'unreachable' }, { kind: 'message', text: MANAGED_UNREACHABLE }],
    ['server copy known, pairing lost, blob label', { mediaId: ID, objectUrl: null, label: 'blob:old', reach: 'unpaired', serverCopyKnown: true }, { kind: 'relink', note: PAIR_AGAIN_MEDIA }],
    ['server copy known, pairing lost, managed label', { mediaId: ID, objectUrl: null, label: `managed:${SHA}`, reach: 'unpaired', serverCopyKnown: true }, { kind: 'message', text: PAIR_AGAIN_MEDIA }],
    ['401 pairing lost, never-checked blob label', { mediaId: ID, objectUrl: null, label: 'blob:old', reach: 'unpaired', pairingLost: true }, { kind: 'relink', note: PAIR_AGAIN_MEDIA }],
    ['401 pairing lost but now unreachable, managed label', { mediaId: ID, objectUrl: null, label: `managed:${SHA}`, reach: 'unreachable', pairingLost: true }, { kind: 'message', text: MANAGED_UNREACHABLE }],
    ['complete but not paired never yields a server src', { mediaId: ID, objectUrl: null, label: `managed:${SHA}`, storage: { state: 'complete', sizeBytes: 1, mimeType: 'video/webm' }, reach: 'unpaired' }, { kind: 'message', text: MANAGED_PAIR }],
    ['path label stays a local src (today)', { mediaId: ID, objectUrl: null, label: 'fixtures/media/synthetic.webm', reach: 'unpaired' }, { kind: 'local', src: 'fixtures/media/synthetic.webm' }],
  ];
  it.each(rows)('%s', (_name, input, expected) => { expect(playbackSource(input)).toEqual(expected); });
  it('a managed: label is never a src in any row', () => {
    for (const [, input] of rows) { const out = playbackSource(input); if ('src' in out) expect(out.src.startsWith('managed:')).toBe(false); }
  });
});

describe('lt-192.4 stage gate (all three relink gates use the derived source)', () => {
  it('browser-only asset + M3 complete + same-origin: the server copy plays, no relink placeholder; the Library row for the current asset has no Relink', async () => {
    const { calls } = scriptedFetch((_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? completeStorage() : json(404, {}));
    const model = await sameOriginModel(dom);
    expect(needsMediaRelink(model)).toBe(true);
    await noteStatus(model, true);
    rerenderApp(model); await flush(); rerenderApp(model);
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual(['POST /api/media/session', `GET /api/media/${model.currentMedia!.id}/storage`]);
    expect(relinkPlaceholder()).toBeNull();
    expect(stageVideo()?.getAttribute('src')).toBe(`${PAGE_ORIGIN}/api/media/${model.currentMedia!.id}/content`);
    expect(needsMediaRelink(model)).toBe(false);
    expect(mediaAssetNeedsRelink(model, model.currentMedia!)).toBe(false);
    expect(stageVideo()?.hasAttribute('crossorigin')).toBe(false);
  });
  it('Library gate (browser-proof finding): after a reload the current asset row offers Open, not only Relink, once its server copy is confirmed', async () => {
    const { calls } = scriptedFetch((_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? completeStorage() : json(404, {}));
    const model = await sameOriginModel(dom);
    await noteStatus(model, true);
    const { setView } = await import('../../apps/web/src/model.ts');
    setView(model, 'library'); rerenderApp(model); await flush(); rerenderApp(model);
    expect(calls.filter(c => c.path.endsWith('/storage'))).toHaveLength(1);
    const labels = Array.from(document.querySelectorAll('.media-row-actions button')).map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual([`Open ${model.currentMedia!.title}`]);
  });
  it('Library gate for a non-current asset: a confirmed server copy drops Relink; unknown storage keeps it (no M3 per row)', async () => {
    const { calls } = scriptedFetch((_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? completeStorage() : json(404, {}));
    const model = await sameOriginModel(dom);
    await noteStatus(model, true);
    await flush();
    const asset = model.currentMedia!;
    const other = { ...asset, id: '22222222-2222-4222-8222-222222222222', title: 'other', originalPath: 'blob:other' };
    model.store.putMediaAsset(other);
    expect(mediaAssetNeedsRelink(model, other)).toBe(true);
    const before = calls.length;
    const { setView } = await import('../../apps/web/src/model.ts');
    setView(model, 'library'); rerenderApp(model); await flush();
    expect(calls.slice(before).filter(c => c.path.includes(other.id))).toEqual([]);
    const { serverMediaFacts } = await import('../../apps/web/src/serverMedia.ts');
    expect(serverMediaFacts(model).storage[asset.id]?.state).toBe('complete');
    // Make the other asset current, let the stage confirm it, then switch back: its row no longer needs Relink.
    model.currentMedia = other; rerenderApp(model); setView(model, 'player'); rerenderApp(model); await flush();
    model.currentMedia = asset;
    expect(mediaAssetNeedsRelink(model, other)).toBe(false);
  });
  it('a local object URL plays locally and makes no network request at all', async () => {
    const { calls } = scriptedFetch(() => completeStorage());
    const model = await sameOriginModel(dom, { keepObjectUrl: true });
    await noteStatus(model, true);
    calls.length = 0;
    rerenderApp(model); await flush(); rerenderApp(model);
    expect(calls).toEqual([]);
    expect(stageVideo()?.getAttribute('src')).toMatch(/^blob:/);
  });
  it('a managed: label with unknown or missing bytes renders an honest message and never assigns a src', async () => {
    scriptedFetch((_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? json(200, { ok: true, state: 'bytes-missing' }) : json(404, {}));
    const model = await sameOriginModel(dom, { label: `managed:${SHA}` });
    rerenderApp(model);
    expect(serverMessage()).toBe(MANAGED_PAIR);
    expect(stageVideo()).toBeNull(); expect(mediaPlaybackUrl(model)).toBe('');
    await noteStatus(model, true);
    rerenderApp(model); await flush(); rerenderApp(model);
    expect(serverMessage()).toBe(MANAGED_BYTES_MISSING);
    expect(stageVideo()).toBeNull();
    expect(document.body.innerHTML).not.toContain('managed:');
    expect(document.body.textContent).not.toMatch(/relink or choose another file/);
  });
  it('a browser-only asset whose server bytes are missing shows the relink placeholder with the precise note', async () => {
    scriptedFetch((_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? json(200, { ok: true, state: 'bytes-missing' }) : json(404, {}));
    const model = await sameOriginModel(dom);
    await noteStatus(model, true);
    rerenderApp(model); await flush(); rerenderApp(model);
    expect(relinkPlaceholder()).not.toBeNull();
    expect(document.querySelector('.server-media-note')?.textContent).toBe(SERVER_COPY_MISSING_NOTE);
    expect(stageVideo()).toBeNull();
  });
  it('native direct (cross-origin) or unavailable managed media keeps browser-local playback and sends no media request', async () => {
    for (const [origin, available] of [['http://127.0.0.1:5174', true], [PAGE_ORIGIN, false]] as const) {
      const { calls } = scriptedFetch(() => completeStorage());
      const model = await sameOriginModel(dom, { origin });
      await noteStatus(model, available);
      rerenderApp(model); await flush(); rerenderApp(model);
      expect(calls, `${origin} available=${available}`).toEqual([]);
      expect(relinkPlaceholder()).not.toBeNull();
    }
  });
  it('M3 runs once per media per pairing: a 404 or unreachable answer never loops', async () => {
    let unreachable = true;
    const { calls } = scriptedFetch((_method, path) => path === '/api/media/session' ? empty(204) : unreachable ? 'unreachable' : json(404, {}));
    const model = await sameOriginModel(dom);
    await noteStatus(model, true);
    for (let i = 0; i < 5; i++) { rerenderApp(model); await flush(); }
    expect(calls.filter(c => c.path.endsWith('/storage'))).toHaveLength(1);
    unreachable = false;
    await noteStatus(model, true);
    for (let i = 0; i < 5; i++) { rerenderApp(model); await flush(); }
    expect(calls.filter(c => c.path.endsWith('/storage'))).toHaveLength(2);
    expect(relinkPlaceholder()).not.toBeNull();
  });
});
