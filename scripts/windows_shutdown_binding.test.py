"""STOPPED native binding assessment: real core/store + injected ctypes ABI only.

Logical controller loss is an exception, NOT an OS-death/IPC qualification.
No live entry point or broker is implemented here.
"""
import contextlib
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
SCRATCH = Path('C:/Users/jmdzi/AppData/Local/hermes/cache/scratch')
RECEIPTS = None
REQUIRE_HARD_BOUND = False
if '--binding-receipts' in sys.argv:
    index = sys.argv.index('--binding-receipts')
    RECEIPTS = Path(sys.argv[index + 1])
    del sys.argv[index:index + 2]
if '--require-hard-bound' in sys.argv:
    sys.argv.remove('--require-hard-bound')
    REQUIRE_HARD_BOUND = True
ROWS = []


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Persistent guards cover imports, callback construction and all test methods.
GUARDS = contextlib.ExitStack()
for module, attribute in ((ctypes, 'WinDLL'), (subprocess, 'Popen'),
                          (subprocess, 'run'), (os, 'system'), (os, 'startfile')):
    GUARDS.enter_context(patch.object(module, attribute,
        side_effect=AssertionError('native/process execution forbidden'), create=True))
fixtures = load('binding_native_fixtures', 'windows_shutdown_native.test.py')
core, native = fixtures.core, fixtures.n
GUARDS.enter_context(patch.object(native, 'real_api',
    side_effect=AssertionError('real_api forbidden')))
ledger_module = load('windows_shutdown_ledger', 'windows_shutdown_ledger.py')


