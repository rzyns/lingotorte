import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const dns = require('node:dns') as typeof import('node:dns');
const http = require('node:http') as typeof import('node:http');
const https = require('node:https') as typeof import('node:https');
const net = require('node:net') as typeof import('node:net');

export type NetworkAttempt = {
  primitive: 'fetch' | 'XMLHttpRequest' | 'WebSocket' | 'http' | 'https' | 'net' | 'dns';
  target: string;
};

type NoNetworkResult<T> = {
  value: T;
  networkAttempts: NetworkAttempt[];
};

export async function withNoNetwork<T>(operation: () => Promise<T> | T): Promise<NoNetworkResult<T>> {
  const attempts: NetworkAttempt[] = [];
  const record = (primitive: NetworkAttempt['primitive'], target: unknown): never => {
    attempts.push({ primitive, target: String(target) });
    throw new Error(`Network disabled during provider-off test: ${primitive} ${String(target)}`);
  };

  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalXMLHttpRequest = globalThis.XMLHttpRequest;

  globalThis.fetch = ((input: RequestInfo | URL) => record('fetch', input)) as typeof fetch;
  globalThis.WebSocket = class BlockedWebSocket {
    constructor(url: string | URL) {
      record('WebSocket', url);
    }
  } as typeof WebSocket;
  globalThis.XMLHttpRequest = class BlockedXMLHttpRequest {
    open(_method: string, url: string | URL): void {
      record('XMLHttpRequest', url);
    }
  } as typeof XMLHttpRequest;

  const spies = [
    vi.spyOn(http, 'request').mockImplementation(((url: unknown) => record('http', url)) as typeof http.request),
    vi.spyOn(http, 'get').mockImplementation(((url: unknown) => record('http', url)) as typeof http.get),
    vi.spyOn(https, 'request').mockImplementation(((url: unknown) => record('https', url)) as typeof https.request),
    vi.spyOn(https, 'get').mockImplementation(((url: unknown) => record('https', url)) as typeof https.get),
    vi.spyOn(net, 'connect').mockImplementation(((options: unknown) => record('net', JSON.stringify(options))) as typeof net.connect),
    vi.spyOn(net, 'createConnection').mockImplementation(((options: unknown) => record('net', JSON.stringify(options))) as typeof net.createConnection),
    vi.spyOn(dns, 'lookup').mockImplementation(((hostname: unknown) => record('dns', hostname)) as unknown as typeof dns.lookup),
    vi.spyOn(dns, 'resolve').mockImplementation(((hostname: unknown) => record('dns', hostname)) as unknown as typeof dns.resolve),
    vi.spyOn(dns, 'resolve4').mockImplementation(((hostname: unknown) => record('dns', hostname)) as unknown as typeof dns.resolve4),
    vi.spyOn(dns, 'resolve6').mockImplementation(((hostname: unknown) => record('dns', hostname)) as unknown as typeof dns.resolve6),
  ];

  try {
    const value = await operation();
    return { value, networkAttempts: attempts };
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
    spies.forEach((spy) => spy.mockRestore());
  }
}
