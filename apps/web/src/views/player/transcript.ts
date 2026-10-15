import type { AppModel } from '../../uiTypes';
import { analyseCueMorphology, renderMorphologyPanel } from '../../morphologyPanel.ts';
import type { Cue } from '@lingotorte/domain';
import { formatTimeMs } from '../../uiTypes';
import {
  clearSelection,
  nativeTextForCue,
  saveSelectionWithReceipt,
  seekToCue,
  setPendingMeaning,
  setPendingNotes,
  setTranscriptQuery,
  cueWordTokens,
  tokenizeCueText,
} from '../../model';
import { requestFocusAfterRender, rerenderApp } from '../../appShell.ts';
import { CAPTURE_REQUIRES_APPROVAL_MESSAGE, openCapture, showSaveToast } from '../../ui/capture.ts';
import { appendSourceDisclosure, currentKeyboardCue, formatCompactTimeMs, linePosition, mediaLabel, renderSourceMetaChip } from '../../ui/common.ts';
import { focusCueWord, renderCueSourceContext, renderCueTargetText, seekToTimedWord, toggleLoopForWord } from './controls.ts';

export function renderTranscriptPanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'transcript-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Transcript cues');

  const search = document.createElement('div');
  search.className = 'transcript-search';
  const input = document.createElement('input');
  input.id = 'transcript-search';
  input.name = 'transcript-search';
  input.type = 'text';
  input.placeholder = 'Search transcript…';
  input.setAttribute('aria-label', 'Search transcript');
  search.appendChild(input);
  panel.appendChild(search);

  input.value = model.transcriptQuery;
  input.addEventListener('input', (e) => {
    setTranscriptQuery(model, (e.target as HTMLInputElement).value);
    rerenderApp(model);
  });

  if (model.cues.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No transcript loaded yet. Import subtitles in the Library view, or use Generate local ASR draft after connecting the configured local service.';
    panel.appendChild(empty);
    return panel;
  }

  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  const canSaveFromTargetTrack = targetTrack?.transcriptStatus === 'approved';
  if (targetTrack && !canSaveFromTargetTrack) {
    const draftBanner = document.createElement('div');
    draftBanner.className = 'status-banner warning transcript-approval-gate';
    draftBanner.setAttribute('role', 'status');
    draftBanner.textContent = targetTrack.transcriptStatus === 'draft'
      ? 'Draft transcript: correct and approve before study use.'
      : 'Transcript is being corrected: approve it before study use.';
    panel.appendChild(draftBanner);
  }

  const filtered = model.transcriptQuery
    ? model.cues.filter((c: Cue) => c.text.toLowerCase().includes(model.transcriptQuery.toLowerCase()))
    : model.cues;

  for (const cue of filtered) {
    const isActive = cue.id === model.player.activeCueId;
    const row = document.createElement('div');
    row.className = `cue-row${isActive ? ' active' : ''}`;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.id = `cue-row-${cue.id}`;
    row.setAttribute('data-cue-id', cue.id);
    row.setAttribute('aria-label', `Line at ${formatTimeMs(cue.startMs)}: ${cue.text}`);
    if (isActive) row.setAttribute('aria-current', 'true');

    const time = document.createElement('div');
    time.className = 'cue-time';
    time.textContent = `${formatTimeMs(cue.startMs)} – ${formatTimeMs(cue.endMs)}`;
    row.appendChild(time);

    const target = renderCueTargetText(model, cue);
    row.appendChild(target);

    const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
    const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
    const nativeText = nativeTextForCue(cue, nativeTrack, nativeCues);
    if (nativeText) {
      const native = document.createElement('div');
      native.className = 'cue-native';
      native.textContent = nativeText;
      row.appendChild(native);
    }

    row.appendChild(renderCueSourceContext(model, cue));

    const actions = document.createElement('div');
    actions.className = 'cue-actions';
    const saveSentenceBtn = document.createElement('button');
    saveSentenceBtn.textContent = 'Save sentence…';
    saveSentenceBtn.setAttribute('aria-label', `Save sentence from line at ${formatTimeMs(cue.startMs)}`);
    saveSentenceBtn.disabled = !canSaveFromTargetTrack;
    if (!canSaveFromTargetTrack) {
      saveSentenceBtn.title = 'Approve this transcript before saving learner study items.';
    }
    saveSentenceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!canSaveFromTargetTrack) return;
      // lt-cms: open the capture form instead of saving immediately.
      openCapture(model, {
        kind: 'sentence',
        text: cue.text,
        cueId: cue.id,
        tokenStart: 0,
        tokenEnd: cue.text.split(/\s+/).filter(Boolean).length,
        charStart: 0,
        charEnd: cue.text.length,
      });
    });
    actions.appendChild(saveSentenceBtn);

    const tokenizeBtn = document.createElement('button');
    tokenizeBtn.textContent = 'Show words';
    tokenizeBtn.setAttribute('aria-label', `Show words for line at ${formatTimeMs(cue.startMs)}`);
    tokenizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void tokenizeCueText(model, cue).then((tokens: import('../../model').TokenInfo[]) => {
        const surface = tokens.map((t: import('../../model').TokenInfo) => t.surface).join(' | ');
        model.player.lastTokenPreview = surface;
        rerenderApp(model);
      });
    });
    actions.appendChild(tokenizeBtn);

    // lt-e8z: grammar analysis (local Morfeusz when paired, browser estimate otherwise). Native button: Enter/Space.
    const analyseBtn = document.createElement('button');
    analyseBtn.type = 'button';
    analyseBtn.className = 'analyse-words';
    // Stable id so rerenderApp restores keyboard focus to this button after the analysis renders.
    analyseBtn.id = `analyse-words-${cue.id}`;
    analyseBtn.textContent = 'Analyse words';
    analyseBtn.setAttribute('aria-label', `Analyse word grammar for line at ${formatTimeMs(cue.startMs)}`);
    analyseBtn.setAttribute('aria-controls', 'morphology-panel');
    analyseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void analyseCueMorphology(model, cue, null, () => rerenderApp(model));
    });
    analyseBtn.addEventListener('keydown', (e) => e.stopPropagation());
    actions.appendChild(analyseBtn);

    row.appendChild(actions);

    const seek = () => {
      seekToCue(model, cue);
      const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
      if (video) {
        video.currentTime = cue.startMs / 1000;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => undefined);
        }
      }
      rerenderApp(model);
    };
    row.addEventListener('click', (e) => {
      // lt-z8s: word buttons are handled by the panel's delegated listener; they never seek the row.
      if ((e.target as Element | null)?.closest?.('.cue-word')) return;
      seek();
    });
    row.addEventListener('keydown', (e) => {
      // lt-r4k.3: only handle keys aimed at the row itself; nested buttons keep native activation.
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        seek();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // lt-z8s: words are not Tab stops; arrows step from the row into its first/last word.
        const ws = Array.from(row.querySelectorAll<HTMLElement>('.cue-target .cue-word, .cue-text .cue-word'));
        const targetWord = e.key === 'ArrowRight' ? ws[0] : ws[ws.length - 1];
        if (!targetWord) return;
        e.preventDefault();
        focusCueWord(targetWord);
      }
    });
    row.addEventListener('mouseup', () => {
      const domSelection = window.getSelection();
      const selectionText = domSelection?.toString().trim();
      if (selectionText) {
        lastDragCaptureAt.set(model, Date.now());
        const rangeStart = selectionOffsetInCueText(row, domSelection, cue.text, selectionText);
        // lt-z8s: same synchronous tokenizer as the word buttons, so click and drag yield identical anchors.
        {
          const tokens = cueWordTokens(cue.text);
          const lower = selectionText.toLowerCase();
          const token = tokens.find(
            (t: import('../../model').TokenInfo) =>
              t.surface.toLowerCase() === lower ||
              (selectionText.length > t.surface.length && cue.text.toLowerCase().slice(t.charStart, t.charEnd).includes(lower)),
          );
          // lt-cms: build a capture selection; nothing is persisted until Save occurrence.
          const anchoredToken = rangeStart === null
            ? token
            : tokens.find((t) => t.charStart === rangeStart && t.surface.toLowerCase() === lower);
          if (anchoredToken && anchoredToken.surface.toLowerCase() === lower) {
            const token = anchoredToken;
            openCapture(model, {
              kind: 'lexeme',
              text: token.surface,
              cueId: cue.id,
              tokenStart: token.tokenIndex,
              tokenEnd: token.tokenIndex + 1,
              charStart: token.charStart,
              charEnd: token.charEnd,
            });
            return;
          }
          const phraseStart = rangeStart ?? cue.text.toLowerCase().indexOf(lower);
          const charStart = phraseStart >= 0 ? phraseStart : 0;
          const charEnd = phraseStart >= 0 ? phraseStart + selectionText.length : cue.text.length;
          const overlapping = tokens.filter((t) => t.charStart < charEnd && t.charEnd > charStart);
          const tokenStart = overlapping.length ? Math.min(...overlapping.map((t) => t.tokenIndex)) : 0;
          const tokenEnd = overlapping.length ? Math.max(...overlapping.map((t) => t.tokenIndex)) + 1 : tokens.length;
          openCapture(model, {
            kind: overlapping.length === 1 ? 'lexeme' : 'phrase',
            text: overlapping.length === 1 ? overlapping[0]!.surface : selectionText,
            cueId: cue.id,
            tokenStart,
            tokenEnd,
            charStart: overlapping.length === 1 ? overlapping[0]!.charStart : charStart,
            charEnd: overlapping.length === 1 ? overlapping[0]!.charEnd : charEnd,
          });
          return;
        }
      }
    });
    panel.appendChild(row);
  }
  installCueWordDelegation(model, panel);
  return panel;
}

