// lt-2t4 integrated qualification: restore routes through the real HTTP admission gate and file-backed SQLite.
import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { LocalStore, ExportService } from '../../packages/storage/src';
import { makeSubtitleTrack } from '../../packages/domain/src';
import type { PracticeMode } from '../../packages/domain/src';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';

const at = '2026-06-21T12:00:00.000Z';
const MODES: PracticeMode[] = ['typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder'];

function fixture(mode: PracticeMode = 'typed-input', suffix = 'a') {
  const store = new LocalStore();
  const itemId = `lt2t4-item-${suffix}`; const occurrenceId = `lt2t4-occ-${suffix}`; const cardId = `lt2t4-card-${suffix}`; const reviewId = `lt2t4-review-${suffix}`;
  const sourceContext = { mediaId: 'media', mediaPath: '/synthetic/media.webm', mediaFingerprint: `sha256:${'a'.repeat(64)}` as const, subtitleTrackId: 'track', cueId: 'cue', timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 } };
  store.putSubtitleTrack({ ...makeSubtitleTrack({ mediaId: 'media', language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/synthetic/track.srt', contentSha256: sourceContext.mediaFingerprint, isActive: true }), id: 'track', createdAt: at });
  store.putMediaAsset({ id: 'media', title: 'synthetic', originalPath: '/synthetic/media.webm', contentSha256: sourceContext.mediaFingerprint, durationMs: 1000, container: 'webm', sizeBytes: 123, importedAt: at, lastSeenAt: at, privacyLabel: 'synthetic' });
  store.putSavedItem({ id: itemId, kind: 'lexeme', language: 'pl', displayText: 'synthetic', createdAt: at, updatedAt: at });
  store.putSavedOccurrence({ id: occurrenceId, savedItemId: itemId, mediaId: 'media', cueId: 'cue', startMs: 0, endMs: 1000, selectionKind: 'lexeme', selectionText: 'synthetic', sourceContext, createdAt: at });
  store.putReviewCard({ id: cardId, savedItemId: itemId, savedOccurrenceId: occurrenceId, cardType: 'recognition', promptTemplate: 'synthetic', createdAt: at });
  store.putReviewCardState({ cardId, state: 'review', dueAt: at, stability: 2, difficulty: 3, elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0, fsrsVersion: 'synthetic', updatedAt: at });
  store.addReviewEvent({ id: reviewId, cardId, rating: 'good', reviewedAt: at, createdAt: at, previousStateJson: '{"state":"new"}', nextStateJson: '{"state":"review"}' });
  store.addPracticeAttempt({ id: `lt2t4-attempt-${suffix}`, cardId, mode, result: 'pass', sourceContext, reviewedAt: at, createdAt: at, givenAnswer: 'synthetic', expectedAnswer: 'synthetic', responseMs: 123, eventLink: { reviewEventId: reviewId } });
  store.putProviderPolicy({ id: 'lt2t4-policy', providerId: 'elevenlabs-scribe', enabled: false, requiresConfirmation: true, allowedDataClasses: [], createdAt: at, updatedAt: at });
  return store;
}
const wire = (store: LocalStore) => JSON.parse(JSON.stringify(new ExportService(store, 'test').buildManifest()));
const emptyWire = () => wire(new LocalStore());

function tableState(file: string) {
  const reader = new DatabaseSync(file, { readOnly: true });
  try {
    const names = reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return JSON.stringify(Object.fromEntries(names.map(({ name }) => [name, reader.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY 1`).all()])));
  } finally { reader.close(); }
}
function raw(origin: string, path: string, method: string, headers: string[], body?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(origin, { path, method, headers }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end(body);
  });
}

async function harness(root: string) {
  let token = ''; let observe: (() => unknown) | undefined; let runnerCalls = 0;
  const databasePath = join(root, 'state.db'); const scratchDir = join(root, 'scratch');
  const service = await startLingotorteLocalService({ host: '127.0.0.1', port: 0, databasePath, scratchDir, modelCacheDir: join(root, 'models'), allowOnlineProviders: false },
    { receiveCapability: v => { token = v; }, observeState: v => { observe = v; }, commandRunner: async () => { runnerCalls++; throw new Error('Unexpected command.'); } });
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await fetch(`${service.origin}${path}`, { method: init.method ?? 'GET', headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    return { status: res.status, json: await res.json().catch(() => undefined) as any };
  };
  const state = async () => (await call('/api/state')).json;
  const scratchFiles = async () => (await readdir(scratchDir, { recursive: true }).catch(() => [])).sort();
  const oracle = async () => JSON.stringify({ logical: observe!(), runnerCalls, tables: tableState(databasePath), files: await scratchFiles() });
  const restore = async (manifest: unknown, mode: 'merge' | 'replace-active') => {
    const before = await state();
    const preview = await call('/api/restore/preview', { method: 'POST', body: { manifest, mode, expectedRevision: before.revision } });
    expect(preview.status).toBe(200);
    const body = { manifest, mode, expectedRevision: before.revision, confirmation: { confirmedAt: at, confirmReplace: mode === 'replace-active', confirmOverwrite: mode === 'merge', acknowledgedWarnings: preview.json.preview.warnings.map((w: { kind: string }) => w.kind) } };
    const commit = await call('/api/restore/commit', { method: 'POST', body }); return { commit, body, before };
  };
  return { service, call, state, oracle, restore, databasePath, token: () => token };
}

describe('lt-2t4 integrated request/restore qualification', () => {
  it('restore preview/commit: full fault x route denial matrix has zero side effects; positive controls change only on admitted commit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-2t4-gate-'));
    const h = await harness(root);
    try {
      const initial = await h.state();
      expect((await h.call('/api/state', { method: 'PUT', body: { snapshot: fixture().snapshot(), expectedRevision: initial.revision } })).status).toBe(200);
      expect((await h.call('/api/jobs', { method: 'POST', body: { kind: 'waiting' } })).status).toBe(201); // pending job is part of the oracle
      const seeded = await h.state(); const host = new URL(h.service.origin).host; const token = h.token();
      const body = (route: string) => JSON.stringify({ manifest: emptyWire(), mode: 'replace-active', expectedRevision: seeded.revision,
        ...(route === 'commit' ? { confirmation: { confirmedAt: at, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: ['replace-active-learner-data', 'learner-history-removed', 'review-schedule-reset'] } } : {}) });
      const faults: { name: string; status: number; host?: string; origin?: string; missing?: boolean; wrong?: boolean; dup?: string; type?: string; enc?: boolean }[] = [
        { name: 'missing-auth', status: 401, missing: true }, { name: 'wrong-auth', status: 401, wrong: true },
        { name: 'foreign-origin', status: 403, origin: 'http://unpaired.invalid' }, { name: 'null-origin', status: 403, origin: 'null' },
        { name: 'wrong-host', status: 403, host: 'unpaired.invalid:5174' }, { name: 'dup-origin', status: 400, dup: 'Origin' },
        { name: 'dup-auth', status: 400, dup: 'Authorization' }, { name: 'text-plain', status: 415, type: 'text/plain' },
        { name: 'form', status: 415, type: 'application/x-www-form-urlencoded' }, { name: 'latin1', status: 415, type: 'application/json; charset=latin1' },
        { name: 'gzip', status: 415, enc: true },
      ];
      let denials = 0;
      for (const route of ['preview', 'commit']) {
        for (const f of faults) {
          const headers = ['Host', f.host ?? host, 'Origin', f.origin ?? 'http://127.0.0.1:5173', 'Content-Type', f.type ?? 'application/json'];
          if (!f.missing) headers.push('Authorization', `Bearer ${f.wrong ? 'A'.repeat(43) : token}`);
          if (f.dup) headers.push(f.dup, f.dup === 'Origin' ? 'http://127.0.0.1:5173' : 'Bearer invalid');
          if (f.enc) headers.push('Content-Encoding', 'gzip');
          const before = await h.oracle();
          const res = await raw(h.service.origin, `/api/restore/${route}`, 'POST', headers, body(route));
          expect(res.status, `${f.name} ${route}`).toBe(f.status); expect(res.body.includes(token)).toBe(false); expect(res.body).not.toContain('lt2t4-review');
          expect(await h.oracle()).toBe(before); denials++;
        }
        const auth = ['Host', host, 'Authorization', `Bearer ${token}`];
        const envelopes = [
          { method: 'GET', headers: [], status: 405 }, { method: 'PUT', headers: ['Content-Type', 'application/json'], b: '{}', status: 405 },
          { method: 'POST', headers: ['Content-Type', 'application/json'], b: '', status: 400 },
          { method: 'POST', headers: ['Content-Type', 'application/json'], b: '[]', status: 400 },
          { method: 'POST', headers: ['Content-Type', 'application/json'], b: JSON.stringify({ ...JSON.parse(body(route)), extra: 1 }), status: 400 },
          { method: 'POST', headers: ['Content-Type', 'application/json'], b: JSON.stringify({ manifest: emptyWire(), mode: 'replace-active' }), status: 428 },
          { method: 'POST', headers: ['Content-Type', 'application/json'], b: JSON.stringify({ ...JSON.parse(body(route)), mode: 'overwrite' }), status: 400 },
          { method: 'POST', headers: ['Content-Type', 'application/json'], b: JSON.stringify({ ...JSON.parse(body(route)), expectedRevision: `sha256:${'0'.repeat(64)}` }), status: 409 },
          { method: 'POST', headers: ['Content-Type', 'application/json'], b: 'x'.repeat(30 * 1024 * 1024), status: 413 },
        ];
        if (route === 'commit') envelopes.push({ method: 'POST', headers: ['Content-Type', 'application/json'], b: JSON.stringify({ ...JSON.parse(body(route)), confirmation: undefined }), status: 400 });
        for (const e of envelopes) {
          const before = await h.oracle();
          const res = await raw(h.service.origin, `/api/restore/${route}`, e.method, [...auth, ...e.headers], e.b);
          expect(res.status, `${route} ${e.method} envelope ${e.status}`).toBe(e.status); expect(await h.oracle()).toBe(before); denials++;
        }
        const before = await h.oracle();
        const pre = await raw(h.service.origin, `/api/restore/${route}`, 'OPTIONS', ['Host', host, 'Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'POST', 'Access-Control-Request-Headers', 'authorization, content-type']);
        expect(pre.status).toBe(204); expect(pre.body).toBe(''); expect(await h.oracle()).toBe(before);
        const preBad = await raw(h.service.origin, `/api/restore/${route}`, 'OPTIONS', ['Host', host, 'Origin', 'http://unpaired.invalid', 'Access-Control-Request-Method', 'POST', 'Access-Control-Request-Headers', 'authorization, content-type']);
        expect(preBad.status).toBe(403); expect(await h.oracle()).toBe(before); denials++;
        // A21: successful preflight does not authorize an unauthenticated actual request.
        const after = await raw(h.service.origin, `/api/restore/${route}`, 'POST', ['Host', host, 'Origin', 'http://127.0.0.1:5173', 'Content-Type', 'application/json'], body(route));
        expect(after.status).toBe(401); expect(await h.oracle()).toBe(before); denials++;
      }
      // Positive controls: authorized preview is read-only; authorized commit changes exactly once.
      const beforePreview = await h.oracle();
      const preview = await h.call('/api/restore/preview', { method: 'POST', body: { manifest: emptyWire(), mode: 'replace-active', expectedRevision: seeded.revision } });
      expect(preview.status).toBe(200); expect(await h.oracle()).toBe(beforePreview);
      const committed = await h.call('/api/restore/commit', { method: 'POST', body: { ...JSON.parse(body('commit')), confirmation: { confirmedAt: at, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: preview.json.preview.warnings.map((w: { kind: string }) => w.kind) } } });
      expect(committed.status).toBe(200); expect(await h.oracle()).not.toBe(beforePreview);
      expect((await h.state()).revision).toBe(committed.json.revision);
      console.info(JSON.stringify({ lt2t4RestoreDenials: denials }));
    } finally { await h.service.close(); await rm(root, { recursive: true, force: true }); }
    // lt-04k.1: 50+ oracle snapshots; ~1-2s alone, >5s default under full-suite load.
  }, 30_000);

  it.each(MODES)('T01/T14 %s: serialized linked practice merges twice over HTTP, ordinary save, service close/reopen exact', async mode => {
    const root = await mkdtemp(join(tmpdir(), 'lt-2t4-t01-'));
    const source = fixture(mode); const manifest = wire(source); const expected = source.snapshot();
    let h = await harness(root);
    try {
      const first = await h.restore(manifest, 'merge'); expect(first.commit.status).toBe(200);
      const afterFirst = await h.state(); const tablesFirst = tableState(h.databasePath);
      const second = await h.restore(manifest, 'merge'); expect(second.commit.status).toBe(200);
      const afterSecond = await h.state();
      expect(afterSecond.snapshot.reviewEvents).toEqual(afterFirst.snapshot.reviewEvents);
      expect(afterSecond.snapshot.practiceAttempts).toEqual(afterFirst.snapshot.practiceAttempts);
      expect(afterSecond.snapshot.learnerAudit).toEqual(afterFirst.snapshot.learnerAudit);
      expect(afterSecond.snapshot.reviewCardStates).toEqual(afterFirst.snapshot.reviewCardStates);
      expect(JSON.parse(tableState(h.databasePath)).review_event).toEqual(JSON.parse(tablesFirst).review_event);
      const save = await h.call('/api/state', { method: 'PUT', body: { snapshot: afterSecond.snapshot, expectedRevision: afterSecond.revision } }); expect(save.status).toBe(200);
      await h.service.close(); h = await harness(root);
      const reopened = await h.state();
      expect(reopened.revision).toBe(save.json.revision);
      expect(reopened.snapshot.practiceAttempts).toEqual(expected.practiceAttempts);
      expect(reopened.snapshot.reviewEvents).toEqual(expected.reviewEvents);
      expect(reopened.snapshot.savedOccurrences).toEqual(expected.savedOccurrences);
      expect(reopened.snapshot.reviewCardStates).toEqual(expected.reviewCardStates);
      expect(reopened.snapshot.learnerAudit.reviewEvents).toEqual(expected.reviewEvents);
      expect(reopened.snapshot.learnerAudit.practiceAttempts).toEqual(expected.practiceAttempts);
    } finally { await h.service.close(); await rm(root, { recursive: true, force: true }); }
  });

  it('T04/T05/T07: empty then subset+new replacement over HTTP survive ordinary save and close/reopen; unselected history stays retained only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-2t4-t04-'));
    let h = await harness(root);
    try {
      const a = fixture('typed-input', 'a'); const b = fixture('speaking', 'b');
      const both = new LocalStore({ ...a.snapshot(), ...Object.fromEntries(Object.entries(b.snapshot()).map(([k, v]) => [k, Array.isArray(v) ? [...(a.snapshot() as any)[k], ...v] : { ...(a.snapshot() as any)[k], ...(v as object) }])) } as any);
      const s0 = await h.state(); expect((await h.call('/api/state', { method: 'PUT', body: { snapshot: both.snapshot(), expectedRevision: s0.revision } })).status).toBe(200);
      const seeded = await h.state();
      const empty = await h.restore(emptyWire(), 'replace-active'); expect(empty.commit.status).toBe(200);
      let cur = await h.state(); expect((await h.call('/api/state', { method: 'PUT', body: { snapshot: cur.snapshot, expectedRevision: cur.revision } })).status).toBe(200);
      await h.service.close(); h = await harness(root);
      cur = await h.state();
      expect(cur.snapshot.reviewEvents).toEqual([]); expect(cur.snapshot.practiceAttempts).toEqual([]);
      for (const k of ['savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates']) expect(cur.snapshot[k]).toEqual({});
      expect(cur.snapshot.learnerAudit.reviewEvents).toEqual(seeded.snapshot.learnerAudit.reviewEvents);
      expect(cur.snapshot.learnerAudit.practiceAttempts).toEqual(seeded.snapshot.learnerAudit.practiceAttempts);
      for (const k of ['mediaAssets', 'subtitleTracks', 'providerPolicies', 'importJobs']) expect(cur.snapshot[k]).toEqual(seeded.snapshot[k]);
      // T05: subset (b only) + new record c.
      const c = fixture('audio-recall', 'c'); const bc = new LocalStore({ ...b.snapshot() });
      const cs = c.snapshot();
      Object.values(cs.savedItems).forEach(x => bc.putSavedItem(x)); Object.values(cs.savedOccurrences).forEach(x => bc.putSavedOccurrence(x));
      Object.values(cs.reviewCards).forEach(x => bc.putReviewCard(x)); Object.values(cs.reviewCardStates).forEach(x => bc.putReviewCardState(x));
      cs.reviewEvents.forEach(x => bc.addReviewEvent(x)); cs.practiceAttempts.forEach(x => bc.addPracticeAttempt(x));
      const subset = wire(bc);
      for (let i = 0; i < 2; i++) { const r = await h.restore(subset, 'replace-active'); expect(r.commit.status).toBe(200); }
      cur = await h.state(); expect((await h.call('/api/state', { method: 'PUT', body: { snapshot: cur.snapshot, expectedRevision: cur.revision } })).status).toBe(200);
      await h.service.close(); h = await harness(root);
      cur = await h.state();
      const ids = (xs: readonly { id: string }[]) => xs.map(x => x.id).sort();
      expect(ids(cur.snapshot.reviewEvents)).toEqual(['lt2t4-review-b', 'lt2t4-review-c']);
      expect(ids(cur.snapshot.practiceAttempts)).toEqual(['lt2t4-attempt-b', 'lt2t4-attempt-c']);
      expect(ids(cur.snapshot.learnerAudit.reviewEvents)).toEqual(['lt2t4-review-a', 'lt2t4-review-b', 'lt2t4-review-c']);
      expect(cur.snapshot.learnerAudit.reviewEvents.filter((e: { id: string }) => e.id === 'lt2t4-review-c')).toHaveLength(1);
      // T07: re-export from active readback includes only active learner records.
      const reexport = new ExportService(new LocalStore(cur.snapshot), 'test').buildManifest();
      expect(ids(reexport.content.reviewEvents)).toEqual(['lt2t4-review-b', 'lt2t4-review-c']);
      expect(JSON.stringify(reexport)).not.toContain('lt2t4-review-a');
    } finally { await h.service.close(); await rm(root, { recursive: true, force: true }); }
  });

  it('T09: lost acknowledgement reconciled by readback; stale/out-of-order writers and replays cannot mutate or resurrect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-2t4-t09-'));
    let h = await harness(root);
    try {
      const s0 = await h.state(); expect((await h.call('/api/state', { method: 'PUT', body: { snapshot: fixture().snapshot(), expectedRevision: s0.revision } })).status).toBe(200);
      const seeded = await h.state();
      const lost = await h.restore(emptyWire(), 'replace-active'); // response treated as lost by the client
      expect(lost.commit.status).toBe(200);
      const readback = await h.state();
      expect(readback.revision).not.toBe(seeded.revision); expect(readback.snapshot.reviewEvents).toEqual([]);
      const beforeReplays = await h.oracle();
      // Blind replay of the identical commit, a changed mode, a stale ordinary save (prior tab/autosave) are all refused with no effect.
      expect((await h.call('/api/restore/commit', { method: 'POST', body: lost.body })).status).toBe(409);
      expect((await h.call('/api/restore/commit', { method: 'POST', body: { ...lost.body, mode: 'merge', confirmation: { ...lost.body.confirmation, confirmReplace: false, confirmOverwrite: true } } })).status).toBe(409);
      expect((await h.call('/api/state', { method: 'PUT', body: { snapshot: seeded.snapshot, expectedRevision: seeded.revision } })).status).toBe(409);
      expect((await h.call('/api/state', { method: 'PUT', body: { snapshot: seeded.snapshot } })).status).toBe(428);
      expect(await h.oracle()).toBe(beforeReplays);
      // A current-revision ordinary save carrying the old active snapshot cannot reactivate retained history.
      const resurrect = await h.call('/api/state', { method: 'PUT', body: { snapshot: seeded.snapshot, expectedRevision: readback.revision } });
      expect(resurrect.status).toBe(400);
      expect(await h.oracle()).toBe(beforeReplays);
      await h.service.close(); h = await harness(root);
      const reopened = await h.state();
      expect(reopened.revision).toBe(readback.revision); expect(reopened.snapshot.reviewEvents).toEqual([]);
      expect(reopened.snapshot.learnerAudit.reviewEvents).toEqual(seeded.snapshot.reviewEvents);
    } finally { await h.service.close(); await rm(root, { recursive: true, force: true }); }
  });
  it('A22: restore preview/commit denials while a snippet worker is paused leave the full oracle unchanged; the worker stays owned and releasable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-2t4-a22-'));
    const databasePath = join(root, 'state.db'); const scratchDir = join(root, 'scratch');
    const mediaPath = join(root, 'synthetic.mkv'); await writeFile(mediaPath, 'synthetic');
    let token = ''; let observe: (() => unknown) | undefined; let calls = 0;
    let pause = false; let release!: () => void; let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }); const running = new Promise<void>(resolve => { started = resolve; });
    const service = await startLingotorteLocalService({ host: '127.0.0.1', port: 0, databasePath, scratchDir, modelCacheDir: join(root, 'models'), allowOnlineProviders: false }, {
      receiveCapability: v => { token = v; }, observeState: v => { observe = v; },
      commandRunner: async (command, args) => {
        calls++; if (pause) { started(); await gate; }
        if (command === 'ffmpeg') { await writeFile(args.at(-1)!, 'RIFF-synthetic-wave'); return { exitCode: 0, stderr: '', stdout: '' }; }
        return { exitCode: 0, stderr: '', stdout: '{"streams":[]}' };
      } });
    const host = new URL(service.origin).host;
    const auth = ['Host', host, 'Authorization', `Bearer ${token}`];
    const json = [...auth, 'Content-Type', 'application/json'];
    const files = async () => (await readdir(root, { recursive: true }).catch(() => [])).sort();
    const oracle = async () => JSON.stringify({ logical: observe!(), calls, tables: tableState(databasePath), files: await files() });
    const poll = async (id: string) => { for (let i = 0; i < 200; i++) { const job = JSON.parse((await raw(service.origin, `/api/jobs/${id}`, 'GET', auth)).body).job; if (['completed', 'failed'].includes(job.status)) return job; await new Promise(r => setTimeout(r, 10)); } throw new Error('job did not settle'); };
    try {
      const s0 = JSON.parse((await raw(service.origin, '/api/state', 'GET', auth)).body);
      expect((await raw(service.origin, '/api/state', 'PUT', json, JSON.stringify({ snapshot: fixture().snapshot(), expectedRevision: s0.revision }))).status).toBe(200);
      const seeded = JSON.parse((await raw(service.origin, '/api/state', 'GET', auth)).body);
      pause = true;
      const submitted = await raw(service.origin, '/api/jobs', 'POST', json, JSON.stringify({ kind: 'source-audio-snippet', payload: { mediaPath, startMs: 0, endMs: 1 } }));
      expect(submitted.status).toBe(201); const pausedId = JSON.parse(submitted.body).job.id as string;
      await running;
      const manifest = emptyWire();
      const pv = await raw(service.origin, '/api/restore/preview', 'POST', json, JSON.stringify({ manifest, mode: 'replace-active', expectedRevision: seeded.revision }));
      expect(pv.status).toBe(200);
      const warnings = JSON.parse(pv.body).preview.warnings.map((w: { kind: string }) => w.kind);
      const before = await oracle();
      const good = (path: string) => path.endsWith('/preview') ? { manifest, mode: 'replace-active', expectedRevision: seeded.revision } : { manifest, mode: 'replace-active', expectedRevision: seeded.revision, confirmation: { confirmedAt: at, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: warnings } };
      let denials = 0;
      for (const path of ['/api/restore/preview', '/api/restore/commit']) {
        const body = JSON.stringify(good(path));
        const rows: [number, string[], string][] = [
          [401, ['Host', host, 'Content-Type', 'application/json'], body],
          [401, ['Host', host, 'Authorization', `Bearer ${'A'.repeat(43)}`, 'Content-Type', 'application/json'], body],
          [403, [...json, 'Origin', 'http://foreign.invalid'], body],
          [415, [...auth, 'Content-Type', 'text/plain'], body],
          [400, json, '[]'],
          [409, json, JSON.stringify({ ...good(path), expectedRevision: s0.revision })],
        ];
        for (const [status, headers, payload] of rows) {
          const res = await raw(service.origin, path, 'POST', headers, payload);
          expect(res.status).toBe(status); expect(res.body.includes(token)).toBe(false);
          expect(await oracle()).toBe(before); denials++;
        }
      }
      expect(calls).toBe(1); // still only the paused worker invocation
      release();
      const published = await poll(pausedId); expect(published.status).toBe('completed');
      const snippet = published.result.url as string;
      expect((await raw(service.origin, snippet, 'GET', auth)).body).toBe('RIFF-synthetic-wave');
      expect((await raw(service.origin, snippet, 'DELETE', auth)).status).toBe(204);
      expect(JSON.parse((await raw(service.origin, '/api/state', 'GET', auth)).body).revision).toBe(seeded.revision);
      console.info(JSON.stringify({ lt2t4PausedWorkerRestoreDenials: denials }));
    } finally { release(); await service.close(); await rm(root, { recursive: true, force: true }); }
  });
});
