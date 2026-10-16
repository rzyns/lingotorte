// lt-e8z: learner word-analysis UI. Real modules, real in-process local service (Morfeusz SGJP), JSDOM.
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cue } from '@lingotorte/domain';
import { createAppModel, importFixtureMediaAndSubtitles, pairLocalService } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { analyseCueMorphology, morphologyPanelState } from '../../apps/web/src/morphologyPanel';
import { startLingotorteLocalService, type LocalServiceRuntime } from '../../apps/local-service/src/server';
import { withNoNetwork } from '../no-network/networkTrap';
import { SYNTHETIC_CAPABILITY } from './pairingFixture';

type Model = ReturnType<typeof createAppModel>;

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, File: dom.window.File,
    Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, KeyboardEvent: dom.window.KeyboardEvent,
    requestAnimationFrame: () => 0,
  });
  return dom;
}

function cue(text: string, id = '00000000-0000-4000-8000-0000000000e8'): Cue {
  return { id, trackId: 't', cueIndex: 1, startMs: 0, endMs: 1000, text } as unknown as Cue;
}

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };
const tokens = (m: Model) => morphologyPanelState(m).current!.tokens;
const tok = (m: Model, surface: string) => tokens(m).find(t => t.surface === surface)!;
const panel = () => document.querySelector('.morphology-panel') as HTMLElement;

