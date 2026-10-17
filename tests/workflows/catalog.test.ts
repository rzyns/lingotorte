import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalog, validateCatalog } from '../../scripts/workflows/catalog.ts';
import { extractStructure, scopeForFile, slug } from '../../scripts/workflows/extract-structure.ts';
import { frictionTotals, journeyMermaid, renderProjections } from '../../scripts/workflows/generate-projections.ts';

// lt-5lb.5: the as-is workflow catalog must stay valid, cross-referenced, provenance-correct and fresh.
// A source change that moves or renames a control, route or key handler fails here until the catalog is
// regenerated (structure) or re-walked (journeys), so the map cannot silently rot.
const root = fileURLToPath(new URL('../../', import.meta.url));

describe('lt-5lb.5 as-is workflow catalog', () => {
  const catalog = loadCatalog(root);

  it('validates: schema, cross-references, provenance, freshness', () => {
    const findings = validateCatalog(root, catalog);
    expect(findings.map((f) => `${f.file}: ${f.message}`)).toEqual([]);
  });

  it('detects drift: renamed control id, altered snippet, unknown step target, bad route', () => {
    const tampered = structuredClone(catalog) as unknown as { structure: { controls: Array<{ id: string; source: { snippet: string } }> }; journeys: Array<{ journey: { steps: Array<{ userDoes: Array<{ target?: string }>; api?: string[] }> } }> };
    const save = tampered.structure.controls.find((c) => c.id === 'player.save')!;
    save.id = 'player.save-renamed';
    tampered.structure.controls[0]!.source.snippet = 'const nothing = here();';
    const step = tampered.journeys[0]!.journey.steps[0]!;
    step.userDoes[0]!.target = 'shell.does-not-exist';
    step.api = ['POST /api/nope'];
    const messages = validateCatalog(root, tampered as unknown as typeof catalog).map((f) => f.message);
    expect(messages.some((m) => m.startsWith('stale:'))).toBe(true);
    expect(messages.some((m) => m.startsWith('provenance drift'))).toBe(true);
    expect(messages.some((m) => m.includes('unknown control shell.does-not-exist'))).toBe(true);
    expect(messages.some((m) => m.includes('unknown route POST /api/nope'))).toBe(true);
    expect(messages.some((m) => m.includes('unknown control player.save'))).toBe(true); // journeys still reference the old id
  });

  it('extracts labels from one-line createElement + textContent statements', () => {
    const refresh = extractStructure(root).controls.find((c) => c.source.path === 'apps/web/src/views/exportImport.ts' && c.labels.includes('Refresh authoritative service preview'));
    expect(refresh?.id).toBe('export-import.refresh-authoritative-service-preview');
  });

  it('has at least the two journeys the spike promised, with observed-live evidence', () => {
    const ids = catalog.journeys.map((j) => j.journey.id);
    expect(ids).toContain('daily-driver-learning-loop');
    expect(ids).toContain('export-restore-learner-state');
    for (const { journey } of catalog.journeys) expect(['observed-live', 'source-reading', 'jsdom-test']).toContain(journey.evidence.kind);
  });

  it('generated projections are current (index + one file per journey)', () => {
    for (const [path, content] of renderProjections(catalog)) {
      expect(existsSync(join(root, path)), `${path} missing`).toBe(true);
      expect(readFileSync(join(root, path), 'utf8'), `${path} stale`).toBe(content);
    }
  });

  it('extraction is deterministic and finds the structure the app really has', () => {
    const a = extractStructure(root);
    const b = extractStructure(root);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.views.map((v) => v.id)).toEqual(['player', 'library', 'saved', 'review', 'practice', 'export-import', 'settings']);
    // Known anchors: every id is unique, the capture Save button carries its stable hook, routes include the restore pair.
    expect(new Set(a.controls.map((c) => c.id)).size).toBe(a.controls.length);
    expect(a.controls.find((c) => c.id === 'player.save')?.dataset).toEqual({ action: 'save-occurrence' });
    expect(a.api.routes.map((r) => r.path)).toEqual(expect.arrayContaining(['/api/restore/preview', '/api/restore/commit', '/api/state']));
    expect(a.keyboard.declared.some((d) => d.key === 'Space' && d.section === 'Review')).toBe(true);
  });

  it('projection helpers behave', () => {
    expect(slug('Save sentence…')).toBe('save-sentence');
    expect(slug('?')).toBe('');
    expect(scopeForFile('apps/web/src/views/exportImport.ts')).toBe('export-import');
    expect(scopeForFile('apps/web/src/views/player/stage.ts')).toBe('player');
    const dd = catalog.journeys.find((j) => j.journey.id === 'daily-driver-learning-loop')!.journey;
    const totals = frictionTotals(dd);
    expect(totals.steps).toBe(dd.steps.length);
    expect(totals.viewSwitches).toBeGreaterThan(0);
    const mermaid = journeyMermaid(dd);
    expect(mermaid.startsWith('flowchart TD')).toBe(true);
    // Decision steps render as diamonds `{...}`, others as boxes `[...]`.
    for (const step of dd.steps) expect(mermaid).toContain(`${step.id.replace(/-/g, '_')}${step.decision ? '{' : '['}`);
    expect(mermaid).not.toMatch(/^\s+s\d\d-/m); // node ids never contain hyphens
    // Steps are grouped by the view they act in; an app-driven navigation is labelled on the edge.
    const s04 = dd.steps.find((s) => s.id === 's04-import')!;
    expect(s04.view).toBe('library');
    expect(s04.navigatesTo).toBe('player');
    expect(mermaid.indexOf('subgraph library')).toBeLessThan(mermaid.indexOf('s04_import['));
    expect(mermaid.indexOf('s04_import[')).toBeLessThan(mermaid.indexOf('subgraph player'));
    expect(mermaid).toContain('s04_import -->|app → player; nav → library| s05_open_transcript_tools');
  });
});
