"""Bounded synthetic shutdown diagnosis only. Never run/import the frozen harness.
prepare: copies and acknowledgement-only source proof, compile-only preflight.
execute/controller: disabled after the aborted batch; retained for source review.
"""
import argparse
import ctypes
from ctypes import wintypes as W
import difflib
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import traceback

ARCHIVES = Path('C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives')
CANDIDATE = ARCHIVES/'lt-a46-candidate-2026-10-10'/'candidate app żółć'
PACKET = ARCHIVES/'lt-a46-harness-binding-2026-10-10-v3'
ATTEMPT = ARCHIVES/'lt-a46-live-attempt-2026-10-10'
PW = Path('C:/Program Files/PowerShell/7/pwsh.exe')
NAMES = ['start-local.mjs', 'start-local-processes.mjs', 'start-local-windows-job.cs', 'start-local.test.mjs']
LIVE_EXECUTION_BLOCK = (
    'Diagnostic execution disabled: aborted batch; ownership coverage, controller '
    'timeout recovery, exception-safe cleanup and attempt accounting require '
    'separate review and authorization. Never reset the frozen packet.'
)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def inventory(paths):
    return [{'path':str(p.resolve()), 'size':p.stat().st_size, 'sha256':sha(p)} for p in sorted(set(paths), key=str)]


def verify(rows):
    for row in rows:
        p = Path(row['path'])
        assert p.stat().st_size == row['size'] and sha(p) == row['sha256'], str(p)


