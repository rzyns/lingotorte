// Test-owned deterministic runtime. Private attached pipe only; log-driver none.
import {createServer as createViteServer,preview} from '/app/node_modules/vite/dist/node/index.js';
import {createServer,request,Agent,Server as HttpServer} from 'node:http';
import {createInterface} from 'node:readline';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const origins=JSON.parse(process.env.QUALIFICATION_ORIGINS??'["http://127.0.0.1:18342","http://192.168.1.3:18343"]');
const compiler=await createViteServer({configFile:'/app/vite.config.ts',envFile:false,server:{middlewareMode:true,hmr:false},logLevel:'silent'});
const {startLingotorteLocalService:start}=await compiler.ssrLoadModule('/@fs/app/apps/local-service/src/server.ts');
const {SqliteLocalPersistence:Persistence}=await compiler.ssrLoadModule('/@fs/app/packages/storage/src/sqliteLocalPersistence.ts');
let saves=0,commands=0,providers=0,capability='',observe,service;
const save=Persistence.prototype.saveSnapshot;Persistence.prototype.saveSnapshot=function(...args){saves++;return save.apply(this,args);};
const wav=Buffer.alloc(3244);wav.write('RIFF');wav.writeUInt32LE(3236,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(3200,40);
const pending=new Set(),socketSets=new Map(),trace=[];let holdPut=false,holdPoll=false,pauseCommands=false,stopping=false,holdAck=false,redirectRule=null,hostileResult=false,foreignHits=0;
function track(server,label){const set=new Set();socketSets.set(label,set);server.on('connection',s=>{set.add(s);s.on('close',()=>set.delete(s));});}
// Observe the owned service listener without editing its frozen source.
const originalListen=HttpServer.prototype.listen;let ownedServiceServer;
HttpServer.prototype.listen=function(...args){if(args[0]===18341){ownedServiceServer=this;track(this,'service');}return originalListen.apply(this,args);};
async function commandRunner(cmd,args){commands++;if(pauseCommands)await new Promise(resolve=>pending.add({type:'command',release:resolve}));if(cmd==='ffprobe')return {exitCode:0,stdout:'{"streams":[]}',stderr:''};if(cmd==='python')return {exitCode:0,stdout:'{"engine":"faster-whisper","model_name":"base","language":"en","segments":[{"start":0,"end":0.1,"text":"Synthetic cue"}]}',stderr:''};if(cmd!=='ffmpeg'||!args.includes('/media/synthetic.txt'))throw new Error('UnexpectedSyntheticCommand');await writeFile(args.at(-1),args.includes('srt')?'1\n00:00:00,000 --> 00:00:00,100\nSynthetic cue\n':wav);return {exitCode:0,stdout:'',stderr:''};}
await mkdir('/state',{recursive:true});await mkdir('/scratch',{recursive:true});
async function boot(){service=await start({host:'127.0.0.1',port:18341,publicOrigins:origins,uiOrigins:origins,databasePath:'/state/browser.db',scratchDir:'/scratch/jobs',modelCacheDir:'/scratch/models',allowOnlineProviders:false},{receiveCapability:v=>{capability=v;},observeState:r=>{observe=r;},commandRunner,fetchImpl:async()=>{providers++;throw new Error('ProviderForbidden');},elevenLabsHttpClient:async()=>{providers++;throw new Error('ProviderForbidden');}});}
await boot();
const upstream=new Agent({keepAlive:false});
const gate=createServer(async(req,res)=>{
 const path=req.url??'';const method=req.method??'GET';
 const safePath=/^\/api\/(health|status|state|jobs(?:\/[a-zA-Z0-9_-]+(?:\/cancel)?)?|snippets\/[a-f0-9-]+|artifacts\/cleanup)$/.test(path)?path:'unclassified';
 let responsePrivateAbsent=true;res.on('finish',()=>trace.push({method,path:safePath,authority:req.headers.host??null,origin:req.headers.origin??null,status:res.statusCode,privateAbsent:responsePrivateAbsent,corsGranted:res.hasHeader('access-control-allow-origin'),credentialsGrant:res.hasHeader('access-control-allow-credentials')}));
 if(redirectRule&&method===redirectRule.method&&(redirectRule.path===path||redirectRule.path==='job-poll'&&method==='GET'&&path.startsWith('/api/jobs/')||redirectRule.path==='snippet'&&path.startsWith('/api/snippets/'))){res.writeHead(307,{Location:(process.env.QUALIFICATION_FOREIGN??'http://127.0.0.1:18349')+'/owned-redirect-target'});res.end();return;}
 let cancelled=false;res.on('close',()=>{cancelled=true;});
 if((holdPut&&method==='PUT'&&path==='/api/state')||(holdPoll&&method==='GET'&&path.startsWith('/api/jobs/'))){
  const item={type:method==='PUT'?'put':'poll',release:null};await new Promise(resolve=>{item.release=resolve;pending.add(item);});pending.delete(item);
 }
 if(stopping||cancelled){res.destroy();return;}
 const next=request({hostname:'127.0.0.1',port:18341,path,method,headers:req.headers,agent:upstream},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',async()=>{let bytes=Buffer.concat(chunks);if(hostileResult&&method==='GET'&&path.startsWith('/api/jobs/')){try{const value=JSON.parse(bytes);if(value.job?.result?.snippetId){value.job.result.url='//'+new URL(process.env.QUALIFICATION_FOREIGN??'http://127.0.0.1:18349').host+'/owned-result-target';bytes=Buffer.from(JSON.stringify(value));}}catch{}}responsePrivateAbsent=![capability,'\"snapshot\"','Private synthetic','RIFF'].some(v=>bytes.includes(Buffer.from(v)));if(holdAck&&method==='PUT'&&response.statusCode===200){const item={type:'ack',release:null};await new Promise(resolve=>{item.release=resolve;pending.add(item);});pending.delete(item);}const headers={...response.headers};delete headers['content-length'];if(!cancelled&&!stopping){res.writeHead(response.statusCode,headers);res.end(bytes);}});});
 next.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"Fixture unavailable"}');}else res.destroy();});req.pipe(next);
});track(gate,'gate');await new Promise(r=>gate.listen(18345,'127.0.0.1',r));
process.env.LINGOTORTE_WEB_HOST='0.0.0.0';process.env.LINGOTORTE_WEB_ALLOWED_HOSTS=[...new Set(origins.map(o=>new URL(o).hostname))].join(',');process.env.LINGOTORTE_PUBLIC_ORIGINS=origins.join(',');process.env.LINGOTORTE_UI_ORIGINS=origins.join(',');process.env.LINGOTORTE_API_PROXY_TARGET='http://127.0.0.1:18345';
const dev=await createViteServer({configFile:'/app/vite.config.ts',server:{host:'0.0.0.0',port:18342,strictPort:true},logLevel:'silent'});track(dev.httpServer,'dev');await dev.listen();
const built=await preview({configFile:'/app/vite.config.ts',preview:{host:'0.0.0.0',port:18343,strictPort:true},logLevel:'silent'});track(built.httpServer,'preview');
const foreign=createServer((req,res)=>{if(req.url==='/owned-redirect-target'||req.url==='/owned-result-target')foreignHits++;res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Owned synthetic foreign origin</title><body>Owned qualification</body>');});track(foreign,'foreign');await new Promise(r=>foreign.listen(18349,'0.0.0.0',r));
async function files(root){const result={};for(const e of await readdir(root,{withFileTypes:true})){const path=root+'/'+e.name;if(e.isDirectory())Object.assign(result,await files(path));else if(e.isFile())result[path]=createHash('sha256').update(await readFile(path)).digest('hex');}return result;}
async function oracle(){const db=new DatabaseSync('/state/browser.db',{readOnly:true});const tables={};try{for(const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()){const name=row.name;tables[name]=db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all();}}finally{db.close();}return {runtime:observe(),tables,saves,commands,providers,stateFiles:await files('/state'),scratchFiles:await files('/scratch'),pending:[...pending].map(x=>x.type).sort()};}
const reply=row=>process.stdout.write(JSON.stringify(row)+'\n');
async function selftest(){
 const rows=[];const check=(stage,ok,value={})=>{rows.push({stage,ok:!!ok,...value});reply({incremental:true,row:{stage,ok:!!ok,...value}});if(!ok)throw new Error('RuntimePreflightAssertion');};
 const call=(path,method='GET',body,auth=capability)=>new Promise((resolve,reject)=>{const q=request({hostname:'127.0.0.1',port:18345,path,method,headers:{Host:new URL(origins[0]).host,Origin:origins[0],Authorization:'Bearer '+auth,...(body?{'Content-Type':'application/json'}:{})}},r=>{let text='';r.on('data',x=>text+=x);r.on('end',()=>resolve({status:r.statusCode,text}));});q.on('error',reject);q.end(body);});
 try{
  for(const name of ['model','sourceAudioSnippet','pairedTransport']){const r=await fetch('http://127.0.0.1:18342/src/'+name+'.ts');check('served-module-'+name,r.status===200&&(await r.text()).length>100,{status:r.status});}
  const html=await new Promise((resolve,reject)=>{const q=request({hostname:'127.0.0.1',port:18343,path:'/',headers:{Host:new URL(origins[1]).host}},r=>{let text='';r.on('data',x=>text+=x);r.on('end',()=>resolve({status:r.statusCode,text}));});q.on('error',reject);q.end();});check('built-preview-html',html.status===200&&html.text.includes('/assets/'),{status:html.status});
  const domain=await compiler.ssrLoadModule('/@fs/app/packages/domain/src/index.ts');const state=JSON.parse((await call('/api/state')).text);const media=domain.makeMediaAsset({title:'Private synthetic runtime sentinel',originalPath:'/media/synthetic.txt',contentSha256:'sha256:'+'1'.repeat(64),durationMs:100,container:'webm',sizeBytes:1,privacyLabel:'synthetic'});state.snapshot.mediaAssets[media.id]=media;const saved=await call('/api/state','PUT',JSON.stringify({snapshot:state.snapshot,expectedRevision:state.revision}));check('nonempty-save-control',saved.status===200);const current=JSON.parse((await call('/api/state')).text);
  const waiting=JSON.parse((await call('/api/jobs','POST','{"kind":"waiting"}')).text).job.id;
  holdPut=holdPoll=true;const old=capability;const put=call('/api/state','PUT',JSON.stringify({snapshot:current.snapshot,expectedRevision:current.revision}),old);const poll=call('/api/jobs/'+waiting,'GET',undefined,old);
  for(let i=0;i<200&&pending.size<2;i++)await new Promise(r=>setTimeout(r,5));check('actual-http-put-poll-gated',pending.size===2);
  upstream.destroy();await service.close();await boot();const before=await oracle();holdPut=holdPoll=false;for(const item of pending)item.release();pending.clear();const [p,j]=await Promise.all([put,poll]);const after=await oracle();const normalized=o=>({...o,pending:[]});check('actual-restart-stale-denials',p.status===401&&j.status===401,{putStatus:p.status,pollStatus:j.status});check('restart-zero-request-effects',JSON.stringify(normalized(before))===JSON.stringify(normalized(after)),{before,after});check('new-capability-control',(await call('/api/status')).status===200);return {selftest:true,ok:true,rows,capability};
 }catch(e){return {selftest:true,ok:false,rows,errorClass:e.constructor.name};}finally{holdPut=holdPoll=false;for(const item of pending)item.release();pending.clear();}
}
const rl=createInterface({input:process.stdin});
async function shutdown(){stopping=true;holdPut=holdPoll=pauseCommands=holdAck=false;for(const item of pending)item.release();pending.clear();const cleanup=[];const close=async(label,fn)=>{const task=Promise.resolve().then(fn);const graceful=await Promise.race([task.then(()=>true),new Promise(r=>{const t=setTimeout(()=>r(false),1500);t.unref();})]);let forced=false;if(!graceful){forced=true;for(const s of socketSets.get(label)??[])s.destroy();await Promise.race([task,new Promise(r=>setTimeout(r,1000))]);}for(let i=0;i<50&&(socketSets.get(label)?.size??0)>0;i++)await new Promise(r=>setTimeout(r,5));cleanup.push({label,graceful,forced,remainingSockets:socketSets.get(label)?.size??0});};upstream.destroy();await close('service',()=>service.close());for(const [label,server] of [['gate',gate],['preview',built.httpServer],['foreign',foreign]]){server.closeIdleConnections?.();await close(label,()=>new Promise(r=>server.close(r)));}await close('dev',()=>dev.close());await close('compiler',()=>compiler.close());rl.close();HttpServer.prototype.listen=originalListen;return {stopped:true,strictPass:cleanup.every(x=>x.graceful&&!x.forced&&x.remainingSockets===0),cleanup};}

const {kinds,rows:matrixRows}=await import('/kit/matrix.mjs');
const internal=(path,method='GET',body)=>new Promise((resolve,reject)=>{const q=request({hostname:'127.0.0.1',port:18345,path,method,headers:{Host:new URL(origins[0]).host,Origin:origins[0],Authorization:'Bearer '+capability,...(body?{'Content-Type':'application/json'}:{})},agent:upstream},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>{const bytes=Buffer.concat(chunks);let value;try{value=JSON.parse(bytes);}catch{}resolve({status:r.statusCode,value,bytes:bytes.length});});});q.on('error',reject);q.end(body);});
async function submit(kind){const r=await internal('/api/jobs','POST',JSON.stringify({kind,payload:kinds[kind]}));if(r.status!==201||!r.value.job?.id)throw new Error('SeedSubmission');return r.value.job.id;}
async function terminal(id){for(let i=0;i<400;i++){const r=await internal('/api/jobs/'+id);if(r.status!==200)throw new Error('SeedPoll');if(['completed','failed'].includes(r.value.job.status))return r.value.job;await new Promise(r=>setTimeout(r,5));}throw new Error('SeedDeadline');}
async function seed(){
 const state=(await internal('/api/state')).value;
 if(!Object.keys(state.snapshot.mediaAssets).length){const domain=await compiler.ssrLoadModule('/@fs/app/packages/domain/src/index.ts');const media=domain.makeMediaAsset({title:'Private synthetic live sentinel',originalPath:'/media/synthetic.txt',contentSha256:'sha256:'+'1'.repeat(64),durationMs:100,container:'wav',sizeBytes:3244,privacyLabel:'synthetic'});state.snapshot.mediaAssets[media.id]=media;const saved=await internal('/api/state','PUT',JSON.stringify({snapshot:state.snapshot,expectedRevision:state.revision}));if(saved.status!==200)throw new Error('SeedSave');}
 await writeFile('/scratch/live-sentinel.txt','Owned synthetic sentinel');
 const waitingId=await submit('waiting');const waiting=await internal('/api/jobs/'+waitingId);if(waiting.status!==200||waiting.value.job?.id!==waitingId||waiting.value.job.status!=='queued')throw new Error('SeedWaitingControl');const snippet=await terminal(await submit('source-audio-snippet'));if(snippet.status!=='completed')throw new Error('SeedSnippet');
 const accessBefore=observe().snippetAccessCounter;const touch=await internal(snippet.result.url);if(touch.status!==200||touch.bytes!==3244||observe().snippetAccessCounter!==accessBefore+1)throw new Error('SeedLRUControl');
 const current=(await internal('/api/state')).value;return {valid:true,waitingId,snippetId:snippet.result.snippetId,rows:matrixRows({waitingId,snippetId:snippet.result.snippetId,snapshot:current.snapshot,revision:current.revision}),revision:current.revision};
}
async function jobControl(kind){const before=await oracle();const id=await submit(kind);const job=kind==='waiting'?{status:'queued'}:await terminal(id);const after=await oracle();return {accepted:true,status:201,terminalStatus:job.status,jobAllocated:after.runtime.jobs.length===before.runtime.jobs.length+1,providers:after.providers,commands:after.commands-before.commands};}
async function liveOp(msg){
 if(msg.op==='seed')return await seed();
 if(msg.op==='paused-start')return {jobId:await submit('source-audio-snippet')};
 if(msg.op==='terminal')return {terminalStatus:(await terminal(msg.jobId)).status};
 if(msg.op==='job-control')return await jobControl(msg.kind);
 if(msg.op==='assets')return {assetManifest:await files('/app/dist/web')};
 if(msg.op==='barriers')return {pending:[...pending].map(x=>x.type).sort(),foreignHits,traceCount:trace.length};
 if(msg.op==='trace-since')return {trace:trace.slice(msg.index??0),foreignHits};
 if(msg.op==='fixture-mode'){holdAck=msg.ack===true;redirectRule=msg.redirect??null;hostileResult=msg.hostile===true;return {configured:true};}
 if(msg.op==='oracle-digest'){const o=await oracle();return {digest:createHash('sha256').update(JSON.stringify(o)).digest('hex'),providers:o.providers,commands:o.commands,saves:o.saves,revision:o.runtime.state.revision,jobs:o.runtime.jobs.length,snippets:o.runtime.snippets.length,pending:o.pending};}
 throw new Error('UnknownLiveIPC');
}

reply({ready:true,capability,origins,assetManifest:await files('/app/dist/web')});
try{for await(const line of rl){let msg;try{msg=JSON.parse(line);}catch{reply({errorClass:'InvalidIPC'});continue;}try{if(msg.op==='selftest')reply(await selftest());else if(msg.op==='oracle')reply(await oracle());else if(msg.op==='trace')reply({trace});else if(msg.op==='gate'){holdPut=msg.put===true;holdPoll=msg.poll===true;pauseCommands=msg.commands===true;reply({gated:true});}else if(msg.op==='release'){holdPut=holdPoll=pauseCommands=holdAck=false;redirectRule=null;hostileResult=false;for(const item of pending)item.release();pending.clear();reply({released:true});}else if(msg.op==='restart'){upstream.destroy();await service.close();await boot();reply({restarted:true,capability});}else if(msg.op==='stop'){reply(await shutdown());break;}else reply(await liveOp(msg));}catch(e){reply({errorClass:e.constructor.name,stage:msg.op});}}}finally{if(!stopping)await shutdown();}
