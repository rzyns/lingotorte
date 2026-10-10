import test from 'node:test';
import assert from 'node:assert/strict';
import { init, parse } from 'es-module-lexer';
import { checkResources, resourceUrl, ORIGIN, FIXTURE_PATHS } from './windows-qualification-resources.mjs';

const snapshotRoot = 'C:/synthetic/candidate app żółć';
const encodedRoot = 'C:/synthetic/candidate%20app%20%C5%BC%C3%B3%C5%82%C4%87';
const fsRoot = '/@fs/' + encodedRoot;
const packagePath = fsRoot + '/packages/domain/index.ts';
const subtitle = '1\n00:00:00,000 --> 00:00:01,000\nżółć\n';
const response = (text, contentType = 'text/javascript', status = 200) => ({ status, contentType, bytes: Buffer.from(text) });
async function parseImports(text) {
  await init;
  const [imports] = parse(text);
  return { imports: imports.filter(i => i.n).map(i => i.n), dynamicUnknown: imports.filter(i => i.d >= 0 && !i.n).length };
}
function canned() {
  const fixtures = FIXTURE_PATHS.map(path => ({ path, expectedBytes: path.endsWith('.webm') ? Buffer.from('1a45dfa30001', 'hex') : Buffer.from(subtitle) }));
  const rows = new Map([
    ['/', response('<title>Lingotorte Local Study</title><script src="/src/main.ts"></script>', 'text/html')],
    ['/@vite/client', response('export const message = "Internal Server Error";')],
    ['/%40vite/client', response('<title>fallback</title>', 'text/html')],
    ['/src/main.ts', response('import "./app.ts"; import "./model.ts"; import "./nested/żółć file.ts?x=%20&y=@";')],
    ['/src/app.ts', response('import "./model.ts"; import("./dynamic.ts"); import(variable);')],
    ['/src/dynamic.ts', response('export const dynamic = true;')],
    ['/src/nested/%C5%BC%C3%B3%C5%82%C4%87%20file.ts?x=%20&y=@', response('export { default } from "../leaf%20module.ts?raw";')],
    ['/src/leaf%20module.ts?raw', response('export default "leaf";')],
    ['/src/model.ts', response(`import { makeMediaAsset } from ${JSON.stringify(packagePath)};\n` + fixtures.map(f => `import x from ${JSON.stringify(fsRoot + '/' + f.path + (f.path.endsWith('.webm') ? '?import' : '?raw'))};`).join('\n'))],
    [packagePath, response('export { makeMediaAsset } from "./recursive.ts";')],
    [fsRoot + '/packages/domain/recursive.ts', response('export const makeMediaAsset = 1; import "./index.ts";')],
  ]);
  for (const f of fixtures) {
    rows.set(fsRoot + '/' + f.path, { status: 200, contentType: f.path.endsWith('.webm') ? 'video/webm' : 'text/plain', bytes: f.expectedBytes });
    rows.set(fsRoot + '/' + f.path + (f.path.endsWith('.webm') ? '?import' : '?raw'), response('export default ' + JSON.stringify(f.path.endsWith('.webm') ? '/synthetic.webm' : subtitle)));
  }
  const requests = [];
  const options = { snapshotRoot, fixtures, parseImports, fetchResource: async target => {
    requests.push(target);
    assert.equal(new URL(target.url).pathname + new URL(target.url).search, target.requestPath);
    assert.equal(new URL(target.url).origin, ORIGIN);
    assert(rows.has(target.requestPath), 'unexpected canned request: ' + target.requestPath);
    return rows.get(target.requestPath);
  } };
  return { options, rows, requests };
}

