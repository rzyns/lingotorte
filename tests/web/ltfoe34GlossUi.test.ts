// lt-foe.3.4: meanings in the word-analysis panel, Meaning pre-fill, Settings credits, export attribution.
// JSDOM with a fake paired transport (fetch stub) returning contract-shaped morphology and gloss JSON.
import { JSDOM } from 'jsdom';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCue, makeMediaAsset, makeSubtitleTrack, validateLearnerExportManifest, type Cue } from '@lingotorte/domain';
import { DICTIONARY_ATTRIBUTION } from '../../packages/domain/src/exportManifest';
import { GLOSS_ATTRIBUTION } from '../../packages/language/src/glossStore';
import { createAppModel, exportLearnerState, pairLocalService, readGlossCapability, saveSelectionWithReceipt, setLocalServiceBaseUrl, setPendingMeaning } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { analyseCueMorphology, morphologyPanelState, orderSenses, suggestionText } from '../../apps/web/src/morphologyPanel';
import { openCapture } from '../../apps/web/src/ui/capture';
import { renderSettingsView } from '../../apps/web/src/views/settings';
import { SYNTHETIC_CAPABILITY } from './pairingFixture';

const ORIGIN = 'http://127.0.0.1:49998';
const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
const SOURCE = { id: 'kaikki-enwiktionary-pl-2026-10-03', name: 'Wiktionary', licence: 'CC BY-SA 4.0 and GFDL', url: 'https://kaikki.org/dictionary/Polish/', attribution: GLOSS_ATTRIBUTION, dumpDate: '2026-10-03' };
const sense = (gloss: string, pos = 'noun', upos: string | null = 'NOUN') => ({ gloss, pos, upos, tags: [] as string[] });

type Morph = { lemma: string; upos: string; alternatives?: { lemma: string; upos: string }[]; unknown?: boolean };
const MORPH: Record<string, Morph> = {
  domu: { lemma: 'domu', upos: 'NOUN' },
  Mamy: { lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'mama', upos: 'NOUN' }] },
  w: { lemma: 'w', upos: 'ADP' },
  Cześć: { lemma: 'cześć', upos: 'NOUN', alternatives: [{ lemma: 'cześć', upos: 'INTJ' }] },
  synthfoa: { lemma: 'synthfoa', upos: 'NOUN' },
  xqz: { lemma: 'xqz', upos: 'X', unknown: true },
  kot: { lemma: 'kot', upos: 'NOUN' },
  pies: { lemma: 'pies', upos: 'NOUN' },
};
const notFound = (lemma: string) => ({ queryIndex: 0, found: false, via: null, lemma, upos: null, senses: [], otherReadings: [] });
const GLOSS: Record<string, unknown> = {
  domu: { queryIndex: 0, found: true, via: 'form-of', lemma: 'dom', upos: 'NOUN', formOf: 'domu', senses: [sense('house'), sense('home')], otherReadings: [] },
  'mieć': { queryIndex: 0, found: true, via: 'alternative', hop: 'lemma', lemma: 'mama', upos: 'NOUN', senses: [sense('mum, mom (mother)')], otherReadings: [] },
  w: { queryIndex: 0, found: true, via: 'lemma', lemma: 'w', upos: 'ADP', senses: [sense('The twenty-ninth letter of the Polish alphabet', 'character', null), sense('in, inside', 'prep', 'ADP'), sense('at', 'prep', 'ADP')], otherReadings: [] },
  'cześć': { queryIndex: 0, found: true, via: 'lemma', lemma: 'cześć', upos: 'NOUN', senses: [sense('reverence, honor')],
    otherReadings: [{ lemma: 'cześć', upos: 'INTJ', hop: 'form-of-text', senses: [sense('Form of greeting; hi; hello; bye', 'intj', 'INTJ')] }] },
  synthfoa: { queryIndex: 0, found: true, via: 'form-of-text', lemma: 'synthfoa', upos: 'NOUN', senses: [sense('genitive plural of synthfoo')], otherReadings: [] },
  kot: { queryIndex: 0, found: true, via: 'lemma', lemma: 'kot', upos: 'NOUN', senses: [sense('cat (domestic animal (Felis catus))  ;  tomcat')], otherReadings: [] },
  pies: { queryIndex: 0, found: true, via: 'lemma', lemma: 'pies', upos: 'NOUN', senses: [sense('dog')], otherReadings: [] },
};

