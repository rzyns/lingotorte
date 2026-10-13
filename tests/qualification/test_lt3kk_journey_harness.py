"""Offline tests for the lt-3kk daily-driver journey gate (scripts/qualification/browser-batch).

No Docker, browser, network or listener. Run:
  BQB_SCRATCH=<scratch> python -I -B tests/qualification/test_lt3kk_journey_harness.py
"""
import ast, importlib.util, json, os, pathlib, re, subprocess, sys, tempfile, types, unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
KIT = ROOT / 'scripts/qualification/browser-batch'
APP = ROOT / 'apps/web/src'


def load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    sys.modules[name] = m
    s.loader.exec_module(m)
    return m


live = load('lt3kk_tests_live', KIT / 'live-batch.py')
c = live.controller
SECRET = 'Q' * 43
IMG = 'sha256:' + 'c' * 64
REV = 'a' * 40
REVIEW = {'specApproved': True, 'qualityApproved': True, 'browserAuthorized': True, 'image': IMG, 'gates': ['lt-3kk'], 'revision': REV}
JOURNEY = [p for p, b, _ in c.PHASES if b == 'lt-3kk']


class Base(unittest.TestCase):
    def setUp(self):
        root = pathlib.Path(os.environ.get('BQB_SCRATCH') or tempfile.gettempdir())
        root.mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(prefix='lt3kk-unit-', dir=root)
        self.addCleanup(self.tmp.cleanup)
        self.dir = pathlib.Path(self.tmp.name)

    def rows(self, j):
        return [json.loads(x) for x in j.path.read_text().splitlines()]


class PhaseBindingTests(Base):
    def test_thirteen_ordered_journey_phases_bound(self):
        self.assertEqual(len(JOURNEY), 13)
        self.assertEqual([int(p.split('-')[1]) for p in JOURNEY], list(range(1, 14)))
        for p in JOURNEY:
            self.assertTrue(callable(getattr(live.BatchDriver, c.method_name(p), None)), p)
        r = live.offline_selfcheck()
        self.assertEqual((r['unboundPhases'], r['unlistedPhaseMethods'], r['authorizationGuard'], r['browserExecuted']), ([], [], True, False))

    def test_depends_only_backwards_and_within_journey(self):
        order = {p: i for i, (p, _, _) in enumerate(c.PHASES)}
        for p in JOURNEY[1:]:
            self.assertIn(p, c.DEPENDS, p)
            for d in c.DEPENDS[p]:
                self.assertTrue(d.startswith('journey-') and order[d] < order[p], (p, d))

    def test_journey_not_in_default_selection_and_runs_alone(self):
        self.assertFalse(any(b == 'lt-3kk' for _, b in c.selected_phases({})))
        self.assertEqual([p for p, _ in c.selected_phases(REVIEW)], JOURNEY)
        with self.assertRaises(PermissionError):
            c.require_authorization({**REVIEW, 'gates': ['lt-3kk', 'lt-2t4']}, IMG)
        for bad in (None, 'HEAD', 'A' * 40, 'a' * 39, 'g' * 40):
            with self.subTest(bad=bad), self.assertRaises(PermissionError):
                c.require_authorization({**REVIEW, 'revision': bad}, IMG)
        c.require_authorization(REVIEW, IMG)

    def test_cascade_skips_dependents_without_running_them(self):
        j = c.Journal(self.dir / 'r.jsonl')
        ran = []

        class D:
            def cleanup(self):
                return None
        d = D()
        for p in JOURNEY:
            def fn(p=p):
                ran.append(p)
                if p == 'journey-03-draft-correct-apply-approve':
                    raise AssertionError('QualificationAssertion')
            setattr(d, c.method_name(p), fn)
        for p, _, _ in c.PHASES:
            if not hasattr(d, c.method_name(p)):
                setattr(d, c.method_name(p), lambda: None)
        self.assertFalse(c.run(d, j, REVIEW, IMG))
        ends = {r['phase']: r['disposition'] for r in self.rows(j) if r['type'] == 'phase-end'}
        self.assertEqual(ends['journey-03-draft-correct-apply-approve'], 'FAILED')
        for p in ('journey-04-save-word-sentence', 'journey-05-review-due-keyboard', 'journey-06-practice-two-modes-keyboard', 'journey-07-morphology-ui-narrow',
                  'journey-09-persist-reload-repair', 'journey-10-relink-restart-reselect', 'journey-11-export-restore-merge', 'journey-13-keyboard-focus'):
            self.assertEqual(ends[p], 'SKIPPED_CASCADE', p)
            self.assertNotIn(p, ran)
        # independent of the transcript step: still executed
        self.assertEqual(ends['journey-08-morphology-origin-denial'], 'PASS')
        self.assertEqual(ends['journey-12-unsupported-codec-feedback'], 'PASS')
        self.assertEqual(ran.count('journey-03-draft-correct-apply-approve'), 1)  # no hidden retry