test('literal Vite client routing is not its percent-encoded negative vector', () => {
  assert.equal(resourceUrl('/@vite/client').requestPath, '/@vite/client');
  assert.equal(resourceUrl('/%40vite/client').requestPath, '/%40vite/client');
});
test('actual successor traverses recursive imports and exact fixtures; error substring in valid JS is accepted', async () => {
  const { options, requests } = canned();
  const graph = await checkResources(options);
  assert.equal(graph.browser_execution, false);
  assert.equal(graph.fixture_checks.length, 3);
  assert.equal(graph.resources['/src/app.ts'].dynamic_nonliteral_imports, 1);
  assert(graph.resources[fsRoot + '/packages/domain/recursive.ts']);
  assert(graph.resources['/src/leaf%20module.ts?raw']);
  assert.equal(graph.resources['/@vite/client'].content_type, 'text/javascript');
  assert(!requests.some(r => r.requestPath === '/%40vite/client'));
  assert.equal(requests.filter(r => r.requestPath === packagePath).length, 1);
  assert.equal(graph.resource_count, requests.length - graph.fixture_checks.length);
  assert.deepEqual(graph.model_package_imports, [packagePath]);
});
test('URL/parser roundtrips preserve Unicode, spaces, existing escapes, queries and relative resolution', async () => {
  const cases = [
    ['/src/żółć file.ts?x=%20&y=@', '/src/%C5%BC%C3%B3%C5%82%C4%87%20file.ts?x=%20&y=@'],
    ['/src/a%2Fb%20c.ts?x=%2520', '/src/a%2Fb%20c.ts?x=%2520'],
    ['../leaf%20module.ts?raw', '/src/leaf%20module.ts?raw'],
    ['/src/a.ts?x=a+b&v=1:2', '/src/a.ts?x=a+b&v=1:2'],
  ];
  for (const [input, expected] of cases) {
    const parsed = await parseImports(`import ${JSON.stringify(input)};`);
    const target = resourceUrl(parsed.imports[0], ORIGIN + '/src/nested/main.ts');
    assert.equal(target.input, input);
    assert.equal(target.requestPath, expected);
    assert.equal(new URL(target.url).pathname + new URL(target.url).search, expected);
  }
});
test('200 HTML for JavaScript is rejected including encoded Vite route', async () => {
  const { options } = canned();
  const original = options.fetchResource;
  options.fetchResource = target => original(target.requestPath === '/@vite/client' ? resourceUrl('/%40vite/client') : target);
  await assert.rejects(checkResources(options), /JavaScript MIME required/);
});
test('status, empty bytes, incorrect MIME and malformed JavaScript fail closed', async () => {
  for (const bad of [response('bad', 'text/javascript', 500), response(''), response('export const x=1', 'application/json'), response('import {')]) {
    const { options, rows } = canned(); rows.set('/@vite/client', bad);
    await assert.rejects(checkResources(options));
  }
});
test('fixture byte, WebM MIME/magic and raw subtitle export identity checks discriminate', async () => {
  for (const kind of ['bytes', 'mime', 'magic', 'raw']) {
    const { options, rows } = canned();
    const fixture = options.fixtures[kind === 'raw' ? 1 : 0];
    const path = fsRoot + '/' + fixture.path;
    if (kind === 'bytes') rows.set(path, response('different', 'video/webm'));
    if (kind === 'mime') rows.set(path, { ...rows.get(path), contentType: 'text/html' });
    if (kind === 'magic') { fixture.expectedBytes = Buffer.from('not WebM'); rows.set(path, { ...rows.get(path), bytes: fixture.expectedBytes }); }
    if (kind === 'raw') rows.set(path + '?raw', response('export default "wrong";'));
    await assert.rejects(checkResources(options), /fixture response byte mismatch|fixture video MIME|fixture WebM magic|raw subtitle export mismatch/);
  }
});
test('escaped snapshot, external/bare imports, missing fixtures and graph bound are rejected', async () => {
  for (const imp of ['/\u0040fs/C:/other/packages/domain.ts', 'https://example.invalid/a.js', '//example.invalid/a.js', 'bare-package']) {
    const { options, rows } = canned(); rows.set('/src/main.ts', response(`import ${JSON.stringify(imp)};`));
    await assert.rejects(checkResources(options), /escaped snapshot|unresolved or external|external or ambiguous/);
  }
  const { options } = canned();
  await assert.rejects(checkResources({ ...options, fixtures: [] }), /fixture/);
  await assert.rejects(checkResources({ ...options, maxResources: 2 }), /unbounded/);
  await assert.rejects(checkResources({ ...options, fetchResource: undefined }), /injected fetchResource/);
});
