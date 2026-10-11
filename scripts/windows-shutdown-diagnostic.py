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
    return controller_injected(*root.controller_capabilities(case_id))


def controller_injected(driver, ownership, emit):
    return recovery_core().controller_core(driver, ownership, emit)


def execute(root, expected):
    raise RuntimeError(LIVE_EXECUTION_BLOCK)
    return execute_injected(*root.execution_capabilities(expected))


def execute_injected(driver, ledger, recoveries, emit):
    return recovery_core().execute_core(driver, ledger, recoveries, emit)


def recovery_core():
    # Path-bound import; there is deliberately no live/native capability adapter.
    import importlib.util
    path = Path(__file__).with_name('windows_shutdown_recovery.py')
    spec = importlib.util.spec_from_file_location('windows_shutdown_recovery', path)
    module = sys.modules.get(spec.name)
    if module is None:
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    return module


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['prepare','execute','controller'])
    parser.add_argument('root',type=Path)
    parser.add_argument('--manifest-sha')
    parser.add_argument('--case',type=int,choices=[1,2,3])
    args=parser.parse_args(argv)
    if args.mode=='execute': return execute(args.root,args.manifest_sha)
    if args.mode=='controller': return controller(args.root,args.case)
    if os.name != 'nt' or sys.flags.optimize:
        raise RuntimeError('prepare requires Windows and non-optimized checks')
    return prepare(args.root)


if __name__ == '__main__':
    raise SystemExit(main())