class GuardTests(Base):
    def test_run_live_journey_refuses_unauthorized_before_process(self):
        spawned = []
        orig = live.subprocess.Popen, live.subprocess.run
        live.subprocess.Popen = lambda *a, **k: spawned.append(a)
        live.subprocess.run = lambda *a, **k: spawned.append(a)
        try:
            os.environ['BQB_IMAGE'] = IMG
            for review in ({**REVIEW, 'browserAuthorized': False}, {**REVIEW, 'revision': None}, {**REVIEW, 'gates': ['lt-3kk', 'lt-13i']}):
                with self.subTest(review=review), self.assertRaises(PermissionError):
                    live.run_live(lambda *a, **k: {}, review, new_tab=lambda u: None)
        finally:
            os.environ.pop('BQB_IMAGE', None)
            live.subprocess.Popen, live.subprocess.run = orig
        self.assertEqual(spawned, [])

    def _fake_run(self, head, porcelain=b'', image_digest=None, ls=b'apps/web/src/app.ts\0package.json\0'):
        calls = []

        def run(args, **k):
            calls.append(args[:4] if args[0] == 'docker' else args[3:5])
            if args[0] == 'git':
                sub = args[3]
                out = {'rev-parse': head.encode() + b'\n', 'status': porcelain, 'ls-files': ls}[sub]
                return types.SimpleNamespace(returncode=0, stdout=out)
            files = json.loads(k['input'])
            return types.SimpleNamespace(returncode=0, stdout=(image_digest if image_digest is not None else live.host_source_digest(files)).encode())
        return run, calls

    def test_revision_guard_accepts_exact_clean_matching_image(self):
        run, calls = self._fake_run(REV)
        r = live.revision_guard(REVIEW, IMG, run=run)
        self.assertEqual((r['revision'], r['clean'], r['files']), (REV, True, 2))
        docker = [x for x in calls if x[0] == 'docker']
        self.assertEqual(docker, [['docker', 'run', '--rm', '--network']])

    def test_revision_guard_refusals(self):
        cases = {'SourceRevisionMismatch': self._fake_run('b' * 40)[0], 'DirtyWorktree': self._fake_run(REV, porcelain=b' M apps/x.ts\n')[0],
                 'ImageSourceMismatch': self._fake_run(REV, image_digest='0' * 64)[0]}
        for tag, run in cases.items():
            with self.subTest(tag=tag):
                with self.assertRaises(PermissionError) as cm:
                    live.revision_guard(REVIEW, IMG, run=run)
                self.assertEqual(str(cm.exception), tag)
        with self.assertRaises(PermissionError):
            live.revision_guard({**REVIEW, 'revision': None}, IMG, run=self._fake_run(REV)[0])

    def test_image_hash_runs_offline_without_mounts(self):
        src = (KIT / 'live-batch.py').read_text(encoding='utf8')
        line = next(l for l in src.splitlines() if "'docker', 'run', '--rm', '--network', 'none'" in l)
        self.assertNotIn('--mount', line)
        self.assertNotIn('-v', line.split())

    def test_journey_files_build_undecodable_locally(self):
        f = live.journey_files(self.dir)
        bad = pathlib.Path(f['undecodable'])
        self.assertTrue(bad.is_file() and bad.suffix == '.webm' and bad.stat().st_size == 64)
        self.assertFalse(bad.read_bytes().startswith(b'\x1a\x45\xdf\xa3'))  # not an EBML/WebM header
        for k in ('media', 'target', 'native'):
            self.assertTrue(pathlib.Path(f[k]).is_file())
        self.assertEqual(live.journey_files(self.dir)['undecodableSha256'], f['undecodableSha256'])


