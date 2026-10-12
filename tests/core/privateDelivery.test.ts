import { it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { lstat, chmod, unlink } from 'node:fs/promises';
import { socketDelivery, retrieveCapability, privateTerminal, PAIRING_DIRECTORY, PAIRING_SOCKET } from '../../apps/local-service/src/privateDelivery.ts';

it.skipIf(process.env.LINGOTORTE_QUALIFY_IPC !== 'true')('actual tmpfs receiver roundtrip, permission rejection, loss and owner-only disposal (Linux Docker tmpfs qualification)', async () => {
  // This file is run explicitly with the API-only tmpfs, not the ordinary suite.

  const delivery = await socketDelivery();
  const capability = randomBytes(32).toString('base64url');
  try {
    await delivery.receiveCapability(capability);
    expect(await delivery.deliveryReady()).toBe(true);
    expect((await retrieveCapability()) === capability).toBe(true);
    expect((await lstat(PAIRING_DIRECTORY)).mode & 0o777).toBe(0o700);
    expect((await lstat(PAIRING_SOCKET)).mode & 0o777).toBe(0o600);
    await expect(privateTerminal()).rejects.toThrow();
    await chmod(PAIRING_SOCKET, 0o644); expect(await delivery.deliveryReady()).toBe(false); await expect(retrieveCapability()).rejects.toThrow();
    await chmod(PAIRING_SOCKET, 0o600); expect(await delivery.deliveryReady()).toBe(true);
    await expect(socketDelivery()).rejects.toThrow(); // Never unlink a foreign/stale endpoint.
    await unlink(PAIRING_SOCKET); expect(await delivery.deliveryReady()).toBe(false);
  } finally { await delivery.close(); }
  await expect(lstat(PAIRING_SOCKET)).rejects.toThrow();
  console.info(JSON.stringify({ tmpfsRoundtrip: true, socketMode: '0600', directoryMode: '0700', nonTTYRefused: true, permissionLossClosed: true, socketLossClosed: true, foreignEndpointPreserved: true }));
});