// lt-z8s: set when a drag-select mouseup captures, so the click that follows it on a word button is ignored.
const lastDragCaptureAt = new WeakMap<AppModel, number>();
const DRAG_CLICK_SUPPRESS_MS = 400;

// lt-z8s: one delegated listener set per transcript panel (no per-token listeners). Word buttons carry
// data-word-cue-id (not data-cue-id, which row selectors rely on)/data-token-index/data-char-start/data-char-end; timed ones also data-start-ms.
function cueWordFromEvent(e: Event): HTMLElement | null {
  // Duck-typed (no instanceof) so it works across realms, e.g. jsdom windows in tests.
  return ((e.target as Element | null)?.closest?.('.cue-word') as HTMLElement | null | undefined) ?? null;
}

function wordRange(button: HTMLElement) {
  return {
    tokenIndex: Number(button.dataset.tokenIndex),
    charStart: Number(button.dataset.charStart),
    charEnd: Number(button.dataset.charEnd),
  };
}

/** Capture `button`; with `extend`, grow the current same-cue selection to include this word. */
function captureCueWord(model: AppModel, cue: Cue, button: HTMLElement, extend: boolean): boolean {
  const word = wordRange(button);
  const prior = model.selection;
  if (extend && prior && prior.cueId === cue.id && prior.kind !== 'sentence') {
    const span = {
      tokenStart: Math.min(prior.tokenStart, word.tokenIndex),
      tokenEnd: Math.max(prior.tokenEnd, word.tokenIndex + 1),
      charStart: Math.min(prior.charStart, word.charStart),
      charEnd: Math.max(prior.charEnd, word.charEnd),
    };
    const multi = span.tokenEnd - span.tokenStart > 1;
    return openCapture(model, { kind: multi ? 'phrase' : 'lexeme', text: cue.text.slice(span.charStart, span.charEnd), cueId: cue.id, ...span });
  }
  return openCapture(model, {
    kind: 'lexeme',
    text: cue.text.slice(word.charStart, word.charEnd),
    cueId: cue.id,
    tokenStart: word.tokenIndex,
    tokenEnd: word.tokenIndex + 1,
    charStart: word.charStart,
    charEnd: word.charEnd,
  });
}

