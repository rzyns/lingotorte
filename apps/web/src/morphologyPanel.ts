// lt-e8z: learner-facing word analysis (grammar only). Local Morfeusz service first, browser heuristic fallback.
// No dictionary, translation, LLM or non-loopback network call is made here. The only egress is the paired
// transport's POST /api/language/morphology (via requestLocalMorphology), and only when paired.
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
    state = { generation: 0, contextKey: key, cache: new Map(), current: null, selectedTokenIndex: null, pendingCueId: null, failure: null };
    states.set(model, state);
  } else if (state.contextKey !== key) {
    state.generation += 1;
    state.contextKey = key;
    state.cache.clear();
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
}

function firstWordIndex(view: MorphologyCueView): number | null {
  return view.tokens.find(t => t.isWord)?.tokenIndex ?? null;
}

export function selectMorphologyToken(model: AppModel, tokenIndex: number): void {
  stateFor(model).selectedTokenIndex = tokenIndex;
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
export const MEANINGS_UNAVAILABLE = 'Word meanings and translations are not available: no dictionary or translation provider is configured. This shows grammar only.';
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
  const heading = el('h3', undefined, 'Word analysis (grammar only)');
  heading.id = 'morphology-heading';
  section.appendChild(heading);
  const status = el('p', 'morphology-status');
  status.id = 'morphology-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  section.appendChild(status);
  const meanings = el('p', 'morphology-meanings-unavailable', MEANINGS_UNAVAILABLE);
  section.appendChild(meanings);

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
        selectMorphologyToken(model, token.tokenIndex);
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
  }
  section.appendChild(detail);
  return section;
}
