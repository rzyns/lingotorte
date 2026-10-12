import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { canonicalOrigin } from '../../apps/local-service/src/requestAdmission.ts';

function raw(origin: string, path: string, method: string, headers: string[], body?: string) {
  return new Promise<{ status: number; body: string; continues: number }>((resolve, reject) => {
    let continues = 0;
    const req = request(origin, { path, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString(), continues }));
    });
    req.on('continue', () => { continues++; }); req.on('error', reject); req.end(body);
  });
}

describe('partial real admission matrix (not A01-A30 qualification)', () => {
  it('compares real logical dispatch state for generated admission and envelope denials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-sor-matrix-'));
    let token = '';
    let observe: (() => unknown) | undefined;
    let receiver = true;
    let runnerCalls = 0;
    const service = await startLingotorteLocalService({ host: '127.0.0.1', port: 0,
      databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false },
      { receiveCapability: value => { token = value; }, observeState: value => { observe = value; }, deliveryReady: async () => receiver,
        commandRunner: async () => { runnerCalls++; throw new Error('Unexpected command.'); } });
    const id = '11111111-1111-4111-8111-111111111111';
    const host = new URL(service.origin).host;
    const routes: { method: string; path: string; body?: string }[] = [
      { method: 'GET', path: '/api/status' }, { method: 'GET', path: '/api/state' },
      { method: 'GET', path: `/api/jobs/${id}` }, { method: 'GET', path: `/api/snippets/${id}` },
      { method: 'PUT', path: '/api/state', body: '{}' }, { method: 'POST', path: `/api/jobs/${id}/cancel`, body: '{}' },
      { method: 'DELETE', path: `/api/snippets/${id}` }, { method: 'POST', path: '/api/artifacts/cleanup', body: '{}' },
      ...['waiting', 'noop', 'local-transcription', 'elevenlabs-scribe', 'youtube-caption', 'embedded-subtitle-list',
        'embedded-subtitle-extract', 'source-audio-snippet'].map(kind => ({ method: 'POST', path: '/api/jobs',
          body: JSON.stringify({ kind, payload: { mediaPath: '/synthetic/not-read.webm' } }) })),
    ];
    const faults: { name: string; status: number; host?: string; origin?: string; missing?: boolean; wrong?: boolean; duplicate?: string }[] = [
      { name: 'missing-auth', status: 401, missing: true }, { name: 'wrong-auth', status: 401, wrong: true },
      { name: 'foreign-origin', status: 403, origin: 'http://unpaired.invalid' }, { name: 'null-origin', status: 403, origin: 'null' },
      { name: 'wrong-host', status: 403, host: 'unpaired.invalid:5174' },
      { name: 'duplicate-origin', status: 400, duplicate: 'Origin' }, { name: 'duplicate-auth', status: 400, duplicate: 'Authorization' },
    ];
    let expanded = 0;
    const oracle = () => JSON.stringify({ state: observe!(), runnerCalls });
    try {
      const created = await fetch(`${service.origin}/api/jobs`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{"kind":"waiting"}' });
      expect(created.status).toBe(201);
      for (const fault of faults) for (const route of routes) {
        const headers = ['Host', fault.host ?? host, 'Origin', fault.origin ?? 'http://127.0.0.1:5173'];
        if (!fault.missing) headers.push('Authorization', `Bearer ${fault.wrong ? 'A'.repeat(43) : token}`);
        if (fault.duplicate) headers.push(fault.duplicate, fault.duplicate === 'Origin' ? 'http://127.0.0.1:5173' : 'Bearer invalid');
        if (route.body !== undefined) headers.push('Content-Type', 'application/json');
        const before = oracle();
        const result = await raw(service.origin, route.path, route.method, headers, route.body);
        expect(result.status, `${fault.name} ${route.method} ${route.path}`).toBe(fault.status);
        expect(result.body.includes(token)).toBe(false);
        expect(result.body).not.toContain('snapshot');
        expect(oracle()).toBe(before); expanded++;
      }
      const auth = ['Host', host, 'Authorization', `Bearer ${token}`];
      const envelopes = [
        { path: '/api/jobs', method: 'POST', headers: ['Content-Type', 'text/plain'], body: '{}', status: 415 },
        { path: '/api/jobs', method: 'POST', headers: ['Content-Type', 'application/json'], body: '', status: 400 },
        { path: '/api/jobs', method: 'POST', headers: ['Content-Type', 'application/json'], body: '[]', status: 400 },
        { path: '/api/artifacts/cleanup', method: 'POST', headers: ['Content-Type', 'application/json'], body: '{"extra":true}', status: 400 },
        { path: '/api/state', method: 'GET', headers: ['Content-Type', 'application/json'], status: 415 },
        { path: '/api/state', method: 'GET', headers: ['Content-Length', '2'], body: '{}', status: 400 },
        { path: '/api/state', method: 'PATCH', headers: [], status: 405 },
        { path: '/api/state?x=1', method: 'GET', headers: [], status: 400 },
        { path: '/api/%73tate', method: 'GET', headers: [], status: 400 },
        { path: '/api/unknown', method: 'GET', headers: [], status: 404 },
        { path: '/api/jobs', method: 'POST', headers: ['Content-Type', 'application/json', 'Content-Encoding', 'gzip'], body: '{}', status: 415 },
        { path: '/api/jobs', method: 'POST', headers: ['Content-Type', 'application/json; charset=latin1'], body: '{}', status: 415 },
        { path: '/api/state', method: 'OPTIONS', headers: ['Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'PUT', 'Access-Control-Request-Headers', 'content-type'], status: 403 },
      ];
      for (const test of envelopes) {
        const before = oracle();
        expect((await raw(service.origin, test.path, test.method, [...auth, ...test.headers], test.body)).status).toBe(test.status);
        expect(oracle()).toBe(before); expanded++;
      }
      const before = oracle();
      const continued = await raw(service.origin, '/api/jobs', 'POST', ['Host', host, 'Expect', '100-continue', 'Content-Type', 'application/json'], '{}');
      expect(continued.status).toBe(401); expect(continued.continues).toBe(0); expect(oracle()).toBe(before); expanded++;
      const preflight = await raw(service.origin, '/api/state', 'OPTIONS', ['Host', host, 'Origin', 'http://127.0.0.1:5173',
        'Access-Control-Request-Method', 'PUT', 'Access-Control-Request-Headers', 'authorization, content-type']);
      expect(preflight.status).toBe(204); expect(preflight.body).toBe(''); expect(oracle()).toBe(before);
      receiver = false;
      expect((await raw(service.origin, '/api/state', 'GET', auth)).status).toBe(401); expect(oracle()).toBe(before); expanded++;
      console.info(JSON.stringify({ expandedDenials: expanded, routeClasses: routes.length, admissionFaults: faults.length,
        envelopeCases: envelopes.length, realLogicalOracle: true, seededSnippetOracle: false, completeAcceptance: false }));
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });

  it('fails private delivery preflight without creating mutable roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-sor-fail-'));
    try {
      const config = { host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false };
      await expect(startLingotorteLocalService(config)).rejects.toThrow('Private capability delivery is required.');
      expect(await readdir(root)).toEqual([]);
      await expect(startLingotorteLocalService(config, { receiveCapability: () => {}, deliveryReady: async () => false })).rejects.toThrow('Private delivery is unavailable.');
      expect(await readdir(root)).toEqual([]);
      for (const invalid of ['http://127.1:5173', 'http://127.0.0.1:05173', 'http://user@localhost:5173', 'http://localhost.:5173', 'http://localhost:80', 'http://localhost/path', 'http://*.invalid:5173']) expect(() => canonicalOrigin(invalid)).toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
