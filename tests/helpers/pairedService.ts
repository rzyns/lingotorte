import { startLingotorteLocalService as start, type LocalServiceConfig, type LocalServiceRuntime } from '../../apps/local-service/src/server.ts';
const capabilities = new Map<string, string>();
export async function startPairedService(config: LocalServiceConfig, runtime: LocalServiceRuntime = {}) {
  let capability = '';
  const service = await start(config, { ...runtime, receiveCapability: async value => { capability = value; await runtime.receiveCapability?.(value); } });
  capabilities.set(service.origin, capability);
  return { ...service, async close() { capabilities.delete(service.origin); await service.close(); } };
}
export const pairedFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const capability = capabilities.get(url.origin);
  if (!capability) throw new Error('Test client is not explicitly paired to this service.');
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${capability}`);
  return globalThis.fetch(input, { ...init, headers, credentials: 'omit', redirect: 'error' });
};