function installCueWordDelegation(model: AppModel, panel: HTMLElement): void {
  const cueFor = (button: HTMLElement) => model.cues.find((c: Cue) => c.id === button.dataset.wordCueId) ?? null;
  panel.addEventListener('click', (e) => {
    const button = cueWordFromEvent(e);
    if (!button) return;
    e.stopPropagation();
    // A drag that starts and ends on one button also fires click; the row's mouseup already captured it.
    // (The capture rerender may already have collapsed the DOM selection, so also honour the mouseup mark.)
    if (Date.now() - (lastDragCaptureAt.get(model) ?? 0) < DRAG_CLICK_SUPPRESS_MS) return;
    const domSelection = window.getSelection();
    if (domSelection && domSelection.isCollapsed === false && domSelection.toString().trim()) return;
    const cue = cueFor(button);
    if (!cue) return;
    // Second click of a double-click: the word is already selected; skip the redundant capture/rerender
    // so dblclick only toggles the word loop and leaves one lexeme selection of this word.
    const prior = model.selection;
    if (e.detail > 1 && !e.shiftKey && !e.altKey && prior && prior.cueId === cue.id && prior.kind === 'lexeme'
      && prior.tokenStart === Number(button.dataset.tokenIndex) && prior.tokenEnd === Number(button.dataset.tokenIndex) + 1) return;
    if (e.altKey) {
      // Alt+click replays a timed word; plain click collects.
      if (button.dataset.startMs !== undefined) seekToTimedWord(model, cue, Number(button.dataset.startMs));
      return;
    }
    captureCueWord(model, cue, button, e.shiftKey);
  });
  panel.addEventListener('dblclick', (e) => {
    const button = cueWordFromEvent(e);
    if (!button || button.dataset.startMs === undefined) return;
    e.stopPropagation();
    const cue = cueFor(button);
    if (cue) toggleLoopForWord(model, cue, Number(button.dataset.charStart), Number(button.dataset.charEnd));
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      // Word spans are role="button" spans (not <button>), so activate them by hand: same path as click.
      const button = cueWordFromEvent(e);
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const cue = cueFor(button);
      if (cue) captureCueWord(model, cue, button, e.shiftKey);
      return;
    }
    if (e.key === 'Escape') {
      const button = cueWordFromEvent(e);
      const cueRow = button?.closest<HTMLElement>('.cue-row');
      if (!cueRow) return;
      e.preventDefault();
      e.stopPropagation();
      cueRow.focus();
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const button = cueWordFromEvent(e);
    if (!button) return;
    const words = Array.from(button.parentElement?.querySelectorAll<HTMLElement>('.cue-word') ?? []);
    const next = words[words.indexOf(button) + (e.key === 'ArrowRight' ? 1 : -1)];
    e.preventDefault();
    e.stopPropagation();
    if (!next) return;
    const cue = cueFor(button);
    if (e.shiftKey && cue) {
      const prior = model.selection;
      if (!(prior && prior.cueId === cue.id && prior.kind !== 'sentence')) captureCueWord(model, cue, button, false);
      if (!captureCueWord(model, cue, next, true)) return;
      focusCueWord(document.getElementById(next.id));
      return;
    }
    focusCueWord(next);
  });
}

