"""Offline ctypes ABI callbacks only: never load a DLL or create a process."""
import ctypes as C
import importlib.util
import hashlib
import tempfile
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
if '--native-baseline' in sys.argv:
    _index = sys.argv.index('--native-baseline')
    ROOT = Path(sys.argv[_index + 1]).resolve()
    del sys.argv[_index:_index + 2]

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

core = load('windows_shutdown_recovery')
with patch.object(C, 'WinDLL', side_effect=AssertionError('DLL forbidden'), create=True):
    n = load('windows_shutdown_native')

class ABI:
    def __init__(self):
        self.job = 0x100000011
        self.process = 0x100000012
        self.thread = 0x100000013
        self.next = 0x100000020
        self.error = 5
        self.calls = []
        self.callback_errors = []
        self.fail = set()
        self.flags = n.KILL_ON_CLOSE
        self.records = {self.process: (101, 12345), 0x100000030: (102, 12346)}
        self.members = set()
        self.live = set()
        self.pids_override = None
        self.count_override = None
        self.resume = 1
        self.attributes = {}
        self.clock = 0.0
        table = types.SimpleNamespace()
        for name, (args, result) in n.SIGNATURES.items():
            def call(*values, name=name):
                self.calls.append((name, values))
                try:
                    if name in self.fail:
                        return 0xffffffff if name in ('WaitForSingleObject', 'ResumeThread') else 0
                    return self.invoke(name, values)
                except BaseException as error:
                    self.callback_errors.append((name, repr(error)))
                    return 0
            # Native-size pointer args and return conversion are actually exercised.
            setattr(table, name, C.CFUNCTYPE(result, *args)(call))
        self.api = n.API(table)

    def invoke(self, name, a):
        if name == 'GetLastError': return self.error
        if name == 'GetCurrentProcess': return n.INVALID
        if name == 'CreateJobObjectW': return self.job
        if name == 'SetInformationJobObject':
            self.flags = C.cast(a[2], C.POINTER(n.EXTENDED_LIMIT)).contents.basic.flags
            return 1
        if name == 'QueryInformationJobObject':
            if a[1] == 9:
                C.cast(a[2], C.POINTER(n.EXTENDED_LIMIT)).contents.basic.flags = self.flags
            elif a[1] == 1:
                C.cast(a[2], C.POINTER(n.ACCOUNTING)).contents.active = len(self.live) if self.count_override is None else self.count_override
            elif a[1] == 3:
                data = C.cast(a[2], C.POINTER(n.PID_LIST)).contents
                pids = sorted({self.records[h][0] for h in self.live}) if self.pids_override is None else self.pids_override
                data.count = len(pids); data.assigned = len(pids)
                for i, pid in enumerate(pids[:64]): data.pids[i] = pid
            return 1
        if name == 'GetHandleInformation': a[1][0] = 1; return 1
        if name == 'InitializeProcThreadAttributeList':
            if not a[0]: a[3][0] = 128; self.error = 122; return 0
            return 1
        if name == 'UpdateProcThreadAttribute':
            count = a[4] // C.sizeof(n.HANDLE)
            self.attributes[a[2]] = list(C.cast(a[3], C.POINTER(n.HANDLE * count)).contents)
            return 1
        if name == 'DeleteProcThreadAttributeList': return None
        if name == 'CreateProcessW':
            self.command = C.wstring_at(a[1]); self.application = a[0]
            self.create_flags = a[5]; self.inherit = a[4]
            self.startup = C.cast(a[8], C.POINTER(n.STARTUPINFOEX)).contents
            self.stdio = (self.startup.startup.stdin, self.startup.startup.stdout, self.startup.startup.stderr)
            a[9][0].process = self.process; a[9][0].thread = self.thread
            a[9][0].pid = 101; a[9][0].tid = 201
            self.members.add(self.process); self.live.add(self.process)
            return 1
        if name == 'GetProcessId': return self.records[a[0]][0]
        if name == 'GetProcessTimes':
            value = self.records[a[0]][1]
            a[1][0].low = value & 0xffffffff; a[1][0].high = value >> 32
            return 1
        if name == 'IsProcessInJob': a[2][0] = int(a[0] in self.members); return 1
        if name == 'ResumeThread': return self.resume
        if name == 'DuplicateHandle':
            self.next += 1; a[3][0] = self.next
            self.records[self.next] = self.records[a[1]]
            if a[1] in self.members: self.members.add(self.next)
            if a[1] in self.live: self.live.add(self.next)
            return 1
        if name == 'OpenProcess':
            return next(h for h, record in self.records.items() if record[0] == a[2])
        if name == 'WaitForSingleObject':
            if a[1]: self.clock += 0.001
            return 258 if a[0] in self.live else 0
        if name == 'TerminateJobObject': self.live.clear(); return 1
        if name == 'TerminateProcess': self.live.discard(a[0]); return 1
        if name == 'CloseHandle': return 1
        raise AssertionError(name)

    def adapter(self):
        return n.NativeOwnershipAdapter(self.api, now=lambda: self.clock, sleep=lambda x: setattr(self, 'clock', self.clock+x))

    def create(self):
        adapter = self.adapter()
        ownership = adapter.create(['C:/fixture żółć/node.exe', 'a b', '"quoted"', 'x\\', '&'], 'C:/fixture żółć', dict(n.REQUIRED_ENV), (51, 52, 53), 10)
        return adapter, ownership

