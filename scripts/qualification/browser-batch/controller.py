"""Browser qualification batch: fixed-vocabulary journal, phase inventory and authorization guard.

Importing this module starts no process, listener, container or browser. It is the
lt-sor ``controller.py`` pattern extended with the restore (lt-2t4), relink (lt-n31)
and transcript-approval (lt-13i) phases. No capability, CDP payload, expression,
request header/body or exception message may ever enter a receipt.
"""
import json
import os
import pathlib

DIAGNOSTIC_TAGS = frozenset((
    'BrowserNavigationDeadline', 'BrowserServerTraceMissing', 'FiniteBarrierDeadline', 'DOMBridgeObjectMissing',
    'DOMResultType', 'ExplicitPairFailed', 'FixtureNotReady', 'FixtureStartupFailure', 'CDPRejected',
    'PrivateBrowserOperation', 'PrivateRuntimeOperation', 'NativeNewTabHelperRequired', 'UnexpectedException',
    'DomDeadline', 'DomButton', 'DomSelector', 'QualificationAssertion', 'FileFixtureMissing',
    'FileChooserUnavailable', 'CommitBarrierMissed', 'SkippedCascade', 'UnknownPhase', 'PrivateRuntimeTimeout',
    'PrivateRuntimeSequence', 'SourceRevisionMismatch', 'FocusDeadline',
))
CDP_METHODS = frozenset((
    'Target.attachToTarget', 'Target.createTarget', 'Target.closeTarget', 'Target.getTargets', 'Page.navigate',
    'Page.reload', 'Page.enable', 'Runtime.evaluate', 'Runtime.callFunctionOn', 'Runtime.releaseObject',
    'DOM.enable', 'DOM.getDocument', 'DOM.querySelector', 'DOM.setFileInputFiles', 'Browser.getVersion',
    'Input.dispatchKeyEvent', 'Input.insertText', 'Emulation.setDeviceMetricsOverride', 'Emulation.clearDeviceMetricsOverride',
))
CATEGORIES = frozenset(('timeout', 'transport', 'javascript', 'rejected'))
# Fixed element ids mirrored from dom-batch.mjs BUTTON_LABELS / SELECTOR_LABELS keys (test-enforced).
DOM_ELEMENTS = frozenset((
    'previewRestore', 'refreshServicePreview', 'restoreNow', 'connectLocalService', 'saveStateNow', 'generateLocalExport',
    'importLocalMedia', 'importAsNewMedia', 'cancel', 'chooseMediaAgain', 'createCorrectedTranscript', 'approveTranscript',
    'choiceService', 'choiceBrowser', 'navLibrary', 'navPlayer', 'navSettings', 'navSaved', 'navExportImport',
    'nav', 'importManifest', 'serviceUrl', 'serviceCapability', 'autosave', 'mediaFile', 'nameConflict', 'confirmMerge',
    'confirmReplace', 'confirmSingle', 'cueText', 'cueStart', 'cueEnd', 'wordText', 'wordStart', 'wordEnd', 'unlisted', 'none',
    'importGatedDraft', 'downloadExport', 'saveSentence', 'showAnswer', 'rateGood', 'submitAttempt', 'analyseWords', 'navReview',
    'navPractice', 'publicReadAuth', 'targetFile', 'nativeFile', 'practiceMode', 'practiceAnswer', 'practiceChoice', 'morphologyPanel',
    'cueRow', 'video', 'createReviewCard',
))
DOM_STATES = frozenset(('missing', 'disabled', 'none'))
RECEIPT_FIELDS = frozenset((
    'ok', 'status', 'method', 'path', 'index', 'fault', 'errorClass', 'oracle', 'counts', 'graceful', 'forced',
    'remainingSockets', 'bytes', 'origin', 'masked', 'cleared', 'privateAbsent', 'browserExecuted', 'image',
    'sha256', 'value', 'errorTag', 'diagnosticMethod', 'failureCategory', 'bead', 'disposition',
    'element', 'elementState',
))
OBSERVED = 'OBSERVED'  # observation-only phase/row; never counted as PASS
PASS_DISPOSITIONS = frozenset(('PASS',))
REVIEW_FLAGS = ('specApproved', 'qualityApproved', 'browserAuthorized')

