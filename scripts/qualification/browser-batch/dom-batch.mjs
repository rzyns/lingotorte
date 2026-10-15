// DOM-only bridge for the browser batch. Pattern: scripts/qualification/lt-sor/dom-live-v2.mjs.
// Never imports production modules, never constructs a model/root, never adds product hooks.
// Private arguments (capability, manifests) are consumed and never returned. Results are fixed
// booleans/counts/short status strings only.
// Exact app strings (web app source, app.ts). Tested against the checkout at test time.
export const CHOICE_LABELS = Object.freeze({ service: 'Load service state (discard browser edits)', browser: 'Keep browser work' });
export const APPLY_DONE = 'Corrected transcript version created';
export const APPROVED_DONE = 'Transcript approved for study';
// Fixed-vocabulary element ids for diagnostics. Errors carry `Tag|labelKey|state`; never free text.
export const BUTTON_LABELS = Object.freeze({ previewRestore: 'Preview restore', refreshServicePreview: 'Refresh authoritative service preview', restoreNow: 'Restore now', connectLocalService: 'Connect local service', saveStateNow: 'Save state now', generateLocalExport: 'Generate local export', importLocalMedia: 'Import local media', importAsNewMedia: 'Import as new media', cancel: 'Cancel', chooseMediaAgain: 'Choose media again', createCorrectedTranscript: 'Create corrected transcript version', approveTranscript: 'Approve transcript for study', choiceService: CHOICE_LABELS.service, choiceBrowser: CHOICE_LABELS.browser, navLibrary: 'Library', navPlayer: 'Player', navSettings: 'Settings', navSaved: 'Saved', navExportImport: 'Export / Import' });
export const SELECTOR_LABELS = Object.freeze({ nav: '.lingotorte-nav', importManifest: '#import-manifest', serviceUrl: '#local-service-url', serviceCapability: '#local-service-capability', autosave: '#local-service-autosave', mediaFile: '#local-media-file', nameConflict: '.media-name-conflict', confirmMerge: '#restore-confirm-overwrite', confirmReplace: '#restore-confirm-replace', confirmSingle: '#restore-confirm', cueText: '#transcript-correction-cue-0', cueStart: '#transcript-correction-cue-0-start-ms', cueEnd: '#transcript-correction-cue-0-end-ms', wordText: '#transcript-word-timing-cue-0-word-0-text', wordStart: '[name="transcript-word-timing-cue-0-word-0-start-ms"]', wordEnd: '[name="transcript-word-timing-cue-0-word-0-end-ms"]' });
export const labelKey = (table, value) => Object.keys(table).find((k) => table[k] === value) ?? 'unlisted';
export const diagnostic = (tag, label = 'none', state = 'none') => new Error(tag + '|' + label + '|' + state);
export async function installBatchDriver(requireUi = true) {
  const wait = async (fn, ms = 8000) => { const end = performance.now() + ms; while (performance.now() < end) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 15)); } throw new Error('DomDeadline'); };
  const find = (sel) => { const n = document.querySelector(sel); if (!n) throw diagnostic('DomSelector', labelKey(SELECTOR_LABELS, sel), 'missing'); return n; };
  const btn = (text, scope = document) => [...scope.querySelectorAll('button')].find((n) => n.textContent.trim() === text);
  const click = (text, scope = document) => { const b = btn(text, scope); if (!b || b.disabled) throw diagnostic('DomButton', labelKey(BUTTON_LABELS, text), b ? 'disabled' : 'missing'); b.click(); };
  const nav = (text) => click(text, find('.lingotorte-nav'));
  const fill = (sel, value) => { const n = find(sel); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); };
  const check = (sel, on = true) => { const n = find(sel); if (n.checked !== on) n.click(); };
  const text = (sel) => document.querySelector(sel)?.textContent ?? '';
  const status = () => { const n = document.querySelector('[data-local-service-sync]'); const t = n?.textContent ?? ''; return { sync: n?.dataset.syncState ?? 'idle', connecting: t.startsWith('Connecting'), pairAgain: t.includes('Pair again'), pairingInputError: t.includes('Select an exact HTTP origin and enter its private session capability.'), outcomeUnknown: t.includes('outcome unknown') || text('.export-import-card').includes('Restore outcome unknown'), conflict: (n?.dataset.syncState ?? '') === 'conflict', autosave: document.querySelector('#local-service-autosave')?.checked ?? false, masked: document.querySelector('#local-service-capability')?.type === 'password', cleared: document.querySelector('#local-service-capability')?.value === '' }; };
  // Request observer: method/path/status only. Bodies and headers are never captured.
  const originalFetch = globalThis.fetch; const events = [];
  globalThis.fetch = async function (target, init) {
    const url = new URL(typeof target === 'string' ? target : target.url, location.href); const tracked = url.origin === location.origin && url.pathname.startsWith('/api/'); const method = init?.method ?? 'GET';
    if (tracked) events.push({ stage: 'start', method, path: url.pathname });
    try { const r = await originalFetch.call(this, target, init); if (tracked) events.push({ stage: 'finish', method, path: url.pathname, status: r.status }); return r; }
    catch (e) { if (tracked) events.push({ stage: 'failed', method, path: url.pathname }); throw e; }
  };
  const count = (method, path, stage) => events.filter((e) => e.method === method && e.path === path && (!stage || e.stage === stage)).length;
  if (requireUi) await wait(() => document.querySelector('.lingotorte-nav'));

  const restorePanel = () => document.querySelector('.export-import-card');
  // Only the role=alert lastError banner (app.ts renderExportImportView) is a restore error. The conflict
  // note '.status-banner.error' (app.ts ~1151) is ALWAYS present in a conflict preview (display:none once a
  // mode is ticked); matching it made restore-commit return while the commit was still in flight (run 2).
  const restoreAlert = () => restorePanel()?.querySelector('[role="alert"].status-banner.error') ?? null;
  const restoreBusy = () => btn(BUTTON_LABELS.previewRestore)?.disabled === true; // app.ts: previewBtn.disabled = restoreIsBusy(model)
  const settled = () => receipt().present || status().outcomeUnknown || !!restoreAlert();
  const receipt = () => { const r = document.querySelector('[data-testid="restore-receipt"]'); return { present: !!r, durable: !!r && (r.querySelector('h3,h4')?.textContent ?? '').includes('durable readback verified') }; };
  const previewRestore = async (manifestJson) => {
    nav('Export / Import'); fill('#import-manifest', manifestJson); const before = count('POST', '/api/restore/preview', 'finish');
    click('Preview restore'); await wait(() => document.querySelector('.restore-preview') || restoreAlert());
    return { preview: !!document.querySelector('.restore-preview'), integrity: document.querySelector('[data-testid="restore-integrity"]')?.dataset.integrityVerified === 'true', conflictChoice: !!document.querySelector('#restore-confirm-overwrite'), commitsSent: count('POST', '/api/restore/commit', 'start') };
  };
  // app.ts renderExportImportView: with a paired service, 'Restore now' stays disabled until (a) exactly one
  // mode is selected (conflict: #restore-confirm-overwrite|#restore-confirm-replace; else #restore-confirm),
  // (b) a service-backed preview is bound for that mode ('Refresh authoritative service preview' ->
  // previewDurableRestore; selecting a mode drops any earlier binding), and (c) every warning is
  // acknowledged AFTER the refresh (previewDurableRestore resets acknowledgedWarnings). Each checkbox
  // change rerenders, so elements are re-queried after every click.
  const confirmRestore = async (mode) => {
    if (document.querySelector('#restore-confirm-overwrite')) check(mode === 'replace' ? '#restore-confirm-replace' : '#restore-confirm-overwrite');
    else if (mode === 'replace') throw diagnostic('DomSelector', 'confirmReplace', 'missing');
    else check('#restore-confirm');
    if (btn(BUTTON_LABELS.refreshServicePreview)) {
      const before = count('POST', '/api/restore/preview', 'finish');
      click(BUTTON_LABELS.refreshServicePreview);
      await wait(() => (count('POST', '/api/restore/preview', 'finish') > before && btn(BUTTON_LABELS.refreshServicePreview) && !btn(BUTTON_LABELS.refreshServicePreview).disabled) || restoreAlert());
    }
    for (let i = 0; i < 16; i++) { const w = [...document.querySelectorAll('input[name="restore-warning"]')].find((n) => !n.checked); if (!w) break; w.click(); }
    try { await wait(() => { const b = btn(BUTTON_LABELS.restoreNow); return b && !b.disabled; }, 3000); } catch { const b = btn(BUTTON_LABELS.restoreNow); throw diagnostic('DomButton', 'restoreNow', b ? 'disabled' : 'missing'); }
    const before = count('POST', '/api/restore/commit', 'start');
    click(BUTTON_LABELS.restoreNow);
    return { commitStartedBefore: before };
  };

  return Object.freeze({ async invoke(op, arg = {}) {
    switch (op) {
      case 'inspect': return status();
      case 'nav': { if (!['Library', 'Player', 'Settings', 'Saved', 'Export / Import'].includes(arg.view)) throw new Error('DomSelector'); nav(arg.view); await wait(() => arg.view !== 'Library' || document.querySelector('#local-media-file')); return { view: arg.view }; }
      case 'pair': { nav('Settings'); fill('#local-service-url', arg.origin); fill('#local-service-capability', arg.capability); const masked = find('#local-service-capability').type === 'password'; click('Connect local service'); await wait(() => !status().connecting); if (status().sync === 'choice') { const label = CHOICE_LABELS[arg.choice]; if (!label) throw new Error('DomSelector'); click(label); } await wait(() => status().sync !== 'choice'); const s = status(); return { ...s, masked, cleared: s.cleared, statusOk: count('GET', '/api/status', 'finish') > 0, stateOk: count('GET', '/api/state', 'finish') > 0 }; }
      case 'save': { nav('Settings'); const b = count('PUT', '/api/state', 'finish'); click('Save state now'); await wait(() => count('PUT', '/api/state', 'finish') > b || status().conflict || status().pairAgain); const last = events.filter((e) => e.method === 'PUT' && e.path === '/api/state' && e.stage === 'finish').at(-1); return { ...status(), putStatus: last?.status ?? null }; }
      case 'autosave': { nav('Settings'); const n = find('#local-service-autosave'); if (n.checked !== (arg.enabled !== false)) n.click(); return status(); }
      case 'export': { nav('Export / Import'); click('Generate local export'); await wait(() => document.querySelector('.export-summary')); return { exported: true }; }
      case 'restore-preview': return await previewRestore(arg.manifestJson);
      case 'restore-commit': { const c = await confirmRestore(arg.mode); await wait(settled, arg.ms ?? 8000); const last = events.filter((e) => e.method === 'POST' && e.path === '/api/restore/commit' && e.stage !== 'start').at(-1); const readbackAfter = events.findIndex((e, i) => i > events.lastIndexOf(last) && e.method === 'GET' && e.path === '/api/state' && e.stage === 'finish') >= 0; return { ...receipt(), commitStatus: last?.status ?? null, commitFailed: last?.stage === 'failed', readbackAfterCommit: readbackAfter, commits: count('POST', '/api/restore/commit', 'start') - c.commitStartedBefore, outcomeUnknown: status().outcomeUnknown, errorShown: !!restoreAlert(), busy: restoreBusy() }; }
      case 'restore-commit-start': { const c = await confirmRestore(arg.mode); await wait(() => count('POST', '/api/restore/commit', 'start') > c.commitStartedBefore, 3000); return { started: true }; }
      case 'restore-settle': { await wait(settled, arg.ms ?? 10000); return { ...receipt(), outcomeUnknown: status().outcomeUnknown, commitsSent: count('POST', '/api/restore/commit', 'start'), restoreNowEnabled: !!btn('Restore now') && !btn('Restore now').disabled }; }
      case 'restore-idle': { nav('Export / Import'); await wait(() => btn(BUTTON_LABELS.previewRestore) && !restoreBusy(), arg.ms ?? 10000).catch(() => { throw diagnostic('DomDeadline', 'previewRestore', 'disabled'); }); return { busy: restoreBusy() }; }
      case 'commit-count': return { commits: count('POST', '/api/restore/commit', 'start'), previews: count('POST', '/api/restore/preview', 'start') };
      case 'import-files': {
        // Files are supplied by the parent via CDP DOM.setFileInputFiles on #local-media-file before this op.
        const input = find('#local-media-file'); const n = input.files?.length ?? 0; if (!n) throw new Error('DomSelector'); // no nav here: a rerender would drop CDP-supplied files
        input.dispatchEvent(new Event('change', { bubbles: true })); click('Import local media');
        await wait(() => document.querySelector('.media-name-conflict') || document.querySelector('.source-range-panel') || document.querySelector('.status-banner.error'));
        return { nameConflict: !!document.querySelector('.media-name-conflict'), imported: !document.querySelector('.media-name-conflict') && !document.querySelector('.status-banner.error'), pickerAvailable: typeof globalThis.showOpenFilePicker === 'function', secureContext: globalThis.isSecureContext === true };
      }
      case 'name-conflict': { const box = find('.media-name-conflict'); click(arg.choice === 'import-new' ? 'Import as new media' : 'Cancel', box); await wait(() => !document.querySelector('.media-name-conflict')); return { resolved: true, cancelledMessage: (document.body.textContent ?? '').includes('Import cancelled. Existing media was not changed.') }; }
      case 'relink-surface': { nav('Player'); const again = btn('Choose media again'); return { chooseAgainPresent: !!again, pickerAvailable: typeof globalThis.showOpenFilePicker === 'function', secureContext: globalThis.isSecureContext === true }; }
      case 'choose-again-no-picker': { nav('Player'); click('Choose media again'); await new Promise((r) => setTimeout(r, 50)); return { fileChooserOpened: document.querySelector('input.relink-file-input[type=file]') !== null, deadEndMessage: (document.body.textContent ?? '').includes('does not support persistent file handles') }; }
      case 'permission-query': { const p = globalThis.showOpenFilePicker; return { pickerAvailable: typeof p === 'function', secureContext: globalThis.isSecureContext === true, permissionsApi: typeof navigator.permissions?.query === 'function' }; }
      case 'transcript-open': {
        // Select the seeded media + target track through the learner UI (Saved occurrence link sets
        // currentMedia, cues and targetTrackId), then require the cue editor inputs to exist.
        nav('Saved'); const link = await wait(() => document.querySelector('a.occurrence-link')); link.click();
        nav('Library'); await wait(() => document.querySelector('.transcript-lifecycle-panel'));
        for (const sel of ['#transcript-correction-cue-0', '#transcript-correction-cue-0-start-ms', '#transcript-correction-cue-0-end-ms', '#transcript-word-timing-cue-0-word-0-text']) find(sel);
        return { panel: true, cueEditor: true, approve: !!btn('Approve transcript for study') };
      }
      case 'transcript-edit': {
        const sel = { 'cue-text': '#transcript-correction-cue-0', 'cue-start': '#transcript-correction-cue-0-start-ms', 'cue-end': '#transcript-correction-cue-0-end-ms', 'word-text': '#transcript-word-timing-cue-0-word-0-text', 'word-start': '[name="transcript-word-timing-cue-0-word-0-start-ms"]', 'word-end': '[name="transcript-word-timing-cue-0-word-0-end-ms"]' }[arg.field];
        if (!sel) throw new Error('DomSelector'); const n = find(sel); const original = n.value; fill(sel, arg.value ?? (arg.field.endsWith('text') ? original + 'x' : String(Number(original) + 10)));
        const a = btn('Approve transcript for study'); const gate = document.querySelector('#transcript-approval-gate');
        const blocked = { approveDisabled: !!a && a.disabled, gateVisible: !!gate && !gate.hidden && (gate.textContent ?? '').length > 0 };
        // Dispatch-guard probe: force-enable Approve and click; the handler must refuse and keep the block reason visible.
        let handlerRefused = null, dispatchReasonVisible = null;
        if (a) { a.disabled = false; a.click(); await new Promise((r) => setTimeout(r, 30)); const g = document.querySelector('#transcript-approval-gate'); handlerRefused = !(document.body.textContent ?? '').includes('Transcript approved for study'); dispatchReasonVisible = (!!g && !g.hidden && (g.textContent ?? '').trim().length > 0) || !!document.querySelector('.status-banner.error'); }
        if (arg.revert) fill(sel, original);
        return { ...blocked, handlerRefused, dispatchReasonVisible, reverted: !!arg.revert, approveEnabledAfterRevert: arg.revert ? !btn('Approve transcript for study')?.disabled : null };
      }
      case 'transcript-apply': { click('Create corrected transcript version'); await wait(() => (document.body.textContent ?? '').includes(APPLY_DONE) || document.querySelector('.status-banner.error')); return { applied: (document.body.textContent ?? '').includes(APPLY_DONE) && !document.querySelector('.status-banner.error'), gateText: !!document.querySelector('#transcript-approval-gate') && !document.querySelector('#transcript-approval-gate').hidden }; }
      case 'transcript-approve': {
        // 'save' navigates to Settings; the approval panel only exists in Library (run 2 found Approve missing).
        nav('Library'); await wait(() => document.querySelector('.transcript-lifecycle-panel'));
        const a = btn(BUTTON_LABELS.approveTranscript); if (!a || a.disabled) return { approved: false, enabled: false, present: !!a, nowDisabled: false };
        a.click(); await wait(() => (document.body.textContent ?? '').includes(APPROVED_DONE) || document.querySelector('.status-banner.error'), 3000).catch(() => null);
        return { approved: (document.body.textContent ?? '').includes(APPROVED_DONE), enabled: true, present: true, nowDisabled: btn(BUTTON_LABELS.approveTranscript)?.disabled === true };
      }
      case 'events': return { events: events.slice(arg.from ?? 0).map((e) => ({ stage: e.stage, method: e.method, path: e.path, status: e.status ?? null })) };
      case 'context-attempt': {
        // Foreign or null-origin attempt against /api/restore/{preview,commit}. Same shapes as lt-sor matrix:
        // fetch (JSON, with/without bearer) and text/plain form POST. Capability never enters srcdoc.
        const frame = document.createElement('iframe'); if (arg.fault === 'null') frame.setAttribute('sandbox', 'allow-scripts allow-forms');
        const action = arg.channel === 'fetch'
          ? "try{const r=await fetch(a.origin+a.path,{method:'POST',headers:{...(a.auth?{Authorization:'Bearer '+a.auth}:{}),'Content-Type':'application/json'},body:a.body,credentials:'omit',redirect:'error'});parent.postMessage({ownedAttempt:a.id,status:r.status},'*');}catch{parent.postMessage({ownedAttempt:a.id,status:null,opaque:true},'*');}"
          : "const f=document.createElement('form');f.method='POST';f.enctype='text/plain';f.action=a.origin+a.path;const t=document.createElement('iframe');t.name='owned-target';document.body.append(t);f.target=t.name;const i=document.createElement('input');i.name=a.body;i.value='';f.append(i);document.body.append(f);f.submit();parent.postMessage({ownedAttempt:a.id,sent:true},'*');";
        const html = '<!doctype html><body><script>' + ("addEventListener('message',async function rx(m){removeEventListener('message',rx);const a=m.data;" + action + '});').replaceAll('</script', '<\\/script') + '</script>';
        let done; const p = new Promise((r) => (done = r)); const l = (e) => { if (e.source === frame.contentWindow && e.data?.ownedAttempt === arg.id) done(e.data); }; addEventListener('message', l);
        frame.srcdoc = html; frame.onload = () => frame.contentWindow.postMessage(arg, '*'); document.body.append(frame);
        try { const r = await Promise.race([p, new Promise((res) => setTimeout(() => res({ deadline: true }), 5000))]); return { status: r.status ?? null, opaque: r.opaque === true, sent: r.sent === true, deadline: r.deadline === true, sandboxed: frame.hasAttribute('sandbox') }; }
        finally { removeEventListener('message', l); setTimeout(() => frame.remove(), 1000); }
      }
      case 'cleanup': { globalThis.fetch = originalFetch; document.querySelectorAll('iframe,embed').forEach((n) => n.remove()); return { released: true }; }
      default: throw new Error('UnknownDomOperation');
    }
  } });
}
