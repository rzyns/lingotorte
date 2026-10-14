"""Offline tests for scripts/qualification/browser-batch. No Docker, browser, network or listener.

Run: python -I -m unittest tests/qualification/test_browser_batch_harness.py  (BQB_SCRATCH set to a scratch dir)
"""
import importlib.util, io, json, os, pathlib, queue, sys, tempfile, threading, types, unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]

def web_ui_source(root):
    """Web UI sources after lt-939 split app.ts into appShell/views/ui modules.
    app.ts is now a re-export; harness string traces read every UI module."""
    src = root / 'apps/web/src'
    files = [src / 'app.ts', src / 'appShell.ts'] + sorted((src / 'ui').glob('*.ts')) + sorted((src / 'views').rglob('*.ts'))
    return '\n'.join(f.read_text(encoding='utf8') for f in files)

KIT = ROOT / 'scripts/qualification/browser-batch'


def load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    sys.modules[name] = m
    s.loader.exec_module(m)
    return m


live = load('bqb_tests_live', KIT / 'live-batch.py')
c = live.controller
SECRET = 'S' * 43
REVIEW = {'specApproved': True, 'qualityApproved': True, 'browserAuthorized': True, 'image': 'sha256:' + 'a' * 64}


class Base(unittest.TestCase):
    def setUp(self):
        root = pathlib.Path(os.environ.get('BQB_SCRATCH') or tempfile.gettempdir())
        root.mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(prefix='bqb-unit-', dir=root)
        self.addCleanup(self.tmp.cleanup)
        self.dir = pathlib.Path(self.tmp.name)

    def rows(self, j):
        return [json.loads(x) for x in j.path.read_text().splitlines()]


class AuthorizationTests(Base):
    def test_guard_requires_literal_true_flags_and_exact_image(self):
        img = REVIEW['image']
        for bad in ({}, {**REVIEW, 'specApproved': 'yes'}, {**REVIEW, 'qualityApproved': False}, {**REVIEW, 'browserAuthorized': 1},
                    {**REVIEW, 'image': 'sha256:' + 'b' * 64}, {**REVIEW, 'gates': ['lt-xyz']}, None):
            with self.subTest(bad=bad), self.assertRaises(PermissionError):
                c.require_authorization(bad, img)
        with self.assertRaises(PermissionError):
            c.require_authorization(REVIEW, 'lingotorte:tag')
        c.require_authorization(REVIEW, img)

    def test_run_live_refuses_before_any_process(self):
        calls = []
        orig = live.subprocess.Popen
        live.subprocess.Popen = lambda *a, **k: calls.append(a) or (_ for _ in ()).throw(AssertionError('spawned'))
        try:
            os.environ.pop('BQB_IMAGE', None)
            with self.assertRaises(PermissionError):
                live.run_live(lambda *a, **k: {}, REVIEW, new_tab=lambda u: None)
        finally:
            live.subprocess.Popen = orig
        self.assertEqual(calls, [])

    def test_offline_selfcheck_all_phases_bound(self):
        r = live.offline_selfcheck()
        self.assertEqual(r['unboundPhases'], [])
        self.assertEqual(r['unlistedPhaseMethods'], [])
        self.assertTrue(r['authorizationGuard'])
        self.assertEqual(r['phases'], 30)  # 17 batch + 13 lt-3kk journey
        self.assertEqual({b for _, b, _ in c.PHASES}, {'lt-2t4', 'lt-n31', 'lt-13i', 'lt-3kk'})
        self.assertEqual(sorted(s for _, b, s in c.PHASES if b == 'lt-2t4'), list(range(1, 11)))

    def test_incomplete_dispatch_refused(self):
        class D: cleanup = lambda self: None
        with self.assertRaises(PermissionError):
            c.run(D(), c.Journal(self.dir / 'r.jsonl'), REVIEW, REVIEW['image'])


class JournalTests(Base):
    def test_unknown_field_and_secret_refused(self):
        j = c.Journal(self.dir / 'r.jsonl', secrets=lambda: [SECRET])
        with self.assertRaises(ValueError):
            j.append('x', 'p', 's', header='x')
        with self.assertRaises(ValueError):
            j.append('x', 'p', 's', value={'k': SECRET})
        with self.assertRaises(ValueError):
            j.append('x', 'p', 's', value='Bearer x; drop')
        self.assertFalse(j.path.exists() and SECRET in j.path.read_text())

    def test_exception_message_never_retained_and_cascade(self):
        j = c.Journal(self.dir / 'r.jsonl')
        def boom(): raise RuntimeError(SECRET)
        j.phase('restore-01-pair', boom, bead='lt-2t4')
        j.phase('restore-02-seed-five-modes', lambda: None, bead='lt-2t4')
        j.phase('relink-01-import-save', lambda: None, bead='lt-n31')
        text = j.path.read_text()
        self.assertNotIn(SECRET, text)
        rows = self.rows(j)
        ends = {r['phase']: r['disposition'] for r in rows if r['type'] == 'phase-end'}
        self.assertEqual(ends, {'restore-01-pair': 'FAILED', 'restore-02-seed-five-modes': 'SKIPPED_CASCADE', 'relink-01-import-save': 'PASS'})
        self.assertEqual(rows[1]['errorTag'], 'UnexpectedException')

    def test_mutated_diagnostic_scrubbed(self):
        e = c.DiagnosticError('CommitBarrierMissed', 'DOM.setFileInputFiles', 'timeout')
        self.assertEqual(c.safe_diagnostic(e), {'errorTag': 'CommitBarrierMissed', 'diagnosticMethod': 'DOM.setFileInputFiles', 'failureCategory': 'timeout'})
        e.tag = e.method = e.category = SECRET
        self.assertNotIn(SECRET, json.dumps(c.safe_diagnostic(e)))


