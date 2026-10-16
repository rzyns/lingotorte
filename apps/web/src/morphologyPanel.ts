// lt-e8z: learner-facing word analysis. Local Morfeusz service first, browser heuristic fallback.
// lt-foe.3.4: meanings from the local service's Wiktionary-derived gloss DB, only for service-analysed words.
// No translation, LLM or non-loopback network call is made here. The only egress is the paired transport's
// POST /api/language/morphology and /api/language/gloss, and only when paired.
import type { Cue } from '@lingotorte/domain';
import { makeLocalPolishMorphologyAdapter, makeWhitespaceTokenizer } from '@lingotorte/language';
import type { AppModel } from './uiTypes';
import { captureLocalServiceTransport } from './model.ts';
import {
  requestLocalMorphology,
  MORPHOLOGY_CLIENT_MAX_TOKENS,
  MORPHOLOGY_CLIENT_MAX_TOKEN_CHARS,
  type ClientMorphologyResult,
} from './morphologyClient.ts';
import type { PairedTransport } from './pairedTransport.ts';
import { requestLocalGloss, type ClientGlossResponse, type ClientGlossResult, type ClientGlossSense, type ClientGlossSource } from './glossClient.ts';

/** lt-foe.3.4: stable data hook values for the Meanings section (data-meanings-state). */
export type MeaningsState = 'loading' | 'available' | 'no-entry' | 'not-installed' | 'disabled' | 'invalid' | 'unsupported' | 'not-paired' | 'unavailable';
export type GlossView = Readonly<{ state: MeaningsState; source?: ClientGlossSource; result?: ClientGlossResult }>;

export type MorphologyQuality = 'certain' | 'probable' | 'possible' | 'ambiguous' | 'unknown' | 'estimate' | 'no-estimate' | 'punctuation';
export type MorphologySource = 'service' | 'browser' | 'none';
export type MorphologyTokenView = Readonly<{
  tokenIndex: number;
  surface: string;
  isWord: boolean;
  source: MorphologySource;
  lemma: string;
  upos: string;
  morph: readonly Readonly<{ key: string; value: string }>[];
  quality: MorphologyQuality;
  alternatives: readonly Readonly<{ lemma: string; upos: string }>[];
}>;
export type MorphologyFallbackReason =
  | 'not-paired' | 'service-unreachable' | 'disabled' | 'adapter-load-failed' | 'unsupported-language'
  | 'analysis-failed' | 'internal' | 'rejected' | 'invalid-response' | 'invalid-request';
export type MorphologyCueView = Readonly<{
  cueId: string;
  source: 'service' | 'browser';
  fallbackReason: MorphologyFallbackReason | null;
  tokens: readonly MorphologyTokenView[];
}>;
type PanelState = {
  generation: number;
  contextKey: string;
  cache: Map<string, MorphologyCueView>;
  current: MorphologyCueView | null;
  selectedTokenIndex: number | null;
  pendingCueId: string | null;
  failure: string | null;
  glossCache: Map<string, GlossView>;
};

const states = new WeakMap<AppModel, PanelState>();

function contextKey(model: AppModel): string {
  return `${model.currentMedia?.id ?? 'none'}|${model.targetTrackId ?? 'none'}`;
}

/** Reset everything when the media or target track changed: cached cue analyses are no longer valid. */
function stateFor(model: AppModel): PanelState {
  const key = contextKey(model);
  let state = states.get(model);
  if (!state) {
    state = { generation: 0, contextKey: key, cache: new Map(), current: null, selectedTokenIndex: null, pendingCueId: null, failure: null, glossCache: new Map() };
    states.set(model, state);
  } else if (state.contextKey !== key) {
    state.generation += 1;
    state.contextKey = key;
    state.cache.clear();
    state.glossCache.clear();
    state.current = null;
    state.selectedTokenIndex = null;
    state.pendingCueId = null;
    state.failure = null;
  }
  return state;
}

