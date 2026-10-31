// lt-192.4 S6 / plan §5 L1 (G16): the open lifecycle through the BlobFs barrier seam against the real service.
// (a) cap, (b) abort during open, (c) abort during fstat, (d) shutdown during open, (e) open/fstat/close failures,
// (f) double close signal and mid-stream abort. Per-descriptor close counts come from the seam.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { seedManagedBlob, syntheticBytes } from '../helpers/managedMediaFixture.ts';
import { barrier, countingFs, dechunk, startMediaService, until, type MediaService } from '../helpers/lt1924Service.ts';
import { MAX_MEDIA_SLOTS, type BlobFs } from '../../apps/local-service/src/managedMedia.ts';

const posix = process.platform !== 'win32';
// Hundreds of raw-socket requests per test: bounded generously so a loaded full-suite run is not a false timeout.
vi.setConfig({ testTimeout: 30_000 });
const services: MediaService[] = [];
afterEach(async () => {
  while (services.length) { const s = services.pop()!; await s.service.close().catch(() => undefined); await rm(s.root, { recursive: true, force: true }); }
});
async function start(fs: BlobFs) { const s = await startMediaService({ fs }); services.push(s); return s; }
const content = (id: string) => `/api/media/${id}/content`;
const storage = (id: string) => `/api/media/${id}/storage`;
const closesOf = (events: ReturnType<typeof countingFs>['events']) => { expect(events.strayCloses, 'double or stray close').toBe(0); return events.perOpen; };

/** Send a request and destroy the client socket while the server is held at a barrier. */
function abortable(port: number, method: string, path: string, headers: [string, string][]) {
  const socket = connect(port, '127.0.0.1', () => socket.write(`${method} ${path} HTTP/1.1\r\n${headers.map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`));
  socket.on('error', () => undefined);
  return socket;
}

