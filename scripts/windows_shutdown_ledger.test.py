"""Real disposable-file IO only, including injected fsync/replace/ack faults."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
SCRATCH = Path('C:/Users/jmdzi/AppData/Local/hermes/cache/scratch')

def load(name, path=None):
    spec = importlib.util.spec_from_file_location(name, path or ROOT / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

core = load('windows_shutdown_recovery')
patch('subprocess.Popen', side_effect=AssertionError('process execution forbidden')).start()
patch('ctypes.WinDLL', side_effect=AssertionError('native DLL execution forbidden'), create=True).start()
BASELINE = os.environ.get('LEDGER_BASELINE')
l = load('windows_shutdown_ledger', Path(BASELINE) if BASELINE else None)
PACKET = b'offline fixed three-case source packet'
SHA = hashlib.sha256(PACKET).hexdigest()

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ledger-adapter-', dir=SCRATCH)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'ledger'
        self.stores = []
        self.addCleanup(self.close_stores)

    def close_stores(self):
        for store in self.stores:
            try: store.close()
            except OSError: pass

    def store(self, **kwargs):
        store = l.LocalLedgerStore(self.root, PACKET, SHA, **kwargs)
        self.stores.append(store)
        return store

    def test_real_append_fsync_readback_maximum_and_reopen_no_resume(self):
        store = self.store(fresh=True)
        ledger = core.AttemptLedger(store)
        self.assertEqual(ledger.read(), [])
        for case in (1,2,3):
            self.assertEqual(ledger.consume(case), case)
            self.assertEqual(json.loads(store.state.read_bytes())['body']['rows'], list(range(1,case+1)))
            self.assertEqual(store.marker.read_bytes(), b'R')
        with self.assertRaises(RuntimeError): ledger.consume(4)
        store.close()
        self.assertFalse(store.lock.exists())
        reopened = self.store()
        self.assertEqual(reopened.read(), [1,2,3])
        with self.assertRaises(RuntimeError): reopened.append(4)

    def test_two_instances_excluded_entire_read_append_lease(self):
        store = self.store(fresh=True)
        before = store.lock.read_bytes()
        with self.assertRaises(FileExistsError): self.store()
        self.assertEqual(store.lock.read_bytes(), before)
        self.assertEqual(core.AttemptLedger(store).consume(1), 1)

    def test_fresh_never_overwrites_existing_closed_root(self):
        store = self.store(fresh=True); store.close()
        before = {p.name:p.read_bytes() for p in self.root.iterdir()}
        with self.assertRaises(FileExistsError): self.store(fresh=True)
        self.assertEqual({p.name:p.read_bytes() for p in self.root.iterdir()}, before)

    def test_faults_poison_persisted_rows_and_reopen_exclusion(self):
        for stage in ('poisoned', 'before_fsync', 'before_replace', 'after_replace', 'before_ack'):
            with self.subTest(stage=stage):
                self.root = Path(self.temp.name) / stage
                def fault(current):
                    if current == stage: raise OSError('injected '+stage)
                store = self.store(fresh=True, fault=fault)
                ledger = core.AttemptLedger(store)
                with self.assertRaises(OSError): ledger.consume(1)
                expected = [1] if stage in ('after_replace','before_ack') else []
                self.assertEqual(json.loads(store.state.read_bytes())['body']['rows'], expected)
                self.assertEqual(store.marker.read_bytes(), b'P')
                self.assertTrue(ledger.uncertain)
                store.close()
                self.assertTrue(store.lock.exists())
                with self.assertRaises(FileExistsError): self.store()
                with self.assertRaises(RuntimeError): ledger.consume(1)

    def test_actual_replace_and_fsync_failures_keep_poison(self):
        for operation in ('replace','fsync'):
            with self.subTest(operation=operation):
                self.root = Path(self.temp.name) / operation
                store = self.store(fresh=True)
                with patch.object(l.os, operation, side_effect=OSError('injected syscall failure')):
                    with self.assertRaises(OSError): core.AttemptLedger(store).consume(1)
                self.assertEqual(store.marker.read_bytes(), b'P')
                self.assertTrue(store.lock.exists())
                store.close()
                with self.assertRaises(FileExistsError): self.store()

    def test_unlink_failure_retains_closed_lease(self):
        store = self.store(fresh=True)
        with patch.object(l.os, 'unlink', side_effect=OSError('unlink denied')):
            with self.assertRaises(OSError): store.close()
        self.assertTrue(store.lock.exists())
        self.assertEqual(store.marker.read_bytes(), b'C' if BASELINE else b'P')
        with self.assertRaises(FileExistsError): self.store()

    def test_case_types_sequence_and_budget_strict(self):
        store = self.store(fresh=True, maximum=1)
        for case in (True, '1', 0, 2):
            with self.assertRaises(RuntimeError): store.append(case)
        store.append(1)
        with self.assertRaises(RuntimeError): store.append(2)
        self.assertEqual(store.read(), [1])

    def test_corrupt_binding_checksum_types_fail_closed(self):
        for mode in ('bool', 'str', 'checksum', 'binding', 'status'):
            with self.subTest(mode=mode):
                self.root = Path(self.temp.name) / mode
                store = self.store(fresh=True)
                if mode == 'status': store.marker.write_bytes(b'?')
                else:
                    doc = json.loads(store.state.read_bytes())
                    if mode == 'bool': doc['body']['rows'] = [True]
                    if mode == 'str': doc['body']['rows'] = ['1']
                    if mode == 'binding': doc['body']['packet_sha256'] = '0'*64
                    doc['sha256'] = hashlib.sha256(l._encode(doc['body'])).hexdigest()
                    if mode == 'checksum': doc['sha256'] = '0'*64
                    store.state.write_bytes(l._encode(doc))
                with self.assertRaises(RuntimeError): store.read()
                self.assertTrue(store.uncertain)
                store.close()
                with self.assertRaises(FileExistsError): self.store()

    def test_packet_malformed_config_rejected_before_sideeffects(self):
        for packet, sha, maximum in ((PACKET, '0'*64, 3), (PACKET, SHA.upper(), 3),
                                     ('text', SHA, 3), (PACKET, SHA, True), (PACKET, SHA, 4)):
            with self.assertRaises(ValueError): l.LocalLedgerStore(self.root,packet,sha,maximum,fresh=True)
        self.assertFalse(self.root.exists())

    def test_core_dispatch_never_after_uncertain_durable_append(self):
        def fault(stage):
            if stage == 'after_replace': raise OSError('persisted but not acknowledged')
        store = self.store(fresh=True, fault=fault)
        class Driver:
            def dispatch(self, *a, **k): raise AssertionError('dispatch forbidden')
        emitted = []
        result = core.execute_core(Driver(), core.AttemptLedger(store), {1: object()}, emitted.append)
        self.assertFalse(result['qualified'])
        self.assertTrue(result['ledger_uncertain'])
        self.assertIsNone(result['consumed_attempts'])
        self.assertEqual(result['possibly_consumed_attempt'], 1)
        self.assertEqual(json.loads(store.state.read_bytes())['body']['rows'], [1])
        self.assertEqual(emitted, [result])

    def test_core_cannot_resume_closed_consumed_batch(self):
        store = self.store(fresh=True); store.append(1); store.close()
        reopened = self.store()
        class Driver:
            def dispatch(self, *a, **k): raise AssertionError('resume forbidden')
        result = core.execute_core(Driver(), core.AttemptLedger(reopened), {}, lambda r: None)
        self.assertFalse(result['qualified'])
        self.assertEqual(result['consumed_attempts'], 1)
        self.assertIn('cannot restart', result['error'])



# Matrix injections delegate real disposable-file os IO; no native modules.
class IOTrace:
    def __init__(self, fail=None, short=False, mismatch=False, primary=None):
        self.fail = fail
        self.short = short
        self.mismatch = mismatch
        self.primary = primary
        self.calls = []
        self.counts = {}
        self.live = {}
        self.hit = False

    def __call__(self, operation, *args):
        if operation in ('open', 'mkdir', 'replace', 'unlink'):
            site = 'root' if operation == 'mkdir' else Path(args[0]).name
        else:
            site = self.live.get(args[0], 'unknown')
        key = (site, operation)
        index = self.counts.get(key, 0) + 1
        self.counts[key] = index
        event = (site, operation, index)
        self.calls.append(event)
        if event == self.primary:
            raise OSError('injected primary owned IO failure')
        if event == self.fail:
            self.hit = True
            if self.short:
                return os.write(args[0], args[1][:-1])
            raise OSError('injected %s/%s/%s' % event)
        value = getattr(os, operation)(*args)
        if operation == 'open': self.live[value] = site
        if operation == 'close': self.live.pop(args[0], None)
        if self.mismatch and site == 'ledger.json' and operation == 'read' and index == 3:
            return b'corrupt committed readback'
        return value

    def reset(self):
        self.calls.clear()
        self.counts.clear()

    def cleanup(self):
        # Test-owned outstanding descriptors only; never retry a successful close.
        for fd in list(self.live):
            os.close(fd)
            del self.live[fd]


class BoundaryTests(LedgerTests):
    def denied(self, store):
        if hasattr(store, '_test_old_wrapper'):
            with self.assertRaises(RuntimeError): store._test_old_wrapper.consume(1)
        for call in (store.read, lambda: store.append(1),
                     lambda: core.AttemptLedger(store).consume(1)):
            with self.assertRaises(RuntimeError): call()
        old = core.AttemptLedger(store)
        with self.assertRaises(RuntimeError): old.consume(1)
        store.close(); store.close()
        self.assertTrue(store.uncertain)
        self.assertTrue(store.closed)
        self.assertTrue(store.lock.exists())
        with self.assertRaises(FileExistsError): self.store()
        class Driver:
            def dispatch(self, *args, **kwargs): raise AssertionError('dispatch forbidden')
        result = core.execute_core(Driver(), core.AttemptLedger(store), {1: object()}, lambda r: None)
        self.assertFalse(result['qualified'])
        self.assertTrue(result['ledger_uncertain'])
        self.assertIsNone(result['consumed_attempts'])

    def test_preflight_read_regression(self):
        store = self.store(fresh=True)
        if BASELINE:
            real = Path.read_bytes
            seen = 0
            def read(path):
                nonlocal seen
                if path == store.marker:
                    seen += 1
                    if seen == 2: raise OSError('exact original second status read')
                return real(path)
            with patch.object(Path, 'read_bytes', read):
                with self.assertRaises(OSError): store.append(1)
        else:
            # Redundant original second status read was removed, not mocked away.
            # Fail the single real preflight status read on the redesigned path.
            trace = IOTrace(fail=('status', 'read', 1))
            store.io = trace
            with self.assertRaises(OSError): store.append(1)
            trace.cleanup()
        retry_accepted = False
        try:
            store.append(1)
            retry_accepted = True
        except RuntimeError:
            pass
        self.assertFalse(retry_accepted, 'direct retry accepted after failed preflight status read')
        self.denied(store)

    def test_original_second_read_is_absent_not_unprotected(self):
        if BASELINE: self.skipTest('new operation inventory only')
        store = self.store(fresh=True)
        trace = IOTrace(); store.io = trace
        store.append(1)
        self.assertEqual(trace.counts[('status', 'open')], 3)  # read, poison, ack
        self.assertEqual(trace.counts[('status', 'read')], 2)  # bytes + EOF, one file read
        store.close(); trace.cleanup()

    def test_pure_arguments_and_stale_wrappers(self):
        if BASELINE: self.skipTest('architecture contract')
        store = self.store(fresh=True)
        first, second = core.AttemptLedger(store), core.AttemptLedger(store)
        self.assertEqual(second.read(), [])
        self.assertEqual(first.consume(1), 1)
        with self.assertRaises(RuntimeError): second.consume(1)
        self.assertFalse(store.uncertain)
        for case in (True, '2', 0, 1, 3, 4):
            with self.assertRaises(RuntimeError): store.append(case)
            self.assertFalse(store.uncertain)
        self.assertEqual(second.consume(2), 2)
        store.close()
        for wrapper in (first, second, core.AttemptLedger(store)):
            with self.assertRaises(RuntimeError): wrapper.consume(3)

    def test_concurrent_same_store_read_append_close_serialized(self):
        if BASELINE: self.skipTest('architecture contract')
        import threading
        store = self.store(fresh=True)
        results = []
        barrier = threading.Barrier(3)
        def consume():
            barrier.wait()
            try: results.append(core.AttemptLedger(store).consume(1))
            except RuntimeError: results.append('denied')
        threads = [threading.Thread(target=consume) for _ in range(2)]
        for thread in threads: thread.start()
        barrier.wait()
        for thread in threads: thread.join(5); self.assertFalse(thread.is_alive())
        self.assertCountEqual(results, [1, 'denied'])
        self.assertEqual(store.read(), [1])
        entered, release, closed = threading.Event(), threading.Event(), threading.Event()
        real = store.io
        def blocking(op, *args):
            if op == 'read' and not entered.is_set():
                entered.set()
                if not release.wait(5): raise RuntimeError('test release timeout')
            return real(op, *args)
        store.io = blocking
        reader = threading.Thread(target=store.read)
        closer = threading.Thread(target=lambda: (store.close(), closed.set()))
        reader.start(); self.assertTrue(entered.wait(5)); closer.start()
        self.assertFalse(closed.wait(.05))
        release.set(); reader.join(5); closer.join(5)
        self.assertFalse(reader.is_alive()); self.assertFalse(closer.is_alive())
        self.assertTrue(closed.is_set())

    def test_close_fd_ambiguous_success_not_retried(self):
        if BASELINE: self.skipTest('architecture contract')
        store = self.store(fresh=True)
        real, target, calls = store.io, store.lock_fd, []
        reused = []
        def close_then_raise(op, *args):
            if op == 'close' and args[0] == target:
                calls.append(args[0]); real(op, *args)
                reused.append(os.open(self.root / 'unrelated', os.O_CREAT | os.O_WRONLY, 0o600))
                raise OSError('close completed but acknowledgement lost')
            return real(op, *args)
        store.io = close_then_raise
        with self.assertRaises(OSError): store.close()
        store.close(); store.close()
        self.assertEqual(calls, [target])
        self.assertIsNone(store.lock_fd)
        self.assertEqual(os.write(reused[0], b'still owned by test'), 19)
        os.close(reused[0]); self.denied(store)

    def test_committed_readback_mismatch_shared_poison(self):
        if BASELINE: self.skipTest('architecture contract')
        store = self.store(fresh=True)
        trace = IOTrace(mismatch=True); store.io = trace
        with self.assertRaises(OSError): store.append(1)
        self.denied(store); trace.cleanup()
        self.assertEqual(json.loads(store.state.read_bytes())['body']['rows'], [1])

    def test_occurrence_matrix(self):
        if BASELINE: self.skipTest('new actual IO seam')
        records = []
        inventories = {}
        serial = 0
        def setup(stage):
            nonlocal serial
            serial += 1
            self.root = Path(self.temp.name) / ('matrix-%d' % serial)
            trace = IOTrace()
            self.addCleanup(trace.cleanup)
            if stage in ('fresh_init', 'init_abort'):
                if stage == 'init_abort': trace.primary = ('status', 'read', 1)
                store = l.LocalLedgerStore.__new__(l.LocalLedgerStore)
                action = lambda: store.__init__(self.root, PACKET, SHA, fresh=True, io=trace)
            else:
                store = self.store(fresh=True)
                if stage == 'reopen_init':
                    store.close()
                    store = l.LocalLedgerStore.__new__(l.LocalLedgerStore)
                    action = lambda: store.__init__(self.root, PACKET, SHA, io=trace)
                else:
                    store._test_old_wrapper = core.AttemptLedger(store)
                    self.assertEqual(store._test_old_wrapper.read(), [])
                    store.io = trace
                    if store.lock_fd is not None: trace.live[store.lock_fd] = 'writer.lock'
                    if stage == 'read': action = store.read
                    if stage == 'append': action = lambda: store.append(1)
                    if stage == 'wrapper_consume': action = lambda: core.AttemptLedger(store).consume(1)
                    if stage == 'close': action = store.close
                    if stage == 'abort':
                        store.marker.write_bytes(b'?')
                        action = store.read
                    if stage == 'abort_io':
                        trace.primary = ('status', 'read', 1)
                        action = store.read
            return store, trace, action

        for stage in ('fresh_init', 'reopen_init', 'read', 'append', 'wrapper_consume', 'close', 'abort', 'abort_io', 'init_abort'):
            store, trace, action = setup(stage)
            if stage == 'abort':
                with self.assertRaises(RuntimeError): action()
            elif stage in ('abort_io', 'init_abort'):
                with self.assertRaises(OSError): action()
            else: action()
            inventory = list(trace.calls)
            inventories[stage] = inventory
            store.close(); trace.cleanup()
            for event in inventory:
                if stage in ('abort_io', 'init_abort') and event == ('status', 'read', 1):
                    continue  # Fixed primary failure, not a secondary injection site.
                for mode in (('error', 'short') if event[1] == 'write' else ('error',)):
                    with self.subTest(stage=stage, event=event, mode=mode):
                        store, trace, action = setup(stage)
                        trace.fail = event; trace.short = mode == 'short'
                        secondary = stage == 'abort' and (event[0] == 'writer.lock' or
                            event[1] in ('write', 'fsync') or
                            event[1] in ('open', 'close') and event[2] >= 2)
                        expected = RuntimeError if secondary else OSError
                        with self.assertRaises(expected) as observed: action()
                        if stage in ('abort_io', 'init_abort') and inventory.index(event) > inventory.index(('status', 'read', 1)):
                            self.assertEqual(str(observed.exception), 'injected primary owned IO failure')
                        if secondary:
                            self.assertEqual(str(observed.exception), 'durable ledger poison or corrupt status')
                        self.assertTrue(trace.hit, 'inventory occurrence not reached')
                        acquired = getattr(store, 'lock_fd', None) is not None or store.uncertain
                        if acquired:
                            self.denied(store)
                        else:
                            self.assertFalse(store.lock.exists())
                        status = store.marker.read_bytes().decode('ascii') if store.marker.exists() else None
                        raw_state = store.state.read_bytes() if store.state.exists() else b''
                        try:
                            rows = json.loads(raw_state)['body']['rows']
                        except (ValueError, KeyError):
                            rows = None  # A real short initial write may be malformed.
                        records.append({'stage': stage, 'site': event[0], 'operation': event[1],
                                        'occurrence': event[2], 'mode': mode, 'injected': trace.hit,
                                        'owned': acquired, 'uncertain': store.uncertain,
                                        'closed': store.closed, 'lease_present': store.lock.exists(),
                                        'primary_error': str(observed.exception),
                                        'status': status, 'rows': rows,
                                        'state_sha256': hashlib.sha256(raw_state).hexdigest(),
                                        'state_bytes': len(raw_state),
                                        'cleanup_errors': store.cleanup_errors,
                                        'shared_denial': acquired})
                        trace.cleanup()
        keys = [(r['stage'],r['site'],r['operation'],r['occurrence'],r['mode']) for r in records]
        self.assertEqual(len(keys), len(set(keys)))
        destination = os.environ.get('LEDGER_MATRIX')
        if destination:
            Path(destination).write_text(json.dumps(records, indent=2)+'\n', encoding='utf-8')
            Path(destination + '.inventory.json').write_text(json.dumps(inventories, indent=2)+'\n', encoding='utf-8')
        print('MATRIX_ROWS=%d' % len(records))

    def test_foreign_lease_never_touched_preacquisition(self):
        if BASELINE: self.skipTest('architecture contract')
        store = self.store(fresh=True)
        original = {p.name: p.read_bytes() for p in self.root.iterdir()}
        trace = IOTrace()
        with self.assertRaises(FileExistsError):
            l.LocalLedgerStore(self.root, PACKET, SHA, io=trace)
        self.assertEqual(trace.calls, [('writer.lock', 'open', 1)])
        self.assertEqual({p.name: p.read_bytes() for p in self.root.iterdir()}, original)

    def test_close_validates_persisted_state_before_releasing_lease(self):
        if BASELINE: self.skipTest('architecture contract')
        for site, raw in (('status', b'?'), ('status', b'P'), ('ledger.json', b'{}')):
            with self.subTest(site=site, raw=raw):
                self.root = Path(self.temp.name) / ('close-corrupt-%d' % len(self.stores))
                store = self.store(fresh=True)
                (store.root / site).write_bytes(raw)
                with self.assertRaises(RuntimeError): store.close()
                self.denied(store)

# Reuse fixture methods, not duplicate original controls in the suite.
for _name in vars(LedgerTests):
    if _name.startswith('test_') and _name not in vars(BoundaryTests):
        setattr(BoundaryTests, _name, None)

if __name__ == '__main__': unittest.main()
