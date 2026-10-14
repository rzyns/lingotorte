import type { AppModel } from '../../uiTypes';
import { analyseCueMorphology, renderMorphologyPanel } from '../../morphologyPanel.ts';
import type { Cue } from '@lingotorte/domain';
import { formatTimeMs } from '../../uiTypes';
import {
  clearSelection,
  nativeTextForCue,
  saveSelection,
  saveSentenceFromCue,
  saveSelectedPhraseFromCue,
  seekToCue,
  setPendingMeaning,
  setPendingNotes,
  setTranscriptQuery,
  tokenizeCueText,
} from '../../model';
import { rerenderApp } from '../../appShell.ts';
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
    saveSentenceBtn.textContent = 'Save sentence';
    saveSentenceBtn.setAttribute('aria-label', `Save sentence from cue at ${formatTimeMs(cue.startMs)}`);
    saveSentenceBtn.disabled = !canSaveFromTargetTrack;
    if (!canSaveFromTargetTrack) {
      saveSentenceBtn.title = 'Approve this transcript before saving learner study items.';
    }
    saveSentenceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!canSaveFromTargetTrack) return;
      void saveSentenceFromCue(model, cue)
        .then(() => rerenderApp(model))
        .catch((err: unknown) => {
          model.importError = err instanceof Error ? err.message : String(err);
          rerenderApp(model);
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
      const selectionText = window.getSelection()?.toString().trim();
      if (selectionText) {
        void tokenizeCueText(model, cue).then((tokens: import('../../model').TokenInfo[]) => {
          const lower = selectionText.toLowerCase();
          const token = tokens.find(
            (t: import('../../model').TokenInfo) =>
              t.surface.toLowerCase() === lower ||
              (selectionText.length > t.surface.length && cue.text.toLowerCase().slice(t.charStart, t.charEnd).includes(lower)),
          );
          if (token) {
            const item = saveSelectedPhraseFromCue(model, cue, token.surface, token.charStart, token.charEnd, token.tokenIndex, token.tokenIndex + 1);
            if (item) {
              model.selection = null;
              model.pendingMeaning = '';
              model.pendingNotes = '';
            }
          } else {
            const phraseStart = cue.text.toLowerCase().indexOf(lower);
            const item = saveSelectedPhraseFromCue(
              model,
              cue,
              selectionText,
              phraseStart >= 0 ? phraseStart : 0,
              phraseStart >= 0 ? phraseStart + selectionText.length : cue.text.length,
              0,
              tokens.length,
            );
            if (item) {
              model.selection = null;
              model.pendingMeaning = '';
              model.pendingNotes = '';
            }
          }
          rerenderApp(model);
        });
      }
    });
    panel.appendChild(row);
  }
  return panel;
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
  saveBtn.addEventListener('click', () => {
    void saveSelection(model).then(() => {
      clearSelection(model);
      rerenderApp(model);
    });
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    clearSelection(model);
    rerenderApp(model);
  });
  actions.append(cancelBtn, saveBtn);
  form.appendChild(actions);
  panel.appendChild(form);

  return panel;
}
