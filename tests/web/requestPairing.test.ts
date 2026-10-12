import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, connectLocalService, setLocalServiceBaseUrl } from '../../apps/web/src/model.ts';

afterEach(() => vi.unstubAllGlobals());
describe('private pairing regression', () => {
  it('does not send status or state before explicit private pairing', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('blocked'));
    vi.stubGlobal('fetch', fetcher);
    const model = createAppModel();
    await connectLocalService(model, 'http://127.0.0.1:5174');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a path-bearing destination before any request', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('blocked'));
    vi.stubGlobal('fetch', fetcher);
    const model = createAppModel();
    setLocalServiceBaseUrl(model, 'http://127.0.0.1:5174/private');
    await connectLocalService(model);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
