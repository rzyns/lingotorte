import { describe, expect, it } from 'vitest';
import { confidenceUnavailable, defaultProviderPolicy } from '../../packages/domain/src';
import {
  makeDisabledMorphologyAdapter,
  makeFixtureDictionaryAdapter,
  makeLocalPolishMorphologyAdapter,
  makeUnavailableDictionaryAdapter,
  makeWhitespaceTokenizer,
  polishFixtureDictionary,
  resolveLocalAdapters,
} from '../../packages/language/src/adapters';
import { withNoNetwork } from '../../tests/no-network/networkTrap';

const sampleCue = { id: 'cue-1', text: 'Uczymy się z własnych napisów.', language: 'pl' };

describe('P3 tokenizer/lemma/POS/dictionary adapter contracts', () => {
  it('whitespace tokenizer round-trips char offsets and splits trailing punctuation', async () => {
    const tokenizer = makeWhitespaceTokenizer('pl');
    const cueText = 'Cześć, to jest lokalny test.';
    const result = await tokenizer.tokenize({
      language: 'pl',
      cueId: sampleCue.id,
      text: cueText,
      preserveCharOffsets: true,
    });

    expect(result.run.adapterKind).toBe('tokenizer');
    expect(result.run.privacyMode).toBe('local');
    expect(result.tokens.length).toBeGreaterThan(0);

    for (const token of result.tokens) {
      expect(cueText.slice(token.charStart, token.charEnd)).toBe(token.surface);
    }

    const wordTokens = result.tokens.filter((t) => t.tokenKind === 'word');
    expect(wordTokens.map((t) => t.normalizedSurface)).toContain('cześć');
    expect(wordTokens.map((t) => t.normalizedSurface)).toContain('lokalny');
    expect(wordTokens.map((t) => t.normalizedSurface)).toContain('test');
  });

  it('disabled morphology adapter returns placeholder analyses with unavailable confidence', async () => {
    const tokenizer = makeWhitespaceTokenizer('pl');
    const morphology = makeDisabledMorphologyAdapter();
    const tokenized = await tokenizer.tokenize({
      language: 'pl',
      cueId: sampleCue.id,
      text: 'lokalny test',
      preserveCharOffsets: true,
    });
    const result = await morphology.analyze({
      language: 'pl',
      cueId: sampleCue.id,
      text: 'lokalny test',
      tokens: tokenized.tokens,
    });

    expect(result.run.adapterKind).toBe('pos-morph');
    expect(result.run.privacyMode).toBe('local');
    expect(result.analyses).toHaveLength(tokenized.tokens.length);
    expect(result.analyses[0]!.lemma).toBe('lokalny');
    expect(result.analyses[0]!.upos).toBe('X');
    expect(result.analyses[0]!.confidence).toEqual(confidenceUnavailable());
    expect(result.warnings[0]).toMatch(/disabled/i);
  });

  it('local Polish morphology returns lemma, POS, and UD-style features without network dependencies', async () => {
    const tokenizer = makeWhitespaceTokenizer('pl');
    const morphology = makeLocalPolishMorphologyAdapter();
    const text = 'Uczymy się z własnych napisów.';
    const tokenized = await tokenizer.tokenize({
      language: 'pl',
      cueId: sampleCue.id,
      text,
      preserveCharOffsets: true,
    });
    const result = await morphology.analyze({ language: 'pl', cueId: sampleCue.id, text, tokens: tokenized.tokens });

    expect(result.run.adapterKind).toBe('pos-morph');
    expect(result.run.privacyMode).toBe('local');
    const bySurface = new Map(tokenized.tokens.map((token, index) => [token.normalizedSurface, result.analyses[index]!]));
    expect(bySurface.get('uczymy')).toMatchObject({ lemma: 'uczyć', upos: 'VERB' });
    expect(bySurface.get('uczymy')?.morph).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Person', value: '1' }),
      expect.objectContaining({ key: 'Number', value: 'Plur' }),
    ]));
    expect(bySurface.get('własnych')).toMatchObject({ lemma: 'własny', upos: 'ADJ' });
    expect(bySurface.get('napisów')).toMatchObject({ lemma: 'napis', upos: 'NOUN' });
    expect(bySurface.get('.')?.upos).toBe('PUNCT');
    expect(result.warnings[0]).toMatch(/local heuristic polish morphology/i);
  });

  it('unavailable dictionary returns empty entries with a local-only warning', async () => {
    const dictionary = makeUnavailableDictionaryAdapter();
    const result = await dictionary.lookup({
      target: { kind: 'token', tokenOccurrenceId: 'tok-1', cueId: 'cue-1', text: 'Cześć' },
      sourceLanguage: 'pl',
      learnerLanguage: 'en',
      context: { cueText: 'Cześć' },
    });

    expect(result.run.adapterKind).toBe('dictionary');
    expect(result.run.privacyMode).toBe('local');
    expect(result.entries).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('unavailable'))).toBe(true);
  });

  it('fixture dictionary resolves known Polish words and records source/license', async () => {
    const dictionary = makeFixtureDictionaryAdapter(polishFixtureDictionary);
    const result = await dictionary.lookup({
      target: { kind: 'token', tokenOccurrenceId: 'tok-1', cueId: 'cue-1', text: 'Cześć' },
      sourceLanguage: 'pl',
      learnerLanguage: 'en',
      context: { cueText: 'Cześć, to jest lokalny test.' },
    });

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0]!;
    expect(entry.headword).toBe('cześć');
    expect(entry.partOfSpeech).toBe('NOUN');
    expect(entry.sourceName).toContain('fixture-dictionary');
    expect(entry.sourceLicense).toBe('synthetic-fixture');
    expect(entry.senses.map((s) => s.gloss)).toContain('hi');
  });

  it('fixture dictionary falls back to surface form when no lemma is provided', async () => {
    const dictionary = makeFixtureDictionaryAdapter(polishFixtureDictionary);
    const result = await dictionary.lookup({
      target: { kind: 'token', tokenOccurrenceId: 'tok-2', cueId: 'cue-1', text: 'Lokalny' },
      sourceLanguage: 'pl',
      learnerLanguage: 'en',
      context: { cueText: 'lokalny test' },
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.headword).toBe('lokalny');
  });

  it('resolveLocalAdapters rejects any policy that enables online providers', () => {
    expect(() => resolveLocalAdapters(defaultProviderPolicy(), 'pl')).not.toThrow();
    expect(() =>
      resolveLocalAdapters({ onlineProvidersEnabled: true, allowedDataClasses: [] }, 'pl'),
    ).toThrow(/online providers must be disabled/i);
    expect(() =>
      resolveLocalAdapters({ onlineProvidersEnabled: false, allowedDataClasses: ['cue-text'] }, 'pl'),
    ).toThrow(/online providers must be disabled/i);
  });
});

