import type { DisabledLookupAdapter, DisabledLookupResult, LookupTokenInput, ProviderPolicy } from './types';

export function defaultProviderPolicy(): ProviderPolicy {
  return {
    onlineProvidersEnabled: false,
    allowedDataClasses: [],
  };
}

export function createDisabledLookupAdapter(policy: ProviderPolicy): DisabledLookupAdapter {
  if (policy.onlineProvidersEnabled !== false || policy.allowedDataClasses.length !== 0) {
    throw new TypeError('P0 disabled lookup adapter only accepts the provider-disabled policy');
  }

  return {
    adapterId: 'lingotorte.disabled-lookup',
    privacyMode: 'local',
    async lookupToken(input: LookupTokenInput): Promise<DisabledLookupResult> {
      if (input.token.length === 0 || input.language.length === 0 || input.cueId.length === 0) {
        throw new TypeError('lookup input must preserve token, language, and cue context');
      }
      return {
        status: 'disabled',
        adapterId: 'lingotorte.disabled-lookup',
        privacyMode: 'local',
        reason: 'online-providers-disabled',
      };
    },
  };
}