export function morphologyPanelState(model: AppModel): Readonly<Pick<PanelState, 'current' | 'selectedTokenIndex' | 'pendingCueId' | 'failure' | 'generation'>> {
  return stateFor(model);
}

function pairedTransport(model: AppModel): PairedTransport | null {
  try { return captureLocalServiceTransport(model); } catch { return null; }
}

function isRequestable(surface: string): boolean {
  return surface.length > 0 && !/\s/.test(surface) && [...surface].length <= MORPHOLOGY_CLIENT_MAX_TOKEN_CHARS;
}

async function browserEstimate(cue: Cue, tokens: Awaited<ReturnType<ReturnType<typeof makeWhitespaceTokenizer>['tokenize']>>['tokens']) {
  const output = await makeLocalPolishMorphologyAdapter().analyze({ language: 'pl', cueId: cue.id, text: cue.text, tokens });
  return new Map(output.analyses.map(a => [a.tokenIndex, a]));
}

/**
 * Analyse one cue's tokens. Only word/number tokens (≤64 code points, no whitespace) are sent, in chunks of
 * ≤64; punctuation and symbols are never requested and are shown as punctuation. Any non-available result
 * falls back to the browser heuristic for the whole cue. A generation token drops stale responses.
 */
export async function analyseCueMorphology(model: AppModel, cue: Cue, tokenIndex: number | null = null, rerender: () => void = () => {}): Promise<void> {
  const state = stateFor(model);
  const generation = ++state.generation;
  const key = state.contextKey;
  const transport = pairedTransport(model);
  const cacheKey = `${cue.id}|${cue.text}|${transport?.origin ?? 'unpaired'}`;
  const cached = state.cache.get(cacheKey);
  if (cached) {
    state.current = cached;
    state.selectedTokenIndex = tokenIndex ?? state.selectedTokenIndex ?? firstWordIndex(cached);
    state.pendingCueId = null;
    state.failure = null;
    rerender();
    void loadSelectedGloss(model, rerender);
    return;
  }
  state.pendingCueId = cue.id;
  state.failure = null;
  rerender();
  const isCurrent = () => generation === state.generation && key === contextKey(model) && states.get(model) === state;
  try {
    const tokenized = await makeWhitespaceTokenizer('pl').tokenize({ language: 'pl', cueId: cue.id, text: cue.text, preserveCharOffsets: true });
    const tokens = tokenized.tokens;
    const wordTokens = tokens.filter(t => (t.tokenKind === 'word' || t.tokenKind === 'number') && isRequestable(t.surface));
    let fallbackReason: MorphologyFallbackReason | null = transport ? null : 'not-paired';
    const serviceByIndex = new Map<number, Extract<ClientMorphologyResult, { status: 'available' }>['analyses'][number]>();
    if (transport && wordTokens.length > 0) {
      for (let start = 0; start < wordTokens.length && !fallbackReason; start += MORPHOLOGY_CLIENT_MAX_TOKENS) {
        const chunk = wordTokens.slice(start, start + MORPHOLOGY_CLIENT_MAX_TOKENS);
        const result = await requestLocalMorphology(transport, 'pl', chunk.map(t => t.surface));
        if (!isCurrent()) return;
        if (result.status === 'available') chunk.forEach((t, i) => serviceByIndex.set(t.tokenIndex, result.analyses[i]!));
        else fallbackReason = result.status === 'unavailable' ? result.reason : result.code;
      }
    }
    const estimate = fallbackReason ? await browserEstimate(cue, tokens) : null;
    if (!isCurrent()) return;
    const views: MorphologyTokenView[] = tokens.map(t => {
      const isWord = t.tokenKind === 'word' || t.tokenKind === 'number';
      if (!isWord) return { tokenIndex: t.tokenIndex, surface: t.surface, isWord, source: 'none', lemma: t.surface, upos: t.tokenKind === 'punctuation' ? 'PUNCT' : 'SYM', morph: [], quality: 'punctuation', alternatives: [] };
      const service = estimate ? undefined : serviceByIndex.get(t.tokenIndex);
      if (service) {
        const quality: MorphologyQuality = service.unknown ? 'unknown' : service.ambiguous ? 'ambiguous' : service.confidence.kind;
        return { tokenIndex: t.tokenIndex, surface: t.surface, isWord, source: 'service', lemma: service.lemma, upos: service.upos, morph: service.morph, quality, alternatives: service.alternatives };
      }
      const guess = estimate?.get(t.tokenIndex);
      const upos = guess?.upos ?? 'X';
      return {
        tokenIndex: t.tokenIndex, surface: t.surface, isWord, source: 'browser', lemma: guess?.lemma ?? t.normalizedSurface, upos,
        morph: (guess?.morph ?? []).filter(f => f.source !== 'adapter-specific').map(f => ({ key: f.key, value: f.value })),
        quality: upos === 'X' ? 'no-estimate' : 'estimate', alternatives: [],
      };
    });
    const view: MorphologyCueView = { cueId: cue.id, source: fallbackReason ? 'browser' : 'service', fallbackReason, tokens: views };
    if (!fallbackReason) state.cache.set(cacheKey, view);
    state.current = view;
    state.selectedTokenIndex = tokenIndex ?? firstWordIndex(view);
    state.pendingCueId = null;
  } catch {
    if (!isCurrent()) return;
    state.pendingCueId = null;
    state.current = null;
    state.failure = 'Word analysis could not run for this cue. Try again, or pick another cue.';
  }
  rerender();
  void loadSelectedGloss(model, rerender);
}

