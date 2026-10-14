import type { AppModel } from '../../uiTypes';
import { analyseCueMorphology, renderMorphologyPanel } from '../../morphologyPanel.ts';
import type { Cue } from '@lingotorte/domain';
import { formatTimeMs } from '../../uiTypes';
import {
  clearSelection,
  nativeTextForCue,
  saveSelection,
  seekToCue,
  setPendingMeaning,
  setPendingNotes,
  setTranscriptQuery,
  tokenizeCueText,
} from '../../model';
import { rerenderApp } from '../../appShell.ts';
import { CAPTURE_REQUIRES_APPROVAL_MESSAGE, openCapture } from '../../ui/capture.ts';
import { appendSourceDisclosure, currentKeyboardCue, formatCompactTimeMs, mediaLabel, renderSourceMetaChip } from '../../ui/common.ts';
import { renderCueSourceContext, renderCueTargetText } from './controls.ts';

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
    row.setAttribute('data-cue-id', cue.id);
    row.setAttribute('aria-label', `Cue at ${formatTimeMs(cue.startMs)}: ${cue.text}`);
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
    saveSentenceBtn.setAttribute('aria-label', `Save sentence from cue at ${formatTimeMs(cue.startMs)}`);
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
    tokenizeBtn.textContent = 'Show tokens';
    tokenizeBtn.setAttribute('aria-label', `Show tokens for cue at ${formatTimeMs(cue.startMs)}`);
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
    analyseBtn.setAttribute('aria-label', `Analyse word grammar for cue at ${formatTimeMs(cue.startMs)}`);
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
    row.addEventListener('click', seek);
    row.addEventListener('keydown', (e) => {
      // lt-r4k.3: only handle keys aimed at the row itself; nested buttons keep native activation.
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        seek();
      }
    });
    row.addEventListener('mouseup', () => {
      const domSelection = window.getSelection();
      const selectionText = domSelection?.toString().trim();
      if (selectionText) {
        const rangeStart = selectionOffsetInCueText(row, domSelection, cue.text, selectionText);
        void tokenizeCueText(model, cue).then((tokens: import('../../model').TokenInfo[]) => {
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
        });
      }
    });
    panel.appendChild(row);
  }
  return panel;
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
    renderSourceMetaChip(`cue ${cue.cueIndex}`),
    renderSourceMetaChip(`${formatCompactTimeMs(cue.startMs)}–${formatCompactTimeMs(cue.endMs)}`),
  );
  if (targetTrack) {
    summary.append(renderSourceMetaChip(`track v${targetTrack.trackVersion}`), renderSourceMetaChip(targetTrack.transcriptStatus));
  }
  if (model.currentMedia?.originalPath) {
    const detail = document.createElement('div');
    detail.className = 'selection-source-detail';
    appendSourceDisclosure(detail, 'source details', model.currentMedia.originalPath);
    summary.appendChild(detail);
  }
  return summary;
}

export function renderSelectionPanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'card selection-panel';
  const h2 = document.createElement('h2');
  h2.textContent = 'Selection';
  panel.appendChild(h2);
  panel.appendChild(renderMorphologyPanel(model, () => rerenderApp(model)));

  if (model.player.lastTokenPreview) {
    const preview = document.createElement('div');
    const isSavedPreview = model.player.lastTokenPreview.startsWith('Saved ');
    preview.className = `token-preview${isSavedPreview ? ' saved-occurrence-preview' : ''}`;
    const label = document.createElement('strong');
    label.textContent = isSavedPreview ? 'Saved occurrence:' : 'Token preview:';
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
      ? 'Saved to My Vocab with the current cue/time/source anchor. Select another transcript word or open My Vocab to review occurrences.'
      : 'Select a word or phrase in a transcript cue to save it with source context.';
    panel.appendChild(p);
    return panel;
  }

  const p = document.createElement('p');
  p.textContent = `Selected: “${model.selection.text}” (${model.selection.kind})`;
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
  saveBtn.textContent = 'Save occurrence';
  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  const canSave = targetTrack?.transcriptStatus === 'approved';
  saveBtn.disabled = !canSave;
  if (!canSave) saveBtn.title = 'Approve this transcript before saving learner study items.';
  const commit = () => {
    if (!canSave) return;
    void saveSelection(model)
      .then(() => {
        clearSelection(model);
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  };
  const cancel = () => {
    clearSelection(model);
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

  return panel;
}