# Ordered phase inventory: (phase id, bead, plan step). Each phase is a single
# driver method of the same name with '-' replaced by '_' and a 'phase_' prefix.
PHASES = (
    ('restore-01-pair', 'lt-2t4', 1),
    ('restore-02-seed-five-modes', 'lt-2t4', 2),
    ('restore-03-export-merge-preview-no-effect', 'lt-2t4', 3),
    ('restore-04-merge-twice-idempotent', 'lt-2t4', 4),
    ('restore-05-empty-replace-readback', 'lt-2t4', 5),
    # Step 7 runs before step 6: tab B must still hold its pre-restart capability so it can save with a
    # genuinely stale revision (re-pairing after the restart would refresh B's revision by design).
    ('restore-07-second-tab-stale-409', 'lt-2t4', 7),
    ('restore-06-reload-restart-repair', 'lt-2t4', 6),
    ('restore-08-kill-during-commit-unknown', 'lt-2t4', 8),
    ('restore-09-foreign-null-origin', 'lt-2t4', 9),
    ('restore-10-wrong-capability-generic', 'lt-2t4', 10),
    ('relink-01-import-save', 'lt-n31', 1),
    ('relink-02-restart-repair-reselect', 'lt-n31', 2),
    ('relink-03-same-name-different-content', 'lt-n31', 3),
    ('relink-04-handle-permission-observation', 'lt-n31', 4),
    ('transcript-01-dirty-approve-refused', 'lt-13i', 1),
    ('transcript-02-apply-inspect-approve', 'lt-13i', 2),
    ('transcript-03-save-reload-anchors', 'lt-13i', 3),
    # lt-3kk daily-driver journey: one fresh store, one service, UI path wherever one exists.
    # Runs ALONE (require_authorization refuses mixing it with the restore/relink/transcript gates).
    ('journey-01-pair', 'lt-3kk', 1),
    ('journey-02-import-media-subtitles', 'lt-3kk', 2),
    ('journey-03-draft-correct-apply-approve', 'lt-3kk', 3),
    ('journey-04-save-word-sentence', 'lt-3kk', 4),
    ('journey-05-review-due-keyboard', 'lt-3kk', 5),
    ('journey-06-practice-two-modes-keyboard', 'lt-3kk', 6),
    ('journey-07-morphology-ui-narrow', 'lt-3kk', 7),
    ('journey-08-morphology-origin-denial', 'lt-3kk', 8),
    ('journey-09-persist-reload-repair', 'lt-3kk', 9),
    ('journey-10-relink-restart-reselect', 'lt-3kk', 10),
    ('journey-11-export-restore-merge', 'lt-3kk', 11),
    ('journey-12-unsupported-codec-feedback', 'lt-3kk', 12),
    ('journey-13-keyboard-focus', 'lt-3kk', 13),
)
# A failed phase cascades to these dependents (marked SKIPPED_CASCADE, never run).
DEPENDS = {
    'restore-02-seed-five-modes': ('restore-01-pair',),
    'restore-03-export-merge-preview-no-effect': ('restore-02-seed-five-modes',),
    'restore-04-merge-twice-idempotent': ('restore-03-export-merge-preview-no-effect',),
    'restore-05-empty-replace-readback': ('restore-02-seed-five-modes',),
    'restore-06-reload-restart-repair': ('restore-05-empty-replace-readback',),
    # Step 7's oracle (stale tab B save -> 409) is only meaningful after restores 04/05 advanced the revision.
    'restore-07-second-tab-stale-409': ('restore-01-pair', 'restore-02-seed-five-modes', 'restore-04-merge-twice-idempotent', 'restore-05-empty-replace-readback'),
    # Step 8 needs a merge that changes state: restore-05 empties the active set and restore-06 re-pairs tab A.
    'restore-08-kill-during-commit-unknown': ('restore-01-pair', 'restore-05-empty-replace-readback', 'restore-06-reload-restart-repair'),
    'restore-09-foreign-null-origin': ('restore-01-pair',),
    'restore-10-wrong-capability-generic': ('restore-01-pair',),
    'relink-02-restart-repair-reselect': ('relink-01-import-save',),
    'relink-03-same-name-different-content': ('relink-01-import-save',),
    'transcript-02-apply-inspect-approve': ('transcript-01-dirty-approve-refused',),
    'transcript-03-save-reload-anchors': ('transcript-02-apply-inspect-approve',),
    'journey-02-import-media-subtitles': ('journey-01-pair',),
    'journey-03-draft-correct-apply-approve': ('journey-02-import-media-subtitles',),
    'journey-04-save-word-sentence': ('journey-03-draft-correct-apply-approve',),
    'journey-05-review-due-keyboard': ('journey-04-save-word-sentence',),
    'journey-06-practice-two-modes-keyboard': ('journey-04-save-word-sentence', 'journey-05-review-due-keyboard'),
    'journey-07-morphology-ui-narrow': ('journey-03-draft-correct-apply-approve',),
    'journey-08-morphology-origin-denial': ('journey-01-pair',),
    'journey-09-persist-reload-repair': ('journey-05-review-due-keyboard', 'journey-06-practice-two-modes-keyboard'),
    'journey-10-relink-restart-reselect': ('journey-09-persist-reload-repair',),
    'journey-11-export-restore-merge': ('journey-10-relink-restart-reselect',),
    'journey-12-unsupported-codec-feedback': ('journey-02-import-media-subtitles',),
    'journey-13-keyboard-focus': ('journey-03-draft-correct-apply-approve', 'journey-05-review-due-keyboard', 'journey-06-practice-two-modes-keyboard', 'journey-07-morphology-ui-narrow'),
}
LEGACY_GATES = ('lt-2t4', 'lt-n31', 'lt-13i')
JOURNEY_GATE = 'lt-3kk'
KNOWN_GATES = frozenset(LEGACY_GATES + (JOURNEY_GATE,))