// ---- lt-foe.3.4 meanings ----

function glossKey(cueId: string, token: MorphologyTokenView, origin: string): string {
  return JSON.stringify([cueId, token.tokenIndex, token.surface, token.lemma, token.upos, origin]);
}

function glossViewFrom(response: ClientGlossResponse): GlossView {
  if (response.status === 'available') {
    const result = response.results[0]!;
    return result.found ? { state: 'available', source: response.source, result } : { state: 'no-entry', source: response.source, result };
  }
  if (response.status === 'unavailable') {
    switch (response.reason) {
      case 'not-installed': return { state: 'not-installed' };
      case 'disabled': return { state: 'disabled' };
      case 'invalid-dictionary': return { state: 'invalid' };
      case 'unsupported-language': return { state: 'unsupported' };
      case 'not-paired': return { state: 'not-paired' };
      default: return { state: 'unavailable' };
    }
  }
  return { state: 'unavailable' };
}

const glossLemmaOk = (l: string) => l.length > 0 && l === l.trim() && [...l].length <= 64 && !/[\u0000-\u001f\u007f-\u009f]|\s{2,}|[^\S ]/u.test(l);

/** Morfeusz lemma/UPOS plus ≤3 alternatives, as the gloss query. Null when the token cannot be queried. */
function glossQueryFor(token: MorphologyTokenView) {
  if (!glossLemmaOk(token.lemma)) return null;
  const upos = /^[A-Z]{1,5}$/.test(token.upos) ? token.upos : undefined;
  const alternatives = token.alternatives.filter(a => glossLemmaOk(a.lemma)).slice(0, 3)
    .map(a => ({ lemma: a.lemma, ...(/^[A-Z]{1,5}$/.test(a.upos) ? { upos: a.upos } : {}) }));
  return { lemma: token.lemma, ...(upos ? { upos } : {}), ...(alternatives.length ? { alternatives } : {}) };
}

const inFlight = new WeakMap<GlossView, Promise<GlossView | null>>();

