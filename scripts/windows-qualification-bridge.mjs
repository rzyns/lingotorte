import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { checkResources, FIXTURE_PATHS } from './windows-qualification-resources.mjs';
import { directTransport } from './windows-qualification-transport.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyBinding(binding) {
  for (const row of binding.runtime_files) assert.equal(sha(fs.readFileSync(row.path)), row.sha256, 'runtime binary drift');
  for (const group of binding.groups) {
    assert.equal(sha(fs.readFileSync(group.manifest)), group.sha256, 'manifest identity');
    for (const row of JSON.parse(fs.readFileSync(group.manifest, 'utf8')).files) {
      const file = path.resolve(group.root, row.path);
      assert(!path.relative(group.root, file).startsWith('..'), 'manifest escape');
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.length, row.size, row.path);
      assert.equal(sha(bytes), row.sha256, row.path);
    }
  }
  for (const row of binding.mappings) assert.equal(fs.realpathSync(row.candidate), row.real, 'dependency target drift');
  assert.equal(fs.realpathSync(binding.parser.entry), binding.parser.real, 'parser target drift');
  assert.equal(sha(fs.readFileSync(binding.parser.entry)), binding.parser.sha256, 'parser entry bytes');
}
export async function boundParser(binding) {
  const require = createRequire(path.join(binding.snapshotRoot, 'package.json'));
  assert.equal(require.resolve('es-module-lexer'), binding.parser.entry, 'snapshot parser resolution');
  const { init, parse } = require(binding.parser.entry);
  await init;
  return text => {
    const [imports] = parse(text);
    return { imports: imports.filter(i => i.n).map(i => i.n), dynamicUnknown: imports.filter(i => i.d >= 0 && !i.n).length };
  };
}
// Fake ClientRequest/IncomingMessage events exercise the identical transport;
// absent canned paths throw rather than falling back to real HTTP.
export function cannedRequest(rows, observed = []) {
  return (options, callback) => {
    observed.push(options);
    const req = new EventEmitter(); req.setTimeout = () => req;
    req.destroy = () => { req.destroyed = true; };
    req.end = () => queueMicrotask(() => {
      if (!Object.hasOwn(rows, options.path)) { req.emit('error', new Error('missing canned response')); return; }
      const row = rows[options.path]; const res = new EventEmitter();
      res.statusCode = row.status; res.headers = { 'content-type': row.contentType }; res.complete = true;
      res.destroy = () => { res.destroyed = true; };
      callback(res);
      if (!res.destroyed) { res.emit('data', Buffer.from(row.base64, 'base64')); res.emit('end'); res.emit('close'); }
    });
    return req;
  };
}
export async function bridge(binding, fetchResource) {
  verifyBinding(binding);
  try {
    const parseImports = await boundParser(binding);
    const fixtures = FIXTURE_PATHS.map(relative => ({ path: relative, expectedBytes: fs.readFileSync(path.join(binding.snapshotRoot, relative)) }));
    return await checkResources({ snapshotRoot: binding.snapshotRoot.replaceAll('\\', '/'), fixtures, parseImports, fetchResource });
  } finally { verifyBinding(binding); }
}
async function main() {
  const [mode, bindingPath, bindingSha, dispositionPath] = process.argv.slice(2);
  assert(['offline', 'live'].includes(mode), 'explicit mode required');
  assert.equal(sha(fs.readFileSync(bindingPath)), bindingSha, 'binding identity');
  const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
  let transport;
  if (mode === 'offline') {
    const chunks = []; let length = 0;
    for await (const chunk of process.stdin) { length += chunk.length; assert(length <= 32 * 1024 * 1024, 'canned input limit'); chunks.push(chunk); }
    transport = directTransport({ request: cannedRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))) });
  } else {
    assert(dispositionPath, 'new explicit disposition required');
    const disposition = JSON.parse(fs.readFileSync(dispositionPath, 'utf8'));
    assert.equal(disposition.authorization, 'lt-c0r.2-new-bounded-live-disposition');
    assert.equal(disposition.binding_sha256, bindingSha);
    assert.equal(disposition.attempts, 1);
    assert.equal(disposition.allow_live, true);
    assert(disposition.parent_approval_reference?.length > 0, 'parent approval reference required');
    const packet = path.dirname(bindingPath);
    const manifestBytes = fs.readFileSync(path.join(packet, 'manifest.json'));
    assert.equal(sha(manifestBytes), disposition.packet_manifest_sha256, 'packet manifest identity');
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.files.find(row => row.path === 'binding.json')?.sha256, bindingSha, 'manifest binding anchor');
    const marker = JSON.parse(fs.readFileSync(path.join(packet, 'execution-started.json'), 'utf8'));
    assert.equal(marker.probe_sha256, manifest.files.find(row => row.path === 'successor.py')?.sha256, 'execution marker identity');
    assert(fs.statSync(path.join(packet, 'sole-launch.lock')).isDirectory(), 'sole-launch lock required');
    transport = directTransport();
  }
  console.log(JSON.stringify({ schema: 1, mode, graph: await bridge(binding, transport) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
