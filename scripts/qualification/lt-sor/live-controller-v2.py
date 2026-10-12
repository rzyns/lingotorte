"""Finite live adapter. Default CLI runs offline validation only. Import starts nothing.
Live entrypoint run_live(cdp, review) is for private browser_exec memory ONLY.
No result, pipe/CDP payload, exception message, or capability may be printed.
"""
import base64,hashlib,importlib.util,json,os,pathlib,queue,subprocess,threading,time,uuid,sys
ROOT=pathlib.Path(__file__).resolve().parent
REPO=ROOT.parents[2]
# Runtime identity and manifest are explicitly supplied, never stale cache literals.
MANIFEST=pathlib.Path(os.environ['LT_SOR_MANIFEST']) if os.environ.get('LT_SOR_MANIFEST') else None
IMAGE=os.environ.get('LT_SOR_IMAGE','')
def output_root():
 p=pathlib.Path(os.environ['LT_SOR_SCRATCH'])/'lt-sor-harness';p.mkdir(parents=True,exist_ok=True);return p
def load(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
base=load('finite_inventory','inventory.py');controller=load('finite_journal','controller.py')
inventory=base.inventory
ARTIFACTS=('live-controller-v2.py','runtime-live-v2.mjs','dom-live-v2.mjs','live-offline-v2.mjs','inventory.py','controller.py','matrix.mjs')
def sha(data):return hashlib.sha256(data).hexdigest()
def synthetic_hash():
 import struct
 wav=bytearray(3244);wav[0:4]=b'RIFF';struct.pack_into('<I',wav,4,3236);wav[8:16]=b'WAVEfmt ';struct.pack_into('<IHHIIHH',wav,16,16,1,1,16000,32000,2,16);wav[36:40]=b'data';struct.pack_into('<I',wav,40,3200)
 return 'sha256:'+sha(wav)
def frozen_binding():
 if MANIFEST is None or not IMAGE.startswith('sha256:') or len(IMAGE)!=71:raise PermissionError('ExplicitImmutableBindingRequired')
 entries=json.loads(MANIFEST.read_text());bad=[x['path'] for x in entries if x['kind']=='file' and sha((REPO/x['path']).read_bytes())!=x['sha256']]
 if bad:raise PermissionError('ProductionSourceChanged')
 if subprocess.check_output(['docker','image','inspect',IMAGE,'--format','{{.Id}}'],text=True).strip()!=IMAGE:raise PermissionError('CandidateImageChanged')
 return {'image':IMAGE,'sourceManifestSha256':sha(MANIFEST.read_bytes()),'sourceEntries':len(entries),'sourceMismatches':len(bad),'artifacts':{f:sha((ROOT/f).read_bytes()) for f in ARTIFACTS}}
class PrivateRuntime:
 def __init__(self,out,live=False,lan='192.168.1.3'):
  self.name='lt-sor-live-v2-'+uuid.uuid4().hex[:12];self._capability='';self._history=[];self.q=queue.Queue();self.lock=threading.Lock();self.out=out;self.forced=False
  ports=tuple(int(x) for x in os.environ.get('LT_SOR_PORTS','18342,18343,18349').split(','))
  if len(ports)!=3 or len(set(ports))!=3 or any(p<1024 or p>65535 for p in ports):raise PermissionError('OwnedPortSelectionInvalid')
  self.origins=[f'http://127.0.0.1:{ports[0]}',f'http://{lan}:{ports[1]}'];self.foreign=f'http://127.0.0.1:{ports[2]}'
  args=['docker','run','--rm','--init','--log-driver','none','--name',self.name,'-i']
  if live:
   # Explicit chosen host binds only; backend remains unpublished. No firewall changes.
   args+=['--network','bridge','-p',f'127.0.0.1:{ports[0]}:18342','-p',f'{lan}:{ports[1]}:18343','-p',f'127.0.0.1:{ports[2]}:18349']
  else:args+=['--network','none']
  media=out/'media';media.mkdir();(media/'synthetic.txt').write_text('Owned synthetic fixture only\n')
  args+=['--mount',f'type=bind,source={ROOT},target=/kit,readonly','--mount',f'type=bind,source={media},target=/media,readonly','--mount',f'type=bind,source={out},target=/out','--mount',f'type=bind,source={MANIFEST},target=/manifest.json,readonly','-e','QUALIFICATION_ORIGINS='+json.dumps(self.origins),'-e','QUALIFICATION_FOREIGN='+self.foreign,IMAGE,'sh','-c','npm run build > /out/build.log 2>&1 && node /kit/runtime-live-v2.mjs']
  self.process=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
  def reader():
   for line in self.process.stdout:
    try:
     v=json.loads(line)
     if 'capability' in v:
      self._capability=v.pop('capability')
      if self._capability not in self._history:self._history.append(self._capability)
     if v.get('incremental'):continue
     self.q.put(v)
    except ValueError:self.q.put({'errorClass':'InvalidPrivateIPC'})
  self.thread=threading.Thread(target=reader,daemon=True);self.thread.start()
  try:
   self.ready=self.q.get(timeout=75)
   if not self.ready.get('ready') or len(self._capability)!=43:raise controller.DiagnosticError('FixtureNotReady')
  except Exception:
   self.close();raise controller.DiagnosticError('FixtureStartupFailure') from None
 def capability(self):return self._capability
 def capabilities(self):return list(self._history)
 def request(self,op,**values):
  with self.lock:
   self.process.stdin.write(json.dumps({'op':op,**values})+'\n');self.process.stdin.flush();v=self.q.get(timeout=35)
   if v.get('errorClass'):raise controller.DiagnosticError('PrivateRuntimeOperation')
   return v
 def close(self):
  clean={'strictPass':False}
  try:clean=self.request('stop')
  except Exception:pass
  try:self.process.wait(timeout=8)
  except subprocess.TimeoutExpired:
   self.forced=True;subprocess.run(['docker','stop','--time','2',self.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=12)
   try:self.process.wait(timeout=5)
   except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=5)
  absent=subprocess.run(['docker','inspect',self.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=12).returncode!=0
  self._capability='';self._history.clear();self.thread.join(timeout=2)
  for stream in (self.process.stdin,self.process.stdout):
   try:stream.close()
   except Exception:pass
  return {**clean,'containerAbsent':absent,'forcedContainer':self.forced,'exit':self.process.returncode,'strictPass':clean.get('strictPass') is True and absent and not self.forced and self.process.returncode==0}
class LiveDriver:
 def __init__(self,cdp,runtime,journal,new_tab=None):
  self.open_tab=new_tab
  self.cdp=cdp;self.runtime=runtime;self.journal=journal;self.target=None;self.session=None;self.object=None;self.origin=None;self.cache={};self.handlers={row['id']:(self.denial if row['channel']!='control' else self.control) for row in inventory()}
 def call(self,method,**params):
  try:
   r=self.cdp(method,**({'session_id':self.session} if self.session and not method.startswith('Target.') else {}),**params)
  except Exception as e:
   raise controller.DiagnosticError('PrivateBrowserOperation',method,'timeout' if isinstance(e,TimeoutError) else 'transport') from None
  if not isinstance(r,dict) or r.get('error'):raise controller.DiagnosticError('CDPRejected',method,'rejected')
  if r.get('exceptionDetails'):
   # Only exact fixed JS message value is accepted; descriptions/stacks are never retained.
   tag=r['exceptionDetails'].get('exception',{}).get('value')
   raise controller.DiagnosticError(tag if tag in controller.DIAGNOSTIC_TAGS else 'PrivateBrowserOperation',method,'javascript')
  return r
 def page(self,origin,reload=False):
  if self.origin==origin and self.object and not reload:return
  if not self.target:
   if not callable(self.open_tab):raise controller.DiagnosticError('NativeNewTabHelperRequired')
   # Browser-level creation does not switch the helper's default session or touch user tabs.
   self.target=self.call('Target.createTarget',url='about:blank',background=True)['targetId'];self.session=self.call('Target.attachToTarget',targetId=self.target,flatten=True)['sessionId']
  if self.object:
   try:self.invoke('cleanup')
   finally:self.call('Runtime.releaseObject',objectId=self.object);self.object=None
  self.call('Page.navigate',url=origin+'/')
  # Navigation is genuinely awaited; old-context installation cannot race into the new page.
  end=time.monotonic()+10
  while time.monotonic()<end:
   try:
    r=self.call('Runtime.evaluate',expression='({origin:location.origin,ready:document.readyState})',returnByValue=True)['result'].get('value',{})
    if r.get('origin')==origin and r.get('ready')=='complete':break
   except RuntimeError:pass
   time.sleep(.02)
  else:raise controller.DiagnosticError('BrowserNavigationDeadline')
  source=(ROOT/'dom-live-v2.mjs').read_bytes();uri='data:text/javascript;base64,'+base64.b64encode(source).decode()
  expression='(async()=>{const m=await import('+json.dumps(uri)+');return await m.installDomDriver('+str(origin!=self.runtime.foreign).lower()+');})()'
  r=self.call('Runtime.evaluate',expression=expression,awaitPromise=True,returnByValue=False)
  self.object=r.get('result',{}).get('objectId')
  if not self.object:raise controller.DiagnosticError('DOMBridgeObjectMissing')
  self.origin=origin
 def invoke(self,op,**arg):
  r=self.call('Runtime.callFunctionOn',objectId=self.object,functionDeclaration="async function(op,arg){try{return await this.invoke(op,arg);}catch(e){return {diagnosticTag:['DomDeadline','DomButton','DomSelector'].includes(e?.message)?e.message:'UnexpectedException'};}}",arguments=[{'value':op},{'value':arg}],awaitPromise=True,returnByValue=True,_response_timeout=12)
  value=r.get('result',{}).get('value')
  if not isinstance(value,dict):raise controller.DiagnosticError('DOMResultType')
  if 'diagnosticTag' in value:raise controller.DiagnosticError(value['diagnosticTag'],'Runtime.callFunctionOn','javascript')
  return value
 def digest(self):
  # Full SQL, runtime maps/LRU/lifecycle, revisions, filesystem hashes and fakes in memory.
  value=self.runtime.request('oracle');value.pop('pending',None)
  return {'sha256':sha(json.dumps(value,sort_keys=True,separators=(',',':')).encode()),'saves':value['saves'],'providers':value['providers'],'commands':value['commands'],'revision':value['runtime']['state']['revision'],'media':len(value['runtime']['state']['snapshot']['mediaAssets'])}
 def checkpoint(self,row,stage,value):self.journal.append('checkpoint',row['phase'],row['id']+':'+stage,oracle=value)
 def until(self,fn,seconds=6):
  end=time.monotonic()+seconds
  while time.monotonic()<end:
   v=fn()
   if v:return v
   time.sleep(.02)
  raise controller.DiagnosticError('FiniteBarrierDeadline')
 def prepared(self,origin=None):
  origin=origin or self.runtime.origins[0];self.page(origin)
  self.invoke('import');r=self.invoke('pair',origin=origin,capability=self.runtime.capability())
  if not r.get('masked') or not r.get('cleared') or r.get('pairAgain'):raise controller.DiagnosticError('ExplicitPairFailed')
  return self.invoke('save')
 def denial(self,row):
  # Every attempt seeds independently before taking its zero-effect checkpoint.
  self.runtime.request('release');seed=self.runtime.request('seed');index=int(row['id'].rsplit('-',1)[1]);wire=seed['rows'][index]
  expectedPath=row['path'].replace('{waitingId}',seed['waitingId']).replace('{snippetId}',seed['snippetId'])
  if not seed.get('valid') or wire['method']!=row['method'] or wire['path']!=expectedPath or (row['path']=='/api/jobs' and wire.get('kind')!=row['effect']):raise controller.DiagnosticError('SeedMappingMismatch')
  self.page(self.runtime.foreign if row['fault'] in ('foreign','null') else self.runtime.origins[0])
  uiProof=None
  if row['fault'] in ('missing','wrong'):
   uiBefore=self.digest();ui=self.invoke('pair',origin=self.runtime.origins[0],capability='' if row['fault']=='missing' else 'A'*43);at=self.runtime.request('barriers')['traceCount'];self.invoke('save');time.sleep(.05);uiProof={'genericErrorVisible':ui['pairAgain'] or ui['pairingInputError'],'masked':ui['masked'],'cleared':ui['cleared'],'autosaveStopped':not ui['autosave'],'oracleUnchanged':uiBefore==self.digest(),'newWorkStopped':at==self.runtime.request('barriers')['traceCount']};self.checkpoint(row,'actual-settings-auth-fault',uiProof)
  before=self.digest();traceIndex=self.runtime.request('barriers')['traceCount'];self.checkpoint(row,'before',{'seedValid':True,'method':wire['method'],'path':wire['path'],'digest':before})
  arg={'id':row['id'],'fault':row['fault'],'channel':row['channel'],'origin':self.runtime.origins[0],'path':wire['path'],'method':wire['method'],'body':wire.get('body'),'auth':None if row['fault']=='missing' else 'A'*43 if row['fault']=='wrong' else self.runtime.capability()}
  browser=self.invoke('context-attempt',**arg) if row['fault'] in ('foreign','null') else self.invoke('fetch',**{k:v for k,v in arg.items() if k in ('origin','path','method','body','auth')})
  if row['fault']=='null' and row['channel']=='embed':
   time.sleep(.7);trace=self.runtime.request('trace-since',index=traceIndex)['trace'];after=self.digest()
   if not trace:
    controls=[self.cache.get('foreign-embed-'+str(index)),self.cache.get('null-navigation-'+str(index))]
    evidenced=browser.get('sent') is True and browser.get('connected') is True and browser.get('elementType')=='EMBED' and browser.get('sandboxed') is True and browser.get('opaqueSandbox') is True and browser.get('resourceCount')==0 and browser.get('loadEvents')==0 and not browser.get('deadline') and all(v and v.get('ok') and v.get('serverTrace') and v.get('unchanged') and v.get('privateAbsent') for v in controls)
    result={'ok':evidenced and before==after,'disposition':'OBSERVED_BROWSER_BLOCK' if evidenced and before==after else 'FAILED','browserPolicy':'opaque-sandbox-embed-exclusion' if evidenced else 'unexplained-no-request','requestCount':0,'serverDenialProven':False,'privateAbsent':evidenced,'unchanged':before==after,'before':before,'after':after,'browserEvidence':browser,'positiveControlIds':['foreign-embed-'+str(index),'null-navigation-'+str(index)]}
    self.checkpoint(row,'after',result);return result
  else:trace=self.until(lambda:self.runtime.request('trace-since',index=traceIndex)['trace'])
  # Browser may only send OPTIONS. Match actual path/envelope rather than inventing origin.
  matching=[t for t in trace if t['path']==wire['path'] and t['method'] in (wire['method'],'OPTIONS')]
  if not matching:raise controller.DiagnosticError('BrowserServerTraceMissing')
  time.sleep(.05);after=self.digest()
  expected=lambda t:403 if t['origin'] in ('null',self.runtime.foreign) else 401
  statusOk=all(t['status']==(row.get('expectedStatus') or expected(t)) and not t.get('credentialsGrant') and (row['fault'] not in ('foreign','null') or not t.get('corsGranted')) for t in matching)
  privateAbsent=all(t.get('privateAbsent') is True for t in matching) and (browser.get('opaque') is True or browser.get('sent') is True or browser.get('privateAbsent') is True)
  result={'ok':statusOk and before==after and privateAbsent and not browser.get('deadline') and (uiProof is None or all(uiProof.values())),'UIAuthProof':uiProof,'status':matching[-1]['status'],'privateAbsent':privateAbsent,'unchanged':before==after,'serverTrace':matching,'before':before,'after':after,'browserOpaque':browser.get('opaque') is True}
  result['disposition']='PASS' if result['ok'] else 'FAILED';self.cache[row['id']]=result
  self.checkpoint(row,'after',result);return result
 def control(self,row):
  stage=row['stage'];phase=row['phase'];dev,lan=self.runtime.origins;origin=lan if phase==base.PHASES[7] else dev
  self.runtime.request('fixture-mode')
  if stage=='built-asset-binding':
   self.page(lan,reload=True);v=self.invoke('asset-binding');actual=self.runtime.request('assets')['assetManifest'];paths=v['scripts']+v['styles'];ok=bool(paths) and all('/app/dist/web'+p in actual for p in paths) and not v['modules'] and actual==self.runtime.ready['assetManifest'];return {'ok':ok,'assetManifestSha256':sha(json.dumps(actual,sort_keys=True).encode()),'moduleCount':v['modules']}
  if stage=='masked-pair':
   self.page(origin);v=self.invoke('pair',origin=origin,capability=self.runtime.capability());policies=[e for e in self.invoke('events')['events'] if e['stage']=='native-policy'];policy=policies[-1] if policies else {};return {'ok':v['masked'] and v['cleared'] and not v['pairAgain'] and policy.get('version')==1 and policy.get('platform')=='linux' and policy.get('fullyQualifiedOnly') and not policy.get('uncAllowed'),'hydratedNativePolicy':policy,**v}
  if stage in ('nonempty-import','subtle-absent-nonempty-import'):
   self.page(origin);self.cache['importIds:'+origin]=set(self.runtime.request('oracle')['runtime']['state']['snapshot']['mediaAssets']);v=self.invoke('import');return {'ok':v['imported'] and (stage=='nonempty-import' or v['subtleAbsent'] and not v['secureContext']),**v}
  if stage=='durable-ack':
   self.page(origin);before=self.digest();v=self.invoke('save');after=self.digest();media=self.runtime.request('oracle')['runtime']['state']['snapshot']['mediaAssets'];newFile=any(k not in self.cache.get('importIds:'+origin,set()) and asset.get('title')=='owned-live' and asset.get('contentSha256')==synthetic_hash() for k,asset in media.items());return {'ok':v['saved'] and after['saves']==before['saves']+1 and after['media']>0 and newFile,'before':before,'after':after,'newNonemptyFileHashMatched':newFile,'syntheticFileSha256':synthetic_hash(),**v}
  if stage=='native-policy':
   self.page(dev);self.invoke('audio-start');self.cache['audioTrace']=self.runtime.request('barriers')['traceCount'];return {'ok':True,'actualUiNativePathAccepted':True}
  if stage=='job-poll':
   v=self.invoke('audio-finish');events=self.invoke('events')['events'];return {'ok':v['blob'] and any(e.get('method')=='GET' and e.get('path','').startswith('/api/jobs/') for e in events),'events':events}
  if stage=='wav-get-delete-blob':
   if origin==lan:self.invoke('audio-start');self.invoke('audio-finish')
   v=self.invoke('audio-finish');events=v['events'];promoted=[e for e in events if e.get('stage')=='blob'];gets=[e for e in events if e.get('stage')=='finish' and e.get('method')=='GET' and e.get('status')==200];deletes=[e for e in events if e.get('stage')=='finish' and e.get('method')=='DELETE' and e.get('status')==204];return {'ok':v['blob'] and bool(gets and deletes and promoted) and promoted[-1]['deletedBeforePromotion'] and promoted[-1]['bytes']==3244,'events':events}
  if stage=='media-ready':
   before=self.invoke('media-inspect');self.call('Target.activateTarget',targetId=self.target)
   v=self.invoke('media-ready');after=self.invoke('media-inspect');return {'ok':v['ready'] and v['controls'] and v['blob'] and not v['mediaError'],'beforeActivation':before,'afterActivation':after,**v}
  if stage=='play-or-policy-block':
   v=self.invoke('play');ok=(v['played'] or v['policyBlocked']) and not v['mediaError'];storage=self.invoke('export-storage',capabilities=self.runtime.capabilities()) if origin==lan else None;return {'ok':ok and (storage is None or storage['privateAbsent'] and storage['exportCaptured'] and storage['downloadPrevented']),'LANStorageExport':storage,**v}
  if stage.startswith('job-control-'):
   self.page(dev);seed=self.runtime.request('seed');wire=next(w for w in seed['rows'] if w.get('kind')==stage.removeprefix('job-control-'));before=self.digest();v=self.invoke('fetch',origin=dev,method='POST',path='/api/jobs',body=wire['body'],auth=self.runtime.capability());jobId=v.get('jobId');acceptedStatus=v.get('status');terminal=v.get('terminalStatus');
   if jobId and terminal not in ('completed','failed') and stage!='job-control-waiting':
    v=self.until(lambda:(lambda x:x if x.get('terminalStatus') in ('completed','failed') else None)(self.invoke('fetch',origin=dev,method='GET',path='/api/jobs/'+jobId,auth=self.runtime.capability())))
   after=self.digest();return {'ok':bool(jobId) and acceptedStatus==201 and after['providers']==0 and (stage=='job-control-waiting' or v.get('terminalStatus') in ('completed','failed')),'acceptedStatus':acceptedStatus,'terminalStatus':v.get('terminalStatus'),'before':before,'after':after}
  if stage=='paused-denial-release':
   seed=self.runtime.request('seed');self.page(self.runtime.foreign);self.runtime.request('gate',commands=True);start=self.runtime.request('paused-start');self.until(lambda:'command' in self.runtime.request('barriers')['pending']);before=self.digest();results=[]
   try:
    for method,path,body in [('POST','/api/jobs/'+start['jobId']+'/cancel','{}'),('DELETE','/api/snippets/'+seed['snippetId'],None),('POST','/api/artifacts/cleanup','{}')]:
     at=self.runtime.request('barriers')['traceCount'];self.invoke('context-attempt',id=uuid.uuid4().hex,fault='null',channel='fetch',origin=dev,path=path,method=method,body=body,auth=self.runtime.capability());trace=self.until(lambda:self.runtime.request('trace-since',index=at)['trace']);results.append(all(t['status']==403 for t in trace) and self.digest()==before)
   finally:self.runtime.request('release')
   terminal=self.runtime.request('terminal',jobId=start['jobId']);return {'ok':all(results) and terminal['terminalStatus']=='completed','denials':results,'terminalStatus':terminal['terminalStatus']}
  if stage=='both-pending':
   self.prepared();self.invoke('autosave');self.runtime.request('gate',put=True,poll=True);self.invoke('audio-start');self.invoke('import',name='restart-owned.wav');pending=self.until(lambda:(lambda p:p if 'put' in p and 'poll' in p else None)(self.runtime.request('barriers')['pending']));self.cache['pendingBefore']=self.digest();return {'ok':True,'pending':pending}
  if stage=='restart-new-capability':
   old=self.runtime.capability();self.runtime.request('restart');changed=old!=self.runtime.capability();self.cache['restartBefore']=self.digest();self.runtime.request('release');v=self.invoke('settled');return {'ok':changed and v['pairAgain'],'rotated':changed,**v}
  if stage=='preserved-no-replay':
   v=self.invoke('work-preserved');at=self.runtime.request('barriers')['traceCount'];time.sleep(.2);stable=at==self.runtime.request('barriers')['traceCount'];after=self.digest();settings=self.invoke('settings');return {'ok':v['preserved'] and stable and not settings['autosave'] and after==self.cache['restartBefore'],'preserved':v['preserved'],'loopsStopped':stable,'before':self.cache['restartBefore'],'after':after}
  if stage=='stale-accepted-ack':
   self.prepared();self.runtime.request('fixture-mode',ack=True);before=self.digest();self.invoke('save-start');self.until(lambda:'ack' in self.runtime.request('barriers')['pending']);committed=self.digest();self.checkpoint(row,'committed-before-owner-loss',committed);self.invoke('endpoint',origin=lan);self.runtime.request('release');time.sleep(.15);v=self.invoke('settings');after=self.digest();return {'ok':committed['saves']==before['saves']+1 and after==committed and not v['saved'],'commitPreserved':after==committed,'staleAckNotDisplayed':not v['saved'],'before':before,'committed':committed,'after':after}
  if stage=='explicit-repair':
   before=self.digest();v=self.invoke('pair',origin=dev,capability=self.runtime.capability());after=self.digest();return {'ok':before==after and v['masked'] and v['cleared'] and not v['pairAgain'],'before':before,'after':after}
  if stage=='endpoint-edit':
   self.prepared();results=[]
   for endpoint in (dev+'/path',dev+'?query=1','http://user@127.0.0.1:18342','http://127.1:18342','https://127.0.0.1:18342',lan):
    at=self.runtime.request('barriers')['traceCount'];before=self.digest();v=self.invoke('endpoint',origin=endpoint);self.invoke('save');snippet=self.invoke('audio-disabled');time.sleep(.05);results.append(v['cleared'] and snippet['disabled'] and at==self.runtime.request('barriers')['traceCount'] and before==self.digest())
   self.prepared();self.runtime.request('gate',poll=True);at=self.runtime.request('barriers')['traceCount'];self.invoke('audio-start');self.until(lambda:'poll' in self.runtime.request('barriers')['pending']);self.invoke('endpoint',origin=lan);self.runtime.request('release');trace=self.until(lambda:(lambda ts:ts if any(t['method']=='GET' and t['path'].startswith('/api/jobs/') for t in ts) else None)(self.runtime.request('trace-since',index=at)['trace']));time.sleep(.05);captured=all(t['authority']==dev.removeprefix('http://') and t['origin'] in (dev,None) for t in trace) and not self.invoke('inspect')['blob'];results.append(captured)
   return {'ok':all(results),'endpointCases':len(results)-1,'capturedSnippetAfterAwait':captured,'noAuthorityOrStateTransfer':all(results)}
  if stage=='redirect-denied':return self.redirect_controls(row)
  if stage=='hostile-result-path':
   self.prepared();self.runtime.request('fixture-mode',hostile=True);at=self.runtime.request('barriers')['traceCount'];self.invoke('audio-start');self.invoke('audio-rejected');trace=self.runtime.request('trace-since',index=at);v=self.invoke('inspect');self.runtime.request('release');return {'ok':not v['blob'] and trace['foreignHits']==0 and not any(t['path'].startswith('/api/snippets/') for t in trace['trace']),'hostileResultNoFetch':not v['blob'],'foreignHits':trace['foreignHits']}
  if stage=='reload-fresh-pair':
   self.prepared();before=self.digest();self.page(dev,reload=True);self.invoke('settings');at=self.runtime.request('barriers')['traceCount'];v=self.invoke('save');time.sleep(.05);empty=v['cleared'] and not v['saved'] and at==self.runtime.request('barriers')['traceCount'];paired=self.invoke('pair',origin=dev,capability=self.runtime.capability());return {'ok':empty and paired['masked'] and paired['cleared'] and self.digest()==before,'freshPairRequired':empty}
  if stage=='disconnect':
   self.page(dev);v=self.invoke('disconnect');at=self.runtime.request('barriers')['traceCount'];save=self.invoke('save');time.sleep(.05);return {'ok':v['cleared'] and not save['saved'] and at==self.runtime.request('barriers')['traceCount'],'newWorkStopped':at==self.runtime.request('barriers')['traceCount']}
  if stage=='storage-export-url-absence':
   self.prepared();v=self.invoke('export-storage',capabilities=self.runtime.capabilities());return {'ok':v['privateAbsent'] and v['exportCaptured'] and v['downloadPrevented'],**v}
  raise controller.DiagnosticError('UnboundControl')
 def redirect_controls(self,row):
  results=[]
  for method,path in [('GET','/api/status'),('GET','/api/state'),('PUT','/api/state'),('POST','/api/jobs'),('GET','job-poll'),('GET','snippet'),('DELETE','snippet')]:
   self.runtime.request('release');self.page(self.runtime.origins[0],reload=True);self.prepared();self.runtime.request('fixture-mode',redirect={'method':method,'path':path});at=self.runtime.request('barriers')['traceCount']
   if path in ('/api/status','/api/state') and method=='GET':self.invoke('pair',origin=self.runtime.origins[0],capability=self.runtime.capability())
   elif method=='PUT':self.invoke('save')
   else:self.invoke('audio-start');self.invoke('audio-rejected')
   trace=self.runtime.request('trace-since',index=at);results.append(any(t['status']==307 for t in trace['trace']) and trace['foreignHits']==0);self.checkpoint(row,method+path,{'redirectObserved':results[-1],'foreignHits':trace['foreignHits'],'trace':trace['trace']})
  self.runtime.request('release');return {'ok':all(results),'redirectCases':len(results),'denied':results}
 def cleanup(self):
  issues=[]
  try:
   if self.object:
    try:self.invoke('cleanup')
    except Exception:issues.append('page')
    try:self.call('Runtime.releaseObject',objectId=self.object)
    except Exception:issues.append('object')
   if self.target:
    try:
     if self.call('Target.closeTarget',targetId=self.target,_response_timeout=12).get('success') is not True:issues.append('target-close-rejected')
    except Exception:issues.append('target-close')
    try:
     if any(t['targetId']==self.target for t in self.call('Target.getTargets',_response_timeout=12)['targetInfos']):issues.append('target-present')
    except Exception:issues.append('target-readback')
  finally:
   clean=self.runtime.close();self.object=None;self.target=None;self.session=None
  return {**clean,'runtimeStrictPass':clean['strictPass'],'browserCleanupIssues':issues,'ownedTargetAbsent':not any(x.startswith('target-') for x in issues),'strictPass':clean['strictPass'] and not issues}
 def run(self):
  required={r['id'] for r in inventory()}
  if set(self.handlers)!=required:raise PermissionError('FiniteHandlersIncomplete')
  try:
   failedPrerequisites=set()
   for row in inventory():
    # Stop dependent LAN/UI journeys after the first failed setup, not seven cascades.
    if row['channel']=='control' and row['phase'] in failedPrerequisites:
     self.journal.append('assertion',row['phase'],row['id'],ok=False,oracle={'disposition':'SKIPPED_CASCADE','prerequisitePhase':row['phase']});continue
    failedBefore=len(self.journal.failures)
    self.journal.phase(row['id'],lambda row=row:self.journal.assert_row(row['phase'],row['id'],(v:=self.handlers[row['id']](row))['ok'] is True,oracle=v))
    if len(self.journal.failures)>failedBefore:
     if row['channel']=='control' and row['phase'] in (base.PHASES[0],base.PHASES[1],base.PHASES[7]):failedPrerequisites.add(row['phase'])
     try:self.runtime.request('release')
     except Exception:self.journal.phase('release-'+row['id'],lambda:self.journal.assert_row('cleanup','release',False))
  finally:self.journal.phase('cleanup',lambda:self.journal.assert_row('cleanup','strict', (v:=self.cleanup())['strictPass'],oracle=v))
  return not self.journal.failures

def run_live(cdp,review,new_tab=None,lan='192.168.1.3'):
 if review.get('image')!=IMAGE or not all(review.get(k) is True for k in ('specApproved','qualityApproved','browserAuthorized')):raise PermissionError('CandidateReviewAndBrowserAuthorizationRequired')
 if not callable(new_tab):raise PermissionError('NativeNewTabHelperRequired')
 # Re-query chosen address and reserve explicit ports before any host publication.
 addresses=json.loads(subprocess.check_output(['powershell.exe','-NoProfile','-Command','Get-NetIPAddress -AddressFamily IPv4 | Select-Object -ExpandProperty IPAddress | ConvertTo-Json -Compress'],text=True))
 import ipaddress
 address=ipaddress.IPv4Address(lan)
 if isinstance(addresses,str):addresses=[addresses]
 if str(address)!=lan or lan not in addresses or not any(address in ipaddress.IPv4Network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')):raise PermissionError('ChosenPrivateLANAddressAbsent')
 import socket
 sockets=[]
 try:
  ports=tuple(int(x) for x in os.environ.get('LT_SOR_PORTS','18342,18343,18349').split(','))
  if len(ports)!=3 or len(set(ports))!=3 or any(p<1024 or p>65535 for p in ports):raise PermissionError('OwnedPortSelectionInvalid')
  for host,port in [('127.0.0.1',ports[0]),(lan,ports[1]),('127.0.0.1',ports[2])]:
   s=socket.socket();s.bind((host,port));sockets.append(s)
 finally:
  for s in sockets:s.close()
 binding=frozen_binding();out=output_root()/('live-v2-'+uuid.uuid4().hex[:12]);out.mkdir();(out/'binding.json').write_text(json.dumps(binding,indent=2));journal=controller.Journal(out/'rows.jsonl');runtime=PrivateRuntime(out,live=True,lan=lan)
 driver=LiveDriver(cdp,runtime,journal,new_tab=new_tab);ok=driver.run();after=frozen_binding();unchanged=binding==after
 required={r['id'] for r in inventory()};receipts=[json.loads(line) for line in journal.path.read_text().splitlines()];attempted={r['phase'] for r in receipts if r['type']=='phase-start' and r['phase'] in required};passed={r['stage'] for r in receipts if r['type']=='assertion' and r.get('ok') is True and r['stage'] in required}
 dispositions={}
 for row in inventory():
  a=next((r for r in receipts if r['type']=='assertion' and r['stage']==row['id']),None)
  dispositions[row['id']]=a.get('oracle',{}).get('disposition','PASS' if a.get('ok') else 'FAILED') if a else 'FAILED'
 counts={k:sum(v==k for v in dispositions.values()) for k in ('PASS','OBSERVED_BROWSER_BLOCK','FAILED','SKIPPED_CASCADE')}
 result={'browserExecuted':True,'ok':ok and unchanged and attempted==required and passed==required,'attemptedRows':len(attempted),'passedRows':counts['PASS'],'contractSatisfiedRows':len(passed),'counts':counts,'requiredRows':len(inventory()),'implementedRows':len(driver.handlers),'denialRows':sum(r['channel']!='control' for r in inventory()),'controls':sum(r['channel']=='control' for r in inventory()),'failures':journal.failures,'sourceAndKitUnchanged':unchanged,'directory':str(out)}
 (out/'execution.json').write_text(json.dumps(result,indent=2));return result

def offline_coverage():
 import ast,inspect
 rows=inventory();driver=LiveDriver(None,None,None);required={r['id'] for r in rows}
 if len(required)!=len(rows) or set(driver.handlers)!=required or not all(callable(v) for v in driver.handlers.values()):raise AssertionError('FiniteHandlerCoverage')
 # Inspect actual control branches, not a second hand-maintained list.
 tree=ast.parse(inspect.getsource(LiveDriver));stages=set()
 for n in ast.walk(tree):
  if isinstance(n,ast.Compare) and isinstance(n.left,ast.Name) and n.left.id=='stage':
   for x in n.comparators:
    if isinstance(x,ast.Constant) and isinstance(x.value,str):stages.add(x.value)
    if isinstance(x,(ast.Tuple,ast.List)):stages.update(v.value for v in x.elts if isinstance(v,ast.Constant) and isinstance(v.value,str))
 missing=[r['id'] for r in rows if r['channel']=='control' and r['stage'] not in stages and not r['stage'].startswith('job-control-')]
 if missing:raise AssertionError('ControlBranchCoverage')
 helper=pathlib.Path(os.environ['LT_SOR_HELPER']) if os.environ.get('LT_SOR_HELPER') else None
 if helper:
  definitions={n.name:[a.arg for a in n.args.args] for n in ast.parse(helper.read_text()).body if isinstance(n,ast.FunctionDef)}
  if definitions['cdp'][:2]!=['method','session_id'] or definitions['new_tab']!=['url']:raise AssertionError('NativeHelperSignatureChanged')
 protocol=[]
 class RuntimeProtocol:
  foreign='http://127.0.0.1:18349'
  def close(self):protocol.append('runtime-close');return {'strictPass':True}
 replies=[('Target.createTarget',{'targetId':'owned-target'}),('Target.attachToTarget',{'sessionId':'owned-session'}),('Page.navigate',{'frameId':'owned-frame'}),('Runtime.evaluate',{'result':{'value':{'origin':'http://127.0.0.1:18342','ready':'complete'}}}),('Runtime.evaluate',{'result':{'objectId':'owned-object'}}),('Runtime.callFunctionOn',{'result':{'value':{'cleared':True}}}),('Runtime.callFunctionOn',{'result':{'value':{'blobReleased':True}}}),('Runtime.releaseObject',{}),('Target.closeTarget',{'success':True}),('Target.getTargets',{'targetInfos':[]})]
 def scripted_cdp(method,**params):
  expected,result=replies.pop(0)
  if method!=expected:raise AssertionError('ProtocolMethodMismatch')
  if method.startswith(('Runtime.','Page.')) and params.get('session_id')!='owned-session':raise AssertionError('ProtocolSessionMissing')
  protocol.append(method);return result
 d=LiveDriver(scripted_cdp,RuntimeProtocol(),None,new_tab=lambda url:('owned-target' if url=='about:blank' else None));d.page('http://127.0.0.1:18342')
 if not d.invoke('inspect')['cleared'] or not d.cleanup()['strictPass'] or replies or protocol[-1]!='runtime-close':raise AssertionError('OwnedBrowserRuntimeCleanupProtocol')
 def broken_cdp(method,**params):
  if method=='Runtime.callFunctionOn':raise controller.DiagnosticError('SyntheticPrivateCdpFailure')
  return {'targetInfos':[]}
 broken=LiveDriver(broken_cdp,RuntimeProtocol(),None);broken.object='owned-object';broken.target='owned-target';broken.session='owned-session';clean=broken.cleanup()
 if clean['strictPass'] or protocol[-1]!='runtime-close':raise AssertionError('IndependentRuntimeCleanupLost')
 bad=LiveDriver(None,None,None);bad.handlers.pop(next(iter(bad.handlers)))
 try:bad.run()
 except PermissionError:pass
 else:raise AssertionError('IncompleteDispatchAllowed')
 try:run_live(None,{})
 except PermissionError:pass
 else:raise AssertionError('UnauthorizedBrowserDispatchAllowed')
 return {'requiredRows':len(rows),'implementedRowBindings':len(driver.handlers),'tableDispatchFunctions':len({h.__func__ for h in driver.handlers.values()}),'denialBindings':sum(r['channel']!='control' for r in rows),'controlBindings':sum(r['channel']=='control' for r in rows),'controlStages':len({r['stage'] for r in rows if r['channel']=='control'}),'unboundRows':missing,'completeMappingAccepted':True,'incompleteDispatchRefused':True,'unauthorizedLiveDispatchRefused':True,'actualHelperSha256':sha(helper.read_bytes()) if helper else None,'protocolEnvironment':'scripted CDP replies, not browser execution','ownedTargetSessionProtocol':True,'independentRuntimeCleanupOnCdpFailure':True,'browserExecuted':False}

if __name__=='__main__':
 # Deliberately NO CLI flag capable of launching a browser.
 coverage=offline_coverage()
 binding=frozen_binding();out=output_root()/('live-v2-offline-'+uuid.uuid4().hex[:12]);out.mkdir();name='lt-sor-live-v2-offline-'+uuid.uuid4().hex[:12]
 media=out/'media';media.mkdir();(media/'synthetic.txt').write_text('Owned synthetic fixture only\n')
 args=['docker','run','--rm','--init','--network','none','--log-driver','none','--name',name,'--mount',f'type=bind,source={ROOT},target=/kit,readonly','--mount',f'type=bind,source={media},target=/media,readonly','--mount',f'type=bind,source={out},target=/out','--mount',f'type=bind,source={MANIFEST},target=/manifest.json,readonly',IMAGE,'sh','-c','npm run build > /out/build.log 2>&1 && node /kit/live-offline-v2.mjs'+(' --wrong-mapping' if '--wrong-mapping' in sys.argv else '')]
 (out/'binding.json').write_text(json.dumps({**binding,'command':args,'browserExecuted':False},indent=2));p=subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);forced=False
 try:rc=p.wait(timeout=150)
 except subprocess.TimeoutExpired:
  forced=True;subprocess.run(['docker','stop','--time','2',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=12);p.wait(timeout=8);rc=p.returncode
 absent=subprocess.run(['docker','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=12).returncode!=0
 rows=[json.loads(line) for line in (out/'rows.jsonl').read_text().splitlines()] if (out/'rows.jsonl').exists() else []
 result={'browserExecuted':False,'coverage':coverage,'exit':rc,'containerAbsent':absent,'forced':forced,'rows':len(rows),'failures':[r for r in rows if r.get('ok') is False],'directory':str(out),'sourceAndKitUnchanged':binding==frozen_binding(),'requiredRows':len(inventory()),'implementedRows':len(LiveDriver(None,None,None).handlers),'summary':[r for r in rows if r.get('type')=='summary']}
 (out/'execution.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));raise SystemExit(0 if rc==0 and absent and not forced and result['sourceAndKitUnchanged'] and result['summary'] and not result['failures'] else 1)