type GlossMode = 'normal' | 'not-installed' | 'disabled' | 'invalid-dictionary' | 'unsupported-language' | 'unreachable' | 'rejected' | 'invalid-response' | 'error' | 'unpairs';
let dom: JSDOM;
let glossMode: GlossMode = 'normal';
let glossBodies: unknown[] = [];
let morphBodies: unknown[] = [];
let glossGate: Promise<void> | null = null;

function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const body = JSON.parse(String(init?.body ?? '{}'));
  if (url === `${ORIGIN}/api/language/morphology`) {
    morphBodies.push(body);
    return Promise.resolve(Response.json({ status: 'available', warnings: [], analyses: (body.tokens as string[]).map((t, i) => {
      const m = MORPH[t] ?? { lemma: t.toLowerCase(), upos: 'X', unknown: true };
      return { tokenIndex: i, lemma: m.lemma, upos: m.upos, morph: [], confidence: { kind: 'certain', value: 1 }, ambiguous: !!m.alternatives?.length, unknown: !!m.unknown, alternatives: m.alternatives ?? [] };
    }) }));
  }
  if (url === `${ORIGIN}/api/language/gloss`) {
    glossBodies.push(body);
    const lemma = body.queries[0].lemma as string;
    const respond = async (): Promise<Response> => {
      if (glossGate) await glossGate;
      switch (glossMode) {
        case 'unreachable': throw new TypeError('ECONNREFUSED');
        case 'rejected': return new Response('{}', { status: 500 });
        case 'invalid-response': return Response.json({ status: 'available', results: [] });
        case 'error': return Response.json({ status: 'error', code: 'lookup-failed' });
        case 'unpairs': return new Response('', { status: 401 });
        case 'normal': return Response.json({ status: 'available', source: SOURCE, results: [GLOSS[lemma] ?? notFound(lemma)] });
        default: return Response.json({ status: 'unavailable', reason: glossMode });
      }
    };
    return respond();
  }
  return Promise.reject(new Error(`unexpected fetch ${url}`));
}

function setupDom() {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File,
    Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, KeyboardEvent: dom.window.KeyboardEvent,
    requestAnimationFrame: () => 0, CSS: { escape: (v: string) => v },
  });
}

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };

function installModel(texts: string[], paired = true) {
  const model = createAppModel();
  model.clock = () => new Date('2030-01-01T00:00:00.000Z');
  const asset = makeMediaAsset({ title: 'Foe', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 8000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: 'approved' });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const cues = texts.map((text, i) => makeCue({ trackId: track.id, cueIndex: i, startMs: i * 4000, endMs: i * 4000 + 3000, text, normalizedText: text, textSha256: sha }));
  for (const c of cues) model.store.putCue(c);
  model.cues = cues;
  if (paired) pairLocalService(model, SYNTHETIC_CAPABILITY, ORIGIN);
  return { model, cues };
}
type Model = ReturnType<typeof createAppModel>;

const meanings = () => document.querySelector('#morphology-meanings') as HTMLElement;
const meaningsState = () => meanings()?.getAttribute('data-meanings-state');
async function analyse(model: Model, cue: Cue, tokenIndex: number | null = null) {
  await analyseCueMorphology(model, cue, tokenIndex, () => rerenderApp(model));
  await flush();
  rerenderApp(model);
}
function lexeme(cue: Cue, word: string) {
  const charStart = cue.text.indexOf(word);
  const tokenStart = cue.text.slice(0, charStart).split(/\s+/).filter(Boolean).length;
  return { kind: 'lexeme' as const, text: word, cueId: cue.id, tokenStart, tokenEnd: tokenStart + 1, charStart, charEnd: charStart + word.length };
}

beforeEach(() => {
  setupDom();
  glossMode = 'normal'; glossBodies = []; morphBodies = []; glossGate = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(fakeFetch as typeof fetch);
});
afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