class RuntimeTests(Base):
    def test_docker_args_policy(self):
        args, origins, foreign = live.docker_args('lt-bqb-live-0123456789ab', REVIEW['image'], (18442, 18449), self.dir, live=True)
        joined = ' '.join(args)
        self.assertIn('--rm', args); self.assertIn('--init', args)
        self.assertEqual(args[args.index('--log-driver') + 1], 'none')
        self.assertEqual(args[args.index('--network') + 1], 'bridge')
        pubs = [args[i + 1] for i, a in enumerate(args) if a == '-p']
        self.assertEqual(pubs, ['127.0.0.1:18442:18442', '127.0.0.1:18449:18449'])
        mounts = [args[i + 1] for i, a in enumerate(args) if a == '--mount']
        self.assertEqual(len(mounts), 3)
        self.assertTrue(mounts[0].endswith('target=/kit,readonly') and mounts[1].endswith('target=/media,readonly'))
        self.assertIn(str(live.MEDIA_DIR), mounts[1])
        self.assertNotIn('-v', args); self.assertNotIn('--volume', args); self.assertNotIn('docker.sock', joined)
        self.assertIn('LINGOTORTE_ALLOW_ONLINE_PROVIDERS=false', args)
        self.assertNotIn('Bearer', joined)
        off, _, _ = live.docker_args('lt-bqb-live-0123456789ab', REVIEW['image'], (18442, 18449), self.dir, live=False)
        self.assertEqual(off[off.index('--network') + 1], 'none'); self.assertNotIn('-p', off)

    def test_ports_validation(self):
        for raw in ('18442', '18442,18442', '80,18449', 'x,y', '18442,70000'):
            os.environ['BQB_PORTS'] = raw
            with self.subTest(raw=raw), self.assertRaises(PermissionError):
                live.ports_from_env()
        os.environ['BQB_PORTS'] = '18442,18449'
        self.assertEqual(live.ports_from_env(), (18442, 18449))
        os.environ.pop('BQB_PORTS')

    def test_capability_stays_in_private_memory(self):
        lines = [json.dumps({'ready': True, 'capability': SECRET, 'origins': ['http://127.0.0.1:18442'], 'foreign': 'http://127.0.0.1:18449'}) + '\n',
                 json.dumps({'restarted': True, 'capability': 'T' * 43}) + '\n']
        class P:
            def __init__(self, *a, **k):
                self.args = a[0]; self.stdin = io.StringIO(); self.stdout = iter(lines); self.returncode = 0
        made = []
        def popen(*a, **k):
            made.append(P(*a, **k)); return made[-1]
        r = live.PrivateRuntime(REVIEW['image'], self.dir, live=False, ports=(18442, 18449), popen=popen)
        r.thread.join(timeout=2)
        self.assertEqual(r.capability(), 'T' * 43)  # latest rotated capability, memory only
        self.assertNotIn(SECRET, ' '.join(made[0].args))
        self.assertNotIn('capability', r.ready)
        v = r.q.get(timeout=2)
        self.assertNotIn('capability', v); self.assertEqual(r.capabilities(), [SECRET, 'T' * 43])

    def test_runtime_error_fixed_tag(self):
        r = object.__new__(live.PrivateRuntime)
        r.lock = threading.Lock(); r._seq = 0; r.process = types.SimpleNamespace(stdin=io.StringIO()); r.q = queue.Queue(); r.q.put({'errorClass': SECRET, 'seq': 1})
        with self.assertRaises(c.DiagnosticError) as cm:
            r.request('oracle')
        self.assertEqual(cm.exception.tag, 'PrivateRuntimeOperation'); self.assertNotIn(SECRET, str(cm.exception))

    def test_cleanup_readback_only_own_exact_name(self):
        seen = []
        def run(args, **k):
            seen.append(args); return types.SimpleNamespace(returncode=0, stdout='')
        self.assertTrue(live.own_containers_absent('lt-bqb-live-0123456789ab', run=run))
        self.assertEqual(seen[0][seen[0].index('--filter') + 1], 'name=^/lt-bqb-live-0123456789ab$')
        self.assertFalse(any('prune' in a or 'rm' == a for a in seen[0]))
        for bad in ('lt-bqb-live-', 'lt-sor-live-v2-0123456789ab', 'lt-bqb-live-0123456789abX'):
            with self.subTest(bad=bad), self.assertRaises(PermissionError):
                live.own_containers_absent(bad, run=run)
        self.assertFalse(live.own_containers_absent('lt-bqb-live-0123456789ab', run=lambda a, **k: types.SimpleNamespace(returncode=0, stdout='lt-bqb-live-0123456789ab\n')))

    def test_file_fixtures_synthetic_and_media_untouched(self):
        before = {p.name: p.read_bytes() for p in live.MEDIA_DIR.iterdir() if p.is_file()}
        f = live.file_fixtures(self.dir)
        self.assertEqual(pathlib.Path(f['original']).parent, live.MEDIA_DIR)
        self.assertEqual(pathlib.Path(f['variant']).name, pathlib.Path(f['original']).name)
        self.assertNotEqual(f['variantSha256'], f['originalSha256'])
        self.assertTrue(str(f['variant']).startswith(str(self.dir)))
        self.assertEqual(before, {p.name: p.read_bytes() for p in live.MEDIA_DIR.iterdir() if p.is_file()})


