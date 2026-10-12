import { createAppModel, pairLocalService } from '../../apps/web/src/model.ts';
import { pairTransport } from '../../apps/web/src/pairedTransport.ts';
// Public synthetic mock bytes ONLY, never used as a production service secret.
export const SYNTHETIC_CAPABILITY = 'A'.repeat(43);
export function pairedModel(...args: Parameters<typeof createAppModel>) {
  const model = createAppModel(...args);
  pairLocalService(model, SYNTHETIC_CAPABILITY);
  return model;
}
export function syntheticTransport(origin = 'http://127.0.0.1:5174') {
  return pairTransport({}, origin, SYNTHETIC_CAPABILITY);
}
