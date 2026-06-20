import { describe, expect, it } from 'vitest';
import { createDisabledLookupAdapter, defaultProviderPolicy } from '../../packages/domain/src/providerPolicy';
import { withNoNetwork } from './networkTrap';

describe('provider-disabled no-network harness', () => {
  it('returns a typed disabled lookup result without attempting network access', async () => {
    const adapter = createDisabledLookupAdapter(defaultProviderPolicy());

    const result = await withNoNetwork(async () =>
      adapter.lookupToken({
        token: 'Cześć',
        language: 'pl',
        cueId: 'cue.pl.0001',
      }),
    );

    expect(result.networkAttempts).toEqual([]);
    expect(result.value).toEqual({
      status: 'disabled',
      adapterId: 'lingotorte.disabled-lookup',
      privacyMode: 'local',
      reason: 'online-providers-disabled',
    });
  });

  it('fails the test harness on attempted fetch while providers are disabled', async () => {
    await expect(
      withNoNetwork(() => fetch('https://example.invalid/provider')),
    ).rejects.toThrow(/Network disabled during provider-off test/);
  });
});
