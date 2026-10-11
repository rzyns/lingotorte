"""Offline injected regression suite. Baseline AST executes only inert slices."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import importlib.util
core_path = Path(sys.argv[2]) if '--revision-baseline' in sys.argv else Path(__file__).with_name('windows_shutdown_recovery.py')
core_spec = importlib.util.spec_from_file_location('windows_shutdown_recovery', core_path)
core = importlib.util.module_from_spec(core_spec)
sys.modules[core_spec.name] = core
core_spec.loader.exec_module(core)
spec = importlib.util.spec_from_file_location('diagnostic_recovery_seams', Path(__file__).with_name('windows-shutdown-diagnostic.py'))
diag = importlib.util.module_from_spec(spec)
with patch('subprocess.Popen', side_effect=RuntimeError('import spawn forbidden')):
    spec.loader.exec_module(diag)


class Adapter:
    def now(self): return 0
    def coverage(self, held, deadline): return True
    def __init__(self):
        self.calls = []
        self.fail = set()
        self.reused = False
        self.relation = True
    def op(self, name, held, value):
        self.calls.append((name, held.identity.pid))
        if (name, held.identity.pid) in self.fail:
            raise RuntimeError(name + ' injected error')
        return value
    def acquire(self, identity, parent, deadline):
        return self.op('acquire', parent, core.Held(core.Identity(identity.pid, 999) if self.reused else identity, object()))
    def proven(self, held, parent, deadline):
        return self.relation
    def active(self, held, deadline): return self.op('query', held, True)
    def terminate(self, held, deadline): return self.op('terminate', held, True)
    def wait_gone(self, held, deadline): return self.op('wait', held, True)
    def close(self, held, deadline): return self.op('close', held, True)


class Store:
    def __init__(self, rows=None): self.rows = [] if rows is None else rows
    def read(self): return self.rows.copy() if isinstance(self.rows, list) else self.rows
    def append(self, case): self.rows.append(case)


class Driver:
    deadline = 21
    recovery_deadline = 110
    case = 1
    def __init__(self): self.calls = []; self.error = None; self.data = {'case': 1, 'cleanup_safe': True, 'lifecycle': 'PASS injected contract only'}
    def ready(self, seconds): self.calls.append(('ready', seconds)); return []
    def request_stop(self): self.calls.append(('stop',))
    def poll_stop(self, seconds): self.calls.append(('poll', seconds))
    def wait_stop(self, seconds): self.calls.append(('wait', seconds))
    def dispatch(self, case, timeout):
        self.calls.append(('dispatch', case, timeout))
        if self.error: raise self.error
    def receipt(self, case): return self.data


def owner(adapter=None):
    a = adapter or Adapter()
    o = core.Ownership(a, core.Held(core.Identity(1, 10), object()))
    o.track([], 21)
    return o


class RecoveryTests(unittest.TestCase):
    def test_failed_acquisition_is_incomplete_not_subset_green(self):
        a = Adapter(); a.fail.add(('acquire', 1)); o = owner(a)
        self.assertFalse(o.track([(core.Identity(2, 20), core.Identity(1, 10))], 21))
        self.assertFalse(o.cleanup(21, lambda r: None)['cleanup_safe'])
    def test_reused_pid_never_adopted_or_terminated(self):
        a = Adapter(); a.reused = True; o = owner(a)
        self.assertFalse(o.track([(core.Identity(2, 20), core.Identity(1, 10))], 21))
        o.cleanup(21, lambda r: None)
        self.assertNotIn(('terminate', 2), a.calls)
        self.assertIn(('close', 2), a.calls)
    def test_snapshot_relation_alone_is_not_authority(self):
        a = Adapter(); a.relation = False; o = owner(a)
        self.assertFalse(o.track([(core.Identity(2, 20), core.Identity(1, 10))], 21))
        o.cleanup(21, lambda r: None); self.assertNotIn(('terminate', 2), a.calls)
    def test_missing_original_launcher_handle(self):
        o = core.Ownership(Adapter(), None)
        self.assertFalse(o.track([], 21)); self.assertFalse(o.cleanup(21, lambda r: None)['cleanup_safe'])
    def test_empty_snapshot_requires_authoritative_coverage(self):
        a = Adapter(); a.coverage = lambda held, deadline: False
        o = owner(a); self.assertFalse(o.coverage)
        self.assertFalse(o.cleanup(21, lambda r: None)['cleanup_safe'])
    def test_unowned_parent_is_never_acquired(self):
        a = Adapter(); o = owner(a)
        self.assertFalse(o.track([(core.Identity(2, 20), core.Identity(9, 90))], 21))
        self.assertEqual(a.calls, [])
    def test_each_operation_error_still_closes_every_handle_and_emits(self):
        for operation in ('query', 'terminate', 'wait', 'close'):
            with self.subTest(operation=operation):
                a = Adapter(); o = owner(a)
                o.track([(core.Identity(2, 20), core.Identity(1, 10))], 21)
                a.fail.update({(operation, 1), ('close', 2)})
                receipts = []; r = o.cleanup(21, receipts.append)
                self.assertFalse(r['cleanup_safe']); self.assertEqual(receipts, [r])
                self.assertIn(('close', 1), a.calls); self.assertIn(('close', 2), a.calls)
                if operation == 'query': self.assertIn(('terminate', 1), a.calls)
    def test_controller_uses_fixed_stop_window_and_core_cleanup(self):
        d = Driver(); o = owner(); receipts = []
        r = diag.controller_injected(d, o, receipts.append)
        self.assertTrue(r['cleanup_safe']); self.assertIn(('poll', 20), d.calls)
        self.assertIn(('wait', 1), d.calls); self.assertEqual(len(receipts), 1)
    def test_controller_failure_always_cleanup(self):
        d = Driver(); d.request_stop = lambda: (_ for _ in ()).throw(RuntimeError('stop failure'))
        o = owner(); r = diag.controller_injected(d, o, lambda r: None)
        self.assertEqual(r['lifecycle'], 'FAIL'); self.assertIn(('close', 1), o.adapter.calls)
    def test_timeout_recovers_via_outside_capability(self):
        d = Driver(); d.error = subprocess.TimeoutExpired('inert', 100)
        s = Store(); o = owner(); receipts = []
        r = diag.execute_injected(d, core.AttemptLedger(s), {1: o}, receipts.append)
        self.assertEqual(r['consumed_attempts'], 1); self.assertEqual(s.read(), [1])
        self.assertFalse(r['qualified']); self.assertTrue(r['recovery'][0]['cleanup_safe'])
        self.assertIn(('terminate', 1), o.adapter.calls); self.assertEqual(len(receipts), 2)
    def test_absent_outside_capability_never_dispatches(self):
        d = Driver(); s = Store()
        r = diag.execute_injected(d, core.AttemptLedger(s), {}, lambda r: None)
        self.assertFalse(r['qualified']); self.assertEqual(d.calls, []); self.assertEqual(s.read(), [])
    def test_missing_corrupt_partial_receipts_consume_attempt(self):
        for data in (None, 'bad', {}, {'case': 1}, {'case': 2, 'cleanup_safe': True}, {'case': 1, 'cleanup_safe': 'yes'}):
            d = Driver(); d.data = data; s = Store()
            r = diag.execute_injected(d, core.AttemptLedger(s), {1: owner()}, lambda r: None)
            self.assertEqual(r['consumed_attempts'], 1); self.assertEqual(s.read(), [1])
            self.assertFalse(r['qualified']); self.assertEqual(len(r['recovery']), 1)
    def test_dispatch_consumes_before_exception_and_no_reset(self):
        s = Store(); d = Driver()
        def dispatch(case, timeout):
            self.assertEqual(s.read(), [1]); raise RuntimeError('dispatch failed')
        d.dispatch = dispatch
        r = diag.execute_injected(d, core.AttemptLedger(s), {1: owner()}, lambda r: None)
        self.assertEqual(r['consumed_attempts'], 1)
        with self.assertRaises(RuntimeError): core.AttemptLedger(s).consume(1)
    def test_budget_and_corruption_fail_closed(self):
        for rows, case in (([1, 2, 3], 4), ([2], 2), ('bad', 1), ([True], 2)):
            with self.assertRaises(RuntimeError): core.AttemptLedger(Store(rows)).consume(case)
    def test_failed_external_cleanup_cannot_green(self):
        a = Adapter(); a.fail.add(('wait', 1)); d = Driver()
        r = diag.execute_injected(d, core.AttemptLedger(Store()), {1: owner(a)}, lambda r: None)
        self.assertFalse(r['qualified']); self.assertFalse(r['recovery'][0]['cleanup_safe'])
    def test_expired_deadline_closes_but_never_mutates(self):
        a = Adapter(); o = owner(a); a.now = lambda: 21
        receipts = []; r = o.cleanup(21, receipts.append)
        self.assertFalse(r['cleanup_safe']); self.assertEqual(receipts, [r])
        self.assertNotIn(('terminate', 1), a.calls); self.assertIn(('close', 1), a.calls)
    def test_existing_attempts_cannot_resume_aborted_batch(self):
        d = Driver(); s = Store([1])
        r = diag.execute_injected(d, core.AttemptLedger(s), {2: owner()}, lambda r: None)
        self.assertEqual(r['consumed_attempts'], 1); self.assertFalse(r['qualified'])
        self.assertEqual(d.calls, []); self.assertEqual(s.read(), [1])
    def test_recovery_exception_still_emits_batch_receipt(self):
        class Broken:
            def cleanup(self, deadline, emit): raise RuntimeError('receipt failed')
        receipts = []; r = diag.execute_injected(Driver(), core.AttemptLedger(Store()), {1: Broken()}, receipts.append)
        self.assertEqual(receipts, [r]); self.assertFalse(r['qualified'])


class RevisionTests(unittest.TestCase):
    def batch(self, d, ledger=None):
        emitted = []
        r = diag.execute_injected(d, ledger or core.AttemptLedger(Store()),
                                  {i: owner() for i in (1, 2, 3)}, emitted.append)
        self.assertEqual(emitted[-1], r)
        return r

    def test_lifecycle_exact_success_required(self):
        for value in ('FAIL', None, True, 'PASS', 'PASS injected contract only\n'):
            with self.subTest(value=value):
                d = Driver()
                d.receipt = lambda case: {'case': case, 'cleanup_safe': True, 'lifecycle': value}
                r = self.batch(d)
                self.assertFalse(r['qualified'])
                if value == 'FAIL': self.assertEqual(r['consumed_attempts'], 3)
        d = Driver(); d.receipt = lambda case: {'case': case, 'cleanup_safe': True}
        self.assertFalse(self.batch(d)['qualified'])

    def test_controller_complete_receipt_composes_success_and_stop_error(self):
        for stop_error in (False, True):
            with self.subTest(stop_error=stop_error):
                emitted = []
                class Composition(Driver):
                    def dispatch(self, case, timeout):
                        super().dispatch(case, timeout)
                        child = Driver(); child.case = case
                        if stop_error:
                            child.request_stop = lambda: (_ for _ in ()).throw(RuntimeError('stop failure'))
                        returned = diag.controller_injected(child, owner(), emitted.append)
                        self.data = emitted[-1]
                        self_outer.assertEqual(self.data, returned)
                self_outer = self; d = Composition(); r = self.batch(d)
                self.assertEqual(r['qualified'], not stop_error)
                self.assertEqual(len(emitted), 3)
                for case, receipt in enumerate(emitted, 1):
                    self.assertEqual(receipt['case'], case)
                    self.assertTrue(receipt['cleanup_safe'])
                    self.assertEqual(receipt['lifecycle'], 'FAIL' if stop_error else 'PASS injected contract only')
                    self.assertIn('stop_reason', receipt)
                    if stop_error: self.assertEqual(receipt['error'], 'stop failure')

    def test_initial_ledger_failure_and_corruption_emit_without_dispatch(self):
        for rows in (None, 'bad', [True], [2], [1, 2, 3, 4], [1.0]):
            with self.subTest(rows=rows):
                s = Store(); s.rows = rows; d = Driver(); ledger = core.AttemptLedger(s)
                r = self.batch(d, ledger)
                self.assertFalse(r['qualified']); self.assertTrue(r['ledger_uncertain'])
                self.assertIsNone(r['consumed_attempts']); self.assertEqual(d.calls, [])
                s.rows = []
                self.assertFalse(self.batch(d, ledger)['qualified']); self.assertEqual(d.calls, [])
        s = Store(); s.read = lambda: (_ for _ in ()).throw(RuntimeError('first read failed'))
        d = Driver(); r = self.batch(d, core.AttemptLedger(s))
        self.assertTrue(r['ledger_uncertain']); self.assertIsNone(r['consumed_attempts'])
        self.assertEqual(d.calls, [])

    def test_append_and_readback_uncertainty_never_dispatch_or_retry(self):
        for mode in ('append-before', 'append-after', 'readback', 'readback-corrupt'):
            with self.subTest(mode=mode):
                class BrokenStore(Store):
                    broken = True
                    def append(self, case):
                        if mode == 'append-before' and self.broken: raise RuntimeError('append before')
                        super().append(case)
                        if mode == 'append-after' and self.broken: raise RuntimeError('append after persist')
                    def read(self):
                        if self.rows and self.broken and mode == 'readback': raise RuntimeError('readback failed')
                        if self.rows and self.broken and mode == 'readback-corrupt': return [True]
                        return super().read()
                s = BrokenStore(); d = Driver(); ledger = core.AttemptLedger(s)
                r = self.batch(d, ledger)
                self.assertFalse(r['qualified']); self.assertTrue(r['ledger_uncertain'])
                self.assertEqual(r['consumed_attempts_min'], 0)
                self.assertEqual(r['possibly_consumed_attempt'], 1)
                self.assertEqual(d.calls, []); self.assertEqual(r['recovery'], [])
                if mode == 'append-after': self.assertEqual(r['consumed_attempts'], 1)
                if mode.startswith('readback'): self.assertIsNone(r['consumed_attempts'])
                s.broken = False
                self.assertFalse(self.batch(d, ledger)['qualified']); self.assertEqual(d.calls, [])
                with self.assertRaises(RuntimeError): ledger.consume(1)

    def test_ledger_maximum_and_case_types_are_strict(self):
        for maximum in (True, 0, -1, 4, '3', 3.0):
            d = Driver(); r = self.batch(d, core.AttemptLedger(Store(), maximum))
            self.assertFalse(r['qualified']); self.assertEqual(d.calls, [])
        for case in (True, 1.0, '1'):
            with self.assertRaises(RuntimeError): core.AttemptLedger(Store()).consume(case)

    def test_consume_read_failure_after_initial_read_emits_final(self):
        class SecondReadFails(Store):
            reads = 0
            def read(self):
                self.reads += 1
                if self.reads == 2: raise RuntimeError('consume read failed')
                return super().read()
        d = Driver(); r = self.batch(d, core.AttemptLedger(SecondReadFails()))
        self.assertTrue(r['ledger_uncertain']); self.assertIsNone(r['consumed_attempts'])
        self.assertEqual(d.calls, []); self.assertEqual(r['recovery'], [])

    def test_ledger_error_final_sink_is_attempted_even_if_sink_raises(self):
        s = Store(); s.rows = None; emitted = []
        def broken_emit(receipt):
            emitted.append(receipt)
            raise RuntimeError('final sink failed')
        d = Driver()
        with self.assertRaisesRegex(RuntimeError, 'final sink failed'):
            diag.execute_injected(d, core.AttemptLedger(s), {}, broken_emit)
        self.assertEqual(len(emitted), 1); self.assertTrue(emitted[0]['ledger_uncertain'])
        self.assertFalse(emitted[0]['qualified']); self.assertEqual(d.calls, [])

    def test_unsafe_cleanup_still_cannot_qualify_lifecycle_failure(self):
        d = Driver(); d.data['lifecycle'] = 'FAIL'
        a = Adapter(); a.fail.add(('wait', 1)); emitted = []
        r = diag.execute_injected(d, core.AttemptLedger(Store()), {1: owner(a)}, emitted.append)
        self.assertFalse(r['qualified']); self.assertEqual(r['consumed_attempts'], 1)
        self.assertFalse(r['recovery'][0]['cleanup_safe']); self.assertEqual(emitted[-1], r)


class BaselineDefects(unittest.TestCase):
    """Extract actual historical AST; never import or run controller/execute."""
    @classmethod
    def setUpClass(cls):
        cls.path = Path(sys.argv[2]); cls.raw = cls.path.read_bytes()
        cls.tree = ast.parse(cls.raw)
        cls.controller = next(n for n in cls.tree.body if isinstance(n, ast.FunctionDef) and n.name == 'controller')
        cls.execute = next(n for n in cls.tree.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')
        print('BASELINE_SHA256=' + hashlib.sha256(cls.raw).hexdigest())
    def run_nodes(self, nodes, env):
        exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), str(self.path), 'exec'), env)
    def test_failed_open_must_report_incomplete_coverage(self):
        track = next(n for n in self.controller.body if isinstance(n, ast.FunctionDef) and n.name == 'track')
        class K:
            def OpenProcess(self, *args): return 0
        env = {'k': K(), 'process_list': lambda k: [{'pid': 1, 'ppid': 0}], 'handles': {}, 'meta': {}, 'p': type('P', (), {'pid': 1})(), 'record': {}}
        self.run_nodes([track], env); env['track']()
        self.assertTrue(env['record'].get('coverage_failed'), 'baseline silently accepts empty held subset')
    def test_query_exception_must_not_skip_close(self):
        outer = next(n for n in self.controller.body if isinstance(n, ast.Try))
        # Actual first recovery query loop plus actual CloseHandle loop.
        loops = [n for n in outer.finalbody if isinstance(n, ast.For)]
        close_loop = next(n for n in loops if isinstance(n.target, ast.Name) and n.target.id == 'h')
        class K:
            def CloseHandle(self, h): closed.append(h)
        closed = []; env = {'handles': {1: 1}, 'record': {'recovery_targets': []}, 'k': K(), 'active': lambda k,h: (_ for _ in ()).throw(RuntimeError('query failed'))}
        try: self.run_nodes([loops[0], close_loop], env)
        except RuntimeError: pass
        self.assertEqual(closed, [1], 'baseline query error skips handle closure')
    def test_timeout_must_recover_outside_controller(self):
        loop = next(n for n in self.execute.body if isinstance(n, ast.For))
        dispatch = next(n for n in loop.body if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'cp')
        recovery = []; env = {'subprocess': subprocess, 'cfg': {'python': 'inert'}, 'root': Path('inert'), 'case_id': 1, 'load': lambda p: {}}
        with patch('subprocess.run', side_effect=subprocess.TimeoutExpired('inert', 100)):
            try: self.run_nodes([dispatch], env)
            except subprocess.TimeoutExpired: pass
        self.assertTrue(recovery, 'actual baseline dispatch has no outside recovery path')
    def test_missing_receipt_must_not_zero_consumed_attempt(self):
        call = next(n for n in self.execute.body if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and n.value.args and isinstance(n.value.args[0], ast.BinOp) and isinstance(n.value.args[0].right, ast.Constant) and n.value.args[0].right.value == 'batch-result.json')
        saved = []; env = {'root': Path('inert'), 'results': [], 'save': lambda p,r: saved.append(r)}
        self.run_nodes([call], env)
        self.assertEqual(saved[0]['executed_cases'], 1, 'baseline uses receipt count despite one dispatched missing receipt')


if __name__ == '__main__':
    if '--revision-baseline' in sys.argv:
        print('REVISION_BASELINE_SHA256=' + hashlib.sha256(core_path.read_bytes()).hexdigest())
        suite = unittest.TestSuite(RevisionTests(name) for name in (
            'test_lifecycle_exact_success_required',
            'test_controller_complete_receipt_composes_success_and_stop_error',
            'test_append_and_readback_uncertainty_never_dispatch_or_retry'))
    elif '--baseline' in sys.argv:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(BaselineDefects)
    else:
        suite = unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(cls)
                                   for cls in (RecoveryTests, RevisionTests))
    # Every native/process boundary forbidden, including in baseline slices.
    with patch('subprocess.Popen', side_effect=RuntimeError('native spawn forbidden')), patch('ctypes.WinDLL', side_effect=RuntimeError('native API forbidden'), create=True):
        result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
