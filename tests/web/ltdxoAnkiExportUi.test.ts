// lt-dxo: Export to Anki UI — acknowledgement gating, .apkg needs the paired service, .txt content, data hooks.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedItem, SavedOccurrence } from '@lingotorte/domain';
import { buildAnkiExportPlan, buildAnkiTextExport } from '../../packages/domain/src';
import { createAppModel, pairLocalService } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { renderSettingsView } from '../../apps/web/src/views/settings';
import { requestAnkiPackage } from '../../apps/web/src/ankiExportClient';
import { SYNTHETIC_CAPABILITY, syntheticTransport } from './pairingFixture';

const ORIGIN = 'http://127.0.0.1:49997';
const repo = resolve(import.meta.dirname, '../..');
const input = JSON.parse(readFileSync(join(repo, 'tests/fixtures/anki/synthetic-anki-input.json'), 'utf8')) as { savedItems: SavedItem[]; savedOccurrences: SavedOccurrence[] };
let dom: JSDOM;
let blobs: Blob[] = [];
let downloads: string[] = [];

function setupDom() {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (v: string) => v },
  });
  blobs = []; downloads = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  dom.window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { downloads.push(this.download); };
}
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };
function model(paired: boolean) {
  const m = createAppModel();
  for (const item of input.savedItems) m.store.putSavedItem(item);
  for (const occ of input.savedOccurrences) m.store.putSavedOccurrence(occ);
  if (paired) pairLocalService(m, SYNTHETIC_CAPABILITY, ORIGIN);
  m.view = 'export-import';
  rerenderApp(m);
  return m;
}
const q = <T extends Element>(sel: string) => document.querySelector(sel) as T;
const btn = (kind: string) => q<HTMLButtonElement>(`[data-anki-export="${kind}"]`);
function acknowledge() { const ack = q<HTMLInputElement>('[data-anki-export-ack]'); ack.checked = true; ack.dispatchEvent(new dom.window.Event('change')); }

beforeEach(setupDom);
afterEach(() => { vi.restoreAllMocks(); });

describe('lt-dxo Export to Anki UI', () => {
  it('shows counts, privacy warnings and the dictionary notice; downloads stay disabled until acknowledged', () => {
    model(true);
    const group = q<HTMLElement>('[data-anki-export-group]');
    expect(group.querySelector('h3')!.textContent).toBe('Export to Anki');
    expect(q('[data-anki-export-counts]').textContent).toContain('4 notes • 6 cards');
    expect(q('[data-anki-export-counts]').textContent).toContain('1 archived items excluded');
    const text = group.textContent!;
    for (const s of ['unencrypted', 'AnkiWeb', 'never syncs', 'No media, audio, file names, timestamps or review history', 'source of truth', 'stable ID', 'CC BY-SA 4.0']) expect(text).toContain(s);
    expect(btn('apkg').disabled).toBe(true);
    expect(btn('txt').disabled).toBe(true);
    acknowledge();
    expect(btn('apkg').disabled).toBe(false);
    expect(btn('txt').disabled).toBe(false);
    expect(btn('apkg').textContent).toBe('Download Anki package (.apkg)');
  });

  it('disables .apkg without a paired service and points to the .txt; the .txt download matches the mapper', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    model(false);
    acknowledge();
    expect(btn('apkg').disabled).toBe(true);
    expect(q('[data-anki-export-reason]').textContent).toContain('Anki text file (.txt)');
    btn('txt').click();
    expect(downloads).toEqual(['lingotorte-anki.txt']);
    const plan = buildAnkiExportPlan(input.savedItems, input.savedOccurrences);
    expect(await blobs[0]!.text()).toBe(buildAnkiTextExport(plan.notes));
    expect(await blobs[0]!.text()).toBe(readFileSync(join(repo, 'tests/fixtures/anki/synthetic-anki-expected.txt'), 'utf8'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('downloads the .apkg bytes from the paired service and shows redacted errors in place', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(zip, { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
    model(true);
    acknowledge();
    btn('apkg').click();
    await flush();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${ORIGIN}/api/export/anki`);
    const sent = JSON.parse(String(init!.body));
    expect(Object.keys(sent)).toEqual(['notes']);
    expect(sent.notes).toHaveLength(4);
    expect(String(init!.body)).not.toContain('secret-name');
    expect(downloads).toEqual(['lingotorte.apkg']);
    expect(new Uint8Array(await blobs[0]!.arrayBuffer())).toEqual(zip);
    expect(q('[data-anki-export-done]').textContent).toContain('4 notes, 6 cards');

    fetchSpy.mockImplementation(async () => new Response(JSON.stringify({ ok: false, error: 'too-many-notes', detail: '/secret/path' }), { status: 400 }));
    btn('apkg').click();
    await flush();
    expect(q('[data-anki-export-error]').textContent).toContain('rejected the Anki export');
    expect(q('[data-anki-export-error]').textContent).not.toContain('secret');
  });

  it('client maps failures to typed results', async () => {
    const t = syntheticTransport();
    const notes = buildAnkiExportPlan(input.savedItems, input.savedOccurrences).notes;
    expect(await requestAnkiPackage(null, notes)).toEqual({ status: 'unavailable', reason: 'not-paired' });
    expect(await requestAnkiPackage(t, [])).toEqual({ status: 'error', code: 'invalid-request' });
    expect(await requestAnkiPackage(t, notes, vi.fn(async () => { throw new TypeError('x'); }))).toEqual({ status: 'unavailable', reason: 'service-unreachable' });
    expect(await requestAnkiPackage(t, notes, vi.fn(async () => new Response('<html>')))).toEqual({ status: 'error', code: 'invalid-response' });
    expect(await requestAnkiPackage(t, notes, vi.fn(async () => new Response('', { status: 500 })))).toEqual({ status: 'error', code: 'failed' });
  });

  it('settings no longer claims external export is disabled, but AnkiConnect still is', () => {
    const text = renderSettingsView(createAppModel()).textContent!;
    expect(text).not.toContain('AnkiConnect / external export: disabled');
    expect(text).toContain('AnkiConnect and AnkiWeb sync: disabled');
  });
});
