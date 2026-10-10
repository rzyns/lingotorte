"""Build an immutable offline successor packet. Never imports the frozen probe."""
import argparse
import ast
import difflib
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

FROZEN_SHA = '486739795a4a61575e7ac8856fd2fc554760e18405c7f333b985aa76f4c13f07'
MANIFESTS = {'source-manifest.json': '9cb1e87f020fbfeba6147605bf478253dcc8c3532b2fbfb07ae47788069f2c83', 'dependency-manifest.json': '5662edf1679205d42d9b6674a15d08f01214adbbc2d0ea546e4dd5cfcf2056fe', 'receipt-manifest.json': '7b2d33a0bdb760c4c05ac43bfd44018c072ebb19b6344a0f790dc89074448eaa'}

def digest(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def write_json(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def segment(text, node):
    return ''.join(text.splitlines(keepends=True)[node.lineno-1:node.end_lineno])

GRAPH = '''def offline_graph(rows):
    binding = support.load(HERE/'binding.json')
    explicit_env = support.validate_environment(support.load(HERE/'environment.json'), HERE, ROOT)
    raw = subprocess.check_output([binding['node']['node'], str(HERE/'windows-qualification-bridge.mjs'), 'offline', str(HERE/'binding.json'), support.digest(HERE/'binding.json')], input=json.dumps(rows), text=True, encoding='utf-8', env=explicit_env, cwd=ROOT, timeout=65)
    receipt = json.loads(raw)
    assert receipt['schema'] == 1 and receipt['mode'] == 'offline'
    return receipt

def verify_graph():
    raw = subprocess.check_output([NODE, str(HERE/'windows-qualification-bridge.mjs'), 'live', str(HERE/'binding.json'), support.digest(HERE/'binding.json'), str(DISPOSITION)], text=True, encoding='utf-8', env=env, cwd=ROOT, timeout=65)
    receipt = json.loads(raw)
    assert receipt['schema'] == 1 and receipt['mode'] == 'live'
    graph = receipt['graph']; assert graph['browser_execution'] is False
    (HERE/(RESULT['scenarios'][-1]['name']+'-resources.json')).write_text(json.dumps(graph,indent=2,ensure_ascii=False),encoding='utf-8')
    return graph
'''
VERIFY = '''def verify_frozen():
    return support.verify_packet(HERE, EXPECTED_MANIFEST_SHA)
'''
SETUP = '''def setup():
    global lock_owned
    LOCK.mkdir(); lock_owned=True
    RESULT['preflight_listeners']=listeners(); assert RESULT['preflight_listeners']==[],RESULT['preflight_listeners']
    RESULT['source_prehash']=verify_frozen()
    assert not (HERE/'execution-started.json').exists(),'one end-to-end execution only'
    env = support.validate_environment(support.load(HERE/'environment.json'), HERE, ROOT)
    assert os.environ['SystemRoot'] == env['SystemRoot'], 'native inventory SystemRoot mismatch'
    RESULT['static_preflight']={'binding':support.digest(HERE/'binding.json'),'historical_preflight_is_execution_authority':False}
    RESULT['explicit_environment']={k:v for k,v in env.items() if k.startswith(('LINGOTORTE_','POWERSHELL_','DOTNET_')) or k in ('TEMP','TMP','TMPDIR','USERPROFILE','HOME','LOCALAPPDATA','APPDATA')}
    for row in support.load(HERE/'binding.json')['mappings']:
        assert Path(row['candidate']).resolve()==Path(row['real']).resolve(),row
        if row['kind']=='candidate source alias': assert Path(row['candidate']).resolve().is_relative_to(ROOT.resolve()),row
    for cache in ('node_modules/.vite','node_modules/.vite-temp'):
        assert (ROOT/cache).resolve().is_relative_to(ROOT.resolve()),cache
    (HERE/'execution-started.json').write_text(json.dumps({'pid':os.getpid(),'probe_sha256':RESULT['source_prehash']['probe_sha256']}),encoding='utf-8')
    return env
'''

def successor(text, candidate):
    tree = ast.parse(text)
    functions = {n.name:n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
    lines = text.splitlines(keepends=True)
    # Exact archived line ranges verified by AST and frozen hash: native setup and
    # subprocess metadata move behind the gate; PE remains an inert definition.
    prefix = ''.join(lines[:16])
    prefix += "import importlib.util\nimport sys\n_spec = importlib.util.spec_from_file_location('qualification_support', HERE/'windows-qualification-support.py')\nsupport = importlib.util.module_from_spec(_spec)\n_spec.loader.exec_module(support)\n"
    prefix += f'SOURCE = Path({str(candidate)!r})\nPRIMARY = SOURCE\nROOT = SOURCE\nSTATE = HERE / "synthetic state żółć"\nLOCK = HERE / "sole-launch.lock"\n'
    prefix += ''.join(lines[22:23]) + segment(text, functions['PE'])
    prefix += ''.join(lines[33:35])
    for node in tree.body:
        if isinstance(node,(ast.FunctionDef,ast.ClassDef)) and node.name != 'PE':
            prefix += '\n' + {'verify_graph':GRAPH,'verify_frozen':VERIFY,'setup':SETUP}.get(node.name,segment(text,node)) + '\n'
    runtime = "NODE = support.load(HERE/'binding.json')['node']['node']\n" + ''.join(lines[23:28] + lines[30:33])
    tail = ''.join(lines[242:])
    main = 'def main(disposition_path=None, expected_manifest_sha=None):\n    global NODE, K, env, lock_owned, DISPOSITION, EXPECTED_MANIFEST_SHA\n    support.require_disposition(HERE, disposition_path, expected_manifest_sha)\n    DISPOSITION = Path(disposition_path)\n    EXPECTED_MANIFEST_SHA = expected_manifest_sha\n    support.verify_packet(HERE, EXPECTED_MANIFEST_SHA)\n'
    main += ''.join('    '+line if line.strip() else line for line in (runtime+tail).splitlines(keepends=True))
    result = prefix + '\n' + main + "\nif __name__ == '__main__':\n    main(*(sys.argv[1:]))\n"
    after = ast.parse(result)
    after_functions = {n.name:n for n in after.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
    preserved = []
    for name,node in functions.items():
        if name not in ('verify_graph','verify_frozen','setup'):
            assert segment(text,node) == segment(result,after_functions[name]), name
            assert ast.dump(node,include_attributes=False) == ast.dump(after_functions[name],include_attributes=False), name
            preserved.append(name)
    main_node = after_functions['main']
    old_tail = ast.parse(tail).body
    assert [ast.dump(n,include_attributes=False) for n in main_node.body[-len(old_tail):]] == [ast.dump(n,include_attributes=False) for n in old_tail], 'application orchestration drift'
    native_before = [n for n in tree.body if 24 <= n.lineno <= 28 or 31 <= n.lineno <= 33]
    native_after = [n for n in main_node.body if isinstance(n, (ast.Assign, ast.Expr)) and ('K' in ast.dump(n) or 'ctypes.WinDLL' in ast.unparse(n))]
    assert [ast.dump(n,include_attributes=False) for n in native_before] == [ast.dump(n,include_attributes=False) for n in native_after], 'native setup drift'
    assert all(segment(text,a) == '\n'.join(line[4:] if line.startswith('    ') else line for line in segment(result,b).split('\n')) for a,b in zip(native_before,native_after)), 'native setup source drift'
    compile(result, '<successor>', 'exec')
    return result, {'preserved_definitions_source_and_ast':preserved,'application_orchestration_ast_equal':True,'native_setup_source_relocated_unchanged':True,'approved_replacements':['HERE/SOURCE/PRIMARY/ROOT/STATE/LOCK identities','verify_graph','verify_frozen','setup','gated main and metadata/native initialization relocation','NODE bound executable identity','offline_graph diagnostic helper'],'frozen_sha256':FROZEN_SHA}

def build(archive, candidate_packet, destination):
    archive, candidate_packet, destination = map(Path,(archive,candidate_packet,destination))
    assert not destination.exists(), 'versioned destination already exists'
    frozen = archive/'scratch-evidence/lt-windows-complete-snapshot-one-shot/probe.py'
    assert digest(archive/'manifest.json') == '954239187d791250516d9533536871225eca257656dfbbf00565dc2dd2b95c72'
    assert digest(frozen) == FROZEN_SHA
    for name,sha in MANIFESTS.items(): assert digest(candidate_packet/name) == sha, name
    candidate = candidate_packet/'candidate app żółć'
    raw = frozen.read_bytes(); text = raw.decode('utf-8')
    generated, equivalence = successor(text,candidate)
    destination.mkdir(parents=True)
    scripts = Path(__file__).resolve().parent
    names = ['windows-qualification-resources.mjs','windows-qualification-resources.test.mjs','windows-qualification-transport.mjs','windows-qualification-bridge.mjs','windows-qualification-support.py','windows-qualification-builder.py','windows-qualification-binding.test.mjs','windows-qualification-binding.test.py','windows-qualification-compile-only.ps1']
    for name in names: shutil.copyfile(scripts/name,destination/name)
    (destination/'frozen-probe.py').write_bytes(raw)
    (destination/'successor.py').write_text(generated,encoding='utf-8',newline='\n')
    (destination/'source-diff.patch').write_text(''.join(difflib.unified_diff(text.splitlines(keepends=True),generated.splitlines(keepends=True),fromfile='frozen-probe.py',tofile='successor.py')),encoding='utf-8')
    write_json(destination/'source-equivalence.json',equivalence)
    env_document=json.loads((candidate_packet/'environment.json').read_text(encoding='utf-8'))
    assert env_document['credentials_present'] in (False, [])
    env = env_document['allowlisted']
    spec=importlib.util.spec_from_file_location('support',scripts/'windows-qualification-support.py'); support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
    assert set(env) <= support.ALLOWED
    for key in support.ROOT_KEYS:
        value=Path(env[key]); assert value.is_relative_to(candidate_packet), key
        if key in ('GIT_CONFIG_GLOBAL','GIT_CONFIG_SYSTEM'):
            assert value.read_bytes() == b'', 'original isolated Git config not empty'
            env[key]=str(destination/'isolated-git-config')
            (destination/'isolated-git-config').write_bytes(b'')
        else:
            env[key]=str(destination/value.relative_to(candidate_packet))
    support.validate_environment(env,destination,candidate)
    write_json(destination/'environment.json',env)
    for key in support.ROOT_KEYS-support.FILE_KEYS: Path(env[key]).mkdir(parents=True,exist_ok=True)
    # Metadata/resolution only, not application import; parser is initialized only by bridge tests.
    metadata=json.loads(subprocess.check_output(['node','-e',"const fs=require('fs');const {createRequire}=require('module');const req=createRequire(process.argv[1]+'/package.json');const entry=req.resolve('es-module-lexer');console.log(JSON.stringify({node:process.execPath,version:process.version,entry,real:fs.realpathSync(entry)}))",str(candidate)],text=True,env=env,cwd=candidate))
    mappings=json.loads((candidate_packet/'dependency-manifest.json').read_text(encoding='utf-8'))['mapping']
    harness_rows=[{'path':p.name,'size':p.stat().st_size,'sha256':digest(p)} for p in sorted(destination.iterdir()) if p.is_file()]
    write_json(destination/'harness-inputs.json',{'files':harness_rows})
    groups=[{'root':str(candidate if name=='source-manifest.json' else candidate/'node_modules' if name=='dependency-manifest.json' else candidate_packet),'manifest':str(candidate_packet/name),'sha256':sha} for name,sha in MANIFESTS.items()]
    groups.append({'root':str(destination),'manifest':str(destination/'harness-inputs.json'),'sha256':digest(destination/'harness-inputs.json')})
    binding={'schema':1,'snapshotRoot':candidate.as_posix(),'groups':groups,'mappings':mappings,'parser':{'entry':metadata['entry'],'real':metadata['real'],'sha256':digest(metadata['entry'])},'node':metadata,'live_authorized':False}
    binding['runtime_files'] = [{'path':p,'sha256':digest(p)} for p in (metadata['node'],sys.executable,'C:/Program Files/PowerShell/7/pwsh.exe')]
    binding['python_version'] = sys.version
    write_json(destination/'binding.json',binding)
    rows=[{'path':p.name,'size':p.stat().st_size,'sha256':digest(p)} for p in sorted(destination.iterdir()) if p.is_file()]
    write_json(destination/'manifest.json',{'schema':1,'scope':'offline binding only; no live disposition issued','files':rows})
    receipt=support.verify_packet(destination,digest(destination/'manifest.json'))
    return {'packet':str(destination),'manifest_sha256':digest(destination/'manifest.json'),'payloads':len(rows),'verified':receipt}

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archive');parser.add_argument('candidate_packet');parser.add_argument('destination')
    args=parser.parse_args();print(json.dumps(build(args.archive,args.candidate_packet,args.destination),ensure_ascii=True,indent=2))
