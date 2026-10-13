// lt-3kk daily-driver journey ops, layered on dom-batch.mjs (installBatchDriver). DOM-only: never imports
// production modules, never touches the model. Results are booleans/counts/fixed keys only. Free text the
// page shows is compared page-side against exact app strings; it is never returned.
// Exact strings traced in the web app sources app.ts, model.ts, morphologyPanel.ts (test-enforced).
export const J = Object.freeze({
  gatedDraft: 'Import gated demo caption draft', // app.ts renderTranscriptLifecyclePanel
  draftDone: 'Draft transcript imported',
  publicRead: 'input[name="youtube-public-read-auth"]',
  saveSentence: 'Save sentence',
  showAnswer: 'Show answer / context',
  createReviewCard: 'Create review card', // app.ts renderSavedView, one per saved item
  submitAttempt: 'Submit attempt',
  downloadExport: 'Download export JSON',
  analyse: 'Analyse words',
  sourceService: 'Local morphology (Morfeusz)', // morphologyPanel.ts SOURCE_LABELS.service
  ambiguousQuality: 'Several readings, check',
  meaningsUnavailable: 'Word meanings and translations are not available: no dictionary or translation provider is configured. This shows grammar only.',
  noDue: 'No cards due right now. All cards, including mastered cards, return when scheduled.',
});
// Fixed focus keys: activeElement -> one of these (never text).
const FOCUS_KEYS = [
  ['body', (n) => n === document.body || !n],
  ['navPlayer', (n) => n.closest?.('.lingotorte-nav') && n.textContent.trim() === 'Player'],
  ['navLibrary', (n) => n.closest?.('.lingotorte-nav') && n.textContent.trim() === 'Library'],
  ['navSaved', (n) => n.closest?.('.lingotorte-nav') && n.textContent.trim() === 'Saved'],
  ['navReview', (n) => n.closest?.('.lingotorte-nav') && n.textContent.trim() === 'Review'],
  ['navPractice', (n) => n.closest?.('.lingotorte-nav') && n.textContent.trim() === 'Practice'],
  ['navExportImport', (n) => n.closest?.('.lingotorte-nav') && n.textContent.trim() === 'Export / Import'],
  ['navSettings', (n) => n.closest?.('.lingotorte-nav') && n.textContent.trim() === 'Settings'],
  ['analyseWords', (n) => n.classList?.contains('analyse-words')],
  ['saveSentence', (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'Save sentence'],
  ['showAnswer', (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'Show answer / context'],
  ['rateGood', (n) => n.getAttribute?.('aria-label') === 'Rate good'],
  ['submitAttempt', (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'Submit attempt'],
  ['practiceMode', (n) => n.id === 'practice-mode'],
  ['practiceAnswer', (n) => n.id === 'practice-answer'],
  ['practiceChoice', (n) => n.classList?.contains('practice-choice')],
  ['createReviewCard', (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'Create review card'],
  ['createCorrectedTranscript', (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'Create corrected transcript version'],
  ['approveTranscript', (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'Approve transcript for study'],
  ['importGatedDraft', (n) => n.tagName === 'BUTTON' && n.textContent.trim() === 'Import gated demo caption draft'],
  ['morphologyPanel', (n) => !!n.closest?.('#morphology-panel')],
  ['cueRow', (n) => n.classList?.contains('cue-row')],
  ['video', (n) => n.tagName === 'VIDEO'],
];
export const focusKey = (n) => (FOCUS_KEYS.find(([, f]) => { try { return !!f(n); } catch { return false; } }) ?? ['unlisted'])[0];

export async function installJourneyDriver(batch, requireUi = true) {
  const base = await batch.installBatchDriver(requireUi);
  const { diagnostic } = batch;
  const wait = async (fn, ms = 8000, tag = 'DomDeadline|none|none') => { const end = performance.now() + ms; while (performance.now() < end) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 15)); } throw new Error(tag); };
  const body = () => document.body.textContent ?? '';
  const buttons = (scope = document) => [...scope.querySelectorAll('button')];
  const byText = (t, scope = document) => buttons(scope).find((b) => b.textContent.trim() === t);
  const navBtn = (t) => byText(t, document.querySelector('.lingotorte-nav') ?? document);
  const nav = async (t) => { const b = navBtn(t); if (!b) throw diagnostic('DomButton', 'nav', 'missing'); b.click(); await new Promise((r) => setTimeout(r, 0)); };
  // Cue editor ids use cue.cueIndex (app.ts ~3436), which starts at 1 for provider drafts (JSDOM probe finding):
  // take the first editor in document order instead of assuming '-0'.
  const firstCueEditor = () => [...document.querySelectorAll('textarea[id^="transcript-correction-cue-"]')].find((n) => /^transcript-correction-cue-\d+$/.test(n.id)) ?? null;
  const cueRows = () => [...document.querySelectorAll('.transcript-panel .cue-row')];
  // Focus targets. Each resolves to one element; key names are the controller DOM_ELEMENTS vocabulary.
  const targets = {
    navPlayer: () => navBtn('Player'), navLibrary: () => navBtn('Library'), navReview: () => navBtn('Review'), navPractice: () => navBtn('Practice'),
    navSaved: () => navBtn('Saved'), navSettings: () => navBtn('Settings'), navExportImport: () => navBtn('Export / Import'),
    importGatedDraft: () => byText(J.gatedDraft), createCorrectedTranscript: () => byText('Create corrected transcript version'),
    approveTranscript: () => byText('Approve transcript for study'),
    saveSentence: () => cueRows()[0] && byText(J.saveSentence, cueRows()[0]),
    analyseWords: () => cueRows()[0]?.querySelector('button.analyse-words'),
    showAnswer: () => byText(J.showAnswer), rateGood: () => document.querySelector('.review-buttons button[aria-label="Rate good"]'),
    submitAttempt: () => byText(J.submitAttempt), practiceMode: () => document.querySelector('#practice-mode'),
    practiceAnswer: () => document.querySelector('#practice-answer'),
    practiceChoice: (i) => document.querySelectorAll('.practice-choices button.practice-choice')[i ?? 0],
    createReviewCard: (i) => buttons().filter((b) => b.textContent.trim() === J.createReviewCard)[i ?? 0],
  };
  const focusInfo = () => {
    const n = document.activeElement; const cs = n && n !== document.body ? getComputedStyle(n) : null;
    let fv = null; try { fv = n && n !== document.body ? n.matches(':focus-visible') : false; } catch { fv = null; }
    const ow = cs ? parseFloat(cs.outlineWidth) || 0 : 0;
    return { key: focusKey(n), onBody: !n || n === document.body, focusVisible: fv, outline: !!cs && cs.outlineStyle !== 'none' && ow > 0, ring: !!cs && ((cs.outlineStyle !== 'none' && ow > 0) || (cs.boxShadow && cs.boxShadow !== 'none')) };
  };
  // Exported-manifest capture: the 'Download export JSON' button calls downloadTextFile(Blob). The blob text is
  // kept in page memory only and pasted into #import-manifest by 'restore-preview-captured'. Never returned.
  let captured = null;
  const realCreate = URL.createObjectURL;
  const ownedEvents = () => base.invoke('events', {});

  async function invoke(op, arg = {}) {
    switch (op) {
      case 'focus': {
        const fn = targets[arg.target]; const n = fn ? fn(arg.index) : null;
        if (!n) throw diagnostic('DomSelector', arg.target in targets ? arg.target : 'unlisted', 'missing');
        if (n.disabled) throw diagnostic('DomButton', arg.target, 'disabled');
        n.focus(); return { ...focusInfo(), focused: document.activeElement === n };
      }
      case 'focus-info': return focusInfo();
      case 'activate-fallback': { // JSDOM probe only: stands in for CDP Enter on the focused control
        const n = document.activeElement; if (!n || n === document.body) throw diagnostic('DomSelector', 'none', 'missing'); n.click(); return focusInfo();
      }
      case 'gated-draft': {
        await nav('Library'); await wait(() => document.querySelector('.transcript-lifecycle-panel'));
        const box = document.querySelector(J.publicRead); if (!box) throw diagnostic('DomSelector', 'publicReadAuth', 'missing');
        if (!box.checked) box.click();
        return { authorized: box.checked, buttonPresent: !!byText(J.gatedDraft) };
      }
      case 'gated-draft-settle': { await wait(() => body().includes(J.draftDone) || document.querySelector('.status-banner.error[role="alert"]'), arg.ms ?? 5000); await wait(() => firstCueEditor(), 3000).catch(() => null); return { imported: body().includes(J.draftDone), cueEditor: !!firstCueEditor() }; }
      case 'edit-cue0': {
        // 'save' navigates to Settings (run-2 lesson); the editor lives in Library.
        await nav('Library'); await wait(() => firstCueEditor(), 3000).catch(() => null);
        const n = firstCueEditor(); if (!n) throw diagnostic('DomSelector', 'cueText', 'missing');
        n.value = arg.text; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true }));
        const a = byText('Approve transcript for study'); return { approveDisabledWhileDirty: !!a && a.disabled };
      }
      case 'apply-settle': { await wait(() => body().includes(batch.APPLY_DONE) || document.querySelector('.status-banner.error[role="alert"]'), 5000); return { applied: body().includes(batch.APPLY_DONE) }; }
      case 'approve-settle': { await wait(() => body().includes(batch.APPROVED_DONE), 3000).catch(() => null); return { approved: body().includes(batch.APPROVED_DONE), nowDisabled: byText('Approve transcript for study')?.disabled === true }; }
      case 'player-cues': {
        await nav('Player'); await wait(() => cueRows().length > 0, 5000);
        const r0 = cueRows()[0]; const s = r0 && byText(J.saveSentence, r0);
        return { cues: cueRows().length, cue0Matches: !!r0 && (r0.querySelector('.cue-target')?.textContent ?? '') === arg.text, saveEnabled: !!s && !s.disabled, draftBanner: !!document.querySelector('.transcript-panel .transcript-approval-gate') };
      }
      case 'select-word': {
        // Real selection + mouseup on the cue row (app.ts renderTranscriptPanel mouseup -> saveSelectedPhraseFromCue).
        const r0 = cueRows()[0]; const t = r0?.querySelector('.cue-target'); if (!t) throw diagnostic('DomSelector', 'cueRow', 'missing');
        const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); let node, at = -1;
        while ((node = walker.nextNode())) { at = node.data.indexOf(arg.word); if (at >= 0) break; }
        if (!node) throw diagnostic('DomSelector', 'cueRow', 'missing');
        const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + arg.word.length);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        r0.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        // The mouseup path saves via saveSelectedPhraseFromCue and does not render a 'Saved' preview (JSDOM probe):
        // the page only reports that the gesture ran; the server oracle after Save is the evidence.
        await new Promise((r) => setTimeout(r, 300));
        sel.removeAllRanges();
        return { gesture: true, selectionHelp: !!document.querySelector('.selection-help') };
      }
      case 'review-state': {
        await wait(() => document.querySelector('.review-card'), 3000);
        return { prompt: !!document.querySelector('.review-prompt'), revealed: !!document.querySelector('.review-reveal'), rateButtons: document.querySelectorAll('.review-buttons button').length, empty: body().includes(J.noDue) };
      }
      case 'practice-state': {
        await wait(() => document.querySelector('.practice-card'), 3000);
        const fb = document.querySelector('.practice-feedback'); const choices = [...document.querySelectorAll('.practice-choices button.practice-choice')];
        const wrong = arg.expected ? choices.findIndex((c) => c.textContent.trim() !== arg.expected) : -1;
        return { mode: document.querySelector('#practice-mode')?.value ?? null, answerInput: !!document.querySelector('#practice-answer'), choices: choices.length, wrongChoiceIndex: wrong, feedback: fb ? (fb.classList.contains('success') ? 'success' : 'error') : 'none', empty: body().includes(J.noDue) || !document.querySelector('#practice-mode') };
      }
      case 'morphology-state': {
        await wait(() => { const s = document.querySelector('#morphology-status'); return s && !(s.textContent ?? '').startsWith('Analysing'); }, arg.ms ?? 10000);
        const panel = document.querySelector('#morphology-panel'); const status = document.querySelector('#morphology-status'); const t = panel?.textContent ?? '';
        const flagged = [...(panel?.querySelectorAll('button.morphology-token') ?? [])].filter((b) => (b.getAttribute('aria-label') ?? '').includes('several readings'));
        let alternatives = 0;
        if (flagged[0]) { flagged[0].click(); await new Promise((r) => setTimeout(r, 30)); const p2 = document.querySelector('#morphology-panel'); alternatives = p2 ? p2.querySelectorAll('#morphology-detail li, #morphology-detail button').length : 0; }
        const p3 = document.querySelector('#morphology-panel'); const t3 = p3?.textContent ?? '';
        return { panel: !!panel, statusRole: status?.getAttribute('role') === 'status', statusLive: status?.getAttribute('aria-live') === 'polite', sourceService: t.includes(J.sourceService) || t3.includes(J.sourceService), ambiguousFlag: flagged.length > 0, ambiguousQuality: t3.includes(J.ambiguousQuality), alternatives, meaningsUnavailable: t.includes(J.meaningsUnavailable), tokens: panel?.querySelectorAll('button.morphology-token').length ?? 0 };
      }
      case 'overflow': {
        const p = document.querySelector('#morphology-panel'); const de = document.documentElement;
        return { width: innerWidth, panelOverflow: !!p && p.scrollWidth > p.clientWidth + 1, pageOverflow: de.scrollWidth > innerWidth + 1, panelPresent: !!p };
      }
      case 'capture-export': {
        await nav('Export / Import'); captured = null;
        URL.createObjectURL = function (blob) { if (blob instanceof Blob) blob.text().then((t) => { captured = t; }); return realCreate.call(URL, blob); };
        try { const b = byText(J.downloadExport); if (!b) throw diagnostic('DomButton', 'downloadExport', 'missing'); b.click(); await wait(() => captured !== null, 3000); }
        finally { URL.createObjectURL = realCreate; }
        let ok = false; try { ok = JSON.parse(captured)?.schemaVersion !== undefined; } catch { ok = false; }
        return { captured: ok, bytes: captured.length };
      }
      case 'restore-preview-captured': { if (!captured) throw diagnostic('DomSelector', 'importManifest', 'missing'); return await base.invoke('restore-preview', { manifestJson: captured }); }
      case 'saved-count': {
        // Saved view has role=tab 'My Vocab' (#saved-tab-vocab: lexeme/phrase) and 'My Sentences' (#saved-tab-sentences).
        await nav('Saved'); await wait(() => document.querySelector('#saved-heading'), 3000);
        if (arg.tab) { const t = document.querySelector('#saved-tab-' + (arg.tab === 'sentences' ? 'sentences' : 'vocab')); if (!t) throw diagnostic('DomSelector', 'unlisted', 'missing'); if (t.getAttribute('aria-selected') !== 'true') { t.click(); await new Promise((r) => setTimeout(r, 0)); } }
        return { links: document.querySelectorAll('a.occurrence-link').length, createButtons: buttons().filter((b) => b.textContent.trim() === J.createReviewCard).length };
      }
      case 'media-feedback': {
        // Undecodable media: wait for the <video> error and look for visible, accessible feedback anywhere.
        await nav('Player'); const v = await wait(() => document.querySelector('.video-stage video'), 3000).catch(() => null);
        const end = performance.now() + (arg.ms ?? 6000); while (performance.now() < end && !(v?.error)) await new Promise((r) => setTimeout(r, 50));
        await new Promise((r) => setTimeout(r, 500));
        const alerts = [...document.querySelectorAll('[role="alert"], [role="status"], .status-banner.error')].filter((n) => n.getClientRects().length > 0 && /decod|codec|format|cannot be played|could not (load|play)|unsupported|not supported/i.test(n.textContent ?? ''));
        return { videoPresent: !!v, videoErrorCode: v?.error?.code ?? null, feedbackVisible: alerts.length > 0, feedbackAccessible: alerts.some((n) => ['alert', 'status'].includes(n.getAttribute('role') ?? '')) };
      }
      case 'morph-events': { const e = (await ownedEvents()).events.filter((x) => x.path === '/api/language/morphology'); return { posts: e.filter((x) => x.stage === 'start' && x.method === 'POST').length, ok200: e.filter((x) => x.stage === 'finish' && x.status === 200).length }; }
      case 'external-events': { const e = (await ownedEvents()).events; return { nonState: e.filter((x) => !['/api/state', '/api/status', '/api/language/morphology', '/api/restore/preview', '/api/restore/commit'].includes(x.path)).length }; }
      default: return await base.invoke(op, arg);
    }
  }
  return Object.freeze({ invoke });
}
