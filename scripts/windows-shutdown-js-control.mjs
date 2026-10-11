import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import childProcess from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';

// Offline control only: no application entrypoint, helper, console API or native signal.
const [source, expectedHash] = process.argv.slice(2);
assert.equal(process.platform, 'win32');
const hash = () => createHash('sha256').update(readFileSync(source)).digest('hex');
assert.equal(hash(), expectedHash);
const forbidden = [];
const restores = [];
function guard(object, key) {
  const original = object[key];
  object[key] = () => { forbidden.push(key); throw new Error(`FORBIDDEN_${key}`); };
  restores.push(() => { object[key] = original; });
}
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) guard(childProcess, key);
for (const key of ['connect', 'createConnection', 'createServer']) guard(net, key);
for (const object of [http, https]) for (const key of ['request', 'get', 'createServer']) guard(object, key);
guard(dgram, 'createSocket');
guard(globalThis, 'fetch');
guard(process, 'kill');
syncBuiltinESMExports();
const realTimeout = globalThis.setTimeout;
const realClear = globalThis.clearTimeout;
const timers = new Set();
let armed = 0;
// Exercise timer registration/clear, not real 10-second escalation or native time.
globalThis.setTimeout = (callback, milliseconds) => {
  assert.equal(milliseconds, 10000);
  const token = { callback, milliseconds };
  timers.add(token); armed++;
  return token;
};
globalThis.clearTimeout = (token) => { assert.ok(timers.delete(token)); };
const processListeners = ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name));
const cases = [];
async function checkpoint() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
try {
  const { startLocalProcesses } = await import(pathToFileURL(source).href);
  for (const name of ['positive', 'exit-not-close', 'stdin-throws']) {
    const signals = new EventEmitter();
    const events = [];
    const observe = (event) => { assert.ok(events.length < 64); events.push(event); };
    const children = [];
    const logs = [];
    let controller;
    let settled = false;
    let outcome;
    const timerStart = armed;
    function close(child) {
      if (child.closed) return;
      child.closed = true;
      child.exitCode = 0;
      child.signalCode = null;
      observe(`close-${child.index}`);
      child.emit('close', 0, null);
    }
    try {
      controller = startLocalProcesses([
        { label: 'one', script: 'inert-one.mjs' },
        { label: 'two', script: 'inert-two.mjs' },
      ], {
        cwd: process.cwd(), env: {}, signals,
        log: (message) => { assert.ok(logs.length < 8); logs.push(String(message).slice(0, 256)); },
        spawnChild: (_executable, _args, options) => {
          assert.equal(signals.listenerCount('SIGINT'), 1);
          assert.equal(signals.listenerCount('SIGTERM'), 1);
          assert.equal(options.shell, false);
          assert.deepEqual(options.stdio, ['pipe', 'inherit', 'inherit']);
          const child = new EventEmitter();
          child.index = children.length;
          child.pid = 41001 + child.index; // Opaque fake IDs: never passed to an OS API.
          child.exitCode = null; child.signalCode = null; child.ends = 0; child.closed = false;
          child.stdin = new EventEmitter();
          child.stdin.end = () => {
            child.ends++;
            observe(`end-${child.index}`);
            if (name === 'stdin-throws' && child.index === 0) throw new Error('INJECTED_WRITE_FAILURE');
          };
          child.kill = () => { throw new Error('ESCALATION_MUST_NOT_RUN'); };
          observe(`spawn-${child.index}-after-registration`);
          children.push(child);
          return child;
        },
      });
      controller.done.then((code) => { settled = true; outcome = code; observe(`done-${code}`); });
      assert.equal(children.length, 2);
      observe('private-SIGINT');
      assert.equal(signals.emit('SIGINT'), true);
      await checkpoint();
      assert.deepEqual(children.map((child) => child.ends), [1, 1]);
      assert.equal(settled, false);
      observe('pending-before-close');
      const firstStop = controller.stop(9);
      assert.strictEqual(controller.stop(8), firstStop);
      assert.deepEqual(children.map((child) => child.ends), [1, 1]);
      if (name === 'exit-not-close') {
        for (const child of children) {
          child.exitCode = 0;
          observe(`exit-${child.index}`);
          child.emit('exit', 0, null);
        }
        await checkpoint();
        assert.equal(settled, false);
        observe('pending-after-both-exit');
      }
      close(children[0]);
      await checkpoint();
      assert.equal(settled, false);
      observe('pending-after-first-close');
      close(children[1]);
      await checkpoint();
      assert.equal(settled, true);
      assert.equal(outcome, name === 'stdin-throws' ? 1 : 0);
      assert.equal(await firstStop, outcome);
      assert.equal(await controller.done, outcome);
      assert.equal(signals.listenerCount('SIGINT'), 0);
      assert.equal(signals.listenerCount('SIGTERM'), 0);
      assert.equal(timers.size, 0);
      assert.equal(logs.length, 0);
      assert.equal(armed - timerStart, name === 'stdin-throws' ? 1 : 2);
      cases.push({ name, passed: true, outcome, events, fakeTimersArmed: armed - timerStart });
    } finally {
      for (const child of children) close(child);
      if (controller) { void controller.stop(1); await checkpoint(); }
      signals.removeAllListeners();
    }
  }
  assert.equal(hash(), expectedHash);
  assert.deepEqual(forbidden, []);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name)), processListeners);
  assert.equal(timers.size, 0);
  // Receipt output occurs only after tested shutdown paths complete.
  process.stdout.write(JSON.stringify({ passed: true, delivery: 'injected_js', sourceSha256: expectedHash,
    runtime: process.version, caseCount: cases.length, cases, forbiddenCalls: forbidden,
    timing: 'Finite microtask checkpoints and fake escalation timers; no native deadlines qualified',
    nativeDelivery: 'NOT_TESTED', productChanged: false }, null, 2) + '\n');
} finally {
  globalThis.setTimeout = realTimeout;
  globalThis.clearTimeout = realClear;
  for (const restore of restores.reverse()) restore();
  syncBuiltinESMExports();
}