describe.skipIf(!posix)('lt-192.4 media open lifecycle (L1)', () => {
  it('(a) cap: 16 held opens; the 17th M3, GET and HEAD get 503 + Retry-After without calling open; release frees every slot', async () => {
    expect(MAX_MEDIA_SLOTS).toBe(16);
    const gate = barrier();
    const { fs, events } = countingFs({ open: gate.wait });
    const s = await start(fs);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(1000));
    // A mix of M3, M4 GET and M4 HEAD shares the one global cap.
    const held = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? s.request('GET', storage(blob.mediaId), [s.bearer()], undefined, 8000)
      : s.request(i % 3 === 0 ? 'HEAD' : 'GET', content(blob.mediaId), [s.bearer()], undefined, 8000)).catch(() => undefined));
    try { await until(() => gate.entered() === 16, 3000, '16 opens at the barrier'); } catch (error) { gate.release(); throw error; }
    expect(s.observe()).toMatchObject({ activeMediaSlots: 16, pendingMediaOpens: 16 });
    for (const [method, path] of [['GET', storage(blob.mediaId)], ['GET', content(blob.mediaId)], ['HEAD', content(blob.mediaId)]] as const) {
      const r = await s.request(method, path, [s.bearer()]);
      expect(r.status, `${method} ${path}`).toBe(503); expect(r.headers['retry-after']).toEqual(['1']);
      if (method === 'HEAD') expect(r.body.length).toBe(0);
    }
    expect(events.opens).toBe(16);
    gate.release();
    await Promise.all(held);
    await until(() => s.observe().activeMediaSlots === 0, 3000, 'slots 0');
    expect(s.observe()).toMatchObject({ activeMediaSlots: 0, pendingMediaOpens: 0, liveMediaStreams: 0 });
    expect(closesOf(events).every(n => n === 1)).toBe(true);
    expect(events.perOpen).toHaveLength(16);
    expect((await s.request('GET', content(blob.mediaId), [s.bearer()])).status).toBe(200);
  });

  for (const stage of ['open', 'fstat'] as const) {
    it(`(${stage === 'open' ? 'b' : 'c'}) client abort during ${stage}: on release the descriptor closes exactly once, no stream, slots 0`, async () => {
      const gate = barrier();
      const { fs, events } = countingFs(stage === 'open' ? { open: () => gate.wait() } : { fstat: () => gate.wait() });
      const s = await start(fs);
      const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(1000));
      let rows = 0;
      for (const [method, path] of [['GET', content(blob.mediaId)], ['HEAD', content(blob.mediaId)], ['GET', storage(blob.mediaId)]] as const) {
        gate.reset();
        const socket = abortable(s.port, method, path, [s.host, s.bearer()]);
        await until(() => gate.entered() === 1 && s.observe().activeMediaSlots === 1, 3000, `held ${method} ${path}`);
        socket.destroy();
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(s.observe().activeMediaSlots, 'still held until the fs call settles').toBe(1);
        gate.release();
        await until(() => s.observe().activeMediaSlots === 0, 3000, 'released');
        expect(closesOf(events), `${method} ${path}`).toEqual(Array(++rows).fill(1));
        expect(events.streams).toBe(0);
        expect(s.observe()).toMatchObject({ pendingMediaOpens: 0, liveMediaStreams: 0 });
      }
      expect(rows).toBe(3);
    });
  }

  it('(d) shutdown during open: new requests are refused, close() waits for the pending open, then closes its fd once', async () => {
    const gate = barrier();
    const { fs, events } = countingFs({ open: gate.wait });
    const s = await start(fs);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(1000));
    const pending = s.request('GET', content(blob.mediaId), [s.bearer()], undefined, 8000).catch(error => error as Error);
    await until(() => gate.entered() === 1);
    let closed = false;
    const closing = s.service.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(closed).toBe(false);
    const late = await s.request('GET', content(blob.mediaId), [s.bearer()]).catch(error => error as Error);
    expect(late instanceof Error || late.status === 503).toBe(true);
    gate.release();
    await closing;
    expect(closed).toBe(true);
    expect(closesOf(events)).toEqual([1]);
    expect(events.streams).toBe(0);
    const outcome = await pending;
    expect(outcome instanceof Error || outcome.status === 503).toBe(true);
    services.pop();
  });

  it('(e) open and fstat failures release once and answer 404 / bytes-missing; a close failure is never retried and never replaces a decided response', async () => {
    for (const fault of ['failOpen', 'failFstat'] as const) {
      const { fs, events } = countingFs({ [fault]: true });
      const s = await start(fs);
      const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(500));
      const m3 = await s.request('GET', storage(blob.mediaId), [s.bearer()]);
      expect(JSON.parse(dechunk(m3).toString()), fault).toEqual({ ok: true, state: 'bytes-missing' });
      const get = await s.request('GET', content(blob.mediaId), [s.bearer()]);
      expect(get.status, fault).toBe(404);
      const head = await s.request('HEAD', content(blob.mediaId), [s.bearer()]);
      expect(head.status, fault).toBe(404); expect(head.body.length).toBe(0);
      for (const r of [m3, get, head]) { expect(r.raw.toString('latin1')).not.toContain(s.libraryDir!); expect(r.raw.toString('latin1')).not.toContain(blob.sha256); expect(r.raw.toString('latin1')).not.toMatch(/EIO|injected/); }
      expect(closesOf(events).every(n => n === 1), fault).toBe(true);
      expect(events.perOpen, fault).toHaveLength(fault === 'failOpen' ? 0 : 3);
      expect(s.observe()).toMatchObject({ activeMediaSlots: 0, pendingMediaOpens: 0 });
    }
    const { fs, events } = countingFs({ failClose: true });
    const s = await start(fs);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(500));
    const m3 = await s.request('GET', storage(blob.mediaId), [s.bearer()]);
    expect(JSON.parse(dechunk(m3).toString())).toEqual({ ok: true, state: 'complete', sizeBytes: 500, mimeType: 'video/webm' });
    const head = await s.request('HEAD', content(blob.mediaId), [s.bearer()]);
    expect(head.status).toBe(200); expect(head.headers['content-length']).toEqual(['500']); expect(head.body.length).toBe(0);
    const unsatisfiable = await s.request('GET', content(blob.mediaId), [s.bearer(), ['Range', 'bytes=999-']]);
    expect(unsatisfiable.status).toBe(416);
    for (const r of [m3, head, unsatisfiable]) expect(r.raw.toString('latin1')).not.toMatch(/EIO|injected|blobs/);
    expect(events.perOpen).toHaveLength(3);
    expect(closesOf(events)).toEqual([1, 1, 1]);
    expect(s.observe()).toMatchObject({ activeMediaSlots: 0, pendingMediaOpens: 0 });
  });

  it('(f) a completed stream (end + response close) and a mid-stream client abort each release exactly once', async () => {
    const { fs, events } = countingFs();
    const s = await start(fs);
    const bytes = syntheticBytes(8 * 1024 * 1024);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, bytes);
    const full = await s.request('GET', content(blob.mediaId), [s.bearer()], undefined, 15_000);
    expect(full.status).toBe(200); expect(full.body.equals(bytes)).toBe(true);
    await until(() => s.observe().activeMediaSlots === 0);
    expect(closesOf(events)).toEqual([1]);
    // Mid-stream abort: read a little, then destroy the client while the server is backpressured.
    const socket = abortable(s.port, 'GET', content(blob.mediaId), [s.host, s.bearer()]);
    await new Promise<void>(resolve => socket.once('data', () => { socket.pause(); resolve(); }));
    await until(() => s.observe().liveMediaStreams === 1, 3000, 'live stream');
    socket.destroy();
    await until(() => s.observe().activeMediaSlots === 0, 3000, 'abort releases');
    expect(s.observe()).toMatchObject({ activeMediaSlots: 0, pendingMediaOpens: 0, liveMediaStreams: 0 });
    expect(closesOf(events)).toEqual([1, 1]);
    expect(events.streams).toBe(2);
  });

  it('(g) client closes BEFORE reservation (held in admission at deliveryReady): no open, slot, fd or stream survives; 16 repeats leave full capacity', async () => {
    // Native HTTP, real admission: the first deliveryReady() of each request is held at a barrier, the client socket
    // is destroyed while held, the server-side response close is given time to be observed, then admission resumes.
    const gate = barrier();
    let holdNext = false;
    const { fs, events } = countingFs();
    const s = await startMediaService({ fs, runtime: { deliveryReady: async () => { if (holdNext) { holdNext = false; await gate.wait(); } return true; } } });
    services.push(s);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(4 * 1024 * 1024));
    const rows = [...Array.from({ length: MAX_MEDIA_SLOTS }, () => ['GET', content(blob.mediaId)] as const), ['HEAD', content(blob.mediaId)] as const, ['GET', storage(blob.mediaId)] as const];
    for (const [method, path] of rows) {
      gate.reset(); holdNext = true;
      const slotsBefore = s.observe().activeMediaSlots;
      const socket = abortable(s.port, method, path, [s.host, s.bearer()]);
      await until(() => gate.entered() === 1, 3000, `${method} ${path} held before reservation`);
      expect(s.observe().activeMediaSlots, 'this request reserved nothing while admission is held').toBe(slotsBefore);
      socket.destroy();
      await new Promise(resolve => setTimeout(resolve, 100));
      gate.release();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const settled = await until(() => { const o = s.observe(); return o.activeMediaSlots === 0 && o.liveMediaStreams === 0 && o.pendingMediaOpens === 0; }, 3000, 'no retained media work')
      .then(() => 'settled', () => JSON.stringify({ slots: s.observe().activeMediaSlots, streams: s.observe().liveMediaStreams, pending: s.observe().pendingMediaOpens }));
    expect(settled, 'slots/streams/pending after 18 pre-reservation aborts').toBe('settled');
    expect(events.opens, 'a request closed before reservation never opens the blob').toBe(0);
    expect(events.streams).toBe(0);
    const ordinary = await s.request('GET', content(blob.mediaId), [s.bearer(), ['Range', 'bytes=0-15']]);
    expect(ordinary.status, 'an ordinary GET after the aborts').toBe(206);
    await until(() => s.observe().activeMediaSlots === 0, 3000, 'ordinary GET released');
    expect(closesOf(events)).toEqual([1]);
  });

  it('shutdown with a paused live stream resolves promptly (no 15 s socket-timeout hang)', async () => {
    const { fs, events } = countingFs();
    const s = await start(fs);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(8 * 1024 * 1024));
    const socket = abortable(s.port, 'GET', content(blob.mediaId), [s.host, s.bearer()]);
    await new Promise<void>(resolve => socket.once('data', () => { socket.pause(); resolve(); }));
    await until(() => s.observe().liveMediaStreams === 1);
    const started = Date.now();
    await s.service.close();
    services.pop();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(closesOf(events)).toEqual([1]);
    socket.destroy();
  });
});