describe('P3 adapter no-network enforcement', () => {
  it('tokenization and fixture dictionary lookup make zero network calls', async () => {
    const adapters = resolveLocalAdapters(defaultProviderPolicy(), 'pl', polishFixtureDictionary);
    const { value, networkAttempts } = await withNoNetwork(async () => {
      const tokenized = await adapters.tokenizer.tokenize({
        language: 'pl',
        cueId: 'cue-1',
        text: 'Cześć, to jest lokalny test.',
        preserveCharOffsets: true,
      });
      const firstToken = tokenized.tokens.find((t) => t.normalizedSurface === 'cześć')!;
      const lookup = await adapters.dictionary.lookup({
        target: {
          kind: 'token',
          tokenOccurrenceId: 'tok-cześć',
          cueId: 'cue-1',
          text: firstToken.surface,
        },
        sourceLanguage: 'pl',
        learnerLanguage: 'en',
        context: { cueText: 'Cześć, to jest lokalny test.' },
      });
      return { tokenized, lookup };
    });

    expect(networkAttempts).toHaveLength(0);
    expect(value.lookup.entries).toHaveLength(1);
    expect(value.lookup.entries[0]!.headword).toBe('cześć');
  });

  it('local Polish morphology adapter makes zero network calls', async () => {
    const adapters = resolveLocalAdapters(defaultProviderPolicy(), 'pl');
    const { value, networkAttempts } = await withNoNetwork(async () => {
      const tokenized = await adapters.tokenizer.tokenize({
        language: 'pl',
        cueId: 'cue-1',
        text: 'lokalny',
        preserveCharOffsets: true,
      });
      const analyzed = await adapters.morphology.analyze({
        language: 'pl',
        cueId: 'cue-1',
        text: 'lokalny',
        tokens: tokenized.tokens,
      });
      return analyzed;
    });

    expect(networkAttempts).toHaveLength(0);
    expect(value.analyses[0]).toMatchObject({ lemma: 'lokalny', upos: 'ADJ' });
  });
});
