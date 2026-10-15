import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// lt-vtw: tokenized type scale, target-language text largest, sticky desktop transcript.
const css = readFileSync(resolve(__dirname, '../../apps/web/src/style.css'), 'utf8');
const XS_META = new Set(['.lingotorte-footer', '.provider-status', '.source-disclosure code', '.cue-time', '.restore-metadata', '.export-metadata']);
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: (m[1] ?? '').trim(), body: m[2] ?? '' }));
const fontSizeOf = (sel: string) => rules.filter((r) => r.sel.split(',').some((p) => p.trim() === sel)).map((r) => /font-size:\s*([^;]+);/.exec(r.body)?.[1]).filter(Boolean);
const TOKENS: Record<string, number> = { '--fs-xs': 0.78, '--fs-sm': 0.875, '--fs-md': 1, '--fs-lg': 1.125, '--fs-xl': 1.4, '--fs-2xl': 1.6 };

describe('lt-vtw typography', () => {
  it('defines the type scale and spacing tokens on :root', () => {
    const root = rules.find((r) => r.sel === ':root')?.body ?? '';
    for (const [k, v] of Object.entries(TOKENS)) expect(root).toContain(`${k}: ${v}rem;`);
    for (const n of [1, 2, 3, 4]) expect(root).toContain(`--space-${n}:`);
    expect(root).not.toMatch(/Inter/);
  });

  it('no font-size uses a literal below 0.875rem, and --fs-xs is only used by documented meta selectors', () => {
    for (const r of rules) {
      const v = /font-size:\s*([^;]+);/.exec(r.body)?.[1];
      if (!v) continue;
      // Every rem/px literal (incl. inside clamp/min/max) is banned: font sizes must use --fs-* tokens.
      expect([...v.matchAll(/\d*\.?\d+(rem|px)\b/g)].map((m) => m[0]), `${r.sel}: ${v}`).toEqual([]);
      if (v.includes('--fs-xs')) for (const part of r.sel.split(',')) expect(XS_META.has(part.trim()), part).toBe(true);
    }
  });

  it('target-language text resolves to >= --fs-lg', () => {
    for (const sel of ['.cue-target', '.subtitle-target', '.review-prompt', '.review-target', '.practice-prompt']) {
      const vals = fontSizeOf(sel);
      expect(vals.length, sel).toBeGreaterThan(0);
      for (const v of vals) {
        const toks = [...(v ?? '').matchAll(/var\((--fs-[a-z0-9]+)\)/g)].map((m) => m[1] ?? '');
        expect(toks.length, `${sel}: ${v}`).toBeGreaterThan(0);
        for (const t of toks) expect(TOKENS[t] ?? 0, `${sel}: ${v}`).toBeGreaterThanOrEqual(1.125);
      }
    }
    expect(rules.find((r) => r.sel === '.cue-target')?.body ?? '').toMatch(/max-width:\s*60ch/);
    expect(rules.find((r) => r.sel === '.review-prompt')?.body ?? '').toMatch(/max-width:\s*50ch/);
  });

  it('makes the transcript aside sticky at >=900px and drops the nested 70vh scroll', () => {
    const media = /@media \(min-width: 900px\) \{\s*\.transcript-copilot \{([^}]*)\}/.exec(css);
    expect(media).not.toBeNull();
    expect(media?.[1]).toMatch(/position:\s*sticky/);
    expect(media?.[1]).toMatch(/align-self:\s*start/);
    expect(media?.[1]).toMatch(/max-height:\s*calc\(100vh - 2rem\)/);
    const panel = rules.find((r) => r.sel === '.transcript-panel')?.body ?? '';
    expect(panel).not.toMatch(/max-height:\s*70vh/);
    // Sticky search must pin flush (no card padding above it) on an opaque card-coloured strip.
    expect(css).toMatch(/@media \(min-width: 900px\) \{[^@]*\.transcript-copilot \{[^}]*padding-top:\s*0;/);
    expect(rules.find((r) => r.sel === '.transcript-search')?.body ?? '').toMatch(/background:\s*var\(--surface\)/);
  });

  it('learner-facing meta/hint text is >= --fs-sm and cue action buttons wrap whole', () => {
    for (const sel of ['.meta', '.saved-item .meta', '.file-hint', '.import-form .file-hint']) expect(fontSizeOf(sel), sel).toEqual(['var(--fs-sm)']);
    expect(fontSizeOf('.source-candidate-card h4')).toEqual(['var(--fs-md)']);
    expect(rules.find((r) => r.sel === '.cue-actions')?.body ?? '').toMatch(/flex-wrap:\s*wrap/);
    expect(rules.find((r) => r.sel === '.cue-actions button')?.body ?? '').toMatch(/white-space:\s*nowrap/);
  });
});