describe('lt-foe.3.4 meanings in the word-analysis panel', () => {
  it('form-of: senses list, Wiktionary source label, "from dom" with domu → dom; heading is "Word analysis"', async () => {
    const { model, cues } = installModel(['domu']);
    await analyse(model, cues[0]!);
    expect(document.querySelector('#morphology-heading')!.textContent).toBe('Word analysis');
    expect(meaningsState()).toBe('available');
    expect(glossBodies).toEqual([{ language: 'pl', queries: [{ lemma: 'domu', upos: 'NOUN' }] }]);
    const text = meanings().textContent!;
    expect(text).toContain('Source: Wiktionary (CC BY-SA)');
    expect(text).toContain('from dom (domu → dom)');
    expect([...meanings().querySelectorAll('ul.morphology-meanings-list li')].map(li => li.textContent)).toEqual(['house', 'home']);
    expect(meanings().querySelector('h5')!.id).toBe('morphology-meanings-heading');
    expect(meanings().querySelector('ul')!.getAttribute('aria-labelledby')).toBe('morphology-meanings-heading');
  });

  it('alternative: Morfeusz alternatives are sent and the result reads "read as mama (noun)"', async () => {
    const { model, cues } = installModel(['Mamy']);
    await analyse(model, cues[0]!);
    expect(glossBodies[0]).toEqual({ language: 'pl', queries: [{ lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'mama', upos: 'NOUN' }] }] });
    expect(meanings().textContent).toContain('read as mama (noun)');
    expect(meanings().textContent).toContain('mum, mom (mother)');
  });

  it('form-of-text senses are labelled "(grammar note)", including other readings', async () => {
    const { model, cues } = installModel(['synthfoa Cześć']);
    await analyse(model, cues[0]!, 0);
    expect(meanings().textContent).toContain('(grammar note)');
    await analyse(model, cues[0]!, 1);
    const others = [...meanings().querySelectorAll('ul.morphology-other-readings li')].map(li => li.textContent);
    expect(meanings().textContent).toContain('Other readings');
    expect(others).toEqual(['cześć (interjection) (grammar note): Form of greeting; hi; hello; bye']);
    expect(meanings().querySelector('.morphology-meanings-via')).toBeNull();
  });

  it("character senses go last ('w' shows the preposition first)", async () => {
    const { model, cues } = installModel(['w']);
    await analyse(model, cues[0]!);
    expect([...meanings().querySelectorAll('ul.morphology-meanings-list li')].map(li => li.textContent))
      .toEqual(['in, inside', 'at', 'The twenty-ninth letter of the Polish alphabet']);
    expect(orderSenses([sense('a', 'character'), sense('b')]).map(s => s.gloss)).toEqual(['b', 'a']);
  });

  it('available but no entry: No dictionary entry for “surface”', async () => {
    const { model, cues } = installModel(['xqz']);
    await analyse(model, cues[0]!);
    expect(meaningsState()).toBe('no-entry');
    expect(meanings().textContent).toContain('No dictionary entry for “xqz”.');
  });

  const rows: [GlossMode, string, string][] = [
    ['not-installed', 'not-installed', 'No dictionary is installed in the local service.'],
    ['disabled', 'disabled', 'Dictionary lookups are turned off in the local service.'],
    ['invalid-dictionary', 'invalid', 'The installed dictionary could not be read.'],
    ['unsupported-language', 'unsupported', 'The local dictionary does not support this language.'],
    ['unreachable', 'unavailable', 'Meanings are unavailable right now.'],
    ['rejected', 'unavailable', 'Meanings are unavailable right now.'],
    ['invalid-response', 'unavailable', 'Meanings are unavailable right now.'],
    ['error', 'unavailable', 'Meanings are unavailable right now.'],
    ['unpairs', 'not-paired', 'Meanings need the local service (pair in Settings).'],
  ];
  for (const [mode, state, text] of rows) {
    it(`gloss ${mode} → data-meanings-state=${state}`, async () => {
      glossMode = mode;
      const { model, cues } = installModel(['domu']);
      await analyse(model, cues[0]!);
      expect(meaningsState()).toBe(state);
      expect(meanings().querySelector('.morphology-meanings-status')!.textContent).toBe(text);
      // The grammar part of the panel still renders.
      expect(document.querySelector('#morphology-detail')!.textContent).toContain('Base form');
    });
  }

  it('browser-estimate fallback (not paired): not-paired text and no gloss call', async () => {
    const { model, cues } = installModel(['domu'], false);
    await analyse(model, cues[0]!);
    expect(morphologyPanelState(model).current!.source).toBe('browser');
    expect(meaningsState()).toBe('not-paired');
    expect(meanings().textContent).toContain('Meanings need the local service (pair in Settings).');
    expect(glossBodies).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('caches per cue/token/origin: re-selecting the word makes no second gloss call', async () => {
    const { model, cues } = installModel(['domu kot']);
    await analyse(model, cues[0]!, 0);
    await analyse(model, cues[0]!, 1);
    await analyse(model, cues[0]!, 0);
    expect(glossBodies.map(b => (b as { queries: { lemma: string }[] }).queries[0]!.lemma)).toEqual(['domu', 'kot']);
    expect(meanings().textContent).toContain('house');
  });

  it('a stale gloss response is dropped after a track change', async () => {
    const { model, cues } = installModel(['domu']);
    let release!: () => void;
    glossGate = new Promise(r => { release = r; });
    const pending = analyseCueMorphology(model, cues[0]!, null, () => rerenderApp(model));
    await flush();
    expect(meaningsState()).toBe('loading');
    model.targetTrackId = 'switched';
    release();
    await pending; await flush();
    expect(morphologyPanelState(model).current).toBeNull();
    rerenderApp(model);
    expect(meanings()).toBeNull();
  });

  it('the panel does not steal focus when a gloss answer arrives', async () => {
    const { model, cues } = installModel(['domu']);
    rerenderApp(model);
    const analyseBtn = document.querySelector<HTMLButtonElement>('button.analyse-words')!;
    analyseBtn.focus();
    await analyseCueMorphology(model, cues[0]!, null, () => rerenderApp(model));
    await flush();
    expect(meaningsState()).toBe('available');
    expect(document.activeElement?.id).toBe(analyseBtn.id);
  });

  it('review: Meanings heading is one level below the detail heading (h4 → h5)', async () => {
    const { model, cues } = installModel(['domu']);
    await analyse(model, cues[0]!);
    const detailHeading = document.querySelector('#morphology-detail h4')!;
    expect(detailHeading).not.toBeNull();
    expect(meanings().querySelector('#morphology-meanings-heading')!.tagName).toBe('H5');
  });

  it('review: only one live region in the panel; per-state text is not a second role=status', async () => {
    glossMode = 'not-installed';
    const { model, cues } = installModel(['domu']);
    await analyse(model, cues[0]!);
    expect(meaningsState()).toBe('not-installed');
    const panel = document.querySelector('#morphology-detail')!.closest('section')!;
    expect(panel.querySelectorAll('[role="status"], [aria-live]').length).toBe(1);
    expect(meanings().querySelector('.morphology-meanings-status')!.hasAttribute('role')).toBe(false);
  });
});

