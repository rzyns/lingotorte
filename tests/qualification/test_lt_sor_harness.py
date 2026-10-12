"""Qualification harness tests; no product runtime/network/browser startup."""
import importlib.util,json,os,pathlib,tempfile,unittest,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
KIT=ROOT/'scripts/qualification/lt-sor'
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m);return m
live=load('lt_sor_tests_live',KIT/'live-controller-v2.py')
c=live.controller
class HarnessRepairTests(unittest.TestCase):
 def setUp(self):
  root=pathlib.Path(os.environ['LT_SOR_SCRATCH']);root.mkdir(parents=True,exist_ok=True)
  self.tmp=tempfile.TemporaryDirectory(prefix='lt-sor-unit-',dir=root);self.addCleanup(self.tmp.cleanup)
 def test_tag_survives_original_failing_seam(self):
  journal_module=load('original_journal',pathlib.Path(os.environ['LT_SOR_BASELINE_JOURNAL'])) if os.environ.get('LT_SOR_BASELINE_JOURNAL') else c
  j=journal_module.Journal(pathlib.Path(self.tmp.name)/'rows.jsonl')
  def fail():raise c.DiagnosticError('BrowserNavigationDeadline','Page.navigate','timeout')
  j.phase('owned-navigation',fail)
  rows=[json.loads(x) for x in j.path.read_text().splitlines()]
  self.assertEqual(rows[-1].get('errorTag'),'BrowserNavigationDeadline')
  self.assertEqual(rows[-1].get('diagnosticMethod'),'Page.navigate')
 def test_unexpected_secret_never_retained(self):
  secret='SYNTHETIC_PRIVATE_SECRET_DO_NOT_EXPORT'
  j=c.Journal(pathlib.Path(self.tmp.name)/'rows.jsonl')
  def fail():raise RuntimeError(secret)
  j.phase('fixed-stage',fail);j.phase('next-independent',lambda:None)
  self.assertNotIn(secret,j.path.read_text());self.assertIn('UnexpectedException',j.path.read_text())
  self.assertEqual(j.failures,['fixed-stage'])
 def test_untrusted_diagnostic_fields_scrubbed(self):
  e=c.DiagnosticError('secret-tag','secret-method','secret-category')
  self.assertEqual(c.safe_diagnostic(e),{'errorTag':'UnexpectedException','diagnosticMethod':None,'failureCategory':None})
 def test_private_runtime_fault_keeps_fixed_tag(self):
  import threading,queue,io,types
  r=object.__new__(live.PrivateRuntime);r.lock=threading.Lock();r.process=types.SimpleNamespace(stdin=io.StringIO());r.q=queue.Queue();r.q.put({'errorClass':'SYNTHETIC_PRIVATE_RUNTIME_SECRET'})
  with self.assertRaises(c.DiagnosticError) as cm:r.request('oracle')
  self.assertEqual(cm.exception.tag,'PrivateRuntimeOperation')
  self.assertNotIn('SYNTHETIC_PRIVATE_RUNTIME_SECRET',str(cm.exception))
 def test_mutated_tag_cannot_export_secret(self):
  e=c.DiagnosticError('BrowserNavigationDeadline');e.tag='SYNTHETIC_MUTATED_SECRET';e.method='SYNTHETIC_MUTATED_SECRET';e.category='SYNTHETIC_MUTATED_SECRET'
  self.assertNotIn('SYNTHETIC_MUTATED_SECRET',json.dumps(c.safe_diagnostic(e)))
 def test_cdp_exception_payload_not_in_diagnostic(self):
  secret='SYNTHETIC_CDP_CAPABILITY_EXPRESSION_SECRET'
  def broken(method,**kw):raise RuntimeError(secret)
  d=live.LiveDriver(broken,None,None)
  with self.assertRaises(c.DiagnosticError) as cm:d.call('Runtime.evaluate',expression=secret)
  self.assertEqual(c.safe_diagnostic(cm.exception)['diagnosticMethod'],'Runtime.evaluate')
  self.assertNotIn(secret,str(cm.exception))
 def test_dispatch_complete_and_cleanup_root_routed(self):
  self.assertEqual(live.offline_coverage()['implementedRowBindings'],135)
 def test_seed_wrong_mapping_fails_before_browser(self):
  class Runtime:
   def request(self,op,**kw):return {'valid':True,'rows':[{'method':'DELETE','path':'/api/status'}],'waitingId':'owned-job','snippetId':'owned-snippet'} if op=='seed' else {}
  d=live.LiveDriver(None,Runtime(),None)
  row=next(x for x in live.inventory() if x['id']=='foreign-fetch-0')
  with self.assertRaises(c.DiagnosticError) as cm:d.denial(row)
  self.assertEqual(cm.exception.tag,'SeedMappingMismatch');self.assertIsNone(d.target)
 def blocked_driver(self,controls=True,changed=False,browser_change=None,trace=None):
  class Runtime:
   origins=['http://127.0.0.1:18342','http://192.168.1.3:18343'];foreign='http://127.0.0.1:18349'
   def request(self,op,**kw):
    if op=='seed':return {'valid':True,'waitingId':'owned-job','snippetId':'owned-snippet','rows':[{'method':'GET','path':'/api/status'}]}
    if op=='barriers':return {'traceCount':0}
    if op=='trace-since':return {'trace':trace or []}
    return {}
   def capability(self):return 'A'*43
  d=live.LiveDriver(None,Runtime(),None);d.page=lambda *a,**kw:None;d.checkpoint=lambda *a,**kw:None
  digests=iter([{'sha256':'before'},{'sha256':'changed' if changed else 'before'}]);d.digest=lambda:next(digests)
  evidence={'sent':True,'connected':True,'elementType':'EMBED','sandboxed':True,'opaqueSandbox':True,'resourceCount':0,'loadEvents':0}
  evidence.update(browser_change or {});d.invoke=lambda *a,**kw:evidence
  if controls:
   positive={'ok':True,'serverTrace':[{'status':401}],'unchanged':True,'privateAbsent':True}
   d.cache={'foreign-embed-0':positive,'null-navigation-0':positive}
  return d
 def test_browser_block_requires_positive_controls_and_zero_effects(self):
  row=next(x for x in live.inventory() if x['id']=='null-embed-0')
  d=self.blocked_driver();v=d.denial(row)
  self.assertTrue(v['ok']);self.assertEqual(v['disposition'],'OBSERVED_BROWSER_BLOCK');self.assertFalse(v['serverDenialProven'])
  for kwargs in ({'controls':False},{'changed':True},{'browser_change':{'connected':False}},{'browser_change':{'resourceCount':1}},{'browser_change':{'opaqueSandbox':False}},{'browser_change':{'deadline':True}}):
   with self.subTest(kwargs=kwargs):self.assertFalse(self.blocked_driver(**kwargs).denial(row)['ok'])
 def test_browser_block_does_not_mask_actual_denial(self):
  row=next(x for x in live.inventory() if x['id']=='null-embed-0')
  trace=[{'path':'/api/status','method':'GET','origin':None,'status':401,'privateAbsent':True,'corsGranted':False,'credentialsGrant':False}]
  d=self.blocked_driver(trace=trace);d.digest=lambda:{'sha256':'unchanged'}
  result=d.denial(row);self.assertTrue(result['ok']);self.assertEqual(result['disposition'],'PASS');self.assertEqual(result['status'],401)
if __name__=='__main__':unittest.main()