class BindingTests(unittest.TestCase):
    def compose(self, scenario, fault=None):
        abis = {case: fixtures.ABI() for case in (1, 2, 3)}
        recoveries = {case: abi.adapter() for case, abi in abis.items()}
        if scenario == 'missing-owner':
            recoveries.pop(1)
        outer = self
        dispatched = []
        windows = []
        emitted = []
        class Driver:
            recovery_deadline = 10
            def dispatch(self, case, timeout):
                outer.assertEqual(timeout, 100)
                outer.assertEqual(store.read(), list(range(1, case + 1)))
                dispatched.append(case)
                abi = abis[case]
                if scenario == 'setup-failure':
                    abi.fail.add('CreateProcessW')
                owner = recoveries[case].create(['C:/inert/node.exe'], 'C:/inert',
                    dict(native.REQUIRED_ENV), (51, 52, 53), 10)
                if scenario in ('controller-timeout', 'controller-death'):
                    if scenario == 'controller-timeout':
                        raise TimeoutError('logical controller timeout')
                    raise EOFError('logical controller IPC loss; no OS process killed')
                if scenario == 'cleanup-exception':
                    abi.fail.add('CloseHandle')
                if scenario == 'uncertain-accounting':
                    abi.count_override = 2
                class Controller:
                    deadline = 10
                    def ready(self, seconds): windows.append(('ready', seconds)); return []
                    def request_stop(self): windows.append(('request', None))
                    def poll_stop(self, seconds): windows.append(('poll', seconds))
                    def wait_stop(self, seconds): windows.append(('wait', seconds))
                controller = Controller()
                controller.case = case
                self.result = core.controller_core(controller, owner, emitted.append)
            def receipt(self, case): return self.result
        packet = b'OFFLINE native/controller composition assessment; not original packet'
        with tempfile.TemporaryDirectory(prefix='native-binding-', dir=SCRATCH) as temp:
            store = ledger_module.LocalLedgerStore(Path(temp) / 'ledger', packet,
                hashlib.sha256(packet).hexdigest(), fresh=True, fault=fault)
            ledger = core.AttemptLedger(store)
            try:
                result = core.execute_core(Driver(), ledger, recoveries, emitted.append)
                physical = json.loads(store.state.read_bytes())['body']['rows']
                status = store.marker.read_bytes().decode('ascii')
                lease = store.lock.exists()
                if scenario == 'ledger-uncertainty':
                    with self.assertRaises(RuntimeError): store.append(1)
                    with self.assertRaises(RuntimeError): core.AttemptLedger(store).consume(1)
                    with self.assertRaises(FileExistsError):
                        ledger_module.LocalLedgerStore(store.root, packet,
                            hashlib.sha256(packet).hexdigest())
                ROWS.append({'scenario': scenario, 'result': result, 'emitted': emitted,
                    'dispatched': dispatched, 'physical_rows': physical, 'status': status,
                    'lease': lease, 'windows': windows,
                    'jobs_retained': {str(k): v.job for k, v in recoveries.items()},
                    'abi_calls': {str(k): [name for name, args in v.calls] for k, v in abis.items()},
                    'native_qualified': False})
                for abi in abis.values(): self.assertEqual(abi.callback_errors, [])
                return result, dispatched, physical, status, recoveries, windows
            finally:
                store.close()

    def test_complete_injected_composition_is_not_native_qualification(self):
        result, dispatched, physical, status, recoveries, windows = self.compose('complete')
        self.assertTrue(result['qualified'])  # existing core means injected contract ONLY
        self.assertEqual(dispatched, [1, 2, 3])
        self.assertEqual(physical, [1, 2, 3])
        self.assertEqual(result['consumed_attempts'], 3)
        self.assertTrue(all(r['native_qualified'] is False for r in result['recovery']))
        self.assertTrue(all(a.job is None for a in recoveries.values()))
        self.assertEqual(windows, [('ready', 35), ('request', None), ('poll', 20), ('wait', 1)] * 3)

    def test_missing_outside_capability_rejected_before_consumption(self):
        result, dispatched, physical, _, _, _ = self.compose('missing-owner')
        self.assertFalse(result['qualified'])
        self.assertEqual(dispatched, [])
        self.assertEqual(physical, [])
        self.assertEqual(result['consumed_attempts'], 0)
        self.assertIn('outside-controller', result['error'])

    def test_setup_failure_consumed_once_and_original_recovery_retained(self):
        result, dispatched, physical, _, owners, _ = self.compose('setup-failure')
        self.assertFalse(result['qualified'])
        self.assertEqual(dispatched, [1])
        self.assertEqual(physical, [1])
        self.assertFalse(result['recovery'][0]['cleanup_safe'])
        self.assertTrue(result['recovery'][0]['job_empty'])
        self.assertIsNone(owners[1].job)

    def test_logical_controller_timeout_recovers_without_refund(self):
        result, dispatched, physical, _, owners, _ = self.compose('controller-timeout')
        self.assertFalse(result['qualified'])
        self.assertEqual(dispatched, [1])
        self.assertEqual(physical, [1])
        self.assertEqual(result['consumed_attempts'], 1)
        self.assertTrue(result['recovery'][0]['cleanup_safe'])
        self.assertIsNone(owners[1].job)

    def test_logical_controller_death_recovers_without_os_death_claim(self):
        result, dispatched, physical, _, owners, _ = self.compose('controller-death')
        self.assertFalse(result['qualified'])
        self.assertEqual(dispatched, [1])
        self.assertEqual(physical, [1])
        self.assertTrue(result['recovery'][0]['cleanup_safe'])
        self.assertIsNone(owners[1].job)
        self.assertIn('no OS process killed', result['error'])

    def test_cleanup_exception_stops_and_retains_job(self):
        result, dispatched, physical, _, owners, _ = self.compose('cleanup-exception')
        self.assertFalse(result['qualified'])
        self.assertEqual(dispatched, [1])
        self.assertEqual(physical, [1])
        self.assertFalse(result['recovery'][0]['cleanup_safe'])
        self.assertIsNotNone(owners[1].job)

    def test_uncertain_job_accounting_never_qualifies(self):
        result, dispatched, physical, _, owners, _ = self.compose('uncertain-accounting')
        self.assertFalse(result['qualified'])
        self.assertEqual(dispatched, [1])
        self.assertEqual(physical, [1])
        self.assertFalse(result['receipts'][0]['cleanup_safe'])
        self.assertFalse(result['recovery'][0]['cleanup_safe'])
        self.assertIsNotNone(owners[1].job)

    def test_real_committed_ledger_uncertainty_denies_dispatch_and_retry(self):
        def fault(stage):
            if stage == 'after_replace': raise OSError('injected committed acknowledgement uncertainty')
        result, dispatched, physical, status, _, _ = self.compose('ledger-uncertainty', fault)
        self.assertFalse(result['qualified'])
        self.assertEqual(dispatched, [])
        self.assertEqual(physical, [1])
        self.assertEqual(status, 'P')
        self.assertTrue(result['ledger_uncertain'])
        self.assertIsNone(result['consumed_attempts'])
        self.assertEqual(result['possibly_consumed_attempt'], 1)
        self.assertEqual(result['recovery'], [])

    def test_exclusive_console_host_readiness_still_blocked(self):
        abi = fixtures.ABI()
        with self.assertRaisesRegex(RuntimeError, 'exclusive console-host lifetime'):
            abi.adapter().fixture_readiness()
        self.assertEqual(abi.calls, [])
        ROWS.append({'scenario': 'console-readiness', 'blocked': True, 'native_qualified': False})

    def test_returning_native_callback_can_overrun_absolute_deadline(self):
        abi = fixtures.ABI()
        adapter, _ = abi.create()
        original = abi.invoke
        def delayed(name, args):
            value = original(name, args)
            if name == 'QueryInformationJobObject': abi.clock += 11
            return value
        abi.invoke = delayed
        count = adapter._count(10)
        self.assertEqual(count, 1)
        ROWS.append({'scenario': 'hard-bound-negative-control', 'deadline': 10,
            'returned_at': abi.clock, 'returned_count': count, 'native_qualified': False})
        if REQUIRE_HARD_BOUND:
            self.assertLessEqual(abi.clock, 10, 'pre-call checks do not enforce a hard native bound')
        else:
            self.assertGreater(abi.clock, 10)
            receipt = adapter.cleanup(10, lambda r: None)
            self.assertFalse(receipt['cleanup_safe'])
            self.assertIsNotNone(adapter.job)
        self.assertEqual(abi.callback_errors, [])


if __name__ == '__main__':
    try:
        unittest.main()
    finally:
        if RECEIPTS is not None:
            RECEIPTS.write_text(json.dumps(ROWS, indent=2, sort_keys=True), encoding='utf-8')
        GUARDS.close()
