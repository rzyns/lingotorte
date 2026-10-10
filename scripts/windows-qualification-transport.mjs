import assert from 'node:assert/strict';
import http from 'node:http';
import { ORIGIN } from './windows-qualification-resources.mjs';

// No global fetch, proxy agent, redirects, DNS hostnames, or implicit requests.
export function directTransport({ request = http.request, timeoutMs = 3000, maxBytes = 16 * 1024 * 1024 } = {}) {
  assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 3000);
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 16 * 1024 * 1024);
  return target => new Promise((resolve, reject) => {
    let req, response, timer, settled = false, ended = false;
    const fail = error => {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(error);
      response?.destroy(); req?.destroy();
    };
    try {
      const url = new URL(target.url);
      assert.equal(url.origin, ORIGIN, 'fixed loopback origin required');
      assert.equal(url.username + url.password + url.hash, '', 'credentials/fragment forbidden');
      assert.equal(target.requestPath, url.pathname + url.search, 'request target mismatch');
      req = request({ protocol: 'http:', hostname: '127.0.0.1', port: 5173,
        method: 'GET', path: target.requestPath, agent: false,
        headers: { 'accept-encoding': 'identity' } }, res => {
        response = res;
        let size = 0; const chunks = [];
        res.on('error', fail);
        res.on('aborted', () => fail(new Error('response aborted')));
        res.on('close', () => { if (!ended) fail(new Error('response closed before end')); });
        if (res.statusCode >= 300 && res.statusCode < 400) { fail(new Error('redirect forbidden')); return; }
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { fail(new Error('encoded response forbidden')); return; }
        res.on('data', chunk => {
          if (settled) return;
          size += chunk.length;
          if (size > maxBytes) { fail(new Error('response byte limit')); return; }
          chunks.push(Buffer.from(chunk));
        });
        res.on('end', () => {
          ended = true;
          if (settled) return;
          if (res.complete === false) { fail(new Error('incomplete response')); return; }
          settled = true; clearTimeout(timer);
          resolve({ status: res.statusCode, contentType: res.headers['content-type'] ?? '', bytes: Buffer.concat(chunks) });
        });
      });
      req.on('error', fail);
      req.on('timeout', () => fail(new Error('request timeout')));
      req.on('close', () => { if (!response && !settled) fail(new Error('request closed before response')); });
      req.setTimeout(timeoutMs);
      timer = setTimeout(() => fail(new Error('request deadline')), timeoutMs);
      req.end();
    } catch (error) { fail(error); }
  });
}
