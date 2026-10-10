import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { resourceUrl, FIXTURE_PATHS } from './windows-qualification-resources.mjs';
import { directTransport } from './windows-qualification-transport.mjs';
import { bridge, cannedRequest } from './windows-qualification-bridge.mjs';

function fake(action) {
  let request, response;
  const observations = [];
  const factory = (options, callback) => {
    observations.push(options);
    request = new EventEmitter(); request.setTimeout = ms => { request.timeout = ms; }; request.destroy = () => { request.destroyed = true; };
    request.end = () => queueMicrotask(() => {
      response = new EventEmitter(); response.statusCode = 200; response.headers = { 'content-type': 'text/javascript' }; response.complete = true;
      response.destroy = () => { response.destroyed = true; };
      action(request, response, callback);
    });
    return request;
  };
  return { factory, observations, state: () => ({request,response}) };
}

test('exact literal target, fixed direct options, status MIME and split raw bytes', async () => {
  const f = fake((req,res,cb) => { cb(res); res.emit('data',Buffer.from([0,255])); res.emit('data',Buffer.from('żółć')); res.emit('end'); res.emit('close'); });
  const result = await directTransport({request:f.factory})(resourceUrl('/@vite/client?x=%20&y=@'));
  assert.deepEqual(result.bytes,Buffer.concat([Buffer.from([0,255]),Buffer.from('żółć')]));
  assert.equal(result.status,200); assert.equal(result.contentType,'text/javascript');
  assert.equal(f.observations[0].path,'/@vite/client?x=%20&y=@');
  assert.equal(f.observations[0].hostname,'127.0.0.1'); assert.equal(f.observations[0].port,5173); assert.equal(f.observations[0].agent,false);
  assert.equal(f.state().request.timeout,3000);
});
test('error, timeout, abort, premature closes, incomplete and byte bounds all fail and destroy owned request', async () => {
  for (const action of [
    (req,res,cb) => req.emit('error',new Error('request error')),
    (req,res,cb) => req.emit('timeout'),
    (req,res,cb) => req.emit('close'),
    (req,res,cb) => { cb(res); res.emit('error',new Error('response error')); },
    (req,res,cb) => { cb(res); res.emit('aborted'); },
    (req,res,cb) => { cb(res); res.emit('close'); },
    (req,res,cb) => { res.complete=false; cb(res); res.emit('end'); },
    (req,res,cb) => { cb(res); res.emit('data',Buffer.alloc(5)); },
  ]) {
    const f=fake(action); await assert.rejects(directTransport({request:f.factory,maxBytes:4})(resourceUrl('/@vite/client')));
    assert.equal(f.state().request.destroyed,true);
  }
  const f=fake(() => {});
  await assert.rejects(directTransport({request:f.factory,timeoutMs:10})(resourceUrl('/@vite/client')),/deadline/);
  assert.equal(f.state().request.destroyed,true);
});
test('redirects, compression, invalid bounds and mismatched/external targets cannot escape', async () => {
  for (const kind of ['redirect','compression']) {
    const f=fake((req,res,cb) => { if(kind==='redirect') res.statusCode=302; else res.headers['content-encoding']='gzip'; cb(res); });
    await assert.rejects(directTransport({request:f.factory})(resourceUrl('/')),/redirect|encoded/); assert.equal(f.observations.length,1);
  }
  const f=fake(() => {});
  for (const target of [{url:'https://example.invalid/',requestPath:'/'},{...resourceUrl('/@vite/client'),requestPath:'/%40vite/client'}]) await assert.rejects(directTransport({request:f.factory})(target));
  assert.equal(f.observations.length,0);
  assert.throws(() => directTransport({timeoutMs:0})); assert.throws(() => directTransport({maxBytes:0}));
});

test('actual packet parser fixtures checker and ClientRequest transport integrate; historical encoded route is RED control', async () => {
  assert(process.env.LT_BINDING, 'LT_BINDING must identify the prepared packet binding');
  const binding=JSON.parse(fs.readFileSync(process.env.LT_BINDING,'utf8'));
  const base=resourceUrl('/@fs/'+binding.snapshotRoot).requestPath;
  const rows={}; const put=(p,text,contentType='text/javascript',status=200) => {rows[p]={base64:Buffer.from(text).toString('base64'),contentType,status};};
  put('/','<title>Lingotorte Local Study</title><script src="/src/main.ts"></script>','text/html');
  put('/@vite/client','export const message="Internal Server Error";'); put('/%40vite/client','<title>fallback</title>','text/html');
  put('/src/main.ts','import "./app.ts"; import "./model.ts"; import "./żółć file.ts?x=%20&y=@";');
  put('/src/app.ts','import "./model.ts"; import(variable);'); put(resourceUrl('/src/żółć file.ts?x=%20&y=@').requestPath,'export const ok=1;');
  const pkg=base+'/packages/domain/index.ts'; put(pkg,'export const makeMediaAsset=1;');
  put('/src/model.ts',`import {makeMediaAsset} from ${JSON.stringify(pkg)};`+FIXTURE_PATHS.map(p=>`import x from ${JSON.stringify(base+'/'+p+(p.endsWith('.webm')?'?import':'?raw'))};`).join(''));
  for(const p of FIXTURE_PATHS) {
    const bytes=fs.readFileSync(binding.snapshotRoot+'/'+p);
    put(base+'/'+p,bytes,p.endsWith('.webm')?'video/webm':'text/plain');
    put(base+'/'+p+(p.endsWith('.webm')?'?import':'?raw'),'export default '+JSON.stringify(p.endsWith('.webm')?'/synthetic.webm':bytes.toString('utf8')));
  }
  const observed=[]; const transport=directTransport({request:cannedRequest(rows,observed)});
  const graph=await bridge(binding,transport);
  assert.equal(graph.fixture_checks.length,3); assert.equal(graph.browser_execution,false); assert.equal(graph.resources['/src/app.ts'].dynamic_nonliteral_imports,1);
  assert(observed.some(o=>o.path==='/@vite/client')); assert(!observed.some(o=>o.path==='/%40vite/client'));
  await assert.rejects(bridge(binding,target => transport(target.requestPath==='/@vite/client'?resourceUrl('/%40vite/client'):target)),/JavaScript MIME/);
  rows['/@vite/client'].contentType='text/html'; await assert.rejects(bridge(binding,transport),/JavaScript MIME/);
});
