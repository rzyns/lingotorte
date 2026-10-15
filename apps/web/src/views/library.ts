import { readNativePathPolicy, NATIVE_PATH_COMPATIBILITY_MESSAGE } from '../../../../packages/domain/src/nativePaths.ts';
import type { AppModel } from '../uiTypes';
import { formatTimeMs } from '../uiTypes';
import {
  applyTrackOffsetMs,
  createOffsetCorrectedTranscriptVersion,
  importFixtureMediaAndSubtitles,
  importBrowserLocalFiles,
  importBrowserLocalFileHandles,
  setView,
  markUnsavedBrowserEdits,
  approveTranscriptTrack,
  createCorrectedTranscriptVersion,
  transcriptApprovalBlockReason,
  transcriptCorrectionPending,
  splitTranscriptCueInCorrectedVersion,
  mergeTranscriptCueWithNextInCorrectedVersion,
  generateElevenLabsScribeDraft,
  generateLocalAsrDraft,
  importYouTubeCaptionCandidate,
  makeLocalServiceAsrProvider,
  makeLocalServiceElevenLabsScribeProvider,
  makeLocalServiceYouTubeCaptionProvider,
  makeFakeYouTubeCaptionProvider,
  activeTargetTrackForMedia,
  listMediaAssetsNewestFirst,
  mediaAssetNeedsRelink,
  openMediaAsset,
  restoreOpenedMediaHandle,
} from '../model';
import { requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { type BrowserFileHandleLike, type BrowserFilePickerGlobal, captureUiServiceOwner, renderStatusToken, renderTranscriptWorkbenchOverview, uiOwnerCurrent } from '../ui/common.ts';
import { clearPendingMediaNameConflict, handleMediaImportError, renderMediaNameConflict } from '../ui/mediaConflict.ts';
import { hasNativeInputPath } from '../ui/snippets.ts';
import { renderCueSourceComparison, renderEmbeddedSubtitleControls } from '../ui/transcriptSources.ts';

function renderTranscriptLifecyclePanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'transcript-lifecycle-panel transcript-workbench';

  const heading = document.createElement('h3');
  heading.textContent = 'Transcript lifecycle';
  panel.appendChild(heading);

  const intro = document.createElement('p');
  intro.textContent = 'Provider/ASR transcripts enter as drafts. Correct and approve a transcript before creating learner study items from it.';
  panel.appendChild(intro);
  panel.appendChild(renderTranscriptWorkbenchOverview(model));

  const gateControls = document.createElement('div');
  gateControls.className = 'transcript-gate-controls';

  const urlLabel = document.createElement('label');
  urlLabel.htmlFor = 'youtube-caption-url';
  urlLabel.textContent = 'Public YouTube URL or video id';
  const urlInput = document.createElement('input');
  urlInput.id = 'youtube-caption-url';
  urlInput.name = 'youtube-caption-url';
  urlInput.type = 'text';
  urlInput.value = model.transcriptLifecycle.youtubeUrl;
  urlInput.placeholder = 'https://www.youtube.com/watch?v=abcdefghijk';
  urlInput.addEventListener('input', () => {
    model.transcriptLifecycle.youtubeUrl = urlInput.value;
  });
  urlLabel.appendChild(urlInput);
  gateControls.appendChild(urlLabel);

  const authLabel = document.createElement('label');
  authLabel.className = 'checkbox-row';
  const authCheckbox = document.createElement('input');
  authCheckbox.name = 'youtube-public-read-auth';
  authCheckbox.type = 'checkbox';
  authCheckbox.checked = model.transcriptLifecycle.publicReadAuthorized;
  authCheckbox.addEventListener('change', () => {
    model.transcriptLifecycle.publicReadAuthorized = authCheckbox.checked;
  });
  authLabel.append(authCheckbox, document.createTextNode(' I authorize a public caption metadata read.'));
  gateControls.appendChild(authLabel);

  const elevenLabsAuthLabel = document.createElement('label');
  elevenLabsAuthLabel.className = 'checkbox-row';
  const elevenLabsAuthCheckbox = document.createElement('input');
  elevenLabsAuthCheckbox.name = 'elevenlabs-provider-auth';
  elevenLabsAuthCheckbox.type = 'checkbox';
  elevenLabsAuthCheckbox.checked = model.transcriptLifecycle.elevenLabsAuthorized;
  elevenLabsAuthCheckbox.addEventListener('change', () => {
    model.transcriptLifecycle.elevenLabsAuthorized = elevenLabsAuthCheckbox.checked;
  });
  elevenLabsAuthLabel.append(elevenLabsAuthCheckbox, document.createTextNode(' I authorize sending extracted audio to ElevenLabs Scribe v2 for an online ASR draft.'));
  gateControls.appendChild(elevenLabsAuthLabel);

  const localAsrPathLabel = document.createElement('label');
  localAsrPathLabel.htmlFor = 'local-asr-media-path';
  localAsrPathLabel.textContent = 'Video path on the local service (for draft transcripts; optional if the current video already has one)';
  const localAsrPathInput = document.createElement('input');
  localAsrPathInput.id = 'local-asr-media-path';
  localAsrPathInput.name = 'local-asr-media-path';
  localAsrPathInput.type = 'text';
  localAsrPathInput.value = model.transcriptLifecycle.localAsrMediaPath;
  localAsrPathInput.placeholder = model.localService.pathPolicy?.platform === 'win32' ? 'C:\\Media\\owned-media.webm' : '/absolute/path/to/owned-media.webm';
  localAsrPathInput.addEventListener('input', () => {
    model.transcriptLifecycle.localAsrMediaPath = localAsrPathInput.value;
  });
  localAsrPathLabel.appendChild(localAsrPathInput);
  gateControls.appendChild(localAsrPathLabel);
  const currentMediaPath = model.currentMedia?.originalPath ?? '';
  if (currentMediaPath.startsWith('blob:') || currentMediaPath.startsWith('browser-file-handle:')) {
    const localAsrPathNote = document.createElement('p');
    localAsrPathNote.className = 'gate-note local-service-media-path-note';
    localAsrPathNote.textContent = 'Browser handles and blob URLs are playback-only; the configured local service still needs an explicit absolute owned local media path for ASR, ffmpeg, ffprobe, and source-media snippets.';
    gateControls.appendChild(localAsrPathNote);
  }
  panel.appendChild(gateControls);
  panel.appendChild(renderEmbeddedSubtitleControls(model));

  const demoGateNote = document.createElement('p');
  demoGateNote.className = 'gate-note';
  demoGateNote.textContent = 'The demo caption button uses a fake provider, but intentionally exercises the same public-caption authorization gate as the real YouTube caption path.';
  panel.appendChild(demoGateNote);

  const actions = document.createElement('div');
  actions.className = 'form-actions transcript-action-row';
  const importBtn = document.createElement('button');
  importBtn.className = 'btn-primary';
  importBtn.textContent = 'Import gated demo caption draft';
  importBtn.addEventListener('click', () => {
    const provider = makeFakeYouTubeCaptionProvider({
      videoId: 'abcdefghijk',
      language: model.transcriptLifecycle.youtubeLanguage,
      isAutoGenerated: true,
      segments: [
        { startMs: 0, endMs: 1800, text: 'Provider caption draft.' },
        { startMs: 1800, endMs: 3400, text: 'Second provider cue.' },
      ],
    });
    void importYouTubeCaptionCandidate(model, {
      url: model.transcriptLifecycle.youtubeUrl,
      language: model.transcriptLifecycle.youtubeLanguage,
      allowPublicRead: model.transcriptLifecycle.publicReadAuthorized,
    }, provider)
      .then(() => {
        model.transcriptLifecycle.pendingCueEdits = {};
        model.transcriptLifecycle.pendingCueTimingEdits = {};
        model.transcriptLifecycle.pendingWordTimingEdits = {};
        model.transcriptLifecycle.lastMessage = 'Draft transcript imported';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.appendChild(importBtn);

  const publicImportBtn = document.createElement('button');
  publicImportBtn.className = 'btn-secondary';
  publicImportBtn.textContent = 'Import public YouTube caption draft';
  publicImportBtn.addEventListener('click', () => {
    const transport = captureUiServiceOwner(model); if (!transport) return;
    const provider = makeLocalServiceYouTubeCaptionProvider(transport, {
      allowPublicRead: model.transcriptLifecycle.publicReadAuthorized,
    });
    void importYouTubeCaptionCandidate(model, {
      url: model.transcriptLifecycle.youtubeUrl,
      language: model.transcriptLifecycle.youtubeLanguage,
      allowPublicRead: model.transcriptLifecycle.publicReadAuthorized,
    }, provider)
      .then(() => {
        if (!uiOwnerCurrent(transport)) return;
        model.transcriptLifecycle.pendingCueEdits = {};
        model.transcriptLifecycle.pendingCueTimingEdits = {};
        model.transcriptLifecycle.pendingWordTimingEdits = {};
        model.transcriptLifecycle.lastMessage = 'Public YouTube caption draft imported through the configured service';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        if (!uiOwnerCurrent(transport)) return;
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.appendChild(publicImportBtn);

  const asrBtn = document.createElement('button');
  asrBtn.className = 'btn-secondary';
  asrBtn.textContent = 'Generate local ASR draft';
  asrBtn.disabled = !model.currentMedia || !hasNativeInputPath(model, model.transcriptLifecycle.localAsrMediaPath || currentMediaPath);
  asrBtn.addEventListener('click', () => {
    const transport = captureUiServiceOwner(model); if (!transport) return;
    const provider = makeLocalServiceAsrProvider(transport, {
      mediaPath: model.transcriptLifecycle.localAsrMediaPath,
      pathPolicy: model.localService.pathPolicy,
      alignWords: true,
    });
    void generateLocalAsrDraft(model, provider, model.transcriptLifecycle.youtubeLanguage)
      .then(() => {
        if (!uiOwnerCurrent(transport)) return;
        model.transcriptLifecycle.pendingCueEdits = {};
        model.transcriptLifecycle.pendingCueTimingEdits = {};
        model.transcriptLifecycle.pendingWordTimingEdits = {};
        model.transcriptLifecycle.lastMessage = 'Local service ASR draft generated';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        if (!uiOwnerCurrent(transport)) return;
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.appendChild(asrBtn);

  const scribeBtn = document.createElement('button');
  scribeBtn.className = 'btn-secondary';
  scribeBtn.textContent = 'Generate ElevenLabs Scribe v2 draft';
  scribeBtn.disabled = !model.currentMedia || !hasNativeInputPath(model, model.transcriptLifecycle.localAsrMediaPath || currentMediaPath);
  scribeBtn.addEventListener('click', () => {
    const transport = captureUiServiceOwner(model); if (!transport) return;
    const provider = makeLocalServiceElevenLabsScribeProvider(transport, {
      mediaPath: model.transcriptLifecycle.localAsrMediaPath,
      pathPolicy: model.localService.pathPolicy,
      modelId: 'scribe_v2',
      allowOnlineProvider: model.transcriptLifecycle.elevenLabsAuthorized,
    });
    void generateElevenLabsScribeDraft(model, provider, {
      language: model.transcriptLifecycle.youtubeLanguage,
      allowOnlineProvider: model.transcriptLifecycle.elevenLabsAuthorized,
    })
      .then(() => {
        if (!uiOwnerCurrent(transport)) return;
        model.transcriptLifecycle.pendingCueEdits = {};
        model.transcriptLifecycle.pendingCueTimingEdits = {};
        model.transcriptLifecycle.pendingWordTimingEdits = {};
        model.transcriptLifecycle.lastMessage = 'ElevenLabs Scribe v2 draft generated';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        if (!uiOwnerCurrent(transport)) return;
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  localAsrPathInput.addEventListener('input', () => {
    const disabled = !model.currentMedia || !hasNativeInputPath(model, localAsrPathInput.value || currentMediaPath);
    asrBtn.disabled = disabled; scribeBtn.disabled = disabled;
  });
  if (!readNativePathPolicy(model.localService.pathPolicy)) {
    const compatibility = document.createElement('p');
    compatibility.textContent = NATIVE_PATH_COMPATIBILITY_MESSAGE;
    actions.appendChild(compatibility);
  }
  actions.appendChild(scribeBtn);
  panel.appendChild(actions);

  if (model.transcriptLifecycle.lastMessage) {
    const status = document.createElement('div');
    status.className = 'status-banner success';
    status.id = 'transcript-lifecycle-status';
    status.tabIndex = -1;
    status.setAttribute('role', 'status');
    status.textContent = model.transcriptLifecycle.lastMessage;
    panel.appendChild(status);
  }

  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  if (!targetTrack) return panel;

  const trackMeta = document.createElement('div');
  trackMeta.className = 'status-banner transcript-track-summary';
  trackMeta.setAttribute('role', 'status');
  trackMeta.textContent = `Current transcript: ${targetTrack.transcriptStatus} • ${targetTrack.transcriptSourceKind} • warnings: ${targetTrack.provenance.warningFlags.join(', ') || 'none'}`;
  panel.appendChild(trackMeta);

  // Dirty/pending edits block approval and structural/offset actions; refreshed in place to keep focus/value.
  const editGuardedButtons: HTMLButtonElement[] = [];
  let refreshApprovalGate = (): void => {};
  const editorBlocked = (): boolean => transcriptApprovalBlockReason(model, targetTrack.id) !== null;

  if (targetTrack.transcriptStatus !== 'approved') {
    const offsetGroup = document.createElement('div');
    offsetGroup.className = 'track-offset-editor';
    const offsetLabel = document.createElement('label');
    offsetLabel.htmlFor = 'track-offset-ms';
    offsetLabel.textContent = 'Apply offset to all cues (ms)';
    const offsetInput = document.createElement('input');
    offsetInput.id = 'track-offset-ms';
    offsetInput.name = 'track-offset-ms';
    offsetInput.type = 'number';
    offsetInput.min = '-3600000';
    offsetInput.max = '3600000';
    offsetInput.step = '10';
    offsetInput.value = '0';
    offsetLabel.appendChild(offsetInput);

    const offsetPreview = document.createElement('div');
    offsetPreview.className = 'offset-preview meta';
    function updateOffsetPreview() {
      const offsetMs = Number(offsetInput.value);
      if (!Number.isFinite(offsetMs) || offsetMs === 0) {
        offsetPreview.textContent = 'No offset selected.';
        return;
      }
      const firstCue = model.cues[0];
      const lastCue = model.cues[model.cues.length - 1];
      if (!firstCue || !lastCue) {
        offsetPreview.textContent = 'No cues to preview.';
        return;
      }
      const shifted = applyTrackOffsetMs([firstCue, lastCue], offsetMs);
      offsetPreview.textContent = `Preview: line 1 ${formatTimeMs(firstCue.startMs)} → ${formatTimeMs(shifted[0]!.startMs)}, line ${model.cues.length} ${formatTimeMs(lastCue.endMs)} → ${formatTimeMs(shifted[1]!.endMs)}`;
    }
    updateOffsetPreview();
    offsetInput.addEventListener('input', updateOffsetPreview);

    const applyOffsetBtn = document.createElement('button');
    applyOffsetBtn.className = 'btn-secondary';
    applyOffsetBtn.textContent = 'Apply offset to all cues';
    editGuardedButtons.push(applyOffsetBtn);
    applyOffsetBtn.addEventListener('click', () => {
      if (editorBlocked()) { refreshApprovalGate(); return; }
      const offsetMs = Number(offsetInput.value);
      if (!Number.isFinite(offsetMs) || offsetMs === 0) {
        model.importError = 'Select a non-zero offset before applying.';
        rerenderApp(model);
        return;
      }
      void createOffsetCorrectedTranscriptVersion(model, targetTrack.id, offsetMs)
        .then(() => {
          model.transcriptLifecycle.pendingCueEdits = {};
          model.transcriptLifecycle.pendingCueTimingEdits = {};
          model.transcriptLifecycle.pendingWordTimingEdits = {};
          model.transcriptLifecycle.lastMessage = `Applied ${offsetMs >= 0 ? '+' : ''}${offsetMs}ms offset to all cues`;
          model.importError = null;
          rerenderApp(model);
        })
        .catch((err: unknown) => {
          model.importError = err instanceof Error ? err.message : String(err);
          rerenderApp(model);
        });
    });
    offsetGroup.append(offsetLabel, offsetPreview, applyOffsetBtn);
    panel.appendChild(offsetGroup);
  }

  if (targetTrack.transcriptStatus !== 'approved') {
    const correctionGroup = document.createElement('div');
    correctionGroup.className = 'transcript-correction-list';
    for (const cue of model.cues) {
      const cueEditor = document.createElement('article');
      cueEditor.className = 'transcript-cue-editor';
      const label = document.createElement('label');
      label.htmlFor = `transcript-correction-cue-${cue.cueIndex}`;
      label.textContent = `Line ${cue.cueIndex} correction`;
      const textarea = document.createElement('textarea');
      textarea.id = `transcript-correction-cue-${cue.cueIndex}`;
      textarea.name = `transcript-correction-cue-${cue.cueIndex}`;
      textarea.value = model.transcriptLifecycle.pendingCueEdits[cue.id] ?? cue.text;
      textarea.addEventListener('input', () => {
        model.transcriptLifecycle.pendingCueEdits[cue.id] = textarea.value;
        markUnsavedBrowserEdits(model);
        refreshApprovalGate();
      });
      label.appendChild(textarea);
      const sourceComparison = renderCueSourceComparison(model, cue, targetTrack.id);

      const timingEdit = model.transcriptLifecycle.pendingCueTimingEdits[cue.id] ?? { startMs: cue.startMs, endMs: cue.endMs };
      const timingRow = document.createElement('div');
      timingRow.className = 'timing-edit-row';
      const startLabel = document.createElement('label');
      startLabel.htmlFor = `transcript-correction-cue-${cue.cueIndex}-start-ms`;
      startLabel.textContent = 'Start ms';
      const startInput = document.createElement('input');
      startInput.id = `transcript-correction-cue-${cue.cueIndex}-start-ms`;
      startInput.name = `transcript-correction-cue-${cue.cueIndex}-start-ms`;
      startInput.type = 'number';
      startInput.min = '0';
      startInput.step = '10';
      startInput.value = String(timingEdit.startMs);
      const endLabel = document.createElement('label');
      endLabel.htmlFor = `transcript-correction-cue-${cue.cueIndex}-end-ms`;
      endLabel.textContent = 'End ms';
      const endInput = document.createElement('input');
      endInput.id = `transcript-correction-cue-${cue.cueIndex}-end-ms`;
      endInput.name = `transcript-correction-cue-${cue.cueIndex}-end-ms`;
      endInput.type = 'number';
      endInput.min = '0';
      endInput.step = '10';
      endInput.value = String(timingEdit.endMs);
      const updateTimingEdit = () => {
        model.transcriptLifecycle.pendingCueTimingEdits[cue.id] = {
          startMs: Number(startInput.value),
          endMs: Number(endInput.value),
        };
        markUnsavedBrowserEdits(model);
        refreshApprovalGate();
      };
      startInput.addEventListener('input', updateTimingEdit);
      endInput.addEventListener('input', updateTimingEdit);
      startLabel.appendChild(startInput);
      endLabel.appendChild(endInput);
      timingRow.append(startLabel, endLabel);

      const wordTimings = model.store.listTranscriptWordTimingsForCue(cue.id);
      const wordTimingPanel = document.createElement('div');
      wordTimingPanel.className = 'word-timing-edit-list';
      if (wordTimings.length > 0) {
        const wordHeading = document.createElement('div');
        wordHeading.className = 'meta';
        wordHeading.textContent = 'Word timings';
        wordTimingPanel.appendChild(wordHeading);
      }
      for (const word of wordTimings) {
        const wordEdit = model.transcriptLifecycle.pendingWordTimingEdits[word.id] ?? {
          text: word.text,
          startMs: word.startMs,
          endMs: word.endMs,
        };
        const wordRow = document.createElement('div');
        wordRow.className = 'word-timing-edit-row';
        const wordLabel = document.createElement('label');
        wordLabel.htmlFor = `transcript-word-timing-cue-${cue.cueIndex}-word-${word.wordIndex}-text`;
        wordLabel.textContent = `Word ${word.wordIndex + 1}`;
        const wordText = document.createElement('input');
        wordText.id = `transcript-word-timing-cue-${cue.cueIndex}-word-${word.wordIndex}-text`;
        wordText.name = `transcript-word-timing-cue-${cue.cueIndex}-word-${word.wordIndex}-text`;
        wordText.type = 'text';
        wordText.value = wordEdit.text;
        const wordStart = document.createElement('input');
        wordStart.name = `transcript-word-timing-cue-${cue.cueIndex}-word-${word.wordIndex}-start-ms`;
        wordStart.type = 'number';
        wordStart.min = '0';
        wordStart.step = '10';
        wordStart.value = String(wordEdit.startMs);
        const wordEnd = document.createElement('input');
        wordEnd.name = `transcript-word-timing-cue-${cue.cueIndex}-word-${word.wordIndex}-end-ms`;
        wordEnd.type = 'number';
        wordEnd.min = '0';
        wordEnd.step = '10';
        wordEnd.value = String(wordEdit.endMs);
        const updateWordTimingEdit = () => {
          markUnsavedBrowserEdits(model);
          model.transcriptLifecycle.pendingWordTimingEdits[word.id] = {
            text: wordText.value,
            startMs: Number(wordStart.value),
            endMs: Number(wordEnd.value),
          };
          refreshApprovalGate();
        };
        wordText.addEventListener('input', updateWordTimingEdit);
        wordStart.addEventListener('input', updateWordTimingEdit);
        wordEnd.addEventListener('input', updateWordTimingEdit);
        wordLabel.appendChild(wordText);
        wordRow.append(wordLabel, wordStart, wordEnd);
        wordTimingPanel.appendChild(wordRow);
      }
      const structureRow = document.createElement('div');
      structureRow.className = 'cue-structure-edit-row';
      const splitCueButton = document.createElement('button');
      splitCueButton.type = 'button';
      splitCueButton.textContent = `Split line ${cue.cueIndex}`;
      editGuardedButtons.push(splitCueButton);
      splitCueButton.addEventListener('click', () => {
        if (editorBlocked()) { refreshApprovalGate(); return; }
        splitCueButton.disabled = true;
        model.transcriptLifecycle.lastMessage = `Splitting line ${cue.cueIndex}…`;
        rerenderApp(model);
        splitTranscriptCueInCorrectedVersion(model, model.targetTrackId!, cue.id)
          .then(() => {
            model.transcriptLifecycle.pendingCueEdits = {};
            model.transcriptLifecycle.pendingCueTimingEdits = {};
            model.transcriptLifecycle.pendingWordTimingEdits = {};
            model.transcriptLifecycle.lastMessage = `Split line ${cue.cueIndex} into a corrected version`;
            model.importError = null;
            rerenderApp(model);
          })
          .catch((err: unknown) => {
            model.importError = err instanceof Error ? err.message : String(err);
            rerenderApp(model);
          });
      });
      const mergeCueButton = document.createElement('button');
      mergeCueButton.type = 'button';
      mergeCueButton.textContent = `Merge line ${cue.cueIndex} with next`;
      const mergeHasNext = model.cues.some((candidate) => candidate.cueIndex === cue.cueIndex + 1);
      mergeCueButton.disabled = !mergeHasNext;
      if (mergeHasNext) editGuardedButtons.push(mergeCueButton);
      mergeCueButton.addEventListener('click', () => {
        if (!mergeHasNext || editorBlocked()) { refreshApprovalGate(); return; }
        mergeCueButton.disabled = true;
        model.transcriptLifecycle.lastMessage = `Merging line ${cue.cueIndex} with next…`;
        rerenderApp(model);
        mergeTranscriptCueWithNextInCorrectedVersion(model, model.targetTrackId!, cue.id)
          .then(() => {
            model.transcriptLifecycle.pendingCueEdits = {};
            model.transcriptLifecycle.pendingCueTimingEdits = {};
            model.transcriptLifecycle.pendingWordTimingEdits = {};
            model.transcriptLifecycle.lastMessage = `Merged line ${cue.cueIndex} with next into a corrected version`;
            model.importError = null;
            rerenderApp(model);
          })
          .catch((err: unknown) => {
            model.importError = err instanceof Error ? err.message : String(err);
            rerenderApp(model);
          });
      });
      structureRow.append(splitCueButton, mergeCueButton);
      if (sourceComparison) {
        cueEditor.append(label, sourceComparison, timingRow, wordTimingPanel, structureRow);
      } else {
        cueEditor.append(label, timingRow, wordTimingPanel, structureRow);
      }
      correctionGroup.appendChild(cueEditor);
    }
    panel.appendChild(correctionGroup);

    const correctBtn = document.createElement('button');
    correctBtn.className = 'btn-secondary';
    correctBtn.textContent = 'Create corrected transcript version';
    correctBtn.addEventListener('click', () => {
      if (transcriptCorrectionPending(model) || model.targetTrackId !== targetTrack.id) { refreshApprovalGate(); return; }
      const submitted = structuredClone({
        cue: model.transcriptLifecycle.pendingCueEdits,
        timing: model.transcriptLifecycle.pendingCueTimingEdits,
        word: model.transcriptLifecycle.pendingWordTimingEdits,
      });
      const edits = model.cues
        .map((cue) => {
          const timing = model.transcriptLifecycle.pendingCueTimingEdits[cue.id] ?? { startMs: cue.startMs, endMs: cue.endMs };
          const wordTimings = model.store.listTranscriptWordTimingsForCue(cue.id).map((word) => {
            const wordEdit = model.transcriptLifecycle.pendingWordTimingEdits[word.id] ?? {
              text: word.text,
              startMs: word.startMs,
              endMs: word.endMs,
            };
            return {
              wordIndex: word.wordIndex,
              text: wordEdit.text,
              charStart: word.charStart,
              charEnd: word.charEnd,
              startMs: wordEdit.startMs,
              endMs: wordEdit.endMs,
              ...(word.confidence !== undefined ? { confidence: word.confidence } : {}),
              ...(word.speakerId !== undefined ? { speakerId: word.speakerId } : {}),
            };
          });
          return {
            cueId: cue.id,
            text: model.transcriptLifecycle.pendingCueEdits[cue.id] ?? cue.text,
            startMs: timing.startMs,
            endMs: timing.endMs,
            ...(wordTimings.length > 0 ? { wordTimings } : {}),
          };
        });
      const parentCues = model.cues.slice();
      const parentWords = parentCues.flatMap((cue) => model.store.listTranscriptWordTimingsForCue(cue.id));
      const applying = createCorrectedTranscriptVersion(model, targetTrack.id, edits);
      refreshApprovalGate();
      void applying
        .then((corrected) => {
          // Consume only the edits that were submitted; edits made while Apply was pending are retained and
          // re-keyed onto the new version so they stay visible and keep approval blocked.
          const lifecycle = model.transcriptLifecycle;
          const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
          const cueIdMap = new Map(parentCues.map((cue, index) => [cue.id, corrected.cues[index]?.id]));
          const childWords = corrected.cues.flatMap((cue) => model.store.listTranscriptWordTimingsForCue(cue.id));
          const wordIdMap = new Map(parentWords.map((word) => {
            const childCueId = cueIdMap.get(word.cueId);
            return [word.id, childWords.find((child) => child.cueId === childCueId && child.wordIndex === word.wordIndex)?.id];
          }));
          const retain = <T>(current: Record<string, T>, sent: Record<string, T>, ids: Map<string, string | undefined>): Record<string, T> => {
            const next: Record<string, T> = {};
            for (const [id, value] of Object.entries(current)) {
              if (Object.hasOwn(sent, id) && same(sent[id], value)) continue;
              next[ids.get(id) ?? id] = value;
            }
            return next;
          };
          lifecycle.pendingCueEdits = retain(lifecycle.pendingCueEdits, submitted.cue, cueIdMap);
          lifecycle.pendingCueTimingEdits = retain(lifecycle.pendingCueTimingEdits, submitted.timing, cueIdMap);
          lifecycle.pendingWordTimingEdits = retain(lifecycle.pendingWordTimingEdits, submitted.word, wordIdMap);
          const retained = [lifecycle.pendingCueEdits, lifecycle.pendingCueTimingEdits, lifecycle.pendingWordTimingEdits]
            .some((value) => Object.keys(value).length > 0);
          model.transcriptLifecycle.lastMessage = retained
            ? 'Corrected transcript version created; edits made during Apply were kept and still need to be applied'
            : 'Corrected transcript version created';
          model.importError = null;
          rerenderApp(model);
        })
        .catch((err: unknown) => {
          model.importError = err instanceof Error ? err.message : String(err);
          rerenderApp(model);
        });
    });
    panel.appendChild(correctBtn);
  }

  const approveBtn = document.createElement('button');
  approveBtn.className = 'btn-primary';
  approveBtn.textContent = 'Approve transcript for study';
  const approvalGate = document.createElement('p');
  approvalGate.className = 'gate-note transcript-approval-gate';
  approvalGate.id = 'transcript-approval-gate';
  approvalGate.setAttribute('role', 'status');
  approvalGate.setAttribute('aria-live', 'polite');
  approveBtn.setAttribute('aria-describedby', approvalGate.id);
  refreshApprovalGate = () => {
    const reason = transcriptApprovalBlockReason(model, targetTrack.id);
    approveBtn.disabled = targetTrack.transcriptStatus === 'approved' || reason !== null;
    approvalGate.textContent = targetTrack.transcriptStatus === 'approved' ? '' : reason ?? '';
    approvalGate.hidden = !approvalGate.textContent;
    for (const guarded of editGuardedButtons) guarded.disabled = reason !== null;
    const applyBtn = Array.from(panel.querySelectorAll('button')).find((candidate) => candidate.textContent === 'Create corrected transcript version');
    if (applyBtn) applyBtn.disabled = transcriptCorrectionPending(model);
  };
  approveBtn.addEventListener('click', () => {
    // Bind approval to the selected track/version rendered by this panel and re-check the guard at dispatch.
    if (model.targetTrackId !== targetTrack.id) { rerenderApp(model); return; }
    try {
      approveTranscriptTrack(model, targetTrack.id);
    } catch (err: unknown) {
      model.importError = err instanceof Error ? err.message : String(err);
      refreshApprovalGate();
      return;
    }
    model.transcriptLifecycle.lastMessage = 'Transcript approved for study';
    model.importError = null;
    requestFocusAfterRender(model, 'transcript-lifecycle-status');
    rerenderApp(model);
  });
  panel.appendChild(approvalGate);
  panel.appendChild(approveBtn);
  refreshApprovalGate();

  return panel;
}

/** lt-1ur: session-only memory of the user's lifecycle-disclosure toggle (not persisted, not on AppModel). */
const lifecycleDisclosureOpen = new WeakMap<AppModel, boolean>();

function lifecycleDisclosureDefaultOpen(model: AppModel): boolean {
  if (!model.currentMedia || !model.targetTrackId) return true;
  const status = model.store.getSubtitleTrack(model.targetTrackId)?.transcriptStatus;
  return status === undefined || status === 'draft' || status === 'correcting';
}

function renderMediaList(model: AppModel): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'media-list';
  const heading = document.createElement('h3');
  heading.textContent = 'Your media';
  wrap.appendChild(heading);
  const assets = listMediaAssetsNewestFirst(model);
  if (assets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'media-list-empty meta';
    empty.textContent = 'No media yet. Add a video below.';
    wrap.appendChild(empty);
    return wrap;
  }
  const list = document.createElement('ul');
  list.className = 'media-rows';
  list.tabIndex = 0; // scrollable region (max-height) must be keyboard reachable
  list.setAttribute('aria-label', 'Imported media');
  for (const asset of assets) {
    const row = document.createElement('li');
    row.className = 'media-row';
    row.dataset.mediaId = asset.id;
    const isCurrent = model.currentMedia?.id === asset.id;
    if (isCurrent) {
      row.classList.add('active');
      row.setAttribute('aria-current', 'true');
    }
    const title = document.createElement('span');
    title.className = 'media-row-title';
    title.textContent = asset.title;
    const duration = document.createElement('span');
    duration.className = 'media-row-duration meta';
    duration.textContent = formatTimeMs(asset.durationMs);
    const status = activeTargetTrackForMedia(model, asset.id)?.transcriptStatus;
    const statusLabel = status === 'approved' ? 'approved' : status ? 'draft' : 'none';
    const statusToken = renderStatusToken(statusLabel === 'approved' ? 'Transcript ready' : statusLabel === 'draft' ? 'Transcript draft' : 'No transcript yet', statusLabel === 'approved' ? 'approved' : statusLabel === 'draft' ? 'draft' : 'neutral');
    statusToken.classList.add('media-row-status');
    const privacy = renderStatusToken(asset.privacyLabel, 'local');
    privacy.classList.add('media-row-privacy');
    const actions = document.createElement('span');
    actions.className = 'media-row-actions';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn-secondary';
    openBtn.textContent = 'Open';
    openBtn.setAttribute('aria-label', `Open ${asset.title}`);
    openBtn.addEventListener('click', () => {
      if (!openMediaAsset(model, asset.id)) return;
      model.importError = null;
      setView(model, 'player');
      rerenderApp(model);
      // lt-ddy.2: reconnect this asset's own stored handle (query-only); 'prompt' keeps the Reconnect placeholder.
      if (!isCurrent) void restoreOpenedMediaHandle(model).then((result) => { if (result !== 'stale') rerenderApp(model); });
    });
    const needsRelink = mediaAssetNeedsRelink(model, asset);
    if (!(isCurrent && needsRelink)) actions.appendChild(openBtn);
    if (needsRelink) {
      // lt-ddy.2: handles are stored per media ('media-handle:<mediaId>'), so a non-current Relink tries that
      // asset's stored handle (query-only): granted reconnects silently, 'prompt' shows the Reconnect placeholder.
      // Every other outcome (no handle, denied, moved/renamed, mismatch) stays on the player's relink placeholder,
      // whose lastError explains why and whose 'Choose media again' opens the picker from a fresh click. The
      // picker is never opened here: after the IndexedDB/permission/getFile/hash awaits, Chrome's transient
      // user activation may have expired and showOpenFilePicker would throw SecurityError.
      const relinkBtn = document.createElement('button');
      relinkBtn.type = 'button';
      relinkBtn.className = 'btn-secondary';
      relinkBtn.textContent = 'Relink';
      relinkBtn.setAttribute('aria-label', `Relink ${asset.title}`);
      relinkBtn.addEventListener('click', () => {
        if (!openMediaAsset(model, asset.id)) return;
        model.importError = null;
        setView(model, 'player');
        rerenderApp(model);
        if (!isCurrent) {
          void restoreOpenedMediaHandle(model).then((result) => {
            if (result !== 'stale') rerenderApp(model);
          });
        }
      });
      actions.appendChild(relinkBtn);
    }
    row.append(title, duration, statusToken, privacy, actions);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

export function renderLibraryView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Library';
  section.appendChild(h2);
  const p = document.createElement('p');
  p.textContent = 'Your imported media, stored on this device. Open one to study, or add another below.';
  section.appendChild(p);
  section.appendChild(renderMediaList(model));

  const form = document.createElement('div');
  form.className = 'import-form';

  const loadBtn = document.createElement('button');
  loadBtn.className = 'btn-secondary';
  loadBtn.type = 'button';
  loadBtn.textContent = 'Load synthetic fixture';
  loadBtn.addEventListener('click', () => {
    void importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    )
      .then(() => {
        setView(model, 'player');
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });

  const localImportGroup = document.createElement('div');
  localImportGroup.className = 'local-file-import add-media-card';
  const localHeading = document.createElement('h3');
  localHeading.textContent = 'Add media';
  const localIntro = document.createElement('p');
  localIntro.className = 'file-hint';
  localIntro.textContent = 'Files stay on this device. Subtitles are optional; you can create a draft transcript later.';
  localImportGroup.append(localHeading, localIntro);

  const localFileGrid = document.createElement('div');
  localFileGrid.className = 'local-file-grid';

  const mediaLabel = document.createElement('label');
  mediaLabel.htmlFor = 'local-media-file';
  mediaLabel.textContent = 'Import copy for this session only';
  const mediaInput = document.createElement('input');
  mediaInput.id = 'local-media-file';
  mediaInput.name = 'local-media-file';
  mediaInput.type = 'file';
  mediaInput.accept = 'video/*,audio/*,.mp4,.m4v,.webm,.mkv,.mov,.mp3,.m4a,.wav';
  const mediaField = document.createElement('div');
  mediaField.className = 'file-field file-field-required';
  const mediaHint = document.createElement('p');
  mediaHint.className = 'file-hint';
  mediaHint.textContent = 'Required. Use owned media from this machine.';
  mediaField.append(mediaLabel, mediaInput, mediaHint);
  localFileGrid.appendChild(mediaField);

  const targetLabel = document.createElement('label');
  targetLabel.htmlFor = 'local-target-subtitle-file';
  targetLabel.textContent = 'Target subtitle file (.srt, optional)';
  const targetInput = document.createElement('input');
  targetInput.id = 'local-target-subtitle-file';
  targetInput.name = 'local-target-subtitle-file';
  targetInput.type = 'file';
  targetInput.accept = '.srt,text/plain,application/x-subrip';
  const targetField = document.createElement('div');
  targetField.className = 'file-field';
  const targetHint = document.createElement('p');
  targetHint.className = 'file-hint';
  targetHint.textContent = 'Optional target-language .srt. Without it, use a draft ASR workflow later.';
  targetField.append(targetLabel, targetInput, targetHint);
  localFileGrid.appendChild(targetField);

  const nativeLabel = document.createElement('label');
  nativeLabel.htmlFor = 'local-native-subtitle-file';
  nativeLabel.textContent = 'Native subtitle file (.srt, optional)';
  const nativeInput = document.createElement('input');
  nativeInput.id = 'local-native-subtitle-file';
  nativeInput.name = 'local-native-subtitle-file';
  nativeInput.type = 'file';
  nativeInput.accept = '.srt,text/plain,application/x-subrip';
  const nativeField = document.createElement('div');
  nativeField.className = 'file-field';
  const nativeHint = document.createElement('p');
  nativeHint.className = 'file-hint';
  nativeHint.textContent = 'Optional native-language support track for dual subtitles.';
  nativeField.append(nativeLabel, nativeInput, nativeHint);
  localFileGrid.appendChild(nativeField);
  localImportGroup.appendChild(localFileGrid);

  const localImportBtn = document.createElement('button');
  localImportBtn.className = 'btn-primary';
  localImportBtn.textContent = 'Import local media';
  localImportBtn.setAttribute('aria-label', 'Import local media');
  localImportBtn.addEventListener('click', () => {
    const mediaFile = mediaInput.files?.[0];
    const targetSubtitleFile = targetInput.files?.[0];
    const nativeSubtitleFile = nativeInput.files?.[0] ?? null;
    if (!mediaFile) {
      model.importError = 'Choose a local media file before importing. A target .srt subtitle file is optional; you can generate an ASR draft afterward.';
      rerenderApp(model);
      return;
    }
    const importInput = targetSubtitleFile
      ? { mediaFile, targetSubtitleFile, nativeSubtitleFile }
      : { mediaFile, nativeSubtitleFile };
    void importBrowserLocalFiles(model, importInput)
      .then(() => {
        clearPendingMediaNameConflict();
        setView(model, 'player');
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        handleMediaImportError(model, err, async () => { await importBrowserLocalFiles(model, importInput, { onNameConflict: 'import-new' }); });
      });
  });
  const localImportActions = document.createElement('div');
  localImportActions.className = 'local-import-actions';
  localImportActions.appendChild(localImportBtn);

  const showOpenFilePicker = (globalThis as BrowserFilePickerGlobal).showOpenFilePicker;
  if (typeof showOpenFilePicker === 'function') {
    let lastPickedHandle: BrowserFileHandleLike | null = null;
    const persistentImportBtn = document.createElement('button');
    persistentImportBtn.className = 'btn-secondary';
    persistentImportBtn.textContent = 'Choose video (recommended — stays linked after reload)';
    persistentImportBtn.setAttribute('aria-label', 'Choose video through a browser persistent file handle (recommended — stays linked after reload)');
    persistentImportBtn.addEventListener('click', () => {
      void showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Owned media files',
            accept: {
              'video/*': ['.mp4', '.m4v', '.webm', '.mkv', '.mov'],
              'audio/*': ['.mp3', '.m4a', '.wav'],
            },
          },
        ],
      })
        .then((handles) => {
          const mediaHandle = handles[0];
          if (!mediaHandle) {
            model.importError = 'No media handle was selected.';
            rerenderApp(model);
            return;
          }
          lastPickedHandle = mediaHandle;
          return importBrowserLocalFileHandles(model, { mediaHandle }).then(() => {
            clearPendingMediaNameConflict();
            if (!model.importError) {
              setView(model, 'player');
              model.importError = null;
            }
            rerenderApp(model);
          });
        })
        .catch((err: unknown) => {
          handleMediaImportError(model, err, () => {
            const retryHandle = lastPickedHandle;
            return retryHandle ? importBrowserLocalFileHandles(model, { mediaHandle: retryHandle }, { onNameConflict: 'import-new' }) : Promise.reject(err);
          });
        });
    });
    localImportActions.prepend(persistentImportBtn);
  }
  localImportGroup.appendChild(localImportActions);
  const fixtureActions = document.createElement('div');
  fixtureActions.className = 'add-media-fixture-actions';
  fixtureActions.appendChild(loadBtn);
  localImportGroup.appendChild(fixtureActions);
  form.appendChild(localImportGroup);

  const conflictBox = renderMediaNameConflict(model);
  if (conflictBox) form.appendChild(conflictBox);
  if (model.importError) {
    const banner = document.createElement('div');
    banner.className = 'status-banner error';
    banner.setAttribute('role', 'alert');
    banner.textContent = model.importError;
    form.appendChild(banner);
  }

  const disclosure = document.createElement('details');
  disclosure.className = 'transcript-lifecycle-disclosure';
  const renderedOpen = lifecycleDisclosureOpen.get(model) ?? lifecycleDisclosureDefaultOpen(model);
  disclosure.open = renderedOpen;
  const summary = document.createElement('summary');
  summary.textContent = 'Transcript tools (ASR drafts, captions, embedded tracks)';
  disclosure.appendChild(summary);
  disclosure.appendChild(renderTranscriptLifecyclePanel(model));
  // Setting open programmatically fires an async 'toggle'; record only genuine changes away from the rendered state.
  let lastOpen = renderedOpen;
  disclosure.addEventListener('toggle', () => {
    if (disclosure.open === lastOpen) return;
    lastOpen = disclosure.open;
    lifecycleDisclosureOpen.set(model, disclosure.open);
  });
  form.appendChild(disclosure);

  section.appendChild(form);
  return section;
}