def method_name(phase):
    return 'phase_' + phase.replace('-', '_')


class DiagnosticError(RuntimeError):
    def __init__(self, tag, method=None, category=None, element=None, element_state=None):
        self.tag = tag if tag in DIAGNOSTIC_TAGS else 'UnexpectedException'
        self.method = method if method in CDP_METHODS else None
        self.category = category if category in CATEGORIES else None
        self.element = element if element in DOM_ELEMENTS else None
        self.element_state = element_state if element_state in DOM_STATES else None
        super().__init__(self.tag)


def safe_diagnostic(error):
    if isinstance(error, DiagnosticError):
        v = DiagnosticError(error.tag, error.method, error.category, getattr(error, 'element', None), getattr(error, 'element_state', None))  # revalidate
        out = {'errorTag': v.tag, 'diagnosticMethod': v.method, 'failureCategory': v.category}
        if v.element is not None:
            out.update(element=v.element, elementState=v.element_state)
        return out
    return {'errorTag': 'UnexpectedException', 'diagnosticMethod': None, 'failureCategory': None}


def _safe_value(value, depth=0):
    """Receipts carry only bool/int/None and short fixed-alphabet strings (ids/hashes/statuses)."""
    if depth > 6:
        raise ValueError('UnsafeReceiptValue')
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) > 96 or not all(c.isalnum() or c in '-_:./ ' for c in value):
            raise ValueError('UnsafeReceiptValue')
        return value
    if isinstance(value, (list, tuple)):
        return [_safe_value(v, depth + 1) for v in value]
    if isinstance(value, dict):
        return {_safe_value(str(k), depth + 1): _safe_value(v, depth + 1) for k, v in value.items()}
    raise ValueError('UnsafeReceiptValue')