/** Cached gloss for a service-analysed token, or a fresh request. Returns null if the context changed meanwhile. */
async function glossForToken(model: AppModel, cueId: string, token: MorphologyTokenView, rerender: () => void): Promise<GlossView | null> {
  const state = stateFor(model);
  const transport = pairedTransport(model);
  if (!transport) return { state: 'not-paired' };
  const key = glossKey(cueId, token, transport.origin);
  const cached = state.glossCache.get(key);
  // Share the in-flight request so a capture opened mid-lookup can still pre-fill (callers re-check staleness).
  if (cached?.state === 'loading') return inFlight.get(cached) ?? null;
  // Transient failures stay visible but are retried on the next selection/analysis.
  if (cached && cached.state !== 'unavailable' && cached.state !== 'not-paired') return cached;
  const query = glossQueryFor(token);
  if (!query) { const v: GlossView = { state: 'no-entry' }; state.glossCache.set(key, v); return v; }
  const context = state.contextKey;
  const marker: GlossView = { state: 'loading' };
  state.glossCache.set(key, marker);
  rerender();
  const request = requestLocalGloss(transport, 'pl', [query]);
  const shared = request.then(response => (states.get(model) !== state || context !== contextKey(model) || state.glossCache.get(key) !== marker) ? null : glossViewFrom(response));
  inFlight.set(marker, shared);
  const response = await request;
  // Stale guard: a media/track change (new generation, cleared cache) or a newer request for the key drops this answer.
  if (states.get(model) !== state || context !== contextKey(model) || state.glossCache.get(key) !== marker) return null;
  const view = glossViewFrom(response);
  state.glossCache.set(key, view);
  // Only the selected word's panel is rerendered; an answer for a word the learner left stays in the cache only.
  const current = state.current;
  if (current?.cueId === cueId && state.selectedTokenIndex === token.tokenIndex && !state.pendingCueId) rerender();
  return view;
}

async function loadSelectedGloss(model: AppModel, rerender: () => void): Promise<void> {
  const state = stateFor(model);
  const view = state.current;
  const token = view?.tokens.find(t => t.tokenIndex === state.selectedTokenIndex && t.isWord);
  if (!view || !token || token.source !== 'service') return;
  await glossForToken(model, view.cueId, token, rerender);
}

/** Meanings state for the selected token, as rendered. Browser-estimate tokens never trigger a gloss call. */
export function selectedMeanings(model: AppModel): GlossView | null {
  const state = stateFor(model);
  const view = state.current;
  const token = view?.tokens.find(t => t.tokenIndex === state.selectedTokenIndex && t.isWord);
  if (!view || !token) return null;
  if (token.source !== 'service') {
    return { state: view.fallbackReason === 'not-paired' || !pairedTransport(model) ? 'not-paired' : 'unavailable' };
  }
  const transport = pairedTransport(model);
  if (!transport) return { state: 'not-paired' };
  return state.glossCache.get(glossKey(view.cueId, token, transport.origin)) ?? { state: 'loading' };
}

/** UI-only ordering: single-letter 'character' senses go last (e.g. "w" the letter after the preposition). */
export function orderSenses(senses: readonly ClientGlossSense[]): ClientGlossSense[] {
  return [...senses.filter(s => s.pos !== 'character'), ...senses.filter(s => s.pos === 'character')];
}

/** First-sense meaning suggestion: parentheticals removed, whitespace collapsed, cut at ';' when long, ≤120 chars. */
export function suggestionText(gloss: string): string {
  let text = gloss;
  for (let prev = ''; prev !== text;) { prev = text; text = text.replace(/\([^()]*\)/g, ' '); }
  text = text.replace(/\s+/g, ' ').replace(/\s+([,;.:!?])/g, '$1').trim();
  if ([...text].length > 60 && text.includes(';')) text = text.slice(0, text.indexOf(';')).trim();
  if ([...text].length > 120) text = [...text].slice(0, 119).join('').trimEnd() + '…';
  return text;
}

type CaptureSelection = Readonly<{ kind: string; text: string; cueId: string; tokenStart: number; tokenEnd: number }>;