class NativeTests(unittest.TestCase):
    def setUp(self):
        self.dll = patch.object(C, 'WinDLL', side_effect=AssertionError('DLL forbidden'), create=True)
        self.dll.start()
        self.addCleanup(self.dll.stop)
        self.abi = ABI()
        self.addCleanup(lambda: self.assertEqual(self.abi.callback_errors, []))

    def test_real_declarations_and_64bit_structures(self):
        self.assertEqual(C.sizeof(n.DWORD), 4)
        if C.sizeof(C.c_void_p) == 8:
            self.assertEqual(C.sizeof(n.STARTUPINFO), 104)
            self.assertEqual(C.sizeof(n.STARTUPINFOEX), 112)
            self.assertEqual(C.sizeof(n.EXTENDED_LIMIT), 144)
            self.assertEqual(C.sizeof(n.PROCESS_INFORMATION), 24)
        for name, (args, result) in n.SIGNATURES.items():
            self.assertEqual(getattr(self.abi.api, name).argtypes, args)
            self.assertIs(getattr(self.abi.api, name).restype, result)

    def test_atomic_job_creation_literal_stdio_and_order(self):
        adapter, ownership = self.abi.create()
        self.assertEqual(ownership.held[adapter.root.identity].handle, self.abi.process)
        self.assertEqual(self.abi.attributes[0x2000D], [self.abi.job])
        self.assertEqual(self.abi.attributes[0x20002], [51, 52, 53])
        self.assertEqual(self.abi.stdio, (51, 52, 53))
        self.assertEqual(self.abi.create_flags, n.CREATE_FLAGS)
        self.assertEqual(self.abi.flags, n.KILL_ON_CLOSE)
        self.assertEqual(self.abi.application, 'C:/fixture żółć/node.exe')
        self.assertEqual(self.abi.command, n.subprocess.list2cmdline(['C:/fixture żółć/node.exe', 'a b', '"quoted"', 'x\\', '&']))
        names = [x[0] for x in self.abi.calls]
        self.assertLess(names.index('UpdateProcThreadAttribute'), names.index('CreateProcessW'))
        self.assertLess(names.index('GetProcessTimes'), names.index('ResumeThread'))
        self.assertTrue(ownership.track([], 10))

    def test_duplicate_original_noninheritable_same_object(self):
        adapter, _ = self.abi.create()
        duplicate = adapter.duplicate_root(10)
        self.assertEqual(duplicate.identity, adapter.root.identity)
        self.assertNotEqual(duplicate.handle, adapter.root.handle)
        call = next(a for name, a in self.abi.calls if name == 'DuplicateHandle')
        self.assertEqual(call[1], self.abi.process)
        self.assertEqual(call[4:], (0, 0, 2))

    def test_failed_duplicate_query_and_close_retains_cleanup_capability(self):
        adapter, _ = self.abi.create()
        self.abi.fail.update(('GetProcessTimes', 'CloseHandle'))
        with self.assertRaises(OSError): adapter.duplicate_root(10)
        self.assertIn(self.abi.next, adapter.auxiliary)
        self.assertNotIn(self.abi.next, adapter.owned)
        self.abi.fail.clear()
        adapter.cleanup(10, lambda r: None)
        self.assertNotIn(self.abi.next, adapter.auxiliary)
        self.assertFalse(any(name == 'TerminateProcess' and a[0] == self.abi.next for name, a in self.abi.calls))

    def test_descendant_identity_membership_rights_and_core_cleanup(self):
        adapter, owner = self.abi.create()
        child = 0x100000030
        self.abi.members.add(child); self.abi.live.add(child)
        self.assertTrue(owner.track([(core.Identity(102, 12346), adapter.root.identity)], 10))
        opened = next(a for name, a in self.abi.calls if name == 'OpenProcess')
        self.assertEqual(opened, (n.QUERY_WAIT, 0, 102))
        result = owner.cleanup(10, lambda r: None)
        self.assertTrue(result['cleanup_safe'])
        self.assertNotIn(self.abi.job, [a[0] for name, a in self.abi.calls if name == 'CloseHandle'])
        self.assertTrue(adapter.cleanup(10, lambda r: None)['cleanup_safe'])
        self.assertIsNone(adapter.job)

    def test_reused_pid_and_nonmember_never_terminated(self):
        for created, member in ((999, True), (12346, False)):
            with self.subTest(created=created, member=member):
                self.abi = ABI(); adapter, owner = self.abi.create()
                if member: self.abi.members.add(0x100000030)
                self.assertFalse(owner.track([(core.Identity(102, created), adapter.root.identity)], 10))
                self.assertNotIn(0x100000030, adapter.owned)
                self.assertIn(('CloseHandle', (0x100000030,)), self.abi.calls)
                self.assertFalse(any(name == 'TerminateProcess' for name, _ in self.abi.calls))

    def test_open_and_query_errors_are_not_ignored(self):
        for fail in ('OpenProcess', 'GetProcessTimes', 'IsProcessInJob'):
            with self.subTest(fail=fail):
                self.abi = ABI(); adapter, owner = self.abi.create()
                self.abi.fail.add(fail)
                self.assertFalse(owner.track([(core.Identity(102, 12346), adapter.root.identity)], 10))
                self.assertTrue(owner.errors)

    def test_job_list_accounting_race_fails_closed(self):
        for pids, count in (([101, 102], None), ([101], 2), ([101, 101], None)):
            with self.subTest(pids=pids, count=count):
                self.abi = ABI(); adapter, owner = self.abi.create()
                self.abi.pids_override = pids; self.abi.count_override = count
                self.assertFalse(owner.track([], 10))

    def test_forged_capabilities_cannot_terminate(self):
        adapter, _ = self.abi.create()
        with self.assertRaises(RuntimeError): adapter.terminate(core.Held(adapter.root.identity, adapter.root.handle), 10)
        self.assertFalse(any(name == 'TerminateJobObject' for name, _ in self.abi.calls))

    def test_bootstrap_failures_retain_outside_recovery(self):
        for fail in ('CreateProcessW', 'GetProcessTimes', 'ResumeThread'):
            with self.subTest(fail=fail):
                self.abi = ABI(); adapter = self.abi.adapter(); self.abi.fail.add(fail)
                with self.assertRaises(n.BootstrapError) as raised:
                    adapter.create(['C:/fixture/node.exe'], 'C:/fixture', dict(n.REQUIRED_ENV), (51,52,53), 10)
                self.assertIs(raised.exception.recovery, adapter)
                self.abi.fail.clear()
                result = adapter.cleanup(10, lambda r: None)
                self.assertFalse(result['cleanup_safe'])  # bootstrap failure never green
                self.assertTrue(result['job_empty'])
                self.assertIsNone(adapter.job)

    def test_operation_errors_and_job_lifetime(self):
        for fail in ('TerminateJobObject', 'QueryInformationJobObject', 'CloseHandle', 'WaitForSingleObject'):
            with self.subTest(fail=fail):
                self.abi = ABI(); adapter, _ = self.abi.create()
                self.abi.fail.add(fail)
                receipt = adapter.cleanup(0.03, lambda r: None)
                self.assertFalse(receipt['cleanup_safe'])
                self.assertTrue(receipt['errors'])
                if fail in ('QueryInformationJobObject', 'CloseHandle'):
                    self.assertEqual(adapter.job, self.abi.job)

    def test_deadline_exhaustion_no_termination_and_retains_job(self):
        adapter, owner = self.abi.create()
        self.abi.calls.clear()
        receipt = adapter.cleanup(0, lambda r: None)
        self.assertFalse(receipt['cleanup_safe'])
        self.assertEqual(adapter.job, self.abi.job)
        self.assertFalse(any(name.startswith('Terminate') for name, _ in self.abi.calls))
        self.assertTrue(any(name == 'CloseHandle' for name, _ in self.abi.calls))

    def test_exited_root_after_job_termination_never_reterminated(self):
        adapter, _ = self.abi.create()
        self.abi.fail.add('TerminateProcess')  # actual documented exited-root error
        receipt = adapter.cleanup(10, lambda r: None)
        self.assertTrue(receipt['cleanup_safe'])
        self.assertFalse(any(name == 'TerminateProcess' for name, _ in self.abi.calls))

    def test_readiness_and_unsafe_launch_values_blocked(self):
        adapter = self.abi.adapter()
        with self.assertRaises(RuntimeError): adapter.fixture_readiness()
        for argv, cwd, env in ((['node.exe'], 'C:/fixture', dict(n.REQUIRED_ENV)),
                              (['C:/fixture/x.cmd'], 'C:/fixture', dict(n.REQUIRED_ENV)),
                              (['C:/fixture/x.exe'], '/fixture', dict(n.REQUIRED_ENV)),
                              (['C:/fixture/x.exe'], 'C:/fixture', {**n.REQUIRED_ENV, 'TOKEN':'secret'}),
                              (['C:/fixture/x.exe'], 'C:/fixture', {})):
            with self.assertRaises(ValueError): n.launch_values(argv,cwd,env)
        self.assertEqual(self.abi.calls, [])

    def test_rejected_handle_close_failure_retains_only_close_capability(self):
        adapter, owner = self.abi.create()
        self.abi.fail.add('CloseHandle')
        self.assertFalse(owner.track([(core.Identity(102, 999), adapter.root.identity)], 10))
        self.assertIn(0x100000030, adapter.auxiliary)
        self.assertNotIn(0x100000030, adapter.owned)
        self.abi.fail.clear()
        adapter.cleanup(10, lambda r: None)
        self.assertNotIn(0x100000030, adapter.auxiliary)
        self.assertFalse(any(name == 'TerminateProcess' and a[0] == 0x100000030 for name, a in self.abi.calls))

    def test_actual_core_composition_with_real_files_and_mocked_abi(self):
        ledger_module = load('windows_shutdown_ledger')
        owners = {}; recoveries = {}; abis = {}
        for case in (1,2,3):
            abi = ABI()
            abis[case] = abi; recoveries[case] = abi.adapter()
        outer = self
        class Driver:
            recovery_deadline = 10
            def dispatch(self, case, timeout):
                outer.assertEqual(timeout, 100)
                outer.assertEqual(store.read(), list(range(1,case+1)))
                # Capability exists outside dispatch; creation is AFTER durable
                # consume, as the real core requires, never in preflight.
                owners[case] = recoveries[case].create(['C:/fixture/node.exe'], 'C:/fixture', dict(n.REQUIRED_ENV), (51,52,53), 10)
                class Controller:
                    deadline = 10
                    def ready(self, seconds): outer.assertEqual(seconds, 35); return []
                    def request_stop(self): pass
                    def poll_stop(self, seconds): outer.assertEqual(seconds, 20)
                    def wait_stop(self, seconds): outer.assertEqual(seconds, 1)
                controller = Controller(); controller.case = case
                self.result = core.controller_core(controller, owners[case], lambda r: None)
            def receipt(self, case): return self.result
        packet = b'offline adapter composition only'
        with tempfile.TemporaryDirectory(prefix='native-abi-ledger-', dir='C:/Users/jmdzi/AppData/Local/hermes/cache/scratch') as temp:
            store = ledger_module.LocalLedgerStore(Path(temp)/'ledger', packet, hashlib.sha256(packet).hexdigest(), fresh=True)
            try:
                result = core.execute_core(Driver(), core.AttemptLedger(store), recoveries, lambda r: None)
                self.assertTrue(result['qualified'])  # injected contract ONLY
                self.assertEqual(result['consumed_attempts'], 3)
                self.assertTrue(all(r['native_qualified'] is False for r in result['recovery']))
                self.assertTrue(all(adapter.job is None for adapter in recoveries.values()))
                for abi in abis.values(): self.assertEqual(abi.callback_errors, [])
            finally: store.close()

if __name__ == '__main__': unittest.main()
