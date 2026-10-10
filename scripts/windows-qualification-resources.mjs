import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const ORIGIN = 'http://127.0.0.1:5173';
export const ENTRYPOINTS = Object.freeze(['/', '/@vite/client', '/src/main.ts', '/src/app.ts', '/src/model.ts']);
export const FIXTURE_PATHS = Object.freeze([
  'fixtures/media/synthetic-polish-dialogue.webm',
  'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
  'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
]);

// WHATWG resolution encodes spaces/Unicode once, preserves existing escapes and
// literal routing punctuation (notably @), and resolves relative module imports.
export function resourceUrl(input, parent = `${ORIGIN}/`) {
  assert(typeof input === 'string' && (input.startsWith('/') || input.startsWith('.')), 'unresolved or external module import');
  assert(!input.startsWith('//') && !input.includes('\\'), 'external or ambiguous resource URL');
  const url = new URL(input, parent);
  assert.equal(url.origin, ORIGIN, 'external resource origin');
  url.hash = '';
  return { input, url: url.href, requestPath: url.pathname + url.search };
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const mime = value => String(value).split(';', 1)[0].trim().toLowerCase();

/** Successor to frozen probe.py verify_graph; never fetches without an injected callback.
 * fetchResource receives {input,url,requestPath}, returns {status,contentType,bytes}.
 * parseImports returns {imports: string[], dynamicUnknown: number} (es-module-lexer adapter).
 * fixtures must supply expectedBytes read from the future frozen snapshot by the caller.
 */
export async function checkResources({ fetchResource, parseImports, snapshotRoot, fixtures,
  maxResources = 250, timeoutMs = 60000 }) {
  assert.equal(typeof fetchResource, 'function', 'injected fetchResource required');
  assert.equal(typeof parseImports, 'function', 'injected parseImports required');
  assert(typeof snapshotRoot === 'string' && /^[A-Za-z]:\//.test(snapshotRoot) && !snapshotRoot.includes('\\'), 'absolute Windows snapshotRoot with forward slashes required');
  assert(Array.isArray(fixtures) && fixtures.length === FIXTURE_PATHS.length, 'all frozen fixture bytes required');
  for (const relative of FIXTURE_PATHS) {
    assert.equal(fixtures.filter(f => f.path === relative && f.expectedBytes instanceof Uint8Array).length, 1, `fixture bytes required: ${relative}`);
  }
  assert(Number.isSafeInteger(maxResources) && maxResources > 0 && Number.isFinite(timeoutMs) && timeoutMs > 0, 'invalid graph bounds');
  const deadline = Date.now() + timeoutMs;
  const resources = Object.create(null), edges = [], transformations = [], bodies = new Map();
  const pending = ENTRYPOINTS.map(input => resourceUrl(input));
  const modelPackageImports = [];
  async function receive(target) {
    assert(Date.now() < deadline, 'resource graph deadline');
    transformations.push(target);
    // Callback must itself enforce its I/O timeout. No implicit transport or redirects.
    const response = await fetchResource(target);
    assert(Date.now() < deadline, 'resource graph deadline');
    assert.equal(response.status, 200, `${target.requestPath}: HTTP status`);
    assert(response.bytes instanceof Uint8Array && response.bytes.byteLength > 0, `${target.requestPath}: empty or invalid bytes`);
    return { bytes: Buffer.from(response.bytes), contentType: String(response.contentType ?? '') };
  }
  while (pending.length) {
    const target = pending.shift(), path = target.requestPath;
    if (Object.hasOwn(resources, path)) continue;
    assert(Object.keys(resources).length < maxResources, 'unexpected unbounded module graph');
    const { bytes, contentType } = await receive(target);
    resources[path] = { bytes: bytes.length, sha256: digest(bytes), content_type: contentType };
    bodies.set(path, bytes);
    const text = decode(bytes);
    if (path === '/') {
      assert.equal(mime(contentType), 'text/html', 'root HTML MIME');
      assert(text.includes('<title>Lingotorte Local Study</title>'), 'root title');
      assert(text.includes('/src/main.ts'), 'root main module');
      continue;
    }
    assert(['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'].includes(mime(contentType)), `${path}: JavaScript MIME required`);
    const parsed = await parseImports(text);
    assert(Array.isArray(parsed.imports) && Number.isSafeInteger(parsed.dynamicUnknown) && parsed.dynamicUnknown >= 0, 'invalid import parser result');
    resources[path].dynamic_nonliteral_imports = parsed.dynamicUnknown;
    for (const imp of parsed.imports) {
      const next = resourceUrl(imp, target.url);
      const decoded = decodeURIComponent(next.requestPath);
      if (decoded.includes('/packages/') || decoded.includes('/vendor/')) {
        assert(decoded.toLowerCase().includes(snapshotRoot.replace(/\/$/, '').toLowerCase() + '/'), `repository import escaped snapshot: ${next.requestPath}`);
      }
      edges.push({ from: path, import: imp, url: next.requestPath });
      if (path === '/src/model.ts' && decoded.includes('/packages/')) modelPackageImports.push(next.requestPath);
      pending.push(next);
    }
  }
  assert(modelPackageImports.length > 0, 'candidate package imports not visible');
  assert(decode(bodies.get('/src/model.ts')).includes('makeMediaAsset'), 'model makeMediaAsset marker');
  const fixtureChecks = [];
  for (const { path: relative, expectedBytes } of fixtures) {
    const matches = Object.keys(resources).filter(path => decodeURIComponent(path).includes(relative));
    assert(matches.length > 0, `fixture import module absent: ${relative}`);
    const target = resourceUrl('/@fs/' + snapshotRoot.replace(/\/$/, '') + '/' + relative);
    const { bytes, contentType } = await receive(target);
    assert.deepEqual(bytes, Buffer.from(expectedBytes), `fixture response byte mismatch: ${relative}`);
    if (relative.endsWith('.webm')) {
      assert.equal(mime(contentType), 'video/webm', 'fixture video MIME');
      assert.deepEqual(bytes.subarray(0, 4), Buffer.from('1a45dfa3', 'hex'), 'fixture WebM magic');
    } else {
      assert(decode(bytes).includes('-->'), 'subtitle cue marker');
      for (const path of matches) {
        if (!new URL(ORIGIN + path).searchParams.has('raw')) continue;
        const match = /export default\s+("(?:\\.|[^"\\])*")/.exec(decode(bodies.get(path)));
        assert(match && JSON.parse(match[1]) === decode(expectedBytes), `raw subtitle export mismatch: ${path}`);
      }
    }
    fixtureChecks.push({ path: relative, url: target.requestPath, bytes: bytes.length, sha256: digest(bytes), content_type: contentType, import_modules: matches });
  }
  return { resources, edges, transformations, resource_count: Object.keys(resources).length,
    fixture_checks: fixtureChecks, model_package_imports: modelPackageImports, browser_execution: false };
}
