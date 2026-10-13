"""Browser qualification batch live adapter (lt-2t4 restore, lt-n31 relink, lt-13i transcript approval).

Successor of scripts/qualification/lt-sor/live-controller-v2.py (PrivateRuntime/LiveDriver pattern).
* Importing this module starts nothing. The CLI is OFFLINE ONLY (self-checks); there is no flag that
  launches Docker or a browser.
* run_live(cdp, review, new_tab=...) is the only live entrypoint. It must be called inside the parent's
  browser_exec memory, never from a terminal: the fixture's stdout pipe privately carries the pairing
  capability and must never reach tool output.
* Nothing returned/written may contain the capability, CDP payloads, expressions or exception text.
"""
import base64, hashlib, importlib.util, json, os, pathlib, queue, subprocess, threading, time, uuid

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[2]
MEDIA_DIR = REPO / 'fixtures' / 'media'
MEDIA_NAME = 'synthetic-polish-dialogue.webm'
ARTIFACTS = ('live-batch.py', 'controller.py', 'runtime-batch.mjs', 'dom-batch.mjs', 'seed-batch.mjs')
CONTAINER_PREFIX = 'lt-bqb-live-'
DEFAULT_PORTS = (18442, 18449)  # dev origin, owned foreign origin. Service/gate stay unpublished.


def _load(name, file):
    s = importlib.util.spec_from_file_location(name, ROOT / file)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


controller = _load('bqb_controller', 'controller.py')
DE = controller.DiagnosticError