class DriverTests(Base):
    def scripted(self, replies):
        log = []
        def cdp(method, **params):
            exp, res = replies.pop(0)
            if method != exp: raise AssertionError('ProtocolMethodMismatch:' + method)
            log.append((method, params.get('session_id')))
            return res
        return cdp, log

    def test_cdp_failure_payload_not_retained(self):
        def broken(method, **kw): raise RuntimeError(SECRET)
        d = live.BatchDriver(broken, None, None)
        with self.assertRaises(c.DiagnosticError) as cm:
            d.call('Runtime.evaluate', expression=SECRET)
        self.assertNotIn(SECRET, str(cm.exception)); self.assertEqual(cm.exception.method, 'Runtime.evaluate')

    def test_set_files_uses_session_and_rejects_missing(self):
        cdp, log = self.scripted([('Target.createTarget', {'targetId': 't'}), ('Target.attachToTarget', {'sessionId': 's'}),
                                  ('DOM.enable', {}), ('DOM.getDocument', {'root': {'nodeId': 1}}), ('DOM.querySelector', {'nodeId': 7}), ('DOM.setFileInputFiles', {})])
        d = live.BatchDriver(cdp, None, None)
        d.tab('R')
        with self.assertRaises(c.DiagnosticError) as cm:
            d.set_files([str(self.dir / 'absent.webm')])
        self.assertEqual(cm.exception.tag, 'FileFixtureMissing')
        d.set_files([str(live.MEDIA_DIR / live.MEDIA_NAME)])
        self.assertEqual([m for m, s in log if m.startswith('DOM.')], ['DOM.enable', 'DOM.getDocument', 'DOM.querySelector', 'DOM.setFileInputFiles'])
        self.assertTrue(all(s == 's' for m, s in log if m.startswith('DOM.')))

    def test_cleanup_closes_only_owned_targets_and_runtime_independent(self):
        closed = []
        class R:
            def close(self): closed.append('runtime'); return {'strictPass': True, 'containerAbsent': True, 'forced': False}
        def cdp(method, **p):
            if method == 'Runtime.callFunctionOn': raise RuntimeError(SECRET)
            if method == 'Target.closeTarget': closed.append(p['targetId']); return {'success': True}
            if method == 'Target.getTargets': return {'targetInfos': [{'targetId': 'user-tab'}]}
            return {}
        j = c.Journal(self.dir / 'r.jsonl')
        d = live.BatchDriver(cdp, R(), j)
        for k in ('A', 'B'):
            t = live.Tab(); t.target = 'owned-' + k; t.session = 's' + k; t.object = 'o' + k; d.tabs[k] = t
        with self.assertRaises(AssertionError):
            d.cleanup()  # page cleanup failed -> strict failure, but targets + runtime still closed
        self.assertEqual(closed, ['owned-A', 'owned-B', 'runtime'])
        self.assertNotIn(SECRET, j.path.read_text())

    def fake_runtime(self, oracles, trace=None, barrier=None):
        class R:
            origins = ['http://127.0.0.1:18442']; foreign = 'http://127.0.0.1:18449'
            def __init__(s): s.ops = []
            def capability(s): return SECRET
            def capabilities(s): return [SECRET]
            def request(s, op, **kw):
                s.ops.append(op)
                if op == 'oracle': return oracles.pop(0) if len(oracles) > 1 else oracles[0]
                if op == 'trace-count': return {'traceCount': 0}
                if op == 'trace-since': return {'trace': list(trace or [])}
                if op == 'commit-barrier': return barrier
                if op.startswith('manifest'): return {'manifestJson': '{}'}
                return {}
        return R()

    def oracle(self, sha='x', rev=1, **kw):
        full = {k: 5 for k in ('savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'reviewEvents', 'practiceAttempts')}
        full['modes'] = sorted(live.seed_modes())
        base = {'tablesSha256': sha, 'revision': rev, 'learner': full, 'auditCounts': {}, 'providers': 0, 'commands': 0, 'anchors': 'a', 'mediaIds': [], 'trackIds': [], 'trackStatus': {}}
        base.update(kw); return base

    def driver(self, runtime, results):
        j = c.Journal(self.dir / ('r%d.jsonl' % len(list(self.dir.iterdir()))), secrets=lambda: [SECRET])
        d = live.BatchDriver(None, runtime, j)
        d.page = lambda *a, **k: None; d.tab = lambda *a, **k: None
        d.invoke = lambda op, **kw: results[op](kw) if callable(results[op]) else results[op]
        return d, j

    def test_foreign_null_zero_effect_and_browser_block_not_pass(self):
        trace = [{'path': '/api/restore/preview', 'status': 403, 'corsGranted': False, 'credentialsGrant': False, 'privateAbsent': True}, {'path': '/api/restore/commit', 'status': 403, 'corsGranted': False, 'credentialsGrant': False, 'privateAbsent': True}]
        d, j = self.driver(self.fake_runtime([self.oracle()], trace=trace), {'context-attempt': {'deadline': False}})
        live.time.sleep, orig = (lambda s: None), live.time.sleep
        try:
            d.phase_restore_09_foreign_null_origin()
            rows = self.rows(j)
            self.assertEqual(sum(r.get('disposition') == 'PASS' for r in rows if r['type'] == 'checkpoint'), 8)
            # Changed oracle -> FAILED
            d2, _ = self.driver(self.fake_runtime([self.oracle('a'), self.oracle('b')] * 8, trace=trace), {'context-attempt': {'deadline': False}})
            with self.assertRaises(AssertionError): d2.phase_restore_09_foreign_null_origin()
            # Zero wire request -> OBSERVED_BROWSER_BLOCK, never PASS
            d3, j3 = self.driver(self.fake_runtime([self.oracle()], trace=[]), {'context-attempt': {'deadline': False}})
            d3.phase_restore_09_foreign_null_origin()
            disp = {r['disposition'] for r in self.rows(j3) if r['type'] == 'checkpoint'}
            self.assertEqual(disp, {'OBSERVED_BROWSER_BLOCK'})
            # CORS granted -> FAILED
            leak = [dict(t, privateAbsent=False) for t in trace]
            d5, _ = self.driver(self.fake_runtime([self.oracle()], trace=leak), {'context-attempt': {'deadline': False}})
            with self.assertRaises(AssertionError): d5.phase_restore_09_foreign_null_origin()
            bad = [dict(t, corsGranted=True) for t in trace]
            d4, _ = self.driver(self.fake_runtime([self.oracle()], trace=bad), {'context-attempt': {'deadline': False}})
            with self.assertRaises(AssertionError): d4.phase_restore_09_foreign_null_origin()
        finally:
            live.time.sleep = orig
        self.assertNotIn(SECRET, j.path.read_text())

    def empty(self, rev):
        return self.oracle(rev=rev, learner={k: 0 for k in ('savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'reviewEvents', 'practiceAttempts')} | {'modes': []})

    def test_kill_during_commit_requires_unknown_and_single_commit(self):
        R1, R2 = 'sha256:' + '1' * 64, 'sha256:' + '2' * 64
        counts = iter([{'commits': 3}, {'commits': 4}])
        res = {'restore-idle': {'busy': False}, 'restore-preview': {}, 'restore-commit-start': {}, 'restore-settle': {'outcomeUnknown': True, 'present': False},
               'commit-count': lambda kw: next(counts), 'pair': {'pairAgain': False, 'masked': True, 'cleared': True, 'statusOk': True, 'stateOk': True}}
        barrier = {'seen': 1, 'upstreamStatus': 200, 'dropped': 1}
        orig = live.time.sleep; live.time.sleep = lambda s: None
        try:
            d, _ = self.driver(self.fake_runtime([self.empty(R1), self.oracle(rev=R2)], barrier=barrier), res)
            d.phase_restore_08_kill_during_commit_unknown()
            # Non-200 upstream is a hard failure (no vacuous pass)
            for st in (None, 500, 409):
                dx, jx = self.driver(self.fake_runtime([self.empty(R1), self.oracle(rev=R2)], barrier=dict(barrier, upstreamStatus=st)), dict(res, **{'commit-count': (lambda it: lambda kw: next(it))(iter([{'commits': 3}, {'commits': 4}]))}))
                with self.subTest(upstream=st), self.assertRaises(AssertionError): dx.phase_restore_08_kill_during_commit_unknown()
            # Revision not advanced -> fail; wrong counts -> fail; non-empty precondition (run 2: idempotent
            # merge into identical state) -> fail before commit; int (non-digest) revisions -> fail
            for olds in ([self.empty(R2), self.oracle(rev=R2)], [self.empty(R1), self.oracle(rev=R2, learner={'practiceAttempts': 5})],
                         [self.oracle(rev=R1), self.oracle(rev=R2)], [self.empty(1), self.oracle(rev=2)]):
                dy, _ = self.driver(self.fake_runtime(olds, barrier=barrier), dict(res, **{'commit-count': (lambda it: lambda kw: next(it))(iter([{'commits': 3}, {'commits': 4}]))}))
                with self.assertRaises(AssertionError): dy.phase_restore_08_kill_during_commit_unknown()
            # False success shown -> fail
            res2 = dict(res, **{'restore-settle': {'outcomeUnknown': False, 'present': True}, 'commit-count': lambda kw: {'commits': 0}})
            d2, _ = self.driver(self.fake_runtime([self.empty(R1)], barrier=barrier), res2)
            with self.assertRaises(AssertionError): d2.phase_restore_08_kill_during_commit_unknown()
            # Blind replay (2 commits) -> fail
            seq = iter([{'commits': 0}, {'commits': 2}])
            d3, _ = self.driver(self.fake_runtime([self.empty(R1)], barrier=barrier), dict(res, **{'commit-count': lambda kw: next(seq)}))
            with self.assertRaises(AssertionError): d3.phase_restore_08_kill_during_commit_unknown()
            # Barrier never reached -> fixed tag, not a pass
            d4, _ = self.driver(self.fake_runtime([self.empty(R1)], barrier={'seen': 0, 'upstreamStatus': None, 'dropped': 0}), dict(res, **{'commit-count': {'commits': 0}}))
            live.time.monotonic, om = iter([0, 100, 200, 300]).__next__, live.time.monotonic
            try:
                with self.assertRaises(c.DiagnosticError) as cm: d4.phase_restore_08_kill_during_commit_unknown()
            finally:
                live.time.monotonic = om
            self.assertEqual(cm.exception.tag, 'CommitBarrierMissed')
        finally:
            live.time.sleep = orig

    def test_transcript_dirty_refusal_requires_all_signals(self):
        good = {'approveDisabled': True, 'gateVisible': True, 'handlerRefused': True, 'dispatchReasonVisible': True, 'approveEnabledAfterRevert': True}
        res = {'pair': {'pairAgain': False}, 'transcript-open': {'cueEditor': True}, 'transcript-edit': good}
        d, j = self.driver(self.fake_runtime([self.oracle()]), res)
        d.phase_transcript_01_dirty_approve_refused()
        self.assertEqual(sum(r['type'] == 'assertion' and r['stage'].startswith('refused-') for r in self.rows(j)), 6)
        self.assertEqual(sum(r['type'] == 'assertion' and r['stage'].startswith('dispatch-guard-refused-') for r in self.rows(j)), 6)
        d3, _ = self.driver(self.fake_runtime([self.oracle()]), dict(res, **{'transcript-open': {}}))
        with self.assertRaises(AssertionError): d3.phase_transcript_01_dirty_approve_refused()
        for k in good:
            d2, _ = self.driver(self.fake_runtime([self.oracle()]), dict(res, **{'transcript-edit': dict(good, **{k: False})}))
            with self.subTest(k=k), self.assertRaises(AssertionError): d2.phase_transcript_01_dirty_approve_refused()

    def test_relink_ids_must_match(self):
        res = {'pair': {'pairAgain': False}, 'nav': {}, 'import-files': {'imported': True, 'nameConflict': False, 'secureContext': True, 'pickerAvailable': True}, 'save': {'putStatus': 200}, 'relink-surface': {'chooseAgainPresent': True}}
        o1 = self.oracle(mediaIds=['m1'], trackIds=['t1'])
        d, _ = self.driver(self.fake_runtime([o1]), res); d.set_files = lambda p: None; d.files = {'original': 'x'}
        d.phase_relink_01_import_save(); d.phase_relink_02_restart_repair_reselect()
        d2, _ = self.driver(self.fake_runtime([o1, self.oracle(mediaIds=['m1', 'm2'], trackIds=['t1'])]), res); d2.set_files = lambda p: None; d2.files = {'original': 'x'}
        d2.phase_relink_01_import_save()
        with self.assertRaises(AssertionError): d2.phase_relink_02_restart_repair_reselect()


    def test_transcript_approval_persisted_server_side(self):
        pre = self.oracle(trackIds=['bqt-track'], trackStatus={'bqt-track': 'draft'})
        mid = self.oracle(trackIds=['bqt-track', 'v2'], trackStatus={'bqt-track': 'draft', 'v2': 'draft'})
        post = self.oracle(trackIds=['bqt-track', 'v2'], trackStatus={'bqt-track': 'draft', 'v2': 'approved'})
        res = {'transcript-edit': {'approveDisabled': True}, 'transcript-apply': {'applied': True}, 'save': {'putStatus': 200}, 'transcript-approve': {'approved': True, 'nowDisabled': True}, 'pair': {'pairAgain': False}}
        def run(oracles):
            d, _ = self.driver(self.fake_runtime(list(oracles)), res); d.state['anchors0'] = 'a'
            d.phase_transcript_02_apply_inspect_approve(); d.phase_transcript_03_save_reload_anchors()
        run([pre, mid, post])
        for bad in (self.oracle(trackIds=['bqt-track', 'v2'], trackStatus={'bqt-track': 'draft', 'v2': 'draft'}),   # not persisted
                    self.oracle(trackIds=['v2'], trackStatus={'v2': 'approved'}),                                     # V1 gone
                    self.oracle(trackIds=['bqt-track', 'v2', 'v3'], trackStatus={'v2': 'draft', 'v3': 'approved'})):  # other track approved
            with self.subTest(bad=bad), self.assertRaises(AssertionError): run([pre, mid, bad])

    def test_observed_disposition_never_pass(self):
        res = {'permission-query': {'pickerAvailable': True, 'secureContext': True, 'permissionsApi': True}}
        d, j = self.driver(self.fake_runtime([self.oracle()]), res)
        j.phase('relink-04-handle-permission-observation', d.phase_relink_04_handle_permission_observation, bead='lt-n31')
        rows = self.rows(j)
        self.assertEqual([r['disposition'] for r in rows if r['type'] == 'phase-end'], ['OBSERVED'])
        self.assertTrue(all(r.get('disposition') != 'PASS' for r in rows))
        self.assertEqual(j.observed, ['relink-04-handle-permission-observation'])
        self.assertNotIn(c.OBSERVED, c.PASS_DISPOSITIONS)

    def test_construction_failure_still_cleans_up(self):
        closed = []
        class R:
            def capabilities(s): return [SECRET]
            def close(s): closed.append(1); return {'strictPass': True, 'containerAbsent': True, 'forced': False}
        def bad_driver(*a, **k): raise RuntimeError(SECRET)
        out = self.dir / 'out'; out.mkdir()
        with self.assertRaises(c.DiagnosticError) as cm:
            live.start_and_run(None, R(), out, {}, REVIEW, REVIEW['image'], driver_cls=bad_driver)
        self.assertEqual(cm.exception.tag, 'FixtureStartupFailure')
        self.assertEqual(closed, [1])
        text = (out / 'rows.jsonl').read_text()
        self.assertNotIn(SECRET, text)
        stages = [json.loads(x)['stage'] for x in text.splitlines()]
        self.assertEqual(stages, ['failed', 'readback'])
        def bad_journal(*a, **k): raise OSError('x')
        closed.clear()
        with self.assertRaises(c.DiagnosticError):
            live.start_and_run(None, R(), self.dir / 'out2', {}, REVIEW, REVIEW['image'], journal_cls=bad_journal)
        self.assertEqual(closed, [1])


class DomLabelTests(unittest.TestCase):
    def test_choice_labels_match_app_strings(self):
        import re
        app = web_ui_source(ROOT)
        dom = (KIT / 'dom-batch.mjs').read_text(encoding='utf8')
        labels = dict(re.findall(r"(service|browser): '([^']+)'", dom.split('CHOICE_LABELS', 1)[1].split('})', 1)[0]))
        self.assertEqual(labels['service'], 'Load service state (discard browser edits)')
        self.assertIn("['service', '" + labels['service'] + "']", app)
        self.assertIn("'" + labels['browser'] + "'", app)
        done = re.search(r"APPLY_DONE = '([^']+)'", dom).group(1)
        self.assertIn("'" + done + "'", app)
        for gone in ('Use service state', 'Reload from service', 'kill-before-forward', 'learner-visible'):
            self.assertNotIn(gone, dom)
        self.assertNotIn('kill-before-forward', (KIT / 'runtime-batch.mjs').read_text(encoding='utf8'))

    def test_missing_choice_button_throws_dombutton(self):
        dom = (KIT / 'dom-batch.mjs').read_text(encoding='utf8')
        pair = [l for l in dom.splitlines() if "case 'pair'" in l][0]
        self.assertIn('click(label)', pair)  # click() throws DomButton on missing/disabled button
        self.assertNotIn('if (keep', pair)
        clickdef = [l for l in dom.splitlines() if l.strip().startswith('const click =')][0]
        self.assertIn("if (!b || b.disabled) throw diagnostic('DomButton', labelKey(BUTTON_LABELS, text), b ? 'disabled' : 'missing')", clickdef)


class StaticSourceTests(unittest.TestCase):
    def test_no_capability_sinks_in_js(self):
        dom = (KIT / 'dom-batch.mjs').read_text(encoding='utf8')
        rt = (KIT / 'runtime-batch.mjs').read_text(encoding='utf8')
        for bad in ('console.', 'localStorage.setItem', 'writeFile(', 'location.hash', '?capability'):
            self.assertNotIn(bad, dom)
        for bad in ('console.', 'writeFile('):
            self.assertNotIn(bad, rt)
        self.assertNotIn('import(\'/src', dom); self.assertNotIn('ssrLoadModule', dom)
        self.assertIn('allowOnlineProviders: false', rt)
        # Capability is only emitted on stdout reply lines.
        self.assertEqual(rt.count('capability }'), 1)

    def test_production_tree_untouched_by_kit(self):
        for f in KIT.iterdir():
            if not f.is_file(): continue
            self.assertNotIn('apps/web/src', f.read_text(encoding='utf8').replace('/@fs/app/apps/local-service', ''))


class Run1CorrectionTests(Base):
    """Regression tests for the run-1 failures (restore-04/05/08 DomButton, restore-07, transcript-01, cleanup)."""

    def dom(self):
        return (KIT / 'dom-batch.mjs').read_text(encoding='utf8')

    def test_restore_confirm_refreshes_service_preview_then_acks_warnings(self):
        app = web_ui_source(ROOT)
        # Product rule the harness must satisfy: paired 'Restore now' needs a durable (service-backed) preview.
        self.assertIn("(model.localService.status !== 'disconnected' && !hasCurrentDurableRestorePreview(model))", app)
        self.assertIn("refresh.textContent = 'Refresh authoritative service preview'", app)
        model = (ROOT / 'apps/web/src/model.ts').read_text(encoding='utf8')
        self.assertIn("model.exportImport.preview = reply.preview as RestorePlan['preview']; model.exportImport.acknowledgedWarnings = [];", model)
        body = self.dom().split('const confirmRestore = async (mode) => {', 1)[1].split('\n  };', 1)[0]
        i_mode, i_refresh, i_warn, i_click = (body.index(x) for x in ("check(mode === 'replace'", 'click(BUTTON_LABELS.refreshServicePreview)', 'restore-warning', 'click(BUTTON_LABELS.restoreNow)'))
        self.assertTrue(i_mode < i_refresh < i_warn < i_click)  # mode -> refresh -> ack (after reset) -> commit
        self.assertIn("throw diagnostic('DomButton', 'restoreNow'", body)

    def test_button_and_selector_labels_exist_in_app_and_controller(self):
        import re
        app = web_ui_source(ROOT)
        dom = self.dom()
        buttons = dict(re.findall(r"(\w+): '([^']+)'", dom.split('BUTTON_LABELS = Object.freeze(', 1)[1].split('});', 1)[0]))
        sels = dict(re.findall(r"(\w+): '([^']+)'", dom.split('SELECTOR_LABELS = Object.freeze(', 1)[1].split('});', 1)[0]))
        self.assertIn('restoreNow', buttons); self.assertIn('refreshServicePreview', buttons)
        for k, v in buttons.items():
            self.assertIn(k, c.DOM_ELEMENTS)
            self.assertIn(v, app, k)
        for k in sels:
            self.assertIn(k, c.DOM_ELEMENTS)
        for k in ('choiceService', 'choiceBrowser', 'wordStart', 'wordEnd'):
            self.assertIn(k, c.DOM_ELEMENTS)

    def test_dom_diagnostic_names_element_fixed_vocabulary(self):
        tab = live.Tab(); tab.object = 'o'
        d = live.BatchDriver(lambda m, **p: {'result': {'value': {'diagnosticTag': 'DomButton', 'element': 'restoreNow', 'elementState': 'disabled'}}}, None, None)
        d.cur = tab
        j = c.Journal(self.dir / 'r.jsonl')
        j.phase('restore-04-merge-twice-idempotent', lambda: d.invoke('restore-commit', mode='merge'), bead='lt-2t4')
        end = self.rows(j)[-1]
        self.assertEqual((end['errorTag'], end['element'], end['elementState']), ('DomButton', 'restoreNow', 'disabled'))
        d.cdp = lambda m, **p: {'result': {'value': {'diagnosticTag': 'DomButton', 'element': SECRET, 'elementState': 'Bearer x'}}}
        j.phase('restore-05-empty-replace-readback', lambda: d.invoke('x'), bead='lt-2t4')
        end = self.rows(j)[-1]
        self.assertNotIn('element', end); self.assertNotIn(SECRET, j.path.read_text())
        self.assertIn("split('|')", live.INVOKE_FN)

    def test_restore_07_runs_before_restart_and_saves_without_repair(self):
        # Run 3: re-pairing tab B after the step-6 restart refreshed its revision, so the 'stale' save was not stale
        # (server correctly returned 400 for history resurrection, not 409). Step 7 must run before the restart and
        # save without re-pairing; the keep-browser re-pair is then checked separately for refused resurrection.
        order = [p for p, _, _ in c.PHASES]
        self.assertLess(order.index('restore-07-second-tab-stale-409'), order.index('restore-06-reload-restart-repair'))
        src = (KIT / 'live-batch.py').read_text(encoding='utf-8')
        body = src.split('def phase_restore_07_second_tab_stale_409', 1)[1].split('def phase_restore_08', 1)[0]
        self.assertLess(body.index("self.invoke('save')"), body.index("self.pair('B', choice='browser')"))
        self.assertIn("'keep-browser-resurrection-refused'", body)
        self.assertIn("k['putStatus'] == 400", body)

    def test_restore_07_cascades_when_04_or_05_not_pass(self):
        for failed in ('restore-04-merge-twice-idempotent', 'restore-05-empty-replace-readback'):
            j = c.Journal(self.dir / (failed + '.jsonl'))
            for p in ('restore-01-pair', 'restore-02-seed-five-modes'):
                j.phase(p, lambda: None)
            j.phase(failed, lambda: (_ for _ in ()).throw(AssertionError('x')))
            ran = []
            j.phase('restore-07-second-tab-stale-409', lambda: ran.append(1))
            self.assertEqual(ran, [])
            self.assertEqual(self.rows(j)[-1]['disposition'], 'SKIPPED_CASCADE')
        j = c.Journal(self.dir / 'ok.jsonl'); ran = []
        for p in ('restore-01-pair', 'restore-02-seed-five-modes', 'restore-04-merge-twice-idempotent', 'restore-05-empty-replace-readback'):
            j.phase(p, lambda: None)
        j.phase('restore-07-second-tab-stale-409', lambda: ran.append(1))
        self.assertEqual(ran, [1])
        self.assertIn("s['putStatus'] == 409 and s['conflict']", (KIT / 'live-batch.py').read_text(encoding='utf8'))  # oracle kept

    def test_transcript_seed_word_timing_source_kind_allowed_by_schema(self):
        import re
        schema = (ROOT / 'packages/storage/src/sqliteLocalPersistence.ts').read_text(encoding='utf8')
        allowed = re.search(r"source_kind TEXT NOT NULL CHECK \(source_kind IN \(('provider-word-timing'[^)]*)\)\)", schema).group(1)
        allowed = set(re.findall(r"'([^']+)'", allowed))
        seed = (KIT / 'seed-batch.mjs').read_text(encoding='utf8')
        wt = seed.split('makeTranscriptWordTiming(', 1)[1].split('})', 1)[0]
        self.assertIn(re.search(r"sourceKind: '([^']+)'", wt).group(1), allowed)

    def _runtime(self, replies, rc=0):
        r = object.__new__(live.PrivateRuntime)
        r.lock = threading.Lock(); r._seq = 0; r.q = queue.Queue(); r.forced = False; r.name = 'lt-bqb-live-0123456789ab'
        r._capability = SECRET; r._history = [SECRET]; r.stop_detail = None
        sent = []
        class In(io.StringIO):
            def write(s, x):
                sent.append(json.loads(x)); seq = sent[-1]['seq']
                for v in replies(sent[-1]):
                    r.q.put({**v, 'seq': seq} if 'seq' not in v else v)
                return len(x)
        r.process = types.SimpleNamespace(stdin=In(), stdout=io.StringIO(), returncode=rc, wait=lambda timeout=None: rc)
        return r, sent

    def test_stale_reply_never_satisfies_later_request(self):
        r, sent = self._runtime(lambda m: [{'seq': 0, 'errorClass': 'FixtureOperation'}, {'ok': True}])
        self.assertEqual(r.request('oracle', timeout=2), {'ok': True, 'seq': 1})

    def test_cleanup_reports_stop_detail_and_exit(self):
        orig = live.own_containers_absent; live.own_containers_absent = lambda name, run=None: True
        try:
            closures = {k: {'graceful': True, 'remainingSockets': 0} for k in ('dev', 'foreign', 'gate', 'service', 'compiler')}
            r, _ = self._runtime(lambda m: [{'stopped': True, 'strictPass': True, 'providers': 0, 'closures': closures}])
            self.assertTrue(r.close()['strictPass'])
            bad = {**closures, 'gate': {'graceful': False, 'remainingSockets': 1}}
            r, _ = self._runtime(lambda m: [{'stopped': True, 'strictPass': False, 'providers': 0, 'closures': bad}])
            v = r.close()
            self.assertFalse(v['strictPass']); self.assertEqual(v['stop']['closures']['gate'], {'graceful': False, 'remainingSockets': 1})
            self.assertEqual(v['stop']['stopStage'], 'reply')
            r, _ = self._runtime(lambda m: [{'stopped': True, 'strictPass': True, 'providers': 0, 'closures': closures}], rc=1)
            v = r.close(); self.assertFalse(v['strictPass']); self.assertEqual(v['stop']['exitCode'], 1)
            j = c.Journal(self.dir / 'c.jsonl', secrets=[SECRET]); j.append('cleanup', 'cleanup', 'readback', ok=False, value={'stop': v['stop']})
        finally:
            live.own_containers_absent = orig

    def test_runtime_stop_path_deterministic(self):
        rt = (KIT / 'runtime-batch.mjs').read_text(encoding='utf8')
        self.assertIn('closeIdleConnections', rt)
        self.assertIn('await settle(socketSets.get(label), 500)', rt)
        self.assertIn("errorStage: 'shutdown'", rt)
        self.assertIn('reply({ ...v, seq }); break;', rt)


class Run2CorrectionTests(DriverTests):
    # Reuses DriverTests fixtures (driver/oracle/fake_runtime); inherited tests also rerun here (offline, cheap).
    """Regression tests for run-2 failures: restore-04/05 DomButton previewRestore disabled, restore-08
    vacuous revision oracle, restore-10 cumulative commit count, transcript-02 Approve missing after save."""

    def dom(self):
        return (KIT / 'dom-batch.mjs').read_text(encoding='utf8')

    def test_restore_settle_ignores_always_present_conflict_banner(self):
        app = web_ui_source(ROOT)
        # Product fact: the conflict note is a '.status-banner.error' (role=status), present whenever a merge
        # conflict preview renders; only lastError uses role=alert.
        self.assertIn("conflictError.className = 'status-banner error';", app)
        self.assertIn("errorBanner.setAttribute('role', 'alert');", app)
        dom = self.dom()
        self.assertNotIn("querySelector('.status-banner.error')", dom.split('const restorePanel', 1)[1].split("case 'import-files'", 1)[0])
        self.assertIn("const restoreAlert = () => restorePanel()?.querySelector('[role=\"alert\"].status-banner.error')", dom)
        for op in ("case 'restore-commit':", "case 'restore-settle':"):
            line = [l for l in dom.splitlines() if op in l][0]
            self.assertIn('await wait(settled', line, op)

    def test_restore_idle_precedes_preview_in_04_05_08(self):
        dom = self.dom()
        self.assertIn("case 'restore-idle':", dom)
        self.assertIn("throw diagnostic('DomDeadline', 'previewRestore', 'disabled')", dom)
        ops = []
        res = {'restore-idle': lambda kw: ops.append('idle') or {'busy': False}, 'restore-preview': lambda kw: ops.append('preview') or {},
               'restore-commit': lambda kw: ops.append('commit') or {'durable': True, 'readbackAfterCommit': True, 'commits': 1, 'commitStatus': 200}}
        o = self.oracle(auditCounts={'practice_attempt': 5, 'review_event': 5, 'active_practice_attempt': 0, 'active_review_event': 0}, tableCounts={'review_event': 5})
        d, _ = self.driver(self.fake_runtime([o]), res)
        d.phase_restore_04_merge_twice_idempotent()
        self.assertEqual(ops[:2], ['idle', 'preview'])
        ops.clear()
        try: d.phase_restore_05_empty_replace_readback()
        except AssertionError: pass
        self.assertEqual(ops[:2], ['idle', 'preview'])

    def test_restore08_depends_on_state_changing_precondition(self):
        deps = c.DEPENDS['restore-08-kill-during-commit-unknown']
        self.assertIn('restore-05-empty-replace-readback', deps)
        self.assertIn('restore-06-reload-restart-repair', deps)

    def test_restore10_counts_commit_delta_and_revision(self):
        res = {'pair': {'pairAgain': True, 'pairingInputError': False, 'masked': True, 'cleared': True},
               'commit-count': {'commits': 4}, 'restore-preview': {'commitsSent': 4}}
        d, j = self.driver(self.fake_runtime([self.oracle()]), res)
        d.phase_restore_10_wrong_capability_generic()  # 4 earlier commits in tab A no longer fail the phase
        row = [r for r in self.rows(j) if r.get('stage') == 'no-commit-no-effect'][0]
        self.assertEqual(row['counts'], {'commits': 0})
        d2, _ = self.driver(self.fake_runtime([self.oracle()]), dict(res, **{'restore-preview': {'commitsSent': 5}}))
        with self.assertRaises(AssertionError): d2.phase_restore_10_wrong_capability_generic()
        d3, _ = self.driver(self.fake_runtime([self.oracle(rev='a'), self.oracle(rev='b')]), res)
        with self.assertRaises(AssertionError): d3.phase_restore_10_wrong_capability_generic()

    def test_restore03_commit_delta(self):
        res = {'export': {}, 'commit-count': {'commits': 2}, 'restore-preview': {'preview': True, 'integrity': True, 'commitsSent': 2, 'conflictChoice': True}}
        d, _ = self.driver(self.fake_runtime([self.oracle()]), res); d.phase_restore_03_export_merge_preview_no_effect()
        d2, _ = self.driver(self.fake_runtime([self.oracle()]), dict(res, **{'restore-preview': dict(res['restore-preview'], commitsSent=3)}))
        with self.assertRaises(AssertionError): d2.phase_restore_03_export_merge_preview_no_effect()

    def test_transcript_approve_returns_to_library_and_requires_message(self):
        app = web_ui_source(ROOT)
        dom = self.dom()
        done = __import__('re').search(r"APPROVED_DONE = '([^']+)'", dom).group(1)
        self.assertIn("model.transcriptLifecycle.lastMessage = '" + done + "';", app)
        body = dom.split("case 'transcript-approve': {", 1)[1].split("case 'events'", 1)[0]
        self.assertLess(body.index("nav('Library')"), body.index('a.click()'))
        self.assertIn('approved: (document.body.textContent', body)
        save = [l for l in dom.splitlines() if "case 'save':" in l][0]
        self.assertIn("nav('Settings')", save)  # why approve must navigate back


if __name__ == '__main__':
    unittest.main()
