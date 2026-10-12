"""Receipt/phase controller for a separately authorized browser run.
Importing this module starts no process, listener or browser. A driver must be
provided by the reviewed parent; no raw CDP response/expression is ever logged.
"""
import json,os,pathlib,time
DIAGNOSTIC_TAGS=frozenset(('BrowserNavigationDeadline','BrowserServerTraceMissing','FiniteBarrierDeadline','DOMBridgeObjectMissing','DOMResultType','SeedMappingMismatch','ExplicitPairFailed','FixtureNotReady','FixtureStartupFailure','CDPRejected','PrivateBrowserOperation','PrivateRuntimeOperation','NativeNewTabHelperRequired','UnboundControl','UnexpectedException','DomDeadline','DomButton','DomSelector','QualificationAssertion'))
class DiagnosticError(RuntimeError):
    def __init__(self,tag,method=None,category=None):
        self.tag=tag if tag in DIAGNOSTIC_TAGS else 'UnexpectedException'
        self.method=method if method in ('Target.attachToTarget','Target.createTarget','Target.closeTarget','Target.getTargets','Page.navigate','Runtime.evaluate','Runtime.callFunctionOn','Runtime.releaseObject','Network.enable') else None
        self.category=category if category in ('timeout','transport','javascript','rejected') else None
        super().__init__(self.tag)
def safe_diagnostic(error):
    if isinstance(error,DiagnosticError):
        validated=DiagnosticError(error.tag,error.method,error.category)
        return {'errorTag':validated.tag,'diagnosticMethod':validated.method,'failureCategory':validated.category}
    return {'errorTag':'UnexpectedException','diagnosticMethod':None,'failureCategory':None}
class Journal:
    def __init__(self,path):
        self.path=pathlib.Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        self.failures=[]
    def append(self,kind,phase,stage,**safe):
        # Fixed vocabulary only. Private capability, request headers, CDP,
        # expressions and exception messages are structurally excluded.
        allowed={'ok','status','method','path','index','fault','errorClass','oracle','counts','graceful','forced','remainingSockets','bytes','origin','masked','cleared','played','policyBlocked','privateAbsent','repairRequired','browserExecuted','image','sha256','value','errorTag','diagnosticMethod','failureCategory'}
        if set(safe)-allowed:raise ValueError('UnsafeReceiptField')
        row={'type':kind,'phase':phase,'stage':stage,**safe}
        encoded=json.dumps(row,separators=(',',':'))+'\n'
        with self.path.open('a',encoding='utf8') as f:f.write(encoded);f.flush();os.fsync(f.fileno())
    def phase(self,name,fn):
        self.append('phase-start',name,'start')
        try:fn();self.append('phase-end',name,'end',ok=True)
        except Exception as e:
            self.failures.append(name)
            self.append('phase-end',name,'end',ok=False,errorClass=type(e).__name__ if type(e) in (RuntimeError,AssertionError,PermissionError,DiagnosticError,TimeoutError) else 'Exception',**safe_diagnostic(e))
    def assert_row(self,phase,stage,ok,**safe):
        self.append('assertion',phase,stage,ok=bool(ok),**safe)
        if not ok:raise AssertionError('QualificationAssertion')

def run(driver,journal,review):
    """driver implements the tested fixture IPC and sanitized DOM operations.
    The parent must implement/verify its browser adapter before dispatch; this
    control layer is not a claim that such adapter has already been executed.
    """
    if not review.get('specApproved') or not review.get('qualityApproved') or not review.get('browserAuthorized'):
        raise PermissionError('ReviewedCandidateAndFreshBrowserAuthorizationRequired')
    if review.get('image')== 'sha256:186e3bb0a204943823c3fe0241ab36927b8fa4d32332dcadad1194c33206f152':
        raise PermissionError('LANHashCandidateRequired')
    # One finite dispatch; unaffected independent phases continue after a failure.
    try:
        for phase in ['A24-dev-settings-save','A24-dev-native-audio','A25-foreign-null','A26-allowed-denials','A26-restart-poll-autosave','A27-endpoint-redirect','A28-reload-storage','A24-LAN-built-settings-save-audio']:
            journal.phase(phase,lambda phase=phase:driver.run_phase(phase,journal))
    finally:
        journal.phase('cleanup',lambda:driver.cleanup(journal))
    return not journal.failures

if __name__=='__main__':
    import tempfile
    # Local safety/control-flow selftest, never browser execution.
    root=pathlib.Path(__file__).parent/'controller-selftest';root.mkdir(exist_ok=True)
    journal=Journal(root/('rows-'+str(time.time_ns())+'.jsonl'))
    touched=[]
    journal.phase('injected-failure',lambda:journal.assert_row('injected-failure','before-raise',False,oracle={'synthetic':True}))
    journal.phase('unaffected',lambda:touched.append(True))
    assert journal.failures==['injected-failure'] and touched==[True]
    try:run(None,journal,{})
    except PermissionError:pass
    else:raise AssertionError('AuthorizationGuardMissing')
    print(json.dumps({'browserExecuted':False,'durableFailureRetained':True,'independentPhaseRan':True,'authorizationGuard':True}))