describe('lt-e8z morphology UI', () => {
  let dom: JSDOM;
  const cleanups: (() => Promise<void>)[] = [];
  beforeEach(() => { dom = setupDom(); });
  afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); vi.restoreAllMocks(); dom.window.close(); });

  async function pairedRealService(runtime: LocalServiceRuntime = {}) {
    const root = await mkdtemp(join(tmpdir(), 'lt-e8z-'));
    let capability = '';
    const service = await startLingotorteLocalService({ host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'),
      scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false },
    { ...runtime, receiveCapability(v) { capability = v; } });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
    const model = createAppModel();
    pairLocalService(model, capability, service.origin);
    return { model, service };
  }

  it('Polish quality fixtures through the real service: lemma, POS, ambiguity, unknown, particles, imperative, punctuation', async () => {
    const { model, service } = await pairedRealService();
    const spy = vi.spyOn(globalThis, 'fetch');
    await analyseCueMorphology(model, cue('Mamy kotem Książki, się nie zażółć xqzvbrt!'), null, () => rerenderApp(model));
    const view = morphologyPanelState(model).current!;
    expect(view.source).toBe('service');
    expect(view.fallbackReason).toBeNull();
    // Only the loopback morphology route, words only (punctuation never requested).
    // lt-foe.3.4: the selected word's gloss lookup also goes to the paired service; morphology is one request.
    const morphCalls = spy.mock.calls.filter(c => String(c[0]).endsWith('/api/language/morphology'));
    expect(morphCalls).toHaveLength(1);
    expect(spy.mock.calls.every(c => [`${service.origin}/api/language/morphology`, `${service.origin}/api/language/gloss`].includes(String(c[0])))).toBe(true);
    expect(String(spy.mock.calls[0]![0])).toBe(`${service.origin}/api/language/morphology`);
    expect(JSON.parse(String(spy.mock.calls[0]![1]!.body))).toEqual({ language: 'pl', tokens: ['Mamy', 'kotem', 'Książki', 'się', 'nie', 'zażółć', 'xqzvbrt'] });
    expect(tok(model, 'kotem')).toMatchObject({ lemma: 'kot', upos: 'NOUN', source: 'service' });
    expect(tok(model, 'Mamy')).toMatchObject({ quality: 'ambiguous' });
    expect([tok(model, 'Mamy').lemma, ...tok(model, 'Mamy').alternatives.map(a => a.lemma)]).toEqual(expect.arrayContaining(['mieć', 'mama']));
    expect(tok(model, 'Książki')).toMatchObject({ lemma: 'książka', upos: 'NOUN' });
    expect(tok(model, 'się')).toMatchObject({ upos: 'PART' });
    expect(tok(model, 'nie')).toMatchObject({ upos: 'PART' });
    expect(tok(model, 'się').quality).not.toMatch(/unknown|ambiguous/);
    expect(tok(model, 'zażółć')).toMatchObject({ lemma: 'zażółcić', upos: 'VERB' });
    expect(tok(model, 'zażółć').morph).toEqual(expect.arrayContaining([{ key: 'Mood', value: 'Imp' }]));
    expect(tok(model, 'xqzvbrt').quality).toBe('unknown');
    expect(tok(model, ',')).toMatchObject({ isWord: false, quality: 'punctuation' });
    for (const t of tokens(model)) expect(t.upos).not.toBe('PROPN');

    rerenderApp(model);
    const text = panel().textContent!;
    expect(text).toContain('Source: Local morphology (Morfeusz)');
    // lt-foe.3.4: meanings state is explicit per word (this service has no gloss DB installed).
    await flush();
    expect(document.querySelector('#morphology-meanings')!.getAttribute('data-meanings-state')).toMatch(/^(not-installed|loading)$/);
    expect(text).not.toMatch(/\d+\s*%|0\.\d\d/);
    // Ambiguous: warning + alternatives, keyboard-focusable.
    const mamyBtn = panel().querySelector<HTMLButtonElement>('button[data-token-index="0"]')!;
    expect(mamyBtn.getAttribute('aria-label')).toContain('several readings');
    mamyBtn.click();
    const detail = document.getElementById('morphology-detail')!;
    expect(document.activeElement).toBe(detail);
    expect(detail.textContent).toContain('Several readings, check');
    expect(detail.textContent).toContain('Other possible readings:');
    expect(detail.textContent).toMatch(/mama \(noun\)|mieć \(verb\)/);
    // Alternatives are plain list items (no action), reachable by screen readers without being tab stops.
    expect(detail.querySelectorAll('.morphology-alternatives li').length).toBeGreaterThan(0);
    expect([...detail.querySelectorAll('.morphology-alternatives li')].every(li => !li.hasAttribute('tabindex'))).toBe(true);
    // Unknown.
    panel().querySelector<HTMLButtonElement>(`button[data-token-index="${tok(model, 'xqzvbrt').tokenIndex}"]`)!.click();
    expect(document.getElementById('morphology-detail')!.textContent).toContain('Not in local dictionary');
    // Imperative readable.
    panel().querySelector<HTMLButtonElement>(`button[data-token-index="${tok(model, 'zażółć').tokenIndex}"]`)!.click();
    expect(document.getElementById('morphology-detail')!.textContent).toContain('mood: imperative');
    // Punctuation shown as punctuation, not a button.
    expect(panel().querySelector('.morphology-token-punct')!.getAttribute('aria-label')).toContain('punctuation, not analysed');
  });

  it('caches per cue (second analysis makes no request) and invalidates on media/track change', async () => {
    const { model } = await pairedRealService();
    const c = cue('Kobieta czyta.');
    await analyseCueMorphology(model, c);
    const spy = vi.spyOn(globalThis, 'fetch');
    await analyseCueMorphology(model, c);
    expect(spy).not.toHaveBeenCalled();
    model.targetTrackId = 'another-track';
    expect(morphologyPanelState(model).current).toBeNull();
    await analyseCueMorphology(model, c);
    expect(spy.mock.calls.filter(call => String(call[0]).endsWith('/api/language/morphology'))).toHaveLength(1);
  });

  it('ignores a stale response after the learner moves to another cue', async () => {
    const { model } = await pairedRealService();
    const first = analyseCueMorphology(model, cue('Kobieta czyta.', '00000000-0000-4000-8000-000000000001'));
    const second = analyseCueMorphology(model, cue('Mamy kota.', '00000000-0000-4000-8000-000000000002'));
    await Promise.all([first, second]);
    expect(morphologyPanelState(model).current!.cueId).toBe('00000000-0000-4000-8000-000000000002');
    // Also stale across a track change mid-flight.
    const late = analyseCueMorphology(model, cue('Kobieta.', '00000000-0000-4000-8000-000000000003'));
    model.targetTrackId = 'switched';
    await late;
    expect(morphologyPanelState(model).current).toBeNull();
  });

  it('not paired: browser estimate with label and status, and zero network (provider off)', async () => {
    const { value: model, networkAttempts } = await withNoNetwork(async () => {
      const m = createAppModel();
      await analyseCueMorphology(m, cue('Uczymy się z własnych napisów, xqzvbrt.'));
      rerenderApp(m);
      return m;
    });
    expect(networkAttempts).toEqual([]);
    expect(model.providerPolicy.onlineProvidersEnabled).toBe(false);
    const view = morphologyPanelState(model).current!;
    expect(view).toMatchObject({ source: 'browser', fallbackReason: 'not-paired' });
    expect(tok(model, 'Uczymy')).toMatchObject({ lemma: 'uczyć', quality: 'estimate', source: 'browser' });
    expect(tok(model, 'xqzvbrt').quality).toBe('no-estimate');
    const text = panel().textContent!;
    expect(text).toContain('Source: Browser estimate');
    expect(text).toContain('Local morphology unavailable (local service not paired), showing browser estimate.');
    expect(document.querySelector('#morphology-meanings')!.getAttribute('data-meanings-state')).toBe('not-paired');
    expect(text).toContain('Meanings need the local service (pair in Settings).');
    expect(document.getElementById('morphology-status')!.getAttribute('aria-live')).toBe('polite');
  });

  const fallbackRows: [string, (origin: string) => typeof fetch, string, string][] = [
    ['service-unreachable', () => (async () => { throw new TypeError('ECONNREFUSED'); }) as typeof fetch, 'service-unreachable', 'local service not reachable'],
    ['unavailable/disabled', () => (async () => Response.json({ status: 'unavailable', reason: 'disabled' })) as typeof fetch, 'disabled', 'turned off'],
    ['unavailable/adapter-load-failed', () => (async () => Response.json({ status: 'unavailable', reason: 'adapter-load-failed' })) as typeof fetch, 'adapter-load-failed', 'dictionary did not load'],
    ['error/analysis-failed', () => (async () => Response.json({ status: 'error', code: 'analysis-failed' })) as typeof fetch, 'analysis-failed', 'hit an error'],
    ['rejected (500)', () => (async () => new Response('{}', { status: 500 })) as typeof fetch, 'rejected', 'refused'],
    ['invalid-response', () => (async () => Response.json({ status: 'available', analyses: [{ tokenIndex: 0, lemma: 'x', upos: 'X', confidence: { kind: 'sure', value: 2 } }], warnings: ['free text'] })) as typeof fetch, 'invalid-response', 'unexpected answer'],
    ['old service (404)', () => (async () => new Response('', { status: 404 })) as typeof fetch, 'service-unreachable', 'not reachable'],
    ['401 → not-paired', () => (async () => new Response('', { status: 401 })) as typeof fetch, 'not-paired', 'not paired'],
  ];
  for (const [name, makeFetch, reason, phrase] of fallbackRows) {
    it(`falls back to the browser estimate on ${name}`, async () => {
      const model = createAppModel();
      pairLocalService(model, SYNTHETIC_CAPABILITY, 'http://127.0.0.1:49999');
      const fake = vi.fn(makeFetch('http://127.0.0.1:49999'));
      vi.spyOn(globalThis, 'fetch').mockImplementation(fake);
      await analyseCueMorphology(model, cue('Uczymy się.'));
      rerenderApp(model);
      expect(fake).toHaveBeenCalledTimes(1);
      expect(String(fake.mock.calls[0]![0])).toBe('http://127.0.0.1:49999/api/language/morphology');
      expect(morphologyPanelState(model).current).toMatchObject({ source: 'browser', fallbackReason: reason });
      const status = document.getElementById('morphology-status')!.textContent!;
      expect(status).toContain(phrase);
      expect(status).toContain('showing browser estimate');
      expect(panel().textContent).toContain('Source: Browser estimate');
      expect(panel().querySelectorAll('button.morphology-token').length).toBe(2);
    });
  }

  it('real service with morphology disabled falls back with the disabled status', async () => {
    const { model } = await pairedRealService({ morphology: { mode: 'disabled' } });
    await analyseCueMorphology(model, cue('Kobieta czyta.'));
    expect(morphologyPanelState(model).current).toMatchObject({ source: 'browser', fallbackReason: 'disabled' });
  });

  it('keyboard: the cue "Analyse words" button and token buttons are native buttons; Enter on a cue row is not hijacked', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    rerenderApp(model);
    expect(panel().querySelector('h3')!.textContent).toBe('Word analysis');
    expect(document.getElementById('morphology-status')!.textContent).toContain('Analyse words');
    const analyse = document.querySelector<HTMLButtonElement>('button.analyse-words')!;
    expect(analyse.getAttribute('aria-label')).toMatch(/^Analyse word grammar for line at/);
    const seekBefore = model.player.activeCueId;
    analyse.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(model.player.activeCueId).toBe(seekBefore);
    analyse.focus();
    const analyseId = analyse.id;
    expect(analyseId).toMatch(/^analyse-words-/);
    expect(analyse.getAttribute('aria-controls')).toBe('morphology-panel');
    expect(document.getElementById('morphology-panel')).not.toBeNull();
    analyse.click(); // what a native button does for Enter/Space
    await flush();
    // Review B1: keyboard focus stays on the (re-rendered) Analyse words button, not the page body.
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).id).toBe(analyseId);
    expect(morphologyPanelState(model).current?.source).toBe('browser');
    const first = panel().querySelector<HTMLButtonElement>('button.morphology-token')!;
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('morphology-detail')!.textContent).toContain('Browser estimate, lower quality');
  });

  it('no-result: a cue with only punctuation keeps a visible status, not a blank panel', async () => {
    const model = createAppModel();
    await analyseCueMorphology(model, cue('… !'));
    rerenderApp(model);
    expect(document.getElementById('morphology-status')!.textContent!.length).toBeGreaterThan(10);
    expect(document.getElementById('morphology-detail')!.textContent).toContain('No word selected.');
  });
});