/**
 * lt-foe.3.4: pre-fill the capture Meaning with a dictionary suggestion for a single-word selection. Uses the panel
 * cache or asks the paired service (never blocks opening). Applied only while the same selection is open and the
 * learner has not typed.
 */
export async function suggestMeaningForSelection(model: AppModel, selection: CaptureSelection, rerender: () => void): Promise<void> {
  if (selection.kind !== 'lexeme' || selection.tokenEnd - selection.tokenStart !== 1) return;
  const transport = pairedTransport(model);
  if (!transport) return;
  const state = stateFor(model);
  const context = state.contextKey;
  let token: MorphologyTokenView | undefined;
  const view = state.current?.cueId === selection.cueId ? state.current : [...state.cache.values()].find(v => v.cueId === selection.cueId);
  if (view) token = view.tokens.find(t => t.tokenIndex === selection.tokenStart && t.isWord && t.surface === selection.text);
  if (!token) {
    if (!isRequestable(selection.text)) return;
    const result = await requestLocalMorphology(transport, 'pl', [selection.text]);
    if (result.status !== 'available') return;
    const a = result.analyses[0]!;
    if (a.unknown) return;
    token = { tokenIndex: selection.tokenStart, surface: selection.text, isWord: true, source: 'service', lemma: a.lemma, upos: a.upos, morph: a.morph, quality: 'certain', alternatives: a.alternatives };
  }
  if (token.source !== 'service') return;
  const gloss = await glossForToken(model, selection.cueId, token, () => {});
  const stillOpen = () => model.selection === selection && model.pendingMeaning === '' && context === contextKey(model);
  if (!gloss || gloss.state !== 'available' || !gloss.source || !gloss.result || !stillOpen()) return;
  const first = orderSenses(gloss.result.senses)[0];
  const text = first ? suggestionText(first.gloss) : '';
  if (!text) return;
  model.pendingMeaning = text;
  model.pendingMeaningSuggestion = { text, source: { kind: 'dictionary-suggested', glossSourceId: gloss.source.id, dumpDate: gloss.source.dumpDate } };
  rerender();
}

function firstWordIndex(view: MorphologyCueView): number | null {
  return view.tokens.find(t => t.isWord)?.tokenIndex ?? null;
}

export function selectMorphologyToken(model: AppModel, tokenIndex: number, rerender: () => void = () => {}): void {
  stateFor(model).selectedTokenIndex = tokenIndex;
  void loadSelectedGloss(model, rerender);
}

