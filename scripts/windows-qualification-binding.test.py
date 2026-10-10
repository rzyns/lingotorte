"""Offline only. Pass the immutable packet root; never calls Run or live main."""
import ast
import base64
import ctypes
import importlib.util
import json
from pathlib import Path
import socket
import os
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch
from urllib.parse import quote

PACKET = Path(sys.argv.pop(1)).resolve() if len(sys.argv)>1 else None


def import_path(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def canned(binding):
    root=Path(binding['snapshotRoot']); base='/@fs/'+quote(root.as_posix(),safe='/@:'); rows={}
    def put(path,value,mime='text/javascript'):
        if isinstance(value,str): value=value.encode('utf-8')
        rows[path]={'base64':base64.b64encode(value).decode(),'contentType':mime,'status':200}
    put('/','<title>Lingotorte Local Study</title><script src="/src/main.ts"></script>','text/html')
    put('/@vite/client','export const message="Internal Server Error";')
    put('/%40vite/client','<title>fallback</title>','text/html')
    put('/src/main.ts','import "./app.ts"; import "./model.ts";')
    put('/src/app.ts','import(variable);')
    package=base+'/packages/domain/index.ts';put(package,'export const makeMediaAsset=1;')
    fixtures=['fixtures/media/synthetic-polish-dialogue.webm','fixtures/subtitles/synthetic-polish-dialogue.target.srt','fixtures/subtitles/synthetic-polish-dialogue.native.srt']
    put('/src/model.ts','import {makeMediaAsset} from '+json.dumps(package)+';'+''.join('import x from '+json.dumps(base+'/'+p+('?import' if p.endswith('.webm') else '?raw'))+';' for p in fixtures))
    for p in fixtures:
        data=(root/p).read_bytes();put(base+'/'+p,data,'video/webm' if p.endswith('.webm') else 'text/plain')
        put(base+'/'+p+('?import' if p.endswith('.webm') else '?raw'),'export default '+json.dumps('/synthetic.webm' if p.endswith('.webm') else data.decode('utf-8')))
    return rows


class BindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert PACKET and (PACKET/'manifest.json').is_file(), 'packet required'
        cls.module=import_path('successor',PACKET/'successor.py')

    def test_import_and_absent_or_bad_gate_have_zero_side_effects(self):
        with patch.object(subprocess,'check_output',side_effect=AssertionError('subprocess forbidden')), patch.object(subprocess,'Popen',side_effect=AssertionError('Popen forbidden')), patch.object(ctypes,'WinDLL',side_effect=AssertionError('native forbidden')), patch.object(socket,'socket',side_effect=AssertionError('socket forbidden')), patch.object(Path,'mkdir',side_effect=AssertionError('mkdir forbidden')):
            module=import_path('guarded_successor',PACKET/'successor.py')
            with self.assertRaisesRegex(AssertionError,'BLOCKED'): module.main()
            with self.assertRaisesRegex(AssertionError,'packet hash mismatch'): module.main('not-a-disposition', '0'*64)
            self.assertFalse(hasattr(module,'K')); self.assertFalse(hasattr(module,'NODE'))
        self.assertFalse((PACKET/'execution-started.json').exists());self.assertFalse((PACKET/'sole-launch.lock').exists())

    def test_optimized_python_import_is_blocked_before_native_or_application_work(self):
        env=self.module.support.validate_environment(self.module.support.load(PACKET/'environment.json'),PACKET,Path(self.module.ROOT))
        result=subprocess.run([sys.executable,'-B','-O','-c','import runpy,sys;runpy.run_path(sys.argv[1],run_name="offline_import")',str(PACKET/'successor.py')],env=env,text=True,encoding='utf-8',capture_output=True,timeout=10)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('optimized Python disables qualification assertions; blocked',result.stderr)
        self.assertFalse((PACKET/'execution-started.json').exists())

    def test_full_frozen_source_and_lifecycle_equivalence(self):
        builder=import_path('builder',PACKET/'windows-qualification-builder.py')
        original=(PACKET/'frozen-probe.py').read_bytes()
        self.assertEqual(builder.digest(PACKET/'frozen-probe.py'),builder.FROZEN_SHA)
        generated,proof=builder.successor(original.decode('utf-8'),Path(self.module.ROOT))
        self.assertEqual(generated,(PACKET/'successor.py').read_bytes().decode('utf-8'))
        self.assertTrue(proof['application_orchestration_ast_equal'])
        self.assertIn('Run',proof['preserved_definitions_source_and_ast'])
        self.assertIn('get',proof['preserved_definitions_source_and_ast'])
        # Compile AST only, not execution of the native owner.
        compile(ast.parse(generated),'<successor>','exec')

    def test_packet_pre_and_post_dependency_and_harness_hashes(self):
        before=self.module.support.verify_packet(PACKET,self.module.support.digest(PACKET/'manifest.json'))
        self.assertEqual(before['files'][:3],[378,16886,22])
        after=self.module.support.verify_packet(PACKET,self.module.support.digest(PACKET/'manifest.json'))
        self.assertEqual(before,after)

    def test_environment_fail_closed_and_no_global_mutation(self):
        support=self.module.support;env=support.load(PACKET/'environment.json')
        support.validate_environment(env,PACKET,Path(self.module.ROOT))
        for mutated in [dict(env,SECRET_KEY='synthetic'),dict(env,LINGOTORTE_ALLOW_ONLINE_PROVIDERS='true'),dict(env,TEMP=str(self.module.ROOT)),dict(env,LINGOTORTE_DB_PATH=env['LINGOTORTE_SCRATCH_DIR'])]:
            with self.assertRaises(AssertionError): support.validate_environment(mutated,PACKET,Path(self.module.ROOT))

    def test_native_console_owner_compiles_only_under_bound_environment(self):
        original=self.module.support.load(PACKET/'environment.json')
        with tempfile.TemporaryDirectory(dir=os.environ['TMPDIR'],prefix='lt-harness żółć ') as scratch:
            env=dict(original)
            for key in self.module.support.ROOT_KEYS:
                env[key]=str(Path(scratch)/Path(original[key]).relative_to(PACKET))
            for key in self.module.support.ROOT_KEYS-self.module.support.FILE_KEYS: Path(env[key]).mkdir(parents=True,exist_ok=True)
            for key in ('GIT_CONFIG_GLOBAL','GIT_CONFIG_SYSTEM'): Path(env[key]).write_bytes(b'')
            self.module.support.validate_environment(env,Path(scratch),Path(self.module.ROOT))
            raw=subprocess.check_output([self.module.PW,'-NoLogo','-NoProfile','-NonInteractive','-File',str(PACKET/'windows-qualification-compile-only.ps1'),'-Helper',str(self.module.ROOT/'scripts/start-local-windows-job.cs')],env=env,text=True,encoding='utf-8',timeout=60)
        receipt=json.loads(raw);self.assertTrue(receipt['compiled']);self.assertFalse(receipt['runInvoked'])
        print('compile-only receipt:',json.dumps(receipt))
        self.assertFalse((PACKET/'execution-started.json').exists())

    def test_python_node_actual_parser_fixture_transport_bridge(self):
        binding=self.module.support.load(PACKET/'binding.json')
        rows=canned(binding)
        receipt=self.module.offline_graph(rows)
        self.assertEqual(receipt['schema'],1);self.assertEqual(receipt['mode'],'offline')
        graph=receipt['graph'];self.assertEqual(len(graph['fixture_checks']),3);self.assertFalse(graph['browser_execution'])
        self.assertIn('/@vite/client',graph['resources']);self.assertNotIn('/%40vite/client',graph['resources'])
        self.assertEqual(graph['resources']['/src/app.ts']['dynamic_nonliteral_imports'],1)
        # Observed RED historical counterpart routes the literal request to HTML.
        rows['/@vite/client']=rows['/%40vite/client']
        with self.assertRaises(subprocess.CalledProcessError): self.module.offline_graph(rows)
        self.assertFalse((PACKET/'execution-started.json').exists())

if __name__=='__main__': unittest.main(verbosity=2)