describe('lt-foe.3.4 Meaning pre-fill', () => {
  it('suggestion text: parentheticals removed, whitespace collapsed, cut at ; when long, capped at 120', () => {
    expect(suggestionText('cat (domestic animal (Felis catus))  ;  tomcat')).toBe('cat; tomcat');
    const long = 'a fairly long first meaning that keeps going beyond sixty chars; second part';
    expect(suggestionText(long)).toBe('a fairly long first meaning that keeps going beyond sixty chars');
    expect([...suggestionText('x'.repeat(300))].length).toBeLessThanOrEqual(120);
  });

  it('word capture pre-fills from the panel cache, shows the hint, and saves as dictionary-suggested', async () => {
    const { model, cues } = installModel(['pies']);
    await analyse(model, cues[0]!);
    const before = glossBodies.length;
    expect(openCapture(model, lexeme(cues[0]!, 'pies'))).toBe(true);
    await flush();
    expect(glossBodies.length).toBe(before);
    expect(model.pendingMeaning).toBe('dog');
    expect(model.pendingMeaningSuggestion).toEqual({ text: 'dog', source: { kind: 'dictionary-suggested', glossSourceId: SOURCE.id, dumpDate: '2026-10-03' } });
    const input = document.querySelector<HTMLInputElement>('#selection-meaning')!;
    expect(input.value).toBe('dog');
    const hint = document.querySelector<HTMLElement>('#selection-meaning-hint')!;
    expect(hint.textContent).toBe('Suggested from Wiktionary — edit freely.');
    expect(hint.hidden).toBe(false);
    const receipt = (await saveSelectionWithReceipt(model))!;
    expect(model.store.getSavedItem(receipt.item!.id)).toMatchObject({ meaning: 'dog', meaningSource: { kind: 'dictionary-suggested', glossSourceId: SOURCE.id, dumpDate: '2026-10-03' } });
  });

  it('fetches morphology + gloss when the cue was not analysed, without blocking opening', async () => {
    const { model, cues } = installModel(['ma kot']);
    expect(openCapture(model, lexeme(cues[0]!, 'kot'))).toBe(true);
    expect(model.pendingMeaning).toBe('');
    await flush();
    expect(morphBodies).toEqual([{ language: 'pl', tokens: ['kot'] }]);
    expect(model.pendingMeaning).toBe('cat; tomcat');
  });

  it('edited suggestion hides the hint and saves as learner', async () => {
    const { model, cues } = installModel(['pies']);
    openCapture(model, lexeme(cues[0]!, 'pies'));
    await flush();
    const input = document.querySelector<HTMLInputElement>('#selection-meaning')!;
    input.value = 'doggy';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(document.querySelector<HTMLElement>('#selection-meaning-hint')!.hidden).toBe(true);
    const receipt = (await saveSelectionWithReceipt(model))!;
    expect(model.store.getSavedItem(receipt.item!.id)).toMatchObject({ meaning: 'doggy', meaningSource: { kind: 'learner' } });
  });

  it('never pre-fills phrase or sentence selections', async () => {
    const { model, cues } = installModel(['pies kot']);
    const c = cues[0]!;
    openCapture(model, { kind: 'phrase', text: 'pies kot', cueId: c.id, tokenStart: 0, tokenEnd: 2, charStart: 0, charEnd: 8 });
    await flush();
    expect(model.pendingMeaning).toBe('');
    openCapture(model, { kind: 'sentence', text: 'pies kot', cueId: c.id, tokenStart: 0, tokenEnd: 2, charStart: 0, charEnd: 8 });
    await flush();
    expect(model.pendingMeaning).toBe('');
    expect(glossBodies).toEqual([]);
    expect(document.querySelector<HTMLElement>('#selection-meaning-hint')!.hidden).toBe(true);
  });

  it('does not overwrite once the learner typed, or after the selection changed', async () => {
    const { model, cues } = installModel(['pies kot']);
    let release!: () => void;
    glossGate = new Promise(r => { release = r; });
    openCapture(model, lexeme(cues[0]!, 'pies'));
    setPendingMeaning(model, 'my own');
    release(); await flush();
    expect(model.pendingMeaning).toBe('my own');
    expect(model.pendingMeaningSuggestion).toBeNull();

    glossGate = new Promise(r => { release = r; });
    openCapture(model, lexeme(cues[0]!, 'kot'));
    model.selection = { ...model.selection! };
    release(); await flush();
    expect(model.pendingMeaning).toBe('');
  });

  it('review: capture opened while the panel lookup is in flight still pre-fills (awaits the shared request)', async () => {
    const { model, cues } = installModel(['pies']);
    let release!: () => void;
    glossGate = new Promise(r => { release = r; });
    const pending = analyseCueMorphology(model, cues[0]!, null, () => rerenderApp(model));
    await flush();
    expect(meaningsState()).toBe('loading');
    expect(openCapture(model, lexeme(cues[0]!, 'pies'))).toBe(true);
    await flush();
    expect(model.pendingMeaning).toBe('');
    release();
    await pending; await flush();
    expect(glossBodies.length).toBe(1);
    expect(model.pendingMeaning).toBe('dog');
    expect(model.pendingMeaningSuggestion?.source.kind).toBe('dictionary-suggested');
  });

  it('review: in-flight shared lookup still respects learner typing', async () => {
    const { model, cues } = installModel(['pies']);
    let release!: () => void;
    glossGate = new Promise(r => { release = r; });
    const pending = analyseCueMorphology(model, cues[0]!, null, () => rerenderApp(model));
    await flush();
    openCapture(model, lexeme(cues[0]!, 'pies'));
    setPendingMeaning(model, 'mine');
    release(); await pending; await flush();
    expect(model.pendingMeaning).toBe('mine');
    expect(model.pendingMeaningSuggestion).toBeNull();
  });

  it('not paired: opening a word capture makes no network call', async () => {
    const { model, cues } = installModel(['pies'], false);
    openCapture(model, lexeme(cues[0]!, 'pies'));
    await flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(model.pendingMeaning).toBe('');
  });
});