def seed_modes():
    return ['typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def ports_from_env():
    raw = os.environ.get('BQB_PORTS', ','.join(map(str, DEFAULT_PORTS)))
    try:
        ports = tuple(int(x) for x in raw.split(','))
    except ValueError:
        raise PermissionError('OwnedPortSelectionInvalid') from None
    if len(ports) != 2 or len(set(ports)) != 2 or any(p < 1024 or p > 65535 for p in ports):
        raise PermissionError('OwnedPortSelectionInvalid')
    return ports


def scratch_root():
    base = os.environ.get('BQB_SCRATCH')
    if not base:
        raise PermissionError('ExplicitScratchRequired')
    p = pathlib.Path(base) / 'browser-batch'
    p.mkdir(parents=True, exist_ok=True)
    return p


def docker_args(name, image, ports, out, live):
    """Exact container argv. Mounts: kit read-only, fixtures/media read-only, owned /out only.
    No volumes, no other host mounts, providers off, log-driver none, explicit loopback publications."""
    dev, foreign = ports
    origins = [f'http://127.0.0.1:{dev}']
    args = ['docker', 'run', '--rm', '--init', '--log-driver', 'none', '--name', name, '-i']
    if live:
        args += ['--network', 'bridge', '-p', f'127.0.0.1:{dev}:18442', '-p', f'127.0.0.1:{foreign}:18449']
    else:
        args += ['--network', 'none']
    args += ['--mount', f'type=bind,source={ROOT},target=/kit,readonly',
             '--mount', f'type=bind,source={MEDIA_DIR},target=/media,readonly',
             '--mount', f'type=bind,source={out},target=/out',
             '-e', 'QUALIFICATION_ORIGINS=' + json.dumps(origins),
             '-e', f'QUALIFICATION_FOREIGN=http://127.0.0.1:{foreign}',
             '-e', 'LINGOTORTE_ALLOW_ONLINE_PROVIDERS=false',
             image, 'node', '/kit/runtime-batch.mjs']
    return args, origins, f'http://127.0.0.1:{foreign}'


def binding(image):
    if not isinstance(image, str) or not image.startswith('sha256:') or len(image) != 71:
        raise PermissionError('ExplicitImmutableBindingRequired')
    media = sorted(p for p in MEDIA_DIR.iterdir() if p.is_file())
    return {'image': image, 'artifacts': {f: sha((ROOT / f).read_bytes()) for f in ARTIFACTS},
            'media': {p.name: sha(p.read_bytes()) for p in media}}


def file_fixtures(out):
    """Host paths for DOM.setFileInputFiles. The original synthetic fixture is used in place (read-only);
    a same-name/different-content variant and a synthetic SRT are created only inside owned scratch."""
    original = MEDIA_DIR / MEDIA_NAME
    if not original.is_file():
        raise DE('FileFixtureMissing')
    variant_dir = out / 'variant'
    variant_dir.mkdir(exist_ok=True)
    variant = variant_dir / MEDIA_NAME
    variant.write_bytes(original.read_bytes() + b'\x00' * 16)  # different fingerprint, same name
    srt = out / 'bqb-target.srt'
    srt.write_text('1\n00:00:00,000 --> 00:00:01,000\nSynthetic relink cue\n', encoding='utf8')
    return {'original': str(original), 'variant': str(variant), 'srt': str(srt),
            'originalSha256': sha(original.read_bytes()), 'variantSha256': sha(variant.read_bytes())}


class PrivateRuntime:
    def __init__(self, image, out, live=False, ports=None, popen=subprocess.Popen):
        self.name = CONTAINER_PREFIX + uuid.uuid4().hex[:12]
        self._capability = ''
        self._history = []
        self.q = queue.Queue()
        self.lock = threading.Lock()
        self.forced = False
        self._seq = 0
        self.stop_detail = None
        args, self.origins, self.foreign = docker_args(self.name, image, ports or ports_from_env(), out, live)
        self.process = popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.thread = threading.Thread(target=self._reader, daemon=True)
        self.thread.start()
        try:
            self.ready = self.q.get(timeout=90)
            if not self.ready.get('ready') or len(self._capability) != 43:
                raise DE('FixtureNotReady')
        except Exception:
            self.close()
            raise DE('FixtureStartupFailure') from None

    def _reader(self):
        for line in self.process.stdout:
            try:
                v = json.loads(line)
            except ValueError:
                self.q.put({'errorClass': 'InvalidPrivateIPC'})
                continue
            if 'capability' in v:
                cap = v.pop('capability')
                if isinstance(cap, str) and cap:
                    self._capability = cap
                    if cap not in self._history:
                        self._history.append(cap)
            self.q.put(v)

    def capability(self):
        return self._capability

    def capabilities(self):
        return list(self._history)

    def request(self, op, timeout=40, **values):
        with self.lock:
            self._seq += 1
            seq = self._seq
            self.process.stdin.write(json.dumps({'op': op, **values, 'seq': seq}) + '\n')
            self.process.stdin.flush()
            end = time.monotonic() + timeout
            while True:
                try:
                    v = self.q.get(timeout=max(0.01, end - time.monotonic()))
                except queue.Empty:
                    raise DE('PrivateRuntimeTimeout') from None
                if v.get('seq') == seq:
                    break
                if time.monotonic() >= end:
                    raise DE('PrivateRuntimeSequence')
                # stale reply of an earlier timed-out request: dropped, never matched to this one
            if v.get('errorClass'):
                raise DE('PrivateRuntimeOperation')
            return v

    def close(self):
        clean = {'strictPass': False}
        stop_stage = 'reply'
        try:
            clean = self.request('stop', timeout=15)
        except DE as e:
            stop_stage = e.tag
        except Exception:
            stop_stage = 'transport'
        try:
            self.process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            self.forced = True
            subprocess.run(['docker', 'stop', '--time', '2', self.name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=12)
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        absent = own_containers_absent(self.name)
        self._capability = ''
        self._history.clear()
        for s in (self.process.stdin, self.process.stdout):
            try:
                s.close()
            except Exception:
                pass
        closures = clean.get('closures') if isinstance(clean.get('closures'), dict) else {}
        self.stop_detail = {
            'stopStage': stop_stage, 'stopStrict': clean.get('strictPass') is True, 'exitCode': self.process.returncode,
            'providers': clean.get('providers') if isinstance(clean.get('providers'), int) else None,
            'closures': {k: {'graceful': v.get('graceful') is True, 'remainingSockets': v.get('remainingSockets') if isinstance(v.get('remainingSockets'), int) else None}
                         for k, v in closures.items() if k in ('dev', 'foreign', 'gate', 'service', 'compiler') and isinstance(v, dict)}}
        return {'strictPass': clean.get('strictPass') is True and absent and not self.forced and self.process.returncode == 0,
                'containerAbsent': absent, 'forced': self.forced, 'stop': self.stop_detail}


def own_containers_absent(name, run=subprocess.run):
    """Strict cleanup readback of ONLY this run's container (exact name; never a prefix sweep or prune)."""
    if not name.startswith(CONTAINER_PREFIX) or len(name) != len(CONTAINER_PREFIX) + 12:
        raise PermissionError('ForeignContainerName')
    r = run(['docker', 'ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=12)
    return r.returncode == 0 and r.stdout.strip() == ''


# Page-side error -> fixed vocabulary. dom-batch.mjs throws 'Tag|elementKey|state'; anything else is unexpected.
INVOKE_FN = ("async function(op,arg){try{return await this.invoke(op,arg);}catch(e){"
             "const p=String(e?.message??'').split('|');"
             "const tag=['DomDeadline','DomButton','DomSelector'].includes(p[0])?p[0]:'UnexpectedException';"
             "return tag==='UnexpectedException'?{diagnosticTag:tag}:{diagnosticTag:tag,element:p[1]??'none',elementState:p[2]??'none'};}}")


class Tab:
    def __init__(self):
        self.target = self.session = self.object = self.origin = None


class BatchDriver:
    def __init__(self, cdp, runtime, journal, files=None):
        self.cdp = cdp
        self.runtime = runtime
        self.journal = journal
        self.files = files or {}
        self.tabs = {}
        self.cur = None
        self.state = {}

    # ---- CDP plumbing (lt-sor LiveDriver.call/page/invoke, multi-tab) ----
    def call(self, method, tab=None, **params):
        tab = tab or self.cur
        session = tab.session if tab and not method.startswith('Target.') and not method.startswith('Browser.') else None
        try:
            r = self.cdp(method, **({'session_id': session} if session else {}), **params)
        except Exception as e:
            raise DE('PrivateBrowserOperation', method, 'timeout' if isinstance(e, TimeoutError) else 'transport') from None
        if not isinstance(r, dict) or r.get('error'):
            raise DE('CDPRejected', method, 'rejected')
        if r.get('exceptionDetails'):
            tag = r['exceptionDetails'].get('exception', {}).get('value')
            raise DE(tag if tag in controller.DIAGNOSTIC_TAGS else 'PrivateBrowserOperation', method, 'javascript')
        return r

    def tab(self, key):
        if key not in self.tabs:
            t = Tab()
            t.target = self.call('Target.createTarget', url='about:blank', background=True)['targetId']
            t.session = self.call('Target.attachToTarget', targetId=t.target, flatten=True)['sessionId']
            self.tabs[key] = t
        self.cur = self.tabs[key]
        return self.cur

    def page(self, key, origin, reload=False):
        t = self.tab(key)
        if t.origin == origin and t.object and not reload:
            return
        if t.object:
            try:
                self.invoke('cleanup')
            except Exception:
                pass
            self.call('Runtime.releaseObject', objectId=t.object)
            t.object = None
        self.call('Page.navigate', url=origin + '/')
        end = time.monotonic() + 12
        while time.monotonic() < end:
            try:
                r = self.call('Runtime.evaluate', expression='({origin:location.origin,ready:document.readyState})', returnByValue=True)['result'].get('value', {})
                if r.get('origin') == origin and r.get('ready') == 'complete':
                    break
            except DE:
                pass
            time.sleep(.03)
        else:
            raise DE('BrowserNavigationDeadline')
        uri = 'data:text/javascript;base64,' + base64.b64encode((ROOT / 'dom-batch.mjs').read_bytes()).decode()
        expr = '(async()=>{const m=await import(' + json.dumps(uri) + ');return await m.installBatchDriver(' + str(origin != self.runtime.foreign).lower() + ');})()'
        t.object = self.call('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=False).get('result', {}).get('objectId')
        if not t.object:
            raise DE('DOMBridgeObjectMissing')
        t.origin = origin

    # Page-side deadlines for restore-commit sum to ~19 s (refresh 8 + enable 3 + commit 8); keep CDP above them
    # so slow paths surface as precise DomDeadline/DomButton tags rather than a transport timeout.
    OP_TIMEOUTS = {'restore-commit': 35}

    def invoke(self, op, **arg):
        fn = INVOKE_FN
        r = self.call('Runtime.callFunctionOn', objectId=self.cur.object, functionDeclaration=fn, arguments=[{'value': op}, {'value': arg}], awaitPromise=True, returnByValue=True, _response_timeout=self.OP_TIMEOUTS.get(op, 20))
        v = r.get('result', {}).get('value')
        if not isinstance(v, dict):
            raise DE('DOMResultType')
        if 'diagnosticTag' in v:
            raise DE(v['diagnosticTag'], 'Runtime.callFunctionOn', 'javascript', v.get('element'), v.get('elementState'))
        return v

    def set_files(self, paths):
        """Supply host fixture files to #local-media-file through CDP (no native chooser dialog)."""
        for p in paths:
            if not pathlib.Path(p).is_file():
                raise DE('FileFixtureMissing')
        self.call('DOM.enable')
        root = self.call('DOM.getDocument', depth=1)['root']['nodeId']
        node = self.call('DOM.querySelector', nodeId=root, selector='#local-media-file').get('nodeId')
        if not node:
            raise DE('DomSelector')
        self.call('DOM.setFileInputFiles', nodeId=node, files=list(paths))

    # ---- oracles ----
    def oracle(self):
        v = self.runtime.request('oracle')
        return v

    def ok(self, phase, stage, cond, **safe):
        self.journal.assert_row(phase, stage, cond, **safe)

    def dev(self):
        return self.runtime.origins[0]

    def pair(self, key='A', choice='browser', capability=None):
        self.page(key, self.dev())
        cap = self.runtime.capability() if capability is None else capability
        return self.invoke('pair', origin=self.dev(), capability=cap, choice=choice)

    # ---- lt-2t4 restore ----
    def phase_restore_01_pair(self):
        P = 'restore-01-pair'
        v = self.pair('A', choice='service')
        o = self.oracle()
        self.ok(P, 'masked-cleared-paired', v['masked'] and v['cleared'] and not v['pairAgain'] and v['statusOk'] and v['stateOk'], masked=v['masked'], cleared=v['cleared'])
        self.ok(P, 'providers-off', o['providers'] == 0 and o['commands'] == 0, oracle={'providers': o['providers'], 'revision': o['revision']})
        self.state['R0'] = o['revision']

    def phase_restore_02_seed_five_modes(self):
        P = 'restore-02-seed-five-modes'
        self.runtime.request('seed-learner')
        self.page('A', self.dev(), reload=True)
        self.pair('A', choice='service')
        o = self.oracle()
        self.state['O1'] = o
        self.ok(P, 'five-modes-seeded', o['learner']['modes'] == sorted(['typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder']) and o['learner']['practiceAttempts'] == 5,
                oracle={'revision': o['revision'], 'tablesSha256': o['tablesSha256'], 'counts': o['learner']})
        # Stale holder for step 7: tab B pairs now and keeps the pre-restore state in memory.
        b = self.pair('B', choice='service')
        self.invoke('autosave', enabled=False)
        self.ok(P, 'stale-tab-held', not b['pairAgain'])
        self.tab('A')

    def phase_restore_03_export_merge_preview_no_effect(self):
        P = 'restore-03-export-merge-preview-no-effect'
        self.tab('A')
        self.invoke('export')
        manifest = self.runtime.request('manifest-seeded')['manifestJson']
        before = self.oracle()
        base = self.invoke('commit-count')['commits']
        v = self.invoke('restore-preview', manifestJson=manifest)
        after = self.oracle()
        self.ok(P, 'preview-shown-no-commit', v['preview'] and v['integrity'] and v['commitsSent'] - base == 0, value={'conflictChoice': v['conflictChoice']})
        self.ok(P, 'server-unchanged', before['tablesSha256'] == after['tablesSha256'] and before['revision'] == after['revision'], oracle={'tablesSha256': after['tablesSha256'], 'revision': after['revision']})
        self.state['manifest'] = True

    def phase_restore_04_merge_twice_idempotent(self):
        P = 'restore-04-merge-twice-idempotent'
        manifest = self.runtime.request('manifest-seeded')['manifestJson']
        # Precondition (not a workaround): no restore may be in flight. A stuck-busy app fails here as
        # DomDeadline|previewRestore|disabled after a finite wait, distinct from a DomButton click refusal.
        self.invoke('restore-idle')
        results = []
        for i in range(2):
            self.invoke('restore-preview', manifestJson=manifest)
            r = self.invoke('restore-commit', mode='merge')
            results.append((r, self.oracle()))
        (r1, o1), (r2, o2) = results
        self.ok(P, 'both-commits-durable-readback', r1['durable'] and r2['durable'] and r1['readbackAfterCommit'] and r2['readbackAfterCommit'] and r1['commits'] == 1 and r2['commits'] == 1, value={'status1': r1['commitStatus'], 'status2': r2['commitStatus']})
        self.ok(P, 'second-merge-no-effect', o1['learner'] == o2['learner'] and o1['auditCounts'] == o2['auditCounts'] and 'review_event' in o2['tableCounts'] and o2['tableCounts']['review_event'] == o1['tableCounts']['review_event'], oracle={'counts': o2['learner'], 'audit': o2['auditCounts']})

    def phase_restore_05_empty_replace_readback(self):
        P = 'restore-05-empty-replace-readback'
        manifest = self.runtime.request('manifest-empty')['manifestJson']
        pre = self.oracle()
        self.invoke('restore-idle')
        self.invoke('restore-preview', manifestJson=manifest)
        r = self.invoke('restore-commit', mode='replace')
        o = self.oracle()
        self.ok(P, 'success-only-after-commit-and-readback', r['durable'] and r['commitStatus'] == 200 and r['readbackAfterCommit'], value={'status': r['commitStatus']})
        active_empty = all(o['learner'][k] == 0 for k in ('savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'reviewEvents', 'practiceAttempts'))
        a, b = o['auditCounts'], pre['auditCounts']
        audit_retained = a['practice_attempt'] >= b['practice_attempt'] >= 5 and a['review_event'] >= b['review_event'] >= 5 and a['active_practice_attempt'] == 0 and a['active_review_event'] == 0
        self.ok(P, 'active-empty-audit-retained', active_empty and audit_retained, oracle={'counts': o['learner'], 'audit': o['auditCounts'], 'revision': o['revision']})
        self.state['R2'] = o['revision']
        self.state['O2'] = o

    def phase_restore_06_reload_restart_repair(self):
        P = 'restore-06-reload-restart-repair'
        self.page('A', self.dev(), reload=True)
        self.runtime.request('restart')
        v = self.pair('A', choice='service')
        o = self.oracle()
        self.ok(P, 'repaired-after-rotation', not v['pairAgain'] and len(self.runtime.capabilities()) >= 2)
        self.ok(P, 'empty-active-audit-revision', o['revision'] == self.state['R2'] and o['learner'] == self.state['O2']['learner'] and o['auditCounts'] == self.state['O2']['auditCounts'], oracle={'revision': o['revision']})

    def phase_restore_07_second_tab_stale_409(self):
        P = 'restore-07-second-tab-stale-409'
        before = self.oracle()
        self.pair('B', choice='browser')  # capability rotated: re-pair, keep stale browser work
        s = self.invoke('save')
        after = self.oracle()
        self.ok(P, 'stale-save-409-visible', s['putStatus'] == 409 and s['conflict'], status=s['putStatus'])
        self.ok(P, 'no-resurrection', after['learner'] == before['learner'] and after['revision'] == before['revision'] and after['tablesSha256'] == before['tablesSha256'], oracle={'revision': after['revision']})
        self.tab('A')

    def phase_restore_08_kill_during_commit_unknown(self):
        P = 'restore-08-kill-during-commit-unknown'
        self.tab('A')
        before = self.oracle()
        # Self-contained: the merge must change server state, or 'revision advanced' is vacuous. restore-05
        # (DEPENDS) left the active learner set empty; prove that here instead of assuming it.
        empty = all(before['learner'].get(k) == 0 for k in ('savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'reviewEvents', 'practiceAttempts'))
        self.ok(P, 'precondition-active-empty', empty, oracle={'revision': before['revision'], 'counts': before['learner']})
        manifest = self.runtime.request('manifest-seeded')['manifestJson']
        self.invoke('restore-idle')
        self.invoke('restore-preview', manifestJson=manifest)
        base_commits = self.invoke('commit-count')['commits']
        self.runtime.request('commit-mode', mode='drop-ack-after-commit')
        self.invoke('restore-commit-start', mode='merge')
        barrier = self.runtime.request('commit-barrier')
        if barrier['seen'] != 1:
            # Barrier is polled after the start op; the fixture kills the service only after upstream commit.
            end = time.monotonic() + 6
            while time.monotonic() < end and self.runtime.request('commit-barrier')['seen'] != 1:
                time.sleep(.05)
            barrier = self.runtime.request('commit-barrier')
        if barrier['seen'] != 1:
            raise DE('CommitBarrierMissed')
        s = self.invoke('restore-settle')
        time.sleep(1.0)
        n = self.invoke('commit-count')
        self.ok(P, 'outcome-unknown-not-success', s['outcomeUnknown'] and not s['present'], value={'upstreamStatus': barrier['upstreamStatus']})
        self.ok(P, 'no-blind-replay', n['commits'] - base_commits == 1 and barrier['dropped'] == 1, counts={'commits': n['commits'] - base_commits})
        self.runtime.request('start-service')
        v = self.pair('A', choice='service')
        o = self.oracle()
        # The barrier proves the upstream commit happened: a non-200 upstream is a hard failure, never vacuous.
        self.ok(P, 'upstream-committed-200', barrier['upstreamStatus'] == 200, value={'upstreamStatus': barrier['upstreamStatus']})
        # Seeded merge manifest = 5 linked chains (one per mode): post-commit active state carries exactly them.
        expected = {'savedItems': 5, 'savedOccurrences': 5, 'reviewCards': 5, 'reviewCardStates': 5, 'reviewEvents': 5, 'practiceAttempts': 5}
        counts_ok = all(o['learner'].get(k) == n for k, n in expected.items()) and o['learner'].get('modes') == sorted(seed_modes())
        # Revisions are opaque 'sha256:<hex>' content digests (run 2 journal), not counters: 'advanced' == differs.
        rev_ok = isinstance(o['revision'], str) and isinstance(before['revision'], str) and o['revision'] != before['revision']
        self.ok(P, 'readback-reconciles', not v['pairAgain'] and rev_ok and counts_ok, oracle={'revision': o['revision'], 'before': before['revision'], 'counts': o['learner']})

    def phase_restore_09_foreign_null_origin(self):
        P = 'restore-09-foreign-null-origin'
        body = json.dumps({'manifest': {}, 'mode': 'merge', 'expectedRevision': 0})
        rows = []
        for fault in ('foreign', 'null'):
            for channel in ('fetch', 'form'):
                for path in ('/api/restore/preview', '/api/restore/commit'):
                    self.page('F', self.runtime.foreign)
                    before = self.oracle()
                    idx = self.runtime.request('trace-count')['traceCount']
                    b = self.invoke('context-attempt', id=f'{fault}-{channel}-{path}', fault=fault, channel=channel, origin=self.dev(), path=path, body=body, auth=self.runtime.capability() if channel == 'fetch' else None)
                    time.sleep(.3)
                    trace = [t for t in self.runtime.request('trace-since', index=idx)['trace'] if t['path'] == path]
                    after = self.oracle()
                    unchanged = before['tablesSha256'] == after['tablesSha256'] and before['revision'] == after['revision']
                    denied = bool(trace) and all(t['status'] in (401, 403) and not t['corsGranted'] and not t['credentialsGrant'] and t.get('privateAbsent') is True for t in trace)
                    # A browser-side block with zero wire requests is recorded as OBSERVED_BROWSER_BLOCK, never PASS.
                    disp = 'PASS' if denied and unchanged else ('OBSERVED_BROWSER_BLOCK' if not trace and unchanged and not b['deadline'] else 'FAILED')
                    rows.append(disp)
                    self.journal.append('checkpoint', P, f'{fault}-{channel}{path.replace("/", "-")}', ok=disp != 'FAILED', disposition=disp, fault=fault, path=path, status=trace[-1]['status'] if trace else None, oracle={'unchanged': unchanged})
        self.tab('A')
        self.ok(P, 'all-attempts-zero-effect', 'FAILED' not in rows, counts={'PASS': rows.count('PASS'), 'OBSERVED_BROWSER_BLOCK': rows.count('OBSERVED_BROWSER_BLOCK')})

    def phase_restore_10_wrong_capability_generic(self):
        P = 'restore-10-wrong-capability-generic'
        before = self.oracle()
        manifest = self.runtime.request('manifest-seeded')['manifestJson']
        # Fresh page: no restore in flight from restore-08, so this phase tests only the wrong-capability path
        # (restore-08's own readback oracle still catches a stuck outcome-unknown state).
        self.page('A', self.dev(), reload=True)
        v = self.pair('A', capability='A' * 43)
        self.page('A', self.dev())
        # Tab A's request observer is cumulative since page install (restore-04/05/08 commits): count a delta.
        base = self.invoke('commit-count')['commits']
        p = self.invoke('restore-preview', manifestJson=manifest)
        after = self.oracle()
        generic = v['pairAgain'] or v['pairingInputError']
        unchanged = before['tablesSha256'] == after['tablesSha256'] and before['revision'] == after['revision']
        self.ok(P, 'generic-pairing-error', generic and v['cleared'], masked=v['masked'], cleared=v['cleared'])
        self.ok(P, 'no-commit-no-effect', p['commitsSent'] - base == 0 and unchanged, oracle={'unchanged': unchanged}, counts={'commits': p['commitsSent'] - base})
        self.pair('A', choice='service')

    # ---- lt-n31 relink ----
    def phase_relink_01_import_save(self):
        P = 'relink-01-import-save'
        self.pair('R', choice='browser')
        self.invoke('nav', view='Library')
        self.set_files([self.files['original']])
        v = self.invoke('import-files')
        s = self.invoke('save')
        o = self.oracle()
        self.state['relink'] = {'media': o['mediaIds'], 'tracks': o['trackIds'], 'anchors': o['anchors']}
        self.ok(P, 'imported-and-saved', v['imported'] and s['putStatus'] == 200 and len(o['mediaIds']) >= 1, value={'secureContext': v['secureContext'], 'pickerAvailable': v['pickerAvailable']})

    def phase_relink_02_restart_repair_reselect(self):
        P = 'relink-02-restart-repair-reselect'
        self.runtime.request('restart')
        self.page('R', self.dev(), reload=True)
        self.pair('R', choice='service')
        surface = self.invoke('relink-surface')
        self.invoke('nav', view='Library')
        self.set_files([self.files['original']])
        v = self.invoke('import-files')
        s = self.invoke('save')
        o = self.oracle()
        prev = self.state['relink']
        self.ok(P, 'same-ids-retained', v['imported'] and not v['nameConflict'] and o['mediaIds'] == prev['media'] and o['trackIds'] == prev['tracks'] and o['anchors'] == prev['anchors'], value={'chooseAgainPresent': surface['chooseAgainPresent'], 'putStatus': s['putStatus']})

    def phase_relink_03_same_name_different_content(self):
        P = 'relink-03-same-name-different-content'
        before = self.oracle()
        self.invoke('nav', view='Library')
        self.set_files([self.files['variant']])
        v = self.invoke('import-files')
        c = self.invoke('name-conflict', choice='cancel') if v['nameConflict'] else {'cancelledMessage': False}
        self.invoke('save')
        after = self.oracle()
        self.ok(P, 'prompted-cancel-no-change', v['nameConflict'] and c['cancelledMessage'] and after['mediaIds'] == before['mediaIds'] and after['trackIds'] == before['trackIds'])

    def phase_relink_04_handle_permission_observation(self):
        P = 'relink-04-handle-permission-observation'
        q = self.invoke('permission-query')
        # Observation only: a loopback origin is a secure context; the native picker dialog is not driven by CDP.
        self.journal.append('checkpoint', P, 'observed', ok=True, disposition=controller.OBSERVED, value={'pickerAvailable': q['pickerAvailable'], 'secureContext': q['secureContext'], 'permissionsApi': q['permissionsApi']})
        if not q['pickerAvailable']:
            e = self.invoke('choose-again-no-picker')
            self.ok(P, 'no-picker-visible-error', e['visibleError'])
        return controller.OBSERVED  # phase disposition OBSERVED, never PASS

    # ---- lt-13i transcript approval ----
    def phase_transcript_01_dirty_approve_refused(self):
        P = 'transcript-01-dirty-approve-refused'
        self.runtime.request('seed-transcript')
        self.page('T', self.dev(), reload=True)
        self.pair('T', choice='service')
        self.state['anchors0'] = self.oracle()['anchors']
        t = self.invoke('transcript-open')
        self.ok(P, 'cue-editor-present', t.get('cueEditor') is True)
        for field in ('cue-text', 'cue-start', 'cue-end', 'word-text', 'word-start', 'word-end'):
            r = self.invoke('transcript-edit', field=field, revert=True)
            self.ok(P, 'refused-' + field, r['approveDisabled'] and r['gateVisible'] and r['approveEnabledAfterRevert'])
            self.ok(P, 'dispatch-guard-refused-' + field, r['handlerRefused'] and r['dispatchReasonVisible'])
        o = self.oracle()
        self.ok(P, 'nothing-approved-server', o['anchors'] == self.state['anchors0'])

    def phase_transcript_02_apply_inspect_approve(self):
        P = 'transcript-02-apply-inspect-approve'
        r = self.invoke('transcript-edit', field='cue-text', revert=False)
        self.ok(P, 'dirty-blocked', r['approveDisabled'])
        before = self.oracle()
        a = self.invoke('transcript-apply')
        self.ok(P, 'applied', a['applied'])
        s = self.invoke('save')
        mid = self.oracle()
        new = sorted(set(mid['trackIds']) - set(before['trackIds']))
        self.ok(P, 'corrected-version-persisted-unapproved', s['putStatus'] == 200 and len(new) == 1 and mid['trackStatus'].get(new[0]) != 'approved', counts={'newTracks': len(new)})
        self.state['corrected'] = new[0]
        self.state['v1Tracks'] = before['trackIds']
        ap = self.invoke('transcript-approve')
        self.ok(P, 'apply-then-approve', ap['approved'] and ap['nowDisabled'], value={'present': ap.get('present'), 'enabled': ap.get('enabled')})

    def phase_transcript_03_save_reload_anchors(self):
        P = 'transcript-03-save-reload-anchors'
        s = self.invoke('save')
        self.page('T', self.dev(), reload=True)
        self.pair('T', choice='service')
        o = self.oracle()
        self.ok(P, 'saved-anchors-unchanged', s['putStatus'] == 200 and o['anchors'] == self.state['anchors0'] and len(o['trackIds']) >= 2, status=s['putStatus'])
        cid = self.state['corrected']
        approved = [k for k, v in o['trackStatus'].items() if v == 'approved' and k not in self.state['v1Tracks']]
        self.ok(P, 'approval-persisted-server', o['trackStatus'].get(cid) == 'approved' and approved == [cid], counts={'approvedNew': len(approved)})
        self.ok(P, 'v1-retained', all(t in o['trackIds'] for t in self.state['v1Tracks']) and 'bqt-track' in o['trackIds'])

    # ---- cleanup (lt-sor: page cleanup, release, close target, readback; runtime independent) ----
    def cleanup(self):
        issues = []
        try:
            for key, t in list(self.tabs.items()):
                self.cur = t
                if t.object:
                    try:
                        self.invoke('cleanup')
                    except Exception:
                        issues.append('page')
                    try:
                        self.call('Runtime.releaseObject', objectId=t.object)
                    except Exception:
                        issues.append('release')
                try:
                    if self.call('Target.closeTarget', targetId=t.target).get('success') is not True:
                        issues.append('target-close-rejected')
                except Exception:
                    issues.append('target-close')
            try:
                present = {x['targetId'] for x in self.call('Target.getTargets')['targetInfos']}
                if any(t.target in present for t in self.tabs.values()):
                    issues.append('target-present')
            except Exception:
                issues.append('target-readback')
        finally:
            # Browser-side row is written while the capability history is still live (secret check meaningful).
            self.journal.append('cleanup', 'cleanup', 'browser-readback', ok=not issues, counts={'issues': len(issues)})
            clean = self.runtime.close() if self.runtime else {'strictPass': False}
            self.tabs.clear()
            self.cur = None
        ok = not issues and clean.get('strictPass') is True
        self.journal.append('cleanup', 'cleanup', 'readback', ok=ok, counts={'issues': len(issues)}, value={'containerAbsent': clean.get('containerAbsent'), 'forced': clean.get('forced'), 'stop': clean.get('stop')})
        if not ok:
            raise AssertionError('QualificationAssertion')
        return {'strictPass': ok}


def start_and_run(cdp, runtime, out, files, review, image, journal_cls=None, driver_cls=None):
    """Construction after the runtime started is guarded: on any construction failure the container is
    still closed and its cleanup read back into a receipt (secret check bound to the live history)."""
    journal_cls = journal_cls or controller.Journal
    driver_cls = driver_cls or BatchDriver
    journal = None
    try:
        journal = journal_cls(out / 'rows.jsonl', secrets=runtime.capabilities)
        driver = driver_cls(cdp, runtime, journal, files=files)
    except Exception:
        clean = {'strictPass': False}
        fallback = controller.Journal(out / 'rows.jsonl', secrets=runtime.capabilities)
        try:
            fallback.append('cleanup', 'construction', 'failed', ok=False, errorTag='UnexpectedException')  # before close clears history
        finally:
            try:
                clean = runtime.close()
            finally:
                fallback.append('cleanup', 'construction', 'readback', ok=False,
                                value={'containerAbsent': clean.get('containerAbsent'), 'forced': clean.get('forced')})
        raise DE('FixtureStartupFailure') from None
    return journal, controller.run(driver, journal, review, image)


def run_live(cdp, review, new_tab=None):
    image = os.environ.get('BQB_IMAGE', '')
    controller.require_authorization(review, image)  # before any process/browser creation
    if not callable(new_tab):
        raise PermissionError('NativeNewTabHelperRequired')
    ports = ports_from_env()
    import socket
    held = []
    try:
        for p in ports:
            s = socket.socket()
            s.bind(('127.0.0.1', p))
            held.append(s)
    finally:
        for s in held:
            s.close()
    bound = binding(image)
    out = scratch_root() / ('live-' + uuid.uuid4().hex[:12])
    out.mkdir()
    (out / 'binding.json').write_text(json.dumps(bound, indent=2))
    files = file_fixtures(out)
    runtime = PrivateRuntime(image, out, live=True, ports=ports)
    journal, ok = start_and_run(cdp, runtime, out, files, review, image)
    unchanged = binding(image) == bound
    rows = [json.loads(x) for x in journal.path.read_text().splitlines()]
    ends = {r['phase']: r.get('disposition') for r in rows if r['type'] == 'phase-end'}
    result = {'browserExecuted': True, 'ok': ok and unchanged, 'phases': ends, 'failures': journal.failures, 'skipped': journal.skipped, 'observed': journal.observed,
              'sourceAndKitUnchanged': unchanged, 'directory': str(out), 'rowsSha256': sha(journal.path.read_bytes())}
    (out / 'execution.json').write_text(json.dumps(result, indent=2))
    return result


def offline_selfcheck():
    """Structural checks only. No docker, browser, network or listener."""
    import ast
    missing = [p for p, _, _ in controller.PHASES if not callable(getattr(BatchDriver, controller.method_name(p), None))]
    tree = ast.parse((ROOT / 'live-batch.py').read_text(encoding='utf8'))
    defined = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name.startswith('phase_')}
    extra = sorted(defined - {controller.method_name(p) for p, _, _ in controller.PHASES})
    try:
        run_live(None, {})
        guard = False
    except PermissionError:
        guard = True
    return {'phases': len(controller.PHASES), 'unboundPhases': missing, 'unlistedPhaseMethods': extra, 'authorizationGuard': guard, 'browserExecuted': False}


if __name__ == '__main__':
    # Deliberately NO flag capable of launching Docker or a browser.
    r = offline_selfcheck()
    print(json.dumps(r, indent=2))
    raise SystemExit(0 if not r['unboundPhases'] and not r['unlistedPhaseMethods'] and r['authorizationGuard'] else 1)