def environment(root, node):
    state = root/'synthetic state żółć'
    for name in ['home/AppData/Local', 'home/AppData/Roaming', 'temp', 'data', 'scratch', 'models']:
        (state/name).mkdir(parents=True, exist_ok=True)
    env = {k:os.environ[k] for k in ['SystemRoot', 'WINDIR', 'COMSPEC', 'ProgramFiles', 'ProgramW6432', 'PATHEXT'] if k in os.environ}
    env['PATH'] = str(node.parent)+';'+str(Path(env['SystemRoot'])/'System32')
    for key, name in {'HOME':'home','USERPROFILE':'home','APPDATA':'home/AppData/Roaming','LOCALAPPDATA':'home/AppData/Local','TEMP':'temp','TMP':'temp','TMPDIR':'temp','LINGOTORTE_DATA_DIR':'data','LINGOTORTE_SCRATCH_DIR':'scratch','LINGOTORTE_MODEL_CACHE_DIR':'models','HF_HOME':'models'}.items():
        env[key] = str(state/name)
    env.update(LINGOTORTE_ALLOW_ONLINE_PROVIDERS='false', LINGOTORTE_HOST='127.0.0.1', POWERSHELL_TELEMETRY_OPTOUT='1', POWERSHELL_UPDATECHECK='Off', HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', DOTNET_CLI_TELEMETRY_OPTOUT='1', DOTNET_NOLOGO='1', NODE_DISABLE_COMPILE_CACHE='1')
    assert not any('KEY' in k or 'TOKEN' in k or k == 'NODE_OPTIONS' for k in env)
    return env


def instrument(original, name):
    # Every inserted byte is retained in proof; inverse replacement is byte-exact.
    edits = []
    jsack = "console.error('[LTDIAG] '+JSON.stringify({boundary:'%s',pid:process.pid,mono:process.hrtime.bigint().toString()}));"
    csack = 'Console.Error.WriteLine("[LTDIAG] {0} pid=" + System.Environment.ProcessId + " mono=" + Stopwatch.GetTimestamp());'
    def add(anchor, inserted, after=False):
        nonlocal original
        assert original.count(anchor.encode()) == 1, (name, anchor)
        replacement = anchor+inserted if after else inserted+anchor
        original = original.replace(anchor.encode(), replacement.encode())
        edits.append({'anchor':anchor, 'inserted':inserted, 'after':after})
    if name == 'start-local-processes.mjs':
        add('  function stop(code = 0) {\n', '    '+jsack % 'stoprequest'+'\n', True)
        add('function onSignal() { ', jsack % 'SIGINTentry'+' ', True)
        add("  signals.on('SIGTERM', onSignal);\n", '  '+jsack % 'launcherregistered'+'\n', True)
        add('      child.stdin?.end();\n', '      '+jsack % 'helperEOFrequest'+'\n')
        add('      const closed = new Promise', "      console.error('[LTDIAG] '+JSON.stringify({boundary:'helperstarted',pid:process.pid,helperPid:child.pid,mono:process.hrtime.bigint().toString()}));\n")
        add('      try { await closed; } finally { clearTimeout(timer); }\n', '      '+jsack % 'helperexit'+'\n', True)
    elif name == 'start-local-windows-job.cs':
        add('                stop.Set();\n', '                '+csack.format('helperEOF')+'\n')
        add('            Check(TerminateJobObject(job, 1));\n', '            '+csack.format('jobterminate')+'\n', True)
        add('            return unchecked((int)exitCode);\n', '            '+csack.format('jobactivezero')+'\n')
        add('            if (process.Process != IntPtr.Zero) CloseHandle(process.Process);\n', '            '+csack.format('helperexit')+'\n', True)
    elif name == 'start-local.mjs':
        add('const require = createRequire(import.meta.url);\n', "process.on('exit', () => { "+jsack % 'launcherexit'+" });\n", True)
    return original, edits


def prepare(root):
    assert not root.exists(), 'choose a fresh external root; never reset existing receipts'
    # Read original closure before any modified copies are created.
    originals = {name:(CANDIDATE/'scripts'/name).read_bytes() for name in NAMES}
    source_manifest = load(CANDIDATE.parent/'source-manifest.json')
    rows = source_manifest['files']
    verify([{'path':str(CANDIDATE/r['path']), 'size':r['size'], 'sha256':r['sha256']} for r in rows])
    original_paths = [CANDIDATE/r['path'] for r in rows]
    original_paths += [p for p in PACKET.iterdir() if p.is_file()]
    original_paths += [p for p in ATTEMPT.rglob('*') if p.is_file()]
    original_paths += [CANDIDATE.parent/'source-manifest.json', PACKET/'binding.json']
    baseline = inventory(original_paths)
    node = Path(shutil.which('node')).resolve()
    root.mkdir(parents=True)
    save(root/'originals-pre.json', baseline)
    env = environment(root, node)
    save(root/'environment.json', env)
    package = root/'synthetic package żółć'
    for path in ['scripts', 'apps/local-service/src', 'node_modules/vite/bin']:
        (package/path).mkdir(parents=True)
    proof = []
    patches = []
    for name, raw in originals.items():
        modified, edits = instrument(raw, name)
        restored = modified
        for e in reversed(edits):
            replacement = e['anchor']+e['inserted'] if e['after'] else e['inserted']+e['anchor']
            assert restored.count(replacement.encode()) == 1
            restored = restored.replace(replacement.encode(), e['anchor'].encode())
        assert restored == raw
        (root/('original-'+name)).write_bytes(raw)
        (package/'scripts'/name).write_bytes(modified)
        proof.append({'name':name, 'original_sha256':hashlib.sha256(raw).hexdigest(), 'instrumented_sha256':hashlib.sha256(modified).hexdigest(), 'stripped_bytes_identical':True, 'edits':edits})
        patches.extend(difflib.unified_diff(raw.decode().splitlines(True), modified.decode().splitlines(True), fromfile='original/'+name, tofile='instrumented/'+name))
    save(root/'source-equivalence.json', proof)
    (root/'instrumentation.diff').write_text(''.join(patches), encoding='utf-8')
    save(package/'package.json', {'type':'module'})
    save(package/'node_modules/vite/package.json', {'name':'vite','type':'module','exports':{'./package.json':'./package.json'}})
    (package/'vite.config.ts').write_text('// inert diagnostic fixture\n', encoding='utf-8')
    child = "console.log('FIXTURE '+JSON.stringify({pid:process.pid,ownerPid:process.ppid})); setInterval(()=>{},1000);\n"
    (package/'apps/local-service/src/server.ts').write_text(child, encoding='utf-8')
    (package/'node_modules/vite/bin/vite.js').write_text(child, encoding='utf-8')
    # Identical additive control bridge in all cases; dormant outside case 2.
    (package/'control-bridge.mjs').write_text("import {existsSync,unlinkSync} from 'node:fs'; const timer=setInterval(()=>{if(existsSync(process.env.LTDIAG_STOP_FILE)){unlinkSync(process.env.LTDIAG_STOP_FILE);clearInterval(timer);process.emit('SIGINT');}},25);timer.unref();\n", encoding='utf-8')
    plan = {'max_cases':3, 'one_batch':True, 'cases':[{'id':1,'name':'native-unchanged-inheritance','reset_before_spawn':False,'delivery':'native CTRL_C_EVENT'}, {'id':2,'name':'direct-JS-signal-entry-control','reset_before_spawn':False,'delivery':'direct JS process.emit SIGINT via disposable file bridge; NOT native qualification'}, {'id':3,'name':'native-prespawn-reset-control','reset_before_spawn':True,'delivery':'native CTRL_C_EVENT; only variable relative to case1 is controller pre-spawn SetConsoleCtrlHandler(NULL,FALSE)'}], 'hypotheses':[{'rank':1,'claim':'Inherited ignoreCtrlC prevents launcher SIGINT entry','prediction':'case1 no entry, case2 entry/teardown, case3 native entry/teardown'}, {'rank':2,'claim':'console attachment/event targeting wrong','prediction':'case1 and3 no entry despite native API success; console membership missing/wrong'}, {'rank':3,'claim':'helper pipe/job teardown stalls after SIGINT','prediction':'entry/stoprequest observed but helperEOF/jobactivezero/exit missing in case2 and3'}, {'rank':4,'claim':'real app workload prerequisite differs from inert children','prediction':'all synthetic cases pass, leaving actual-app attribution unresolved'}], 'stop_window':'20 seconds polling + 1 second wait (unchanged)', 'readiness_window_seconds':35, 'children':2, 'listeners':0, 'scope':'synthetic only; no repair/combined qualification; no reset in Hermes parent or baseline'}
    save(root/'plan.json', plan)
    for p in [package/'scripts/start-local.mjs', package/'scripts/start-local-processes.mjs', package/'control-bridge.mjs']:
        cp = subprocess.run([str(node),'--check',str(p)],env=env,capture_output=True,text=True,timeout=30)
        assert cp.returncode == 0, cp.stderr
    command = "$ErrorActionPreference='Stop';$s=[IO.File]::ReadAllText($args[0]);Add-Type -TypeDefinition $s;'COMPILE_ONLY_OK';$PSVersionTable.PSVersion.ToString();[Environment]::Version.ToString()"
    compile_script = root/'compile-only.ps1'
    compile_script.write_text(command, encoding='utf-8')
    cp = subprocess.run([str(PW),'-NoLogo','-NoProfile','-NonInteractive','-File',str(compile_script),str(package/'scripts/start-local-windows-job.cs')],env=env,capture_output=True,text=True,timeout=60)
    save(root/'offline-preflight.json', {'compile_returncode':cp.returncode,'stdout':cp.stdout,'stderr':cp.stderr,'node_version':subprocess.check_output([str(node),'--version'],env=env,text=True).strip(), 'source_count':len(rows),'original_hash_count':len(baseline),'synthetic_launches':0})
    assert cp.returncode == 0 and 'COMPILE_ONLY_OK' in cp.stdout, cp.stderr
    shutil.copyfile(__file__, root/'controller.py')
    save(root/'runtime.json', inventory([node,Path(sys.executable),PW]))
    save(root/'config.json', {'node':str(node),'package':str(package),'python':sys.executable})
    frozen = inventory([p for p in root.rglob('*') if p.is_file()])
    save(root/'manifest.json', frozen)
    verify(baseline)
    print(json.dumps({'root':str(root),'manifest_sha256':sha(root/'manifest.json'),'offline_preflight':load(root/'offline-preflight.json')}))


class PE(ctypes.Structure):
    _fields_ = [('dwSize',W.DWORD),('cntUsage',W.DWORD),('th32ProcessID',W.DWORD),('th32DefaultHeapID',ctypes.c_size_t),('th32ModuleID',W.DWORD),('cntThreads',W.DWORD),('th32ParentProcessID',W.DWORD),('pcPriClassBase',W.LONG),('dwFlags',W.DWORD),('szExeFile',W.WCHAR*260)]


def native():
    k = ctypes.WinDLL('kernel32', use_last_error=True)
    specifications = {'OpenProcess':([W.DWORD,W.BOOL,W.DWORD],W.HANDLE),'CloseHandle':([W.HANDLE],W.BOOL),'GetExitCodeProcess':([W.HANDLE,ctypes.POINTER(W.DWORD)],W.BOOL),'TerminateProcess':([W.HANDLE,W.UINT],W.BOOL),'WaitForSingleObject':([W.HANDLE,W.DWORD],W.DWORD),'CreateToolhelp32Snapshot':([W.DWORD,W.DWORD],W.HANDLE),'Process32FirstW':([W.HANDLE,ctypes.POINTER(PE)],W.BOOL),'Process32NextW':([W.HANDLE,ctypes.POINTER(PE)],W.BOOL),'FreeConsole':([],W.BOOL),'AttachConsole':([W.DWORD],W.BOOL),'SetConsoleCtrlHandler':([ctypes.c_void_p,W.BOOL],W.BOOL),'GenerateConsoleCtrlEvent':([W.DWORD,W.DWORD],W.BOOL),'GetConsoleProcessList':([ctypes.POINTER(W.DWORD),W.DWORD],W.DWORD),'GetConsoleWindow':([],W.HWND)}
    for name,(args,result) in specifications.items():
        fn = getattr(k,name); fn.argtypes=args; fn.restype=result
    return k


def process_list(k):
    snap=k.CreateToolhelp32Snapshot(2,0)
    assert snap not in (0,ctypes.c_void_p(-1).value)
    entry=PE(); entry.dwSize=ctypes.sizeof(entry); out=[]
    try:
        ok=k.Process32FirstW(snap,ctypes.byref(entry))
        while ok:
            out.append({'pid':entry.th32ProcessID,'ppid':entry.th32ParentProcessID,'exe':entry.szExeFile})
            ok=k.Process32NextW(snap,ctypes.byref(entry))
        return out
    finally: k.CloseHandle(snap)


def active(k,h):
    code=W.DWORD()
    if not k.GetExitCodeProcess(h,ctypes.byref(code)):
        raise RuntimeError(('held process query failed',ctypes.get_last_error()))
    return code.value == 259


def controller(root, case_id):
    raise RuntimeError(LIVE_EXECUTION_BLOCK)
    assert not sys.flags.optimize
    cfg=load(root/'config.json'); plan=load(root/'plan.json'); case=plan['cases'][case_id-1]
    verify(load(root/'manifest.json')); verify(load(root/'originals-pre.json'))
    marker=root/f'case-{case_id}-started.json'
    with marker.open('x',encoding='utf-8') as f: json.dump({'id':case_id,'pid':os.getpid(),'monotonic_ns':time.monotonic_ns(),'manifest_sha256':sha(root/'manifest.json'),'plan_sha256':sha(root/'plan.json')},f)
    k=native(); handles={}; meta={}; p=None
    record={'case':case,'events':[],'ports':[],'no_listener_fixture':True}
    log_path=root/f'case-{case_id}.log'
    def event(boundary,**extra):
        record['events'].append({'boundary':boundary,'monotonic_ns':time.monotonic_ns(),**extra})
        save(root/f'case-{case_id}-result.json',record)
    def track():
        entries=process_list(k); owned=set(handles)|({p.pid} if p else set())
        for _ in range(10):
            more={r['pid'] for r in entries if r['ppid'] in owned}
            if more<=owned: break
            owned|=more
        for r in entries:
            pid=r['pid']
            if pid in owned and pid not in handles:
                h=k.OpenProcess(0x1001,False,pid)
                if h: handles[pid]=h; meta[pid]=r
        record['owned']=list(meta.values())
    def owned_listeners():
        raw=subprocess.check_output([str(Path(os.environ['SystemRoot'])/'System32/netstat.exe'),'-ano','-p','TCP'],text=True,timeout=15)
        return [{'address':parts[1],'pid':int(parts[4])} for line in raw.splitlines() if len(parts:=line.split())==5 and parts[0]=='TCP' and parts[3]=='LISTENING' and int(parts[4]) in handles]
    log=log_path.open('w',encoding='utf-8')
    try:
        if case['reset_before_spawn']:
            assert k.SetConsoleCtrlHandler(None,False),ctypes.get_last_error()
            event('controller-prespawn-reset')
        startup=subprocess.STARTUPINFO(); startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW; startup.wShowWindow=0
        package=Path(cfg['package']); env=load(root/'environment.json')
        stop_file=root/f'case-{case_id}-stop.request'
        env['LTDIAG_STOP_FILE']=str(stop_file)
        p=subprocess.Popen([cfg['node'],'--import',(package/'control-bridge.mjs').as_uri(),str(package/'scripts/start-local.mjs')],cwd=package,env=env,stdout=log,stderr=subprocess.STDOUT,startupinfo=startup,creationflags=subprocess.CREATE_NEW_CONSOLE)
        event('spawn',launcher_pid=p.pid,creationflags=subprocess.CREATE_NEW_CONSOLE,show_window=0,stdio='stdout file, stderr STDOUT, stdin inherited; helper bootstrap/stdio unchanged')
        deadline=time.monotonic()+35
        while time.monotonic()<deadline:
            track()
            text=log_path.read_text(encoding='utf-8')
            fixtures=[json.loads(line[8:]) for line in text.splitlines() if line.startswith('FIXTURE ')]
            if len(fixtures)==2 and 'launcherregistered' in text: break
            assert p.poll() is None, 'launcher exited before synthetic readiness'
            time.sleep(.05)
        else: raise AssertionError('synthetic readiness timeout')
        assert len(fixtures)==2
        for r in fixtures:
            assert r['pid'] in handles and r['ownerPid'] in handles
        event('ready',fixtures=fixtures)
        if case_id == 2:
            stop_file.write_text('SIGINT',encoding='utf-8')
            event('direct-JS-SIGINT-request')
        else:
            track(); k.FreeConsole(); assert k.AttachConsole(p.pid),ctypes.get_last_error()
            try:
                array=(W.DWORD*128)(); count=k.GetConsoleProcessList(array,128)
                assert 0<count<=128 and p.pid in list(array)[:count]
                # Console membership metadata only; never take ownership from membership.
                window=k.GetConsoleWindow()
                user=ctypes.WinDLL('user32',use_last_error=True)
                user.GetWindowThreadProcessId.argtypes=[W.HWND,ctypes.POINTER(W.DWORD)]; user.GetWindowThreadProcessId.restype=W.DWORD
                window_pid=W.DWORD()
                if window: user.GetWindowThreadProcessId(window,ctypes.byref(window_pid))
                conhost=next((r for r in process_list(k) if r['pid']==window_pid.value and r['exe'].lower()=='conhost.exe'),None)
                if conhost and conhost['pid'] not in handles:
                    h=k.OpenProcess(0x1001,False,conhost['pid'])
                    assert h,ctypes.get_last_error()
                    handles[conhost['pid']]=h; meta[conhost['pid']]={**conhost,'ownership':'GetConsoleWindow of exclusively owned attached console'}
                event('console-attached',console_window=int(window or 0),console_window_pid=window_pid.value,console_members=list(array)[:count],controller_pid=os.getpid(),held_conhost=conhost)
                assert k.SetConsoleCtrlHandler(None,True),ctypes.get_last_error()
                assert k.GenerateConsoleCtrlEvent(0,0),ctypes.get_last_error()
                event('native-event-generated',event=0,process_group=0)
                time.sleep(.15)
            finally: k.FreeConsole()
        deadline=time.monotonic()+20
        while p.poll() is None and time.monotonic()<deadline:
            track(); time.sleep(.05)
        code=p.wait(timeout=1)
        record['launcher_exit']=code
        record['lifecycle_pid_readback']=[{'pid':pid,'alive':active(k,h)} for pid,h in handles.items()]
        assert code==0 and all(not r['alive'] for r in record['lifecycle_pid_readback']), 'exit or owned cleanup failure'
        record['lifecycle']='PASS synthetic only'
        event('lifecycle-result')
    except BaseException as error:
        record['lifecycle']='FAIL'; record['error']=repr(error); record['traceback']=traceback.format_exc()
        record['failure_pid_readback']=[{'pid':pid,'alive':active(k,h)} for pid,h in handles.items()]
        event('failure-before-recovery')
    finally:
        track()
        record['recovery_targets']=[]
        for pid,h in list(handles.items()):
            if active(k,h):
                record['recovery_targets'].append(pid)
                assert k.TerminateProcess(h,99),ctypes.get_last_error()
        if p:
            try: p.wait(timeout=10)
            except subprocess.TimeoutExpired: record['recovery_wait_timeout']=True
        deadline=time.monotonic()+10
        while any(active(k,h) for h in handles.values()) and time.monotonic()<deadline: time.sleep(.05)
        record['final_held_readback']=[{'pid':pid,'alive':active(k,h)} for pid,h in handles.items()]
        record['final_owned_listeners']=owned_listeners()
        record['cleanup_safe']=all(not r['alive'] for r in record['final_held_readback']) and not record['final_owned_listeners']
        # Independently re-open identities; a newly reused PID is not killed.
        record['independent_readback']=[]
        for pid in handles:
            h=k.OpenProcess(0x1000,False,pid)
            if h:
                code=W.DWORD(); assert k.GetExitCodeProcess(h,ctypes.byref(code)); k.CloseHandle(h)
                record['independent_readback'].append({'pid':pid,'exit_code':code.value})
            else: record['independent_readback'].append({'pid':pid,'open_error':ctypes.get_last_error()})
        for h in handles.values(): k.CloseHandle(h)
        log.close()
        record['log_sha256']=sha(log_path)
        verify(load(root/'originals-pre.json'))
        save(root/f'case-{case_id}-result.json',record)
    return 0 if record['cleanup_safe'] else 2


def execute(root, expected):
    raise RuntimeError(LIVE_EXECUTION_BLOCK)
    assert sha(root/'manifest.json') == expected
    verify(load(root/'manifest.json')); verify(load(root/'originals-pre.json'))
    with (root/'execution-started.json').open('x',encoding='utf-8') as f:
        json.dump({'maximum_cases':3,'manifest_sha256':expected,'plan_sha256':sha(root/'plan.json'),'pid':os.getpid()},f)
    cfg=load(root/'config.json'); results=[]
    for case_id in range(1,4):
        with (root/'case-budget.jsonl').open('a',encoding='utf-8') as f: f.write(json.dumps({'case':case_id,'maximum':3,'monotonic_ns':time.monotonic_ns()})+'\n')
        cp=subprocess.run([cfg['python'],str(root/'controller.py'),'controller',str(root),'--case',str(case_id)],env=load(root/'environment.json'),capture_output=True,text=True,timeout=100)
        save(root/f'case-{case_id}-controller-output.json',{'returncode':cp.returncode,'stdout':cp.stdout,'stderr':cp.stderr})
        receipt=root/f'case-{case_id}-result.json'
        if receipt.exists(): results.append(load(receipt))
        if cp.returncode != 0 or not receipt.exists() or not results[-1].get('cleanup_safe'):
            break
    verify(load(root/'originals-pre.json')); verify(load(root/'manifest.json'))
    save(root/'originals-post.json',inventory([Path(r['path']) for r in load(root/'originals-pre.json')]))
    save(root/'batch-result.json',{'executed_cases':len(results),'maximum_cases':3,'cases':[{'id':r['case']['id'],'lifecycle':r.get('lifecycle','HARNESS FAIL before completed result'),'cleanup_safe':r.get('cleanup_safe',False)} for r in results], 'stopped_before_repair':True,'originals_unchanged':True})
    save(root/'receipts-manifest.json',inventory([p for p in root.iterdir() if p.is_file() and p.name not in ['receipts-manifest.json']]))
    print(json.dumps({'batch':load(root/'batch-result.json'),'receipts_manifest':str(root/'receipts-manifest.json'),'receipts_manifest_sha256':sha(root/'receipts-manifest.json')},indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['prepare','execute','controller'])
    parser.add_argument('root',type=Path)
    parser.add_argument('--manifest-sha')
    parser.add_argument('--case',type=int,choices=[1,2,3])
    args=parser.parse_args()
    assert os.name=='nt' and not sys.flags.optimize
    if args.mode=='prepare': prepare(args.root)
    elif args.mode=='execute': execute(args.root,args.manifest_sha)
    else: raise SystemExit(controller(args.root,args.case))