describe('lt-foe.3.4 Settings credits', () => {
  const DECISIONS_16A = 'Word meanings from English Wiktionary (en.wiktionary.org), © Wiktionary contributors, via Wiktextract/kaikki.org, CC BY-SA 4.0 and GFDL. Filtered to Polish and converted to SQLite.';

  it('shows the service attribution verbatim (== DECISIONS §16a) with a CC BY-SA 4.0 link', () => {
    const model = createAppModel();
    model.localService.glossCapability = readGlossCapability({ languages: ['pl'], state: 'available', source: { id: SOURCE.id, dumpDate: '2026-10-03', attribution: GLOSS_ATTRIBUTION } });
    const view = renderSettingsView(model);
    const credits = view.querySelector('#settings-credits')!;
    expect(credits.querySelector('h3')!.textContent).toBe('Credits');
    expect(credits.querySelector('.credits-attribution')!.textContent).toBe(DECISIONS_16A);
    const link = credits.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // DECISIONS.md is not copied into the contributor image; check it where the checkout has it.
    if (existsSync('DECISIONS.md')) expect(readFileSync('DECISIONS.md', 'utf8')).toContain(DECISIONS_16A);
    expect(DICTIONARY_ATTRIBUTION).toBe(DECISIONS_16A);
  });

  it('review: renders the §16a constant, never arbitrary service attribution text', () => {
    const model = createAppModel();
    model.localService.glossCapability = readGlossCapability({ state: 'available', source: { id: 'x', dumpDate: '2026-10-03', attribution: 'Evil <b>text</b> from service' } });
    const credits = renderSettingsView(model).querySelector('#settings-credits')!;
    expect(credits.querySelector('.credits-attribution')!.textContent).toBe(DECISIONS_16A);
    expect(credits.textContent).not.toContain('Evil');
  });

  it('review: unpairing / changing the service clears the gloss capability so Credits drops the attribution', async () => {
    const { model } = installModel(['pies']);
    model.localService.glossCapability = readGlossCapability({ state: 'available', source: { id: SOURCE.id, dumpDate: '2026-10-03', attribution: GLOSS_ATTRIBUTION } });
    setLocalServiceBaseUrl(model, 'http://127.0.0.1:49997');
    expect(model.localService.glossCapability).toBeNull();
    expect(renderSettingsView(model).querySelector('#settings-credits')!.textContent).toContain('No dictionary installed.');
    model.localService.glossCapability = readGlossCapability({ state: 'available', source: { id: SOURCE.id, dumpDate: '2026-10-03', attribution: GLOSS_ATTRIBUTION } });
    pairLocalService(model, SYNTHETIC_CAPABILITY, ORIGIN);
    expect(model.localService.glossCapability).toBeNull();
  });

  it('review: a 401 (pairing lost) clears the gloss capability', async () => {
    const { model, cues } = installModel(['domu']);
    model.localService.glossCapability = readGlossCapability({ state: 'available', source: { id: SOURCE.id, dumpDate: '2026-10-03', attribution: GLOSS_ATTRIBUTION } });
    glossMode = 'unpairs';
    await analyse(model, cues[0]!);
    expect(meaningsState()).toBe('not-paired');
    expect(model.localService.glossCapability).toBeNull();
  });

  it('no dictionary when the capability is absent, not available, or off-contract', () => {
    const model = createAppModel();
    expect(renderSettingsView(model).querySelector('#settings-credits')!.textContent).toContain('No dictionary installed.');
    expect(readGlossCapability({ state: 'not-installed' })).toEqual({ state: 'not-installed', source: null });
    expect(readGlossCapability({ state: 'available' })).toBeNull();
    expect(readGlossCapability({ state: 'available', source: { id: 'x', dumpDate: 'bad', attribution: 'y' } })).toBeNull();
    expect(readGlossCapability({ state: 'weird' })).toBeNull();
    expect(readGlossCapability('available')).toBeNull();
  });
});

