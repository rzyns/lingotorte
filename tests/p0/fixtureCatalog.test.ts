import { describe, expect, it } from 'vitest';
import { loadSyntheticFixtureCatalog } from '../../packages/domain/src/fixtures';

const repoRoot = new URL('../../', import.meta.url);

describe('P0 synthetic fixture catalog', () => {
  it('loads owned/synthetic media, subtitle, and transcript fixture provenance', () => {
    const catalog = loadSyntheticFixtureCatalog(repoRoot);

    expect(catalog.media.id).toBe('media.synthetic-polish-dialogue');
    expect(catalog.media.sourceKind).toBe('synthetic');
    expect(catalog.media.path).toBe('fixtures/media/synthetic-polish-dialogue.webm');
    expect(catalog.media.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(catalog.subtitleTracks.map((track) => track.role)).toEqual(['target', 'native']);
    expect(catalog.transcript.schemaVersion).toBe('lingotorte.fixture-transcript.v1');
    expect(catalog.prohibitedSourceMarkers).toEqual([]);
  });
});