class Journal:
    def __init__(self, path, secrets=()):
        self.path = pathlib.Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.failures = []
        self.skipped = []
        self.observed = []
        self._secrets = secrets  # callable or tuple; checked, never written

    def _secret_values(self):
        s = self._secrets() if callable(self._secrets) else self._secrets
        return [x for x in s if x]

    def append(self, kind, phase, stage, **safe):
        if set(safe) - RECEIPT_FIELDS:
            raise ValueError('UnsafeReceiptField')
        row = {'type': kind, 'phase': phase, 'stage': stage, **{k: _safe_value(v) for k, v in safe.items()}}
        encoded = json.dumps(row, separators=(',', ':'), sort_keys=True) + '\n'
        if any(secret in encoded for secret in self._secret_values()):
            raise ValueError('SecretInReceipt')
        with self.path.open('a', encoding='utf8') as f:
            f.write(encoded)
            f.flush()
            os.fsync(f.fileno())

    def phase(self, name, fn, bead=None):
        blocked = [d for d in DEPENDS.get(name, ()) if d in self.failures or d in self.skipped]
        if blocked:
            self.skipped.append(name)
            self.append('phase-end', name, 'end', ok=False, bead=bead, disposition='SKIPPED_CASCADE')
            return
        self.append('phase-start', name, 'start', bead=bead)
        try:
            r = fn()
            disp = OBSERVED if r == OBSERVED else 'PASS'
            if disp == OBSERVED:
                self.observed.append(name)
            self.append('phase-end', name, 'end', ok=True, bead=bead, disposition=disp)
        except Exception as e:  # noqa: BLE001 - classified, message never retained
            self.failures.append(name)
            cls = type(e).__name__ if type(e) in (RuntimeError, AssertionError, PermissionError, DiagnosticError, TimeoutError) else 'Exception'
            self.append('phase-end', name, 'end', ok=False, bead=bead, disposition='FAILED', errorClass=cls, **safe_diagnostic(e))

    def assert_row(self, phase, stage, ok, **safe):
        self.append('assertion', phase, stage, ok=bool(ok), **safe)
        if not ok:
            raise AssertionError('QualificationAssertion')


def require_authorization(review, image):
    """Hard guard: all three review flags must be literally True and bound to the exact image."""
    if not isinstance(review, dict) or not all(review.get(k) is True for k in REVIEW_FLAGS):
        raise PermissionError('ReviewedCandidateAndFreshBrowserAuthorizationRequired')
    if not isinstance(image, str) or not image.startswith('sha256:') or len(image) != 71 or review.get('image') != image:
        raise PermissionError('ExactImageBindingRequired')
    gates = review.get('gates')
    if gates is not None and (not isinstance(gates, (list, tuple)) or not set(gates) <= KNOWN_GATES):
        raise PermissionError('UnknownGateSelection')
    if gates is not None and JOURNEY_GATE in gates:
        # One fresh store, one service: the journey never shares a runtime with the other gates.
        if list(gates) != [JOURNEY_GATE]:
            raise PermissionError('JourneyGateMustRunAlone')
        rev = review.get('revision')
        if not isinstance(rev, str) or len(rev) != 40 or any(c not in '0123456789abcdef' for c in rev):
            raise PermissionError('ExactCandidateRevisionRequired')


def selected_phases(review):
    gates = set(review.get('gates') or LEGACY_GATES)  # default unchanged: the journey must be selected explicitly
    return [(p, b) for p, b, _ in PHASES if b in gates]


def run(driver, journal, review, image):
    require_authorization(review, image)
    missing = [p for p, _, _ in PHASES if not callable(getattr(driver, method_name(p), None))]
    if missing:
        raise PermissionError('IncompletePhaseDispatch')
    try:
        for phase, bead in selected_phases(review):
            journal.phase(phase, getattr(driver, method_name(phase)), bead=bead)
    finally:
        journal.phase('cleanup', driver.cleanup)
    return not journal.failures