class JournalSafetyTests(Base):
    def test_capability_never_journalled_and_new_vocabulary_safe(self):
        j = c.Journal(self.dir / 'r.jsonl', secrets=lambda: [SECRET])
        with self.assertRaises(ValueError):
            j.append('checkpoint', 'journey-01-pair', 'x', value={'cap': SECRET})
        with self.assertRaises(ValueError):
            j.append('checkpoint', 'journey-01-pair', 'x', freeText='Mamy zamek')
        with self.assertRaises(ValueError):
            j.append('checkpoint', 'journey-04-save-word-sentence', 'x', value={'t': 'Cześć, to jest'})  # non-ascii free text refused
        for k in ('importGatedDraft', 'analyseWords', 'rateGood', 'practiceChoice', 'video'):
            self.assertIn(k, c.DOM_ELEMENTS)
        for m in ('Input.dispatchKeyEvent', 'Input.insertText', 'Emulation.setDeviceMetricsOverride', 'Emulation.clearDeviceMetricsOverride'):
            self.assertIn(m, c.CDP_METHODS)
        e = c.safe_diagnostic(c.DiagnosticError('FocusDeadline', element='rateGood', element_state='none'))
        self.assertEqual((e['errorTag'], e['element']), ('FocusDeadline', 'rateGood'))

    def test_driver_never_journals_typed_answer_or_cue_text(self):
        tree = ast.parse((KIT / 'live-batch.py').read_text(encoding='utf8'))
        driver = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'BatchDriver')
        checked = 0
        for fn in driver.body:
            if not (isinstance(fn, ast.FunctionDef) and (fn.name.startswith('phase_journey_') or fn.name == 'note_focus')):
                continue
            for call in ast.walk(fn):
                if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr in ('ok', 'append', 'assert_row'):
                    checked += 1
                    # Only keyword values and the stage name are written; positional conditions become a bool.
                    seg = ' '.join(ast.unparse(k.value) for k in call.keywords) + ' ' + (ast.unparse(call.args[1]) if len(call.args) > 1 else '')
                    for bad in ("['text']", 'JOURNEY_CUE', 'capability', 'JOURNEY_WORDS[', 'value=w', '=w,', '=w)'):
                        self.assertNotIn(bad, seg, (fn.name, bad))
        self.assertGreater(checked, 30)

    def test_observed_rows_never_upgrade_to_pass(self):
        src = (KIT / 'live-batch.py').read_text(encoding='utf8')
        body = src[src.index('def phase_journey_01_pair'):src.index('def cleanup(self)')]
        self.assertNotIn("disposition='PASS'", body)
        self.assertIn('OBSERVED_BROWSER_BLOCK', body)

    def test_cleanup_unchanged_strict(self):
        src = (KIT / 'live-batch.py').read_text(encoding='utf8')
        self.assertIn("ok = not issues and clean.get('strictPass') is True", src)
        self.assertIn("'--filter', 'name=^/' + name + '$'", src)
        self.assertNotRegex(src, r"['\"]prune['\"]")  # never a docker prune argv


class SourceTraceTests(unittest.TestCase):
    """Every exact UI string/selector the journey relies on exists in the app sources at this revision."""

    def app(self):
        return '\n'.join((APP / f).read_text(encoding='utf8') for f in ('app.ts', 'model.ts', 'morphologyPanel.ts'))

    def test_journey_strings_exist_in_app(self):
        js = (KIT / 'dom-journey.mjs').read_text(encoding='utf8')
        block = js[js.index('export const J = Object.freeze({'):js.index('});')]
        values = re.findall(r":\s*'((?:[^'\\]|\\.)*)'", block)
        app = self.app()
        self.assertGreaterEqual(len(values), 12)
        for v in values:
            needle = v.replace('\\', '')
            if needle.startswith('input[name='):
                needle = needle.split('"')[1]
            with self.subTest(v=v):
                self.assertIn(needle, app)
        for sel in ("'local-target-subtitle-file'", "'local-native-subtitle-file'", "'practice-mode'", "'practice-answer'", "'morphology-status'",
                    "'practice-choice", "'Rate ${rating}'", "'analyse-words'", "'review-buttons'", "'saved-occurrence-preview'", "'Create corrected transcript version'"):
            with self.subTest(sel=sel):
                self.assertTrue(sel.strip("'") in app or sel.replace("'", '`') in app, sel)

    def test_no_production_import_or_hook(self):
        js = (KIT / 'dom-journey.mjs').read_text(encoding='utf8')
        self.assertNotRegex(js, r"import\s.*from\s+['\"]")
        self.assertNotIn('apps/web/src', js)
        self.assertNotIn('__lingotorte', js)

    def test_g2_g3_fixes_present(self):
        """G2/G3 were fixed by lt-r4k.1/.2 before the live run; journey-12/13 now assert the fixed behaviour."""
        app = (APP / 'app.ts').read_text(encoding='utf8')
        stage = app[app.index('function renderVideoStage'):app.index('function renderEmptyVideoPlaceholder')]
        self.assertIn("addEventListener('error'", stage)
        self.assertIn('media-error-alert', stage)
        self.assertIn('export function requestFocusAfterRender', app)


if __name__ == '__main__':
    unittest.main()