// lt-cms: anchor a drag-selection by its DOM Range offset within the cue's target-text element so a
// repeated word maps to the occurrence the learner actually selected. Returns null when unavailable
// (no range, selection outside the cue text, or text mismatch) so callers fall back to indexOf.
function selectionOffsetInCueText(row: HTMLElement, sel: globalThis.Selection | null | undefined, cueText: string, selectionText: string): number | null {
  if (!sel || typeof sel.rangeCount !== 'number' || sel.rangeCount < 1 || typeof sel.getRangeAt !== 'function') return null;
  const range = sel.getRangeAt(0);
  const textEl = row.querySelector('.cue-target, .cue-text') as HTMLElement | null;
  if (!textEl || !textEl.contains(range.startContainer)) return null;
  if ((textEl.textContent ?? '') !== cueText) return null;
  const pre = document.createRange();
  pre.selectNodeContents(textEl);
  pre.setEnd(range.startContainer, range.startOffset);
  let offset = pre.toString().length;
  const raw = range.toString();
  offset += raw.length - raw.trimStart().length;
  if (cueText.slice(offset, offset + selectionText.length).toLowerCase() !== selectionText.toLowerCase()) return null;
  return offset;
}

function renderSelectionSourceSummary(model: AppModel): HTMLElement | null {
  const cue = currentKeyboardCue(model);
  if (!cue) return null;
  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  const summary = document.createElement('div');
  summary.className = 'selection-source-summary';
  summary.append(
    renderSourceMetaChip(mediaLabel(model)),
    renderSourceMetaChip(`line ${linePosition(model, cue)}`),
    renderSourceMetaChip(`${formatCompactTimeMs(cue.startMs)}–${formatCompactTimeMs(cue.endMs)}`),
  );
  if (targetTrack) {
    summary.append(renderSourceMetaChip(targetTrack.transcriptStatus === 'approved' ? 'Transcript ready' : 'Transcript draft'));
  }
  if (model.currentMedia?.originalPath) {
    const detail = document.createElement('div');
    detail.className = 'selection-source-detail';
    // lt-unl: track version stays in the disclosure, off the primary line.
    appendSourceDisclosure(detail, 'source details', targetTrack ? `${model.currentMedia.originalPath} • track v${targetTrack.trackVersion} • ${targetTrack.transcriptStatus}` : model.currentMedia.originalPath);
    summary.appendChild(detail);
  }
  return summary;
}