describe('lt-foe.3.4 export attribution notice', () => {
  it('export domain attribution constant equals the gloss store attribution', () => {
    expect(DICTIONARY_ATTRIBUTION).toBe(GLOSS_ATTRIBUTION);
  });

  it('contains-dictionary-text only when a saved item keeps a dictionary-suggested meaning; manifest validates', async () => {
    const { model, cues } = installModel(['pies kot']);
    openCapture(model, lexeme(cues[0]!, 'kot'));
    await flush();
    setPendingMeaning(model, 'a cat');
    await saveSelectionWithReceipt(model);
    let manifest = exportLearnerState(model).manifest;
    expect(manifest.privacyWarnings.map(w => w.kind)).not.toContain('contains-dictionary-text');

    openCapture(model, lexeme(cues[0]!, 'pies'));
    await flush();
    expect(model.pendingMeaning).toBe('dog');
    await saveSelectionWithReceipt(model);
    const exported = exportLearnerState(model);
    manifest = exported.manifest;
    const notice = manifest.privacyWarnings.find(w => w.kind === 'contains-dictionary-text')!;
    expect(notice.severity).toBe('info');
    expect(notice.message).toContain(GLOSS_ATTRIBUTION);
    expect(notice.message).toContain('CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)');
    const parsed = validateLearnerExportManifest(JSON.parse(exported.manifestJson));
    expect(parsed.privacyWarnings.map(w => w.kind)).toContain('contains-dictionary-text');
    // Older manifests without the kind still validate.
    const older = JSON.parse(exported.manifestJson);
    older.privacyWarnings = older.privacyWarnings.filter((w: { kind: string }) => w.kind !== 'contains-dictionary-text');
    expect(() => validateLearnerExportManifest(older)).not.toThrow();
    // Unknown kinds remain rejected.
    older.privacyWarnings.push({ kind: 'made-up', severity: 'info', message: 'x' });
    expect(() => validateLearnerExportManifest(older)).toThrow();
  });
  it('review: browser export path (exportLearnerState) adds the notice for a stored dictionary-suggested item', async () => {
    const { model, cues } = installModel(['pies']);
    openCapture(model, lexeme(cues[0]!, 'pies'));
    await flush();
    await saveSelectionWithReceipt(model);
    const { manifest } = exportLearnerState(model);
    expect(manifest.privacyWarnings.filter(w => w.kind === 'contains-dictionary-text')).toHaveLength(1);
    expect(model.exportImport.lastExport!.warningCount).toBe(manifest.privacyWarnings.length);
  });
});

describe('lt-foe.3.4 qualification harness hook', () => {
  it('dom-journey checks data-meanings-state, not the removed grammar-only sentence', () => {
    const journey = readFileSync('scripts/qualification/browser-batch/dom-journey.mjs', 'utf8');
    expect(journey).toContain("getAttribute('data-meanings-state')");
    expect(journey).not.toContain('This shows grammar only');
    expect(readFileSync('scripts/qualification/browser-batch/live-batch.py', 'utf8')).toContain("m['meaningsState']");
  });
});