const UPOS_LABELS: Record<string, string> = {
  NOUN: 'noun', PROPN: 'proper noun', VERB: 'verb', AUX: 'auxiliary verb', ADJ: 'adjective', ADV: 'adverb', PRON: 'pronoun',
  DET: 'determiner', PART: 'particle', ADP: 'preposition', CCONJ: 'conjunction', SCONJ: 'subordinating conjunction',
  NUM: 'number', INTJ: 'interjection', PUNCT: 'punctuation', SYM: 'symbol', X: 'unclassified',
};
const FEATURE_KEYS: Record<string, string> = {
  Case: 'case', Number: 'number', Gender: 'gender', Person: 'person', Tense: 'tense', Mood: 'mood', Aspect: 'aspect',
  Degree: 'degree', VerbForm: 'verb form', Voice: 'voice', Animacy: 'animacy', PronType: 'pronoun type', Reflex: 'reflexive',
  NumType: 'number type', Polarity: 'polarity',
};
const FEATURE_VALUES: Record<string, string> = {
  Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Ins: 'instrumental', Loc: 'locative', Voc: 'vocative',
  Sing: 'singular', Plur: 'plural', Masc: 'masculine', Fem: 'feminine', Neut: 'neuter', '1': 'first', '2': 'second', '3': 'third',
  Pres: 'present', Past: 'past', Fut: 'future', Ind: 'indicative', Imp: 'imperative', Cnd: 'conditional', Perf: 'perfective',
  Pos: 'positive', Cmp: 'comparative', Comp: 'comparative', Sup: 'superlative', Inf: 'infinitive', Fin: 'finite', Part: 'participle',
  Act: 'active', Pass: 'passive', Yes: 'yes', Prs: 'personal', Dem: 'demonstrative', Card: 'cardinal', Neg: 'negative', Anim: 'animate', Inan: 'inanimate', Hum: 'personal',
};
export function readablePos(upos: string): string { return UPOS_LABELS[upos] ?? upos.toLowerCase(); }
export function readableFeature(f: Readonly<{ key: string; value: string }>): string {
  // Aspect=Imp is imperfective, Mood=Imp is imperative.
  const value = f.key === 'Aspect' && f.value === 'Imp' ? 'imperfective' : FEATURE_VALUES[f.value] ?? f.value;
  return `${FEATURE_KEYS[f.key] ?? f.key}: ${value}`;
}
export const QUALITY_LABELS: Record<MorphologyQuality, string> = {
  certain: 'Certain',
  probable: 'Likely reading (single dictionary reading)',
  possible: 'Low confidence, check',
  ambiguous: 'Several readings, check',
  unknown: 'Not in local dictionary',
  estimate: 'Browser estimate, lower quality',
  'no-estimate': 'No browser estimate for this word',
  punctuation: 'Punctuation, not analysed',
};
export const SOURCE_LABELS = { service: 'Local morphology (Morfeusz)', browser: 'Browser estimate' } as const;
export const MEANINGS_SOURCE_LABEL = 'Wiktionary (CC BY-SA)';
export const MEANINGS_STATE_TEXT: Record<Exclude<MeaningsState, 'available'>, string> = {
  loading: 'Looking up meanings…',
  'no-entry': 'No dictionary entry for “{surface}”.',
  'not-installed': 'No dictionary is installed in the local service.',
  disabled: 'Dictionary lookups are turned off in the local service.',
  invalid: 'The installed dictionary could not be read.',
  unsupported: 'The local dictionary does not support this language.',
  'not-paired': 'Meanings need the local service (pair in Settings).',
  unavailable: 'Meanings are unavailable right now.',
};
const FALLBACK_STATUS: Record<MorphologyFallbackReason, string> = {
  'not-paired': 'Local morphology unavailable (local service not paired), showing browser estimate.',
  'service-unreachable': 'Local morphology unavailable (local service not reachable), showing browser estimate.',
  disabled: 'Local morphology is turned off in the local service, showing browser estimate.',
  'adapter-load-failed': 'Local morphology unavailable (dictionary did not load), showing browser estimate.',
  'unsupported-language': 'Local morphology does not support this language, showing browser estimate.',
  'analysis-failed': 'Local morphology hit an error, showing browser estimate.',
  internal: 'Local morphology hit an error, showing browser estimate.',
  rejected: 'Local morphology request was refused, showing browser estimate.',
  'invalid-response': 'Local morphology returned an unexpected answer, showing browser estimate.',
  'invalid-request': 'This cue could not be sent for local morphology, showing browser estimate.',
};
export function morphologyStatusText(view: MorphologyCueView): string {
  return view.fallbackReason ? FALLBACK_STATUS[view.fallbackReason] : 'Analysed on this computer with local morphology.';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderMorphologyPanel(model: AppModel, rerender: () => void): HTMLElement {
  const state = stateFor(model);
  const section = el('section', 'morphology-panel');
  section.id = 'morphology-panel';
  section.setAttribute('aria-labelledby', 'morphology-heading');
  const heading = el('h3', undefined, 'Word analysis');
  heading.id = 'morphology-heading';
  section.appendChild(heading);
  const status = el('p', 'morphology-status');
  status.id = 'morphology-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  section.appendChild(status);

  const view = state.current;
  if (state.pendingCueId) status.textContent = 'Analysing words…';
  else if (state.failure) status.textContent = state.failure;
  else if (!view) status.textContent = 'Choose “Analyse words” on a line, or a subtitle word, to see its grammar.';
  else status.textContent = morphologyStatusText(view);
  if (!view) return section;

  const source = el('p', `morphology-source morphology-source-${view.source}`);
  source.append(el('strong', undefined, 'Source: '), document.createTextNode(SOURCE_LABELS[view.source]));
  if (view.source === 'browser') source.append(document.createTextNode(' (lower quality, small built-in word list)'));
  section.appendChild(source);

  const list = el('ul', 'morphology-token-list');
  list.setAttribute('aria-label', 'Words in this cue');
  for (const token of view.tokens) {
    const li = el('li');
    if (!token.isWord) {
      const span = el('span', 'morphology-token morphology-token-punct', token.surface);
      span.setAttribute('aria-label', `${token.surface} (punctuation, not analysed)`);
      li.appendChild(span);
    } else {
      const button = el('button', 'morphology-token', token.surface);
      button.type = 'button';
      button.id = `morphology-token-${token.tokenIndex}`;
      button.dataset.tokenIndex = String(token.tokenIndex);
      button.setAttribute('aria-pressed', String(state.selectedTokenIndex === token.tokenIndex));
      button.setAttribute('aria-controls', 'morphology-detail');
      const flag = token.quality === 'ambiguous' ? ', several readings' : token.quality === 'unknown' ? ', not in local dictionary' : '';
      button.setAttribute('aria-label', `Show grammar for ${token.surface}${flag}`);
      if (flag) button.append(el('span', 'morphology-token-flag', token.quality === 'ambiguous' ? ' (?)' : ' (unknown)'));
      button.addEventListener('click', event => {
        event.stopPropagation();
        selectMorphologyToken(model, token.tokenIndex, rerender);
        rerender();
        (document.getElementById('morphology-detail') as HTMLElement | null)?.focus();
      });
      li.appendChild(button);
    }
    list.appendChild(li);
  }
  section.appendChild(list);

  const selected = view.tokens.find(t => t.tokenIndex === state.selectedTokenIndex && t.isWord);
  const detail = el('div', 'morphology-detail');
  detail.id = 'morphology-detail';
  detail.tabIndex = -1;
  detail.setAttribute('role', 'region');
  detail.setAttribute('aria-label', 'Word grammar details');
  if (!selected) {
    detail.appendChild(el('p', undefined, 'No word selected.'));
  } else {
    detail.dataset.quality = selected.quality;
    detail.dataset.source = selected.source;
    detail.appendChild(el('h4', undefined, `“${selected.surface}”`));
    const quality = el('p', `morphology-quality morphology-quality-${selected.quality}`);
    quality.append(el('strong', undefined, 'Quality: '), document.createTextNode(QUALITY_LABELS[selected.quality]));
    detail.appendChild(quality);
    const dl = el('dl', 'morphology-fields');
    const add = (term: string, value: string) => { dl.append(el('dt', undefined, term), el('dd', undefined, value)); };
    if (selected.quality === 'unknown' || selected.quality === 'no-estimate') {
      add('Base form', 'not known');
      add('Part of speech', 'not known');
    } else {
      add(selected.quality === 'ambiguous' ? 'Base form (first reading)' : 'Base form', selected.lemma);
      add('Part of speech', readablePos(selected.upos));
      add('Grammar', selected.morph.length ? selected.morph.map(readableFeature).join(', ') : 'no features listed');
    }
    detail.appendChild(dl);
    if (selected.quality === 'ambiguous') {
      detail.appendChild(el('p', 'morphology-ambiguity-note', 'This form has several readings. The first one is not chosen from the sentence context, so check which fits.'));
    }
    if (selected.alternatives.length) {
      const altHeading = el('p', 'morphology-alternatives-heading', 'Other possible readings:');
      altHeading.id = 'morphology-alternatives-heading';
      const alts = el('ul', 'morphology-alternatives');
      alts.setAttribute('aria-labelledby', 'morphology-alternatives-heading');
      selected.alternatives.forEach((alt, index) => {
        const item = el('li', undefined, `${alt.lemma} (${readablePos(alt.upos)})`);
        item.id = `morphology-alternative-${index}`;
        alts.appendChild(item);
      });
      detail.append(altHeading, alts);
    }
    if (selected.source === 'browser') {
      detail.appendChild(el('p', 'morphology-estimate-note', 'Browser estimate from a small built-in list; it may be wrong. Pair the local service for dictionary-based analysis.'));
    }
    detail.appendChild(renderMeanings(selected, selectedMeanings(model) ?? { state: 'loading' }));
  }
  section.appendChild(detail);
  return section;
}

function hopNote(hop: string | null | undefined, lemma: string, formOf: string | undefined): string {
  if (hop === 'form-of') return ` (${formOf ?? '?'} → ${lemma})`;
  if (hop === 'form-of-text') return ' (grammar note)';
  return '';
}

function senseList(senses: readonly ClientGlossSense[], className: string, labelledBy: string): HTMLUListElement {
  const list = el('ul', className);
  list.setAttribute('aria-labelledby', labelledBy);
  for (const sense of orderSenses(senses).slice(0, 3)) list.appendChild(el('li', undefined, sense.gloss));
  return list;
}

/** lt-foe.3.4: the Meanings section; data-meanings-state is the stable hook for harnesses. */
function renderMeanings(token: MorphologyTokenView, gloss: GlossView): HTMLElement {
  const box = el('section', 'morphology-meanings');
  box.id = 'morphology-meanings';
  box.dataset.meaningsState = gloss.state;
  box.setAttribute('aria-labelledby', 'morphology-meanings-heading');
  const heading = el('h5', 'morphology-meanings-heading', 'Meanings');
  heading.id = 'morphology-meanings-heading';
  box.appendChild(heading);
  if (gloss.state !== 'available' || !gloss.result) {
    const text = MEANINGS_STATE_TEXT[gloss.state === 'available' ? 'unavailable' : gloss.state].replace('{surface}', token.surface);
    const p = el('p', 'morphology-meanings-status', text);
    box.appendChild(p);
    return box;
  }
  const result = gloss.result;
  const source = el('p', 'morphology-meanings-source');
  source.append(el('strong', undefined, 'Source: '), document.createTextNode(MEANINGS_SOURCE_LABEL));
  box.appendChild(source);
  const hop = result.via === 'alternative' ? result.hop : result.via;
  let lead = '';
  if (result.via === 'alternative') lead = `read as ${result.lemma} (${readablePos(result.upos ?? 'X')})`;
  else if (result.via === 'form-of') lead = `from ${result.lemma} (${result.formOf ?? token.surface} → ${result.lemma})`;
  if (result.via === 'alternative' && hop === 'form-of') lead += ` (${result.formOf ?? token.surface} → ${result.lemma})`;
  if (hop === 'form-of-text') lead += `${lead ? ' ' : ''}(grammar note)`;
  if (lead) box.appendChild(el('p', 'morphology-meanings-via', lead));
  box.appendChild(senseList(result.senses, 'morphology-meanings-list', 'morphology-meanings-heading'));
  if (result.otherReadings.length) {
    const otherHeading = el('p', 'morphology-other-readings-heading', 'Other readings');
    otherHeading.id = 'morphology-other-readings-heading';
    const others = el('ul', 'morphology-other-readings');
    others.setAttribute('aria-labelledby', 'morphology-other-readings-heading');
    for (const other of result.otherReadings) {
      const senses = orderSenses(other.senses).slice(0, 3).map(s => s.gloss).join('; ');
      others.appendChild(el('li', undefined, `${other.lemma} (${readablePos(other.upos ?? 'X')})${hopNote(other.hop, other.lemma, other.formOf)}: ${senses}`));
    }
    box.append(otherHeading, others);
  }
  return box;
}
