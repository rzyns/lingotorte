import { describe, expect, it } from 'vitest';
import { scanRuntimePrivacyBoundaries } from '../../packages/domain/src/privacyScan';

const repoRoot = new URL('../../', import.meta.url);

describe('runtime privacy boundary scan', () => {
  it('keeps runtime code free of Lingopie URLs or proprietary fixture markers', async () => {
    const result = await scanRuntimePrivacyBoundaries(repoRoot);

    expect(result.scannedFiles.length).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });
});