export function renderSelectionPanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'card selection-panel';
  const h2 = document.createElement('h2');
  // lt-dlf.7 (N2): heading names what is being saved; the grammar block sits below the form.
  const kind = model.selection?.kind;
  h2.textContent = kind === 'sentence' ? 'Save a sentence' : kind === 'phrase' ? 'Save a phrase' : kind === 'lexeme' ? 'Save a word' : 'Save a word or phrase';
  panel.appendChild(h2);
  const morphology = renderMorphologyPanel(model, () => rerenderApp(model));

  if (model.player.lastTokenPreview) {
    const preview = document.createElement('div');
    const isSavedPreview = model.player.lastTokenPreview.startsWith('Saved ');
    preview.className = `token-preview${isSavedPreview ? ' saved-occurrence-preview' : ''}`;
    const label = document.createElement('strong');
    label.textContent = isSavedPreview ? 'Saved:' : 'Words in this line:';
    const value = document.createElement('span');
    value.textContent = model.player.lastTokenPreview;
    preview.append(label, value);
    if (isSavedPreview) {
      const sourceSummary = renderSelectionSourceSummary(model);
      if (sourceSummary) preview.appendChild(sourceSummary);
    }
    panel.appendChild(preview);
  }

  if (!model.selection) {
    if (model.importError === CAPTURE_REQUIRES_APPROVAL_MESSAGE) {
      const blocked = document.createElement('p');
      blocked.className = 'selection-help capture-blocked';
      blocked.setAttribute('role', 'status');
      blocked.textContent = CAPTURE_REQUIRES_APPROVAL_MESSAGE;
      panel.appendChild(blocked);
    }
    const p = document.createElement('p');
    p.className = 'selection-help';
    p.textContent = model.player.lastTokenPreview?.startsWith('Saved ')
      ? 'Saved to My Vocab with the video and time it came from. Select another word in the transcript, or open My Vocab to see where you saved it.'
      : 'Select a word or phrase in a transcript line to save it with the video and time it came from.';
    panel.appendChild(p);
    panel.appendChild(morphology);
    return panel;
  }

  const p = document.createElement('p');
  p.textContent = `Selected: “${model.selection.text}” (${model.selection.kind === 'lexeme' ? 'word' : model.selection.kind})`;
  panel.appendChild(p);

  const form = document.createElement('div');
  form.className = 'selection-form';

  const meaningGroup = document.createElement('div');
  const meaningLabel = document.createElement('label');
  meaningLabel.textContent = 'Meaning (optional)';
  meaningLabel.htmlFor = 'selection-meaning';
  const meaningInput = document.createElement('input');
  meaningInput.id = 'selection-meaning';
  meaningInput.type = 'text';
  meaningInput.value = model.pendingMeaning;
  meaningInput.placeholder = 'e.g. hello';
  meaningInput.addEventListener('input', (e) => {
    setPendingMeaning(model, (e.target as HTMLInputElement).value);
  });
  meaningGroup.append(meaningLabel, meaningInput);
  form.appendChild(meaningGroup);

  const notesGroup = document.createElement('div');
  const notesLabel = document.createElement('label');
  notesLabel.textContent = 'Notes (optional)';
  notesLabel.htmlFor = 'selection-notes';
  const notesInput = document.createElement('textarea');
  notesInput.id = 'selection-notes';
  notesInput.value = model.pendingNotes;
  notesInput.placeholder = 'Personal notes…';
  notesInput.addEventListener('input', (e) => {
    setPendingNotes(model, (e.target as HTMLInputElement).value);
  });
  notesGroup.append(notesLabel, notesInput);
  form.appendChild(notesGroup);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save occurrence'; // exact text: tests and browser scripts click it
  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  const canSave = targetTrack?.transcriptStatus === 'approved';
  saveBtn.disabled = !canSave;
  if (!canSave) saveBtn.title = 'Approve this transcript before saving learner study items.';
  // lt-dlf.5 (audit N10): closing the form destroys Meaning as the panel moves back to the left column,
  // so hand focus to the clicked cue row (preventScroll + 'nearest'); the toast's Undo never takes focus.
  const returnFocusToRow = `cue-row-${model.selection.cueId}`;
  const commit = () => {
    if (!canSave) return;
    void saveSelectionWithReceipt(model)
      .then((receipt) => {
        clearSelection(model);
        requestFocusAfterRender(model, returnFocusToRow);
        if (receipt) showSaveToast(model, receipt);
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  };
  const cancel = () => {
    clearSelection(model);
    requestFocusAfterRender(model, returnFocusToRow);
    rerenderApp(model);
  };
  saveBtn.addEventListener('click', commit);
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', cancel);
  meaningInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      commit();
    }
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  });
  actions.append(cancelBtn, saveBtn);
  form.appendChild(actions);
  panel.appendChild(form);
  panel.appendChild(morphology);

  return panel;
}
