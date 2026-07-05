import type { AppModel, ViewName } from './uiTypes';
import type { Cue, SavedItem, LearnerExportManifest } from '@lingotorte/domain';
import { verifyExportIntegrity } from '@lingotorte/domain';
import { formatDueAt, formatTimeMs } from './uiTypes';
import {
  activeCueAtTime,
  activeLoopRangeForSelection,
  applyLoopTolerance,
  applyTrackOffsetMs,
  clearLoopRange,
  clearSelection,
  createOffsetCorrectedTranscriptVersion,
  createReviewCardForSavedItem,
  importFixtureMediaAndSubtitles,
  importBrowserLocalFiles,
  importBrowserLocalFileHandles,
  listReviewBuckets,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  nativeTextForCue,
  nextCue,
  pickNextDueCard,
  PLAYBACK_RATE_STEP,
  previousCue,
  saveSelection,
  saveSentenceFromCue,
  saveSelectedPhraseFromCue,
  saveLexemeFromCue,
  seekToCue,
  seekToTime,
  setLoopRange,
  setPlaybackRate,
  setPendingMeaning,
  setPendingNotes,
  setReviewBucketAsOf,
  setTranscriptQuery,
  setView,
  submitReviewRating,
  toggleLoopCue,
  toggleLoopRange,
  togglePlay,
  toggleReviewReveal,
  tokenizeCueText,
  setPracticeMode,
  setPracticePendingAnswer,
  submitPracticeAttempt,
  prepareSentenceBuilderForCue,
  setSentenceBuilderTokens,
  submitSentenceBuilderAttempt,
  exportLearnerState,
  previewRestoreManifest,
  confirmRestore,
  setExportImportAcknowledgedWarning,
  setExportImportConfirmOverwrite,
  setExportImportConfirmReplace,
  setExportImportError,
  connectLocalService,
  saveModelToLocalService,
  setLocalServiceAutosave,
  setLocalServiceBaseUrl,
  approveTranscriptTrack,
  createCorrectedTranscriptVersion,
  splitTranscriptCueInCorrectedVersion,
  mergeTranscriptCueWithNextInCorrectedVersion,
  generateElevenLabsScribeDraft,
  generateLocalAsrDraft,
  importYouTubeCaptionCandidate,
  makeLocalServiceAsrProvider,
  makeLocalServiceElevenLabsScribeProvider,
  makeLocalServiceYouTubeCaptionProvider,
  makeFakeYouTubeCaptionProvider,
  mediaPlaybackUrl,
  needsMediaRelink,
  handleNameFromMedia,
  restoreBrowserMediaHandle,
  learnerProgress,
  generateMultipleChoices,
  studyMetrics,
  formatCompactDurationMs,
} from './model';

export function renderApp(model: AppModel): HTMLElement {
  installGlobalKeyboardShortcuts(model);
  const root = document.createElement('div');
  root.className = 'lingotorte-app';
  root.appendChild(renderHeader(model));
  root.appendChild(renderMain(model));
  root.appendChild(renderFooter());
  return root;
}

let keyboardShortcutsDocument: Document | null = null;
let keyboardShortcutsModel: AppModel | null = null;
let keyboardShortcutsHandler: ((event: KeyboardEvent) => void) | null = null;

type BrowserFileHandleLike = Readonly<{
  name: string;
  getFile(): Promise<File>;
  queryPermission?: (opts: { mode: 'read' }) => Promise<string>;
  requestPermission?: (opts: { mode: 'read' }) => Promise<string>;
}>;

type BrowserFilePickerGlobal = typeof globalThis & Readonly<{
  showOpenFilePicker?: (options?: unknown) => Promise<BrowserFileHandleLike[]>;
}>;

type BrowserFileWritableLike = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
};

type BrowserFileSaveHandleLike = Readonly<{
  name: string;
  createWritable(): Promise<BrowserFileWritableLike>;
  getFile(): Promise<File>;
}>;

type BrowserFileSavePickerGlobal = typeof globalThis & Readonly<{
  showSaveFilePicker?: (options?: unknown) => Promise<BrowserFileSaveHandleLike>;
}>;

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}

function currentKeyboardCue(model: AppModel): Cue | null {
  if (model.player.activeCueId) {
    return model.cues.find((cue) => cue.id === model.player.activeCueId) ?? null;
  }
  return activeCueAtTime(model.cues, model.player.currentTimeMs) ?? model.cues[0] ?? null;
}

function seekRenderedVideoToCue(cue: Cue): void {
  const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
  if (video) {
    video.currentTime = cue.startMs / 1000;
  }
}

function installGlobalKeyboardShortcuts(model: AppModel): void {
  keyboardShortcutsModel = model;
  if (typeof document === 'undefined') return;
  if (keyboardShortcutsDocument === document && keyboardShortcutsHandler) return;
  if (keyboardShortcutsDocument && keyboardShortcutsHandler) {
    keyboardShortcutsDocument.removeEventListener('keydown', keyboardShortcutsHandler);
  }
  keyboardShortcutsDocument = document;
  keyboardShortcutsHandler = (event: KeyboardEvent) => {
    const currentModel = keyboardShortcutsModel;
    if (!currentModel || isEditableShortcutTarget(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const cue = currentKeyboardCue(currentModel);
    let handled = false;
    if (event.key === 'r' || event.key === 'R') {
      if (cue) {
        seekToCue(currentModel, cue);
        seekRenderedVideoToCue(cue);
        handled = true;
      }
    } else if (event.key === '[') {
      if (cue) {
        const targetCue = previousCue(currentModel.cues, cue.id) ?? cue;
        seekToCue(currentModel, targetCue);
        seekRenderedVideoToCue(targetCue);
        handled = true;
      }
    } else if (event.key === ']') {
      if (cue) {
        const targetCue = nextCue(currentModel.cues, cue.id) ?? cue;
        seekToCue(currentModel, targetCue);
        seekRenderedVideoToCue(targetCue);
        handled = true;
      }
    } else if (event.key === ',') {
      setPlaybackRate(currentModel, currentModel.player.playbackRate - PLAYBACK_RATE_STEP);
      const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
      if (video) video.playbackRate = currentModel.player.playbackRate;
      handled = true;
    } else if (event.key === '.') {
      setPlaybackRate(currentModel, currentModel.player.playbackRate + PLAYBACK_RATE_STEP);
      const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
      if (video) video.playbackRate = currentModel.player.playbackRate;
      handled = true;
    }
    if (handled) {
      event.preventDefault();
      rerenderApp(currentModel);
    }
  };
  document.addEventListener('keydown', keyboardShortcutsHandler);
}

function renderHeader(model: AppModel): HTMLElement {
  const header = document.createElement('header');
  header.className = 'lingotorte-header';
  const brand = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = 'Lingotorte';
  const tagline = document.createElement('p');
  tagline.textContent = 'Local-first study workspace';
  brand.append(h1, tagline);
  header.appendChild(brand);
  header.appendChild(renderNav(model));
  return header;
}

function renderNav(model: AppModel): HTMLElement {
  const views: { id: ViewName; label: string }[] = [
    { id: 'player', label: 'Player' },
    { id: 'library', label: 'Library' },
    { id: 'saved', label: 'Saved' },
    { id: 'review', label: 'Review' },
    { id: 'practice', label: 'Practice' },
    { id: 'export-import', label: 'Export / Import' },
    { id: 'settings', label: 'Settings' },
  ];
  const nav = document.createElement('nav');
  nav.className = 'lingotorte-nav';
  nav.setAttribute('aria-label', 'Primary');
  const buttons = new Map<ViewName, HTMLButtonElement>();
  for (const view of views) {
    const btn = document.createElement('button');
    btn.textContent = view.label;
    btn.addEventListener('click', () => {
      setView(model, view.id);
      rerenderApp(model);
    });
    buttons.set(view.id, btn);
    nav.appendChild(btn);
  }
  (nav as any).__currentButtons = buttons;
  return nav;
}

function setActiveNav(nav: HTMLElement, view: ViewName): void {
  const buttons = (nav as any).__currentButtons as Map<ViewName, HTMLButtonElement> | undefined;
  if (!buttons) return;
  for (const [id, btn] of buttons) {
    const isCurrent = id === view;
    btn.setAttribute('aria-current', isCurrent ? 'page' : 'false');
    btn.toggleAttribute('aria-current', isCurrent);
  }
}

function renderMain(model: AppModel): HTMLElement {
  const main = document.createElement('main');
  main.className = 'lingotorte-main';
  switch (model.view) {
    case 'player':
      main.appendChild(renderPlayerView(model));
      break;
    case 'library':
      main.appendChild(renderLibraryView(model));
      break;
    case 'saved':
      main.appendChild(renderSavedView(model));
      break;
    case 'review':
      main.appendChild(renderReviewView(model));
      break;
    case 'practice':
      main.appendChild(renderPracticeView(model));
      break;
    case 'export-import':
      main.appendChild(renderExportImportView(model));
      break;
    case 'settings':
      main.appendChild(renderSettingsView(model));
      break;
  }
  return main;
}

function renderPracticeView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card practice-card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Practice';
  section.appendChild(h2);

  const active = pickNextDueCard(model, model.review.bucketAsOf);

  if (model.practice.lastAttemptResult) {
    const feedback = document.createElement('div');
    feedback.className = `practice-feedback ${model.practice.lastAttemptResult.correct ? 'success' : 'error'}`;
    feedback.setAttribute('role', 'status');
    feedback.textContent = model.practice.lastAttemptResult.correct
      ? `Result: ${model.practice.lastAttemptResult.result} ✓`
      : `Result: ${model.practice.lastAttemptResult.result}`;
    section.appendChild(feedback);
  }

  if (!active) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No cards due right now. Add more saved items or wait for scheduled reviews.';
    section.appendChild(empty);
    return section;
  }

  const { occurrence, state, card } = active;
  const currentCue = model.store.getCue(occurrence.cueId);
  const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
  const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
  const nativeText = currentCue ? nativeTextForCue(currentCue, nativeTrack, nativeCues) : undefined;

  const prompt = document.createElement('div');
  prompt.className = 'practice-prompt';
  prompt.setAttribute('role', 'alert');
  prompt.setAttribute('aria-live', 'polite');
  prompt.textContent = card.promptTemplate;
  section.appendChild(prompt);

  const modeRow = document.createElement('div');
  modeRow.className = 'practice-mode-row';
  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Mode';
  modeLabel.htmlFor = 'practice-mode';
  const modeSelect = document.createElement('select');
  modeSelect.id = 'practice-mode';
  modeSelect.name = 'practice-mode';
  modeSelect.setAttribute('aria-label', 'Practice mode');
  const modes: { value: import('./uiTypes').PracticeMode; label: string }[] = [
    { value: 'typed-input', label: 'Typed input' },
    { value: 'multiple-choice', label: 'Multiple choice' },
    { value: 'sentence-builder', label: 'Sentence builder' },
    { value: 'audio-recall', label: 'Audio recall' },
    { value: 'speaking', label: 'Speaking' },
  ];
  for (const mode of modes) {
    const option = document.createElement('option');
    option.value = mode.value;
    option.textContent = mode.label;
    option.selected = model.practice.mode === mode.value;
    modeSelect.appendChild(option);
  }
  modeSelect.addEventListener('change', () => {
    setPracticeMode(model, modeSelect.value as import('./uiTypes').PracticeMode);
    rerenderApp(model);
  });
  modeLabel.appendChild(modeSelect);
  modeRow.appendChild(modeLabel);
  section.appendChild(modeRow);

  const typedEnabled = model.practice.mode === 'typed-input' || model.practice.typedAttemptsEnabled;

  if (model.practice.mode === 'multiple-choice') {
    const choices = generateMultipleChoices(model, active.savedItem.displayText);
    const choiceGroup = document.createElement('div');
    choiceGroup.className = 'practice-choices';
    choiceGroup.setAttribute('role', 'group');
    choiceGroup.setAttribute('aria-label', 'Multiple choice answers');
    for (let i = 0; i < choices.length; i++) {
      const choiceBtn = document.createElement('button');
      choiceBtn.className = 'btn-secondary practice-choice';
      choiceBtn.type = 'button';
      choiceBtn.dataset.choiceIndex = String(i);
      choiceBtn.textContent = choices[i]!;
      choiceBtn.setAttribute('aria-label', `Answer choice ${i + 1}`);
      choiceBtn.addEventListener('click', () => {
        submitPracticeAttempt(model, choices[i]!, model.review.bucketAsOf);
        rerenderApp(model);
      });
      choiceGroup.appendChild(choiceBtn);
    }
    section.appendChild(choiceGroup);
  } else if (model.practice.mode === 'audio-recall') {
    const audioGroup = document.createElement('div');
    audioGroup.className = 'practice-audio-recall';

    const prompt = document.createElement('p');
    prompt.className = 'practice-audio-prompt';
    prompt.textContent = 'Dyktafon — mów teraz:';
    prompt.setAttribute('aria-live', 'polite');
    audioGroup.appendChild(prompt);

    const recordBtn = document.createElement('button');
    recordBtn.className = 'btn-primary record-btn';
    recordBtn.type = 'button';
    recordBtn.dataset.testid = 'record-btn';
    recordBtn.setAttribute('aria-label', 'Record your answer');
    const micIcon = document.createElement('span');
    micIcon.textContent = '🎤';
    recordBtn.appendChild(micIcon);
    recordBtn.appendChild(document.createTextNode(' Nagrywaj'));

    let mediaStream: MediaStream | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let recognition: any = null;

    recordBtn.addEventListener('click', async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const sr = (window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
        if (!sr) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition = new (sr as new (...args: unknown[]) => any)();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'pl-PL';
        recognition.onresult = (event: { results: Array<Array<{ transcript: string; confidence: number }>> }) => {
          const transcript = event.results[0]?.[0]?.transcript ?? '';
          setPracticePendingAnswer(model, transcript);
          rerenderApp(model);
        };
        recognition.onerror = () => {
          mediaStream?.getTracks().forEach((t) => t.stop());
          rerenderApp(model);
        };
        recognition.onend = () => {
          mediaStream?.getTracks().forEach((t) => t.stop());
          rerenderApp(model);
        };
        recognition.start();
        rerenderApp(model);
      } catch {
        mediaStream?.getTracks().forEach((t) => t.stop());
      }
    });

    audioGroup.appendChild(recordBtn);

    if (model.practice.pendingAnswer) {
      const transcriptDiv = document.createElement('div');
      transcriptDiv.className = 'practice-transcript-preview';
      transcriptDiv.textContent = `Rozpoznano: "${model.practice.pendingAnswer}"`;
      audioGroup.appendChild(transcriptDiv);
    }

    section.appendChild(audioGroup);
  } else if (model.practice.mode === 'sentence-builder') {
    const currentCue = model.store.getCue(active.occurrence.cueId);
    const expectedText = currentCue ? currentCue.text : active.savedItem.displayText;
    if (model.practice.sentenceBuilder.poolTokens.length === 0 && model.practice.sentenceBuilder.orderedTokens.length === 0 && expectedText.trim().length > 0) {
      const initial = prepareSentenceBuilderForCue(expectedText);
      setSentenceBuilderTokens(model, initial.poolTokens, initial.orderedTokens);
    }
    const pool = model.practice.sentenceBuilder.poolTokens;
    const ordered = model.practice.sentenceBuilder.orderedTokens;

    const builderGroup = document.createElement('div');
    builderGroup.className = 'sentence-builder';
    builderGroup.setAttribute('role', 'region');
    builderGroup.setAttribute('aria-label', 'Sentence builder');

    const answerArea = document.createElement('div');
    answerArea.className = 'sentence-builder-answer';
    answerArea.setAttribute('aria-label', 'Your sentence');
    if (ordered.length === 0) {
      answerArea.textContent = 'Tap words in order to build the sentence.';
      answerArea.classList.add('sentence-builder-placeholder');
    } else {
      for (let i = 0; i < ordered.length; i++) {
        const token = ordered[i]!;
        const tokenBtn = document.createElement('button');
        tokenBtn.type = 'button';
        tokenBtn.className = 'sentence-builder-token sentence-builder-token--ordered';
        tokenBtn.textContent = token;
        tokenBtn.setAttribute('aria-label', `Remove ${token} from position ${i + 1}`);
        tokenBtn.addEventListener('click', () => {
          const nextOrdered = ordered.filter((_, index) => index !== i);
          const nextPool = [...pool, token];
          setSentenceBuilderTokens(model, nextPool, nextOrdered);
          rerenderApp(model);
        });
        answerArea.appendChild(tokenBtn);
      }
    }
    builderGroup.appendChild(answerArea);

    const poolArea = document.createElement('div');
    poolArea.className = 'sentence-builder-pool';
    poolArea.setAttribute('role', 'group');
    poolArea.setAttribute('aria-label', 'Available words');
    if (pool.length === 0) {
      const emptyPool = document.createElement('span');
      emptyPool.className = 'meta';
      emptyPool.textContent = 'All words placed.';
      poolArea.appendChild(emptyPool);
    } else {
      for (let i = 0; i < pool.length; i++) {
        const token = pool[i]!;
        const tokenBtn = document.createElement('button');
        tokenBtn.type = 'button';
        tokenBtn.className = 'sentence-builder-token sentence-builder-token--pool';
        tokenBtn.textContent = token;
        tokenBtn.setAttribute('aria-label', `Add ${token}`);
        tokenBtn.addEventListener('click', () => {
          const nextOrdered = [...ordered, token];
          const nextPool = pool.filter((_, index) => index !== i);
          setSentenceBuilderTokens(model, nextPool, nextOrdered);
          rerenderApp(model);
        });
        poolArea.appendChild(tokenBtn);
      }
    }
    builderGroup.appendChild(poolArea);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-secondary';
    resetBtn.textContent = 'Reset sentence';
    resetBtn.setAttribute('aria-label', 'Reset sentence builder');
    resetBtn.addEventListener('click', () => {
      const initial = prepareSentenceBuilderForCue(expectedText);
      setSentenceBuilderTokens(model, initial.poolTokens, initial.orderedTokens);
      rerenderApp(model);
    });
    builderGroup.appendChild(resetBtn);

    section.appendChild(builderGroup);
  } else if (typedEnabled) {
    const answerGroup = document.createElement('div');
    answerGroup.className = 'practice-answer';
    const answerLabel = document.createElement('label');
    answerLabel.textContent = 'Your answer';
    answerLabel.htmlFor = 'practice-answer';
    const answerInput = document.createElement('input');
    answerInput.id = 'practice-answer';
    answerInput.name = 'practice-answer';
    answerInput.type = 'text';
    answerInput.value = model.practice.pendingAnswer;
    answerInput.placeholder = 'Type the target text…';
    answerInput.autocomplete = 'off';
    answerInput.setAttribute('aria-label', 'Type your answer');
    answerInput.addEventListener('input', () => {
      setPracticePendingAnswer(model, answerInput.value);
    });
    answerGroup.appendChild(answerLabel);
    answerGroup.appendChild(answerInput);
    section.appendChild(answerGroup);
  }

  const controls = document.createElement('div');
  controls.className = 'practice-controls';

  const replayBtn = document.createElement('button');
  replayBtn.className = 'btn-secondary';
  replayBtn.textContent = 'Replay source cue';
  replayBtn.setAttribute('aria-label', 'Jump back to the source cue in the player');
  replayBtn.disabled = !currentCue;
  replayBtn.addEventListener('click', () => {
    if (!currentCue) return;
    setView(model, 'player');
    model.player.currentTimeMs = currentCue.startMs;
    model.player.activeCueId = currentCue.id;
    model.player.isPlaying = false;
    const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
    if (video) {
      video.currentTime = currentCue.startMs / 1000;
    }
    rerenderApp(model);
  });
  controls.appendChild(replayBtn);

  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn-secondary';
  skipBtn.textContent = 'Skip';
  skipBtn.setAttribute('aria-label', 'Skip this practice attempt');
  skipBtn.addEventListener('click', () => {
    submitPracticeAttempt(model, '', model.review.bucketAsOf);
    rerenderApp(model);
  });
  controls.appendChild(skipBtn);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Submit attempt';
  submitBtn.setAttribute('aria-label', 'Submit practice attempt');
  section.appendChild(controls);

  if (model.practice.mode === 'sentence-builder') {
    submitBtn.addEventListener('click', () => {
      submitSentenceBuilderAttempt(model, model.practice.sentenceBuilder.orderedTokens, model.review.bucketAsOf);
      rerenderApp(model);
    });
  } else {
    submitBtn.addEventListener('click', () => {
      submitPracticeAttempt(model, model.practice.pendingAnswer, model.review.bucketAsOf);
      rerenderApp(model);
    });
  }
  controls.appendChild(submitBtn);

  const context = document.createElement('div');
  context.className = 'review-context';
  if (currentCue) {
    const time = document.createElement('p');
    time.className = 'meta';
    time.textContent = `Source: ${formatTimeMs(currentCue.startMs)} – ${formatTimeMs(currentCue.endMs)}`;
    context.appendChild(time);
    const targetContext = document.createElement('p');
    targetContext.className = 'review-target-context';
    targetContext.textContent = currentCue.text;
    context.appendChild(targetContext);
    if (nativeText) {
      const nativeContext = document.createElement('p');
      nativeContext.className = 'review-native-context';
      nativeContext.textContent = nativeText;
      context.appendChild(nativeContext);
    }
    const sourceNote = document.createElement('p');
    sourceNote.className = 'meta';
    appendSourceDisclosure(sourceNote, `Media: ${compactPathLabel(occurrence.sourceContext.mediaPath)}`, occurrence.sourceContext.mediaPath);
    context.appendChild(sourceNote);
  }
  section.appendChild(context);

  const stats = document.createElement('p');
  stats.className = 'meta';
  const attemptCount = model.store.listPracticeAttemptsForCard(card.id).length;
  stats.textContent = `${attemptCount} attempt${attemptCount === 1 ? '' : 's'} recorded • state: ${state.state} • due: ${formatDueAt(state.dueAt)}`;
  section.appendChild(stats);

  return section;
}

function renderExportImportView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card export-import-card';

  const h2 = document.createElement('h2');
  h2.textContent = 'Export / Import';
  section.appendChild(h2);

  const intro = document.createElement('p');
  intro.textContent = 'All export and import operations are local-only. The export file is unencrypted and contains local media paths.';
  section.appendChild(intro);

  const exportGroup = document.createElement('div');
  exportGroup.className = 'export-import-group';
  const exportHeading = document.createElement('h3');
  exportHeading.textContent = 'Export learner state';
  exportGroup.appendChild(exportHeading);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-primary';
  exportBtn.textContent = 'Generate local export';
  exportBtn.setAttribute('aria-label', 'Generate local learner export manifest');
  exportBtn.addEventListener('click', () => {
    try {
      exportLearnerState(model);
      rerenderApp(model);
    } catch (err: unknown) {
      setExportImportError(model, err instanceof Error ? err.message : String(err));
      rerenderApp(model);
    }
  });
  exportGroup.appendChild(exportBtn);

  if (model.exportImport.lastExport) {
    const summary = document.createElement('div');
    summary.className = 'status-banner success export-summary';
    summary.setAttribute('role', 'status');
    summary.textContent = `Export ready: ${model.exportImport.lastExport.fileName} • ${model.exportImport.lastExport.recordCount} records • ${model.exportImport.lastExport.warningCount} privacy warnings • ${model.exportImport.lastExport.manifestIntegrityVerified ? 'manifest integrity verified' : 'manifest integrity warning'} • destination: downloaded via your browser`;
    exportGroup.appendChild(summary);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-secondary';
    downloadBtn.textContent = 'Download export JSON';
    downloadBtn.setAttribute('aria-label', `Download learner export JSON as ${model.exportImport.lastExport.fileName}`);
    downloadBtn.addEventListener('click', () => {
      downloadTextFile(model.exportImport.lastExport!.fileName, model.exportImport.lastExport!.manifestJson);
    });
    exportGroup.appendChild(downloadBtn);

    const showSaveFilePicker = (globalThis as BrowserFileSavePickerGlobal).showSaveFilePicker;
    if (typeof showSaveFilePicker === 'function') {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn-secondary';
      saveBtn.textContent = 'Save export to chosen file';
      saveBtn.setAttribute('aria-label', 'Save learner export JSON through a browser File System Access save picker with readback verification');
      saveBtn.addEventListener('click', () => {
        const manifestJson = model.exportImport.lastExport!.manifestJson;
        const fileName = model.exportImport.lastExport!.fileName;
        void showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'Lingotorte export JSON',
              accept: { 'application/json': ['.json'] },
            },
          ],
        })
          .then(async (handle) => {
            const writable = await handle.createWritable();
            try {
              await writable.write(manifestJson);
            } finally {
              await writable.close();
            }
            const savedFile = await handle.getFile();
            const savedText = await savedFile.text();
            if (savedText !== manifestJson) {
              throw new Error('Export file readback did not match the written manifest.');
            }
            model.exportImport.lastSaveVerified = {
              fileName: savedFile.name,
              verifiedAt: new Date().toISOString(),
            };
            model.exportImport.lastError = null;
            rerenderApp(model);
          })
          .catch((err: unknown) => {
            setExportImportError(model, err instanceof Error ? err.message : String(err));
            rerenderApp(model);
          });
      });
      exportGroup.appendChild(saveBtn);
    }

    if (model.exportImport.lastSaveVerified) {
      const verifyBanner = document.createElement('div');
      verifyBanner.className = 'status-banner success export-verified';
      verifyBanner.setAttribute('role', 'status');
      verifyBanner.textContent = `Verified: ${model.exportImport.lastSaveVerified.fileName} saved and readback matched at ${model.exportImport.lastSaveVerified.verifiedAt}`;
      exportGroup.appendChild(verifyBanner);
    }
  }

  section.appendChild(exportGroup);
  const importGroup = document.createElement('div');
  importGroup.className = 'export-import-group';
  const importHeading = document.createElement('h3');
  importHeading.textContent = 'Import / restore learner state';
  importGroup.appendChild(importHeading);

  const importLabel = document.createElement('label');
  importLabel.textContent = 'Paste export manifest JSON';
  importLabel.htmlFor = 'import-manifest';
  importGroup.appendChild(importLabel);

  const importTextarea = document.createElement('textarea');
  importTextarea.id = 'import-manifest';
  importTextarea.name = 'import-manifest';
  importTextarea.placeholder = '{"schemaVersion":"lingotorte.learner-export.v1",...}';
  importTextarea.setAttribute('aria-label', 'Export manifest JSON');
  importGroup.appendChild(importTextarea);

  const previewBtn = document.createElement('button');
  previewBtn.className = 'btn-secondary';
  previewBtn.textContent = 'Preview restore';
  previewBtn.setAttribute('aria-label', 'Preview restore from manifest JSON');
  previewBtn.addEventListener('click', () => {
    try {
      previewRestoreManifest(model, importTextarea.value);
      setExportImportError(model, null);
    } catch (err: unknown) {
      setExportImportError(model, err instanceof Error ? err.message : String(err));
    }
    rerenderApp(model);
  });
  importGroup.appendChild(previewBtn);

  if (model.exportImport.preview) {
    const previewPanel = document.createElement('div');
    previewPanel.className = 'restore-preview';
    previewPanel.setAttribute('role', 'region');
    previewPanel.setAttribute('aria-label', 'Restore preview');

    const previewHeading = document.createElement('h3');
    previewHeading.textContent = 'Restore preview';
    previewPanel.appendChild(previewHeading);

    const counts = model.exportImport.preview.counts;
    const countsList = document.createElement('ul');
    for (const [key, count] of Object.entries(counts)) {
      const li = document.createElement('li');
      li.textContent = `${key}: ${count}`;
      countsList.appendChild(li);
    }
    previewPanel.appendChild(countsList);
    previewPanel.appendChild(renderRestoreOperationPreview(model.exportImport.preview));

    const safe = document.createElement('p');
    safe.className = model.exportImport.preview.safeToRestore ? 'status-banner success' : 'status-banner warning';
    safe.setAttribute('role', 'status');
    safe.textContent = model.exportImport.preview.safeToRestore
      ? 'Safe to restore: local learner state is empty.'
      : 'Local learner state exists. Resolve the conflict below before restoring.';
    previewPanel.appendChild(safe);

    const integrity = document.createElement('p');
    integrity.className = 'status-banner success';
    integrity.setAttribute('role', 'status');
    integrity.dataset.testid = 'restore-integrity';
    try {
      const manifest = JSON.parse(model.exportImport.manifestJson ?? '{}') as unknown as LearnerExportManifest;
      const verified = verifyExportIntegrity(manifest);
      integrity.textContent = verified
        ? `Integrity verified: ${manifest.integrity.recordCount} records, root hash matches.`
        : 'Integrity warning: recomputed hash does not match manifest. The file may have been altered.';
      integrity.className = verified ? 'status-banner success' : 'status-banner error';
      integrity.dataset.integrityVerified = String(verified);
    } catch {
      integrity.textContent = 'Integrity check unavailable: manifest JSON is not valid.';
      integrity.className = 'status-banner error';
      integrity.dataset.integrityVerified = 'false';
    }
    previewPanel.appendChild(integrity);

    if (model.exportImport.preview.overwriteConfirmationRequired) {
      const conflictHeading = document.createElement('h4');
      conflictHeading.textContent = 'Resolve restore conflict';
      previewPanel.appendChild(conflictHeading);

      const conflictNote = document.createElement('p');
      conflictNote.className = 'meta';
      conflictNote.textContent = 'Local learner state already exists. Choose exactly one option below.';
      previewPanel.appendChild(conflictNote);

      const overwriteLabel = document.createElement('label');
      overwriteLabel.htmlFor = 'restore-confirm-overwrite';
      const overwriteCheckbox = document.createElement('input');
      overwriteCheckbox.type = 'checkbox';
      overwriteCheckbox.id = 'restore-confirm-overwrite';
      overwriteCheckbox.name = 'restore-confirm-overwrite';
      overwriteCheckbox.checked = model.exportImport.confirmOverwrite;
      overwriteCheckbox.addEventListener('change', () => {
        setExportImportConfirmOverwrite(model, overwriteCheckbox.checked);
        if (overwriteCheckbox.checked) setExportImportConfirmReplace(model, false);
        rerenderApp(model);
      });
      overwriteLabel.appendChild(overwriteCheckbox);
      overwriteLabel.append(' Merge/update: import adds new records and updates changed records in my current local learner state.');
      previewPanel.appendChild(overwriteLabel);

      const replaceLabel = document.createElement('label');
      replaceLabel.htmlFor = 'restore-confirm-replace';
      const replaceCheckbox = document.createElement('input');
      replaceCheckbox.type = 'checkbox';
      replaceCheckbox.id = 'restore-confirm-replace';
      replaceCheckbox.name = 'restore-confirm-replace';
      replaceCheckbox.checked = model.exportImport.confirmReplace;
      replaceCheckbox.addEventListener('change', () => {
        setExportImportConfirmReplace(model, replaceCheckbox.checked);
        if (replaceCheckbox.checked) setExportImportConfirmOverwrite(model, false);
        rerenderApp(model);
      });
      replaceLabel.appendChild(replaceCheckbox);
      replaceLabel.append(' Replace all: clear existing local learner state before importing (destructive).');
      previewPanel.appendChild(replaceLabel);

      const conflictError = document.createElement('p');
      conflictError.className = 'status-banner error';
      conflictError.setAttribute('role', 'status');
      conflictError.textContent = 'Restore requires one of the options above to be selected.';
      conflictError.style.display = model.exportImport.confirmOverwrite || model.exportImport.confirmReplace ? 'none' : 'block';
      previewPanel.appendChild(conflictError);
    } else {
      const confirmLabel = document.createElement('label');
      confirmLabel.htmlFor = 'restore-confirm';
      const confirmCheckbox = document.createElement('input');
      confirmCheckbox.type = 'checkbox';
      confirmCheckbox.id = 'restore-confirm';
      confirmCheckbox.name = 'restore-confirm';
      confirmCheckbox.checked = model.exportImport.confirmOverwrite;
      confirmCheckbox.addEventListener('change', () => {
        setExportImportConfirmOverwrite(model, confirmCheckbox.checked);
        rerenderApp(model);
      });
      confirmLabel.appendChild(confirmCheckbox);
      confirmLabel.append(' I confirm this restore.');
      previewPanel.appendChild(confirmLabel);
    }

    const warningHeading = document.createElement('h4');
    warningHeading.textContent = 'Privacy warnings';
    previewPanel.appendChild(warningHeading);

    const warningList = document.createElement('ul');
    for (const warning of model.exportImport.preview.warnings) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const warningCheckboxId = `restore-warning-${warning.kind}`;
      label.htmlFor = warningCheckboxId;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = warningCheckboxId;
      checkbox.name = 'restore-warning';
      checkbox.value = warning.kind;
      checkbox.checked = model.exportImport.acknowledgedWarnings.includes(warning.kind);
      checkbox.addEventListener('change', () => {
        setExportImportAcknowledgedWarning(model, warning.kind, checkbox.checked);
        rerenderApp(model);
      });
      label.appendChild(checkbox);
      label.append(` ${warning.severity.toUpperCase()}: ${warning.message}`);
      li.appendChild(label);
      warningList.appendChild(li);
    }
    previewPanel.appendChild(warningList);

    const allWarningsAcknowledged = model.exportImport.preview.warnings.every((w) =>
      model.exportImport.acknowledgedWarnings.includes(w.kind),
    );
    const canRestore = allWarningsAcknowledged && (model.exportImport.confirmOverwrite || model.exportImport.confirmReplace);

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn-primary';
    restoreBtn.textContent = 'Restore now';
    restoreBtn.setAttribute('aria-label', 'Restore learner state from manifest');
    restoreBtn.disabled = !canRestore;
    restoreBtn.addEventListener('click', () => {
      try {
        confirmRestore(model);
        setExportImportError(model, null);
      } catch (err: unknown) {
        setExportImportError(model, err instanceof Error ? err.message : String(err));
      }
      rerenderApp(model);
    });
    previewPanel.appendChild(restoreBtn);

    importGroup.appendChild(previewPanel);
  }

  if (model.exportImport.lastError) {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'status-banner error';
    errorBanner.setAttribute('role', 'alert');
    errorBanner.textContent = model.exportImport.lastError;
    importGroup.appendChild(errorBanner);
  }

  section.appendChild(importGroup);
  return section;
}

function renderRestoreOperationPreview(preview: NonNullable<AppModel['exportImport']['preview']>): HTMLElement {
  const container = document.createElement('div');
  container.className = 'restore-operation-preview';
  const heading = document.createElement('h4');
  heading.textContent = 'Restore operation preview';
  container.appendChild(heading);

  const operationList = document.createElement('ul');
  const operationRows: { key: keyof typeof preview.operations; label: string }[] = [
    { key: 'savedItems', label: 'savedItems' },
    { key: 'savedOccurrences', label: 'savedOccurrences' },
    { key: 'reviewCards', label: 'reviewCards' },
    { key: 'reviewCardStates', label: 'reviewCardStates' },
    { key: 'reviewEvents', label: 'reviewEvents' },
    { key: 'practiceAttempts', label: 'practiceAttempts' },
    { key: 'sourceContexts', label: 'sourceContexts' },
  ];
  for (const row of operationRows) {
    const counts = preview.operations[row.key];
    const li = document.createElement('li');
    li.textContent = `${row.label}: ${counts.added} added, ${counts.updated} updated, ${counts.skippedIdentical} skipped identical`;
    operationList.appendChild(li);
  }
  container.appendChild(operationList);

  if (preview.details.savedItems.length > 0) {
    const detailHeading = document.createElement('h5');
    detailHeading.textContent = 'Saved item changes';
    container.appendChild(detailHeading);
    const detailList = document.createElement('ul');
    for (const detail of preview.details.savedItems) {
      const li = document.createElement('li');
      li.textContent = `${detail.label}: ${detail.action}`;
      detailList.appendChild(li);
    }
    container.appendChild(detailList);
  }

  return container;
}

function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'lingotorte-footer';
  const left = document.createElement('span');
  left.textContent = 'All data stays local. Providers disabled by default.';
  const status = document.createElement('span');
  status.className = 'provider-status';
  status.setAttribute('aria-live', 'polite');
  status.innerHTML = `<span aria-hidden="true">🔒</span> Local-only`;
  footer.append(left, status);
  return footer;
}

function renderStatusToken(label: string, tone: 'local' | 'approved' | 'draft' | 'warning' | 'neutral' = 'neutral'): HTMLElement {
  const token = document.createElement('span');
  token.className = `status-token status-token-${tone}`;
  token.textContent = label;
  return token;
}

function formatCompactTimeMs(ms: number): string {
  return formatTimeMs(ms).replace(/\.00$/, '');
}

function compactPathLabel(path: string): string {
  if (path.startsWith('blob:')) return 'browser-local media';
  if (path.startsWith('youtube:')) return path;
  const withoutQuery = path.split(/[?#]/)[0] ?? path;
  const parts = withoutQuery.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function mediaLabel(model: AppModel, fallbackPath?: string): string {
  if (model.currentMedia?.title) return model.currentMedia.title;
  if (fallbackPath) return compactPathLabel(fallbackPath);
  if (model.currentMedia?.originalPath) return compactPathLabel(model.currentMedia.originalPath);
  return 'No media loaded';
}

function appendSourceDisclosure(container: HTMLElement, summaryText: string, detailText: string): void {
  const summary = document.createElement('span');
  summary.className = 'source-compact-summary';
  summary.textContent = summaryText;
  container.appendChild(summary);

  if (!detailText) return;
  const details = document.createElement('details');
  details.className = 'source-disclosure';
  details.addEventListener('click', (event) => event.stopPropagation());
  const disclosureSummary = document.createElement('summary');
  disclosureSummary.textContent = 'details';
  const code = document.createElement('code');
  code.textContent = detailText;
  details.append(disclosureSummary, code);
  container.appendChild(details);
}

function renderSourceMetaChip(text: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'source-meta-chip';
  chip.textContent = text;
  return chip;
}

function renderStudyStatusRail(model: AppModel): HTMLElement {
  const rail = document.createElement('div');
  rail.className = 'status-token-rail';
  rail.setAttribute('aria-label', 'Study status');
  rail.appendChild(renderStatusToken('local/private', 'local'));

  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  const transcriptStatus = targetTrack?.transcriptStatus ?? 'no transcript';
  const statusTone = transcriptStatus === 'approved'
    ? 'approved'
    : transcriptStatus === 'draft'
      ? 'draft'
      : transcriptStatus === 'correcting'
        ? 'warning'
        : 'neutral';
  rail.appendChild(renderStatusToken(transcriptStatus, statusTone));

  const sourceLabel = targetTrack?.transcriptSourceKind ?? 'local import ready';
  rail.appendChild(renderStatusToken(sourceLabel, targetTrack?.transcriptStatus === 'draft' ? 'warning' : 'neutral'));

  const progress = learnerProgress(model, new Date());
  const progressParts: string[] = [];
  if (progress.savedItems > 0) progressParts.push(`${progress.savedItems} saved`);
  if (progress.dueCards > 0) progressParts.push(`${progress.dueCards} due`);
  if (progress.totalReviews > 0) progressParts.push(`${progress.totalReviews} reviews`);
  if (progress.practiceAttempts > 0) progressParts.push(`${progress.practiceAttempts} practice`);
  if (progressParts.length > 0) {
    rail.appendChild(renderStatusToken(progressParts.join(' • '), 'neutral'));
  }

  const metrics = studyMetrics(model);
  const today = formatCompactDurationMs(metrics.todayStudyTimeMs);
  const total = formatCompactDurationMs(metrics.totalStudyTimeMs);
  const streakText = metrics.streakDays > 0 ? `🔥 ${metrics.streakDays} day streak` : '🔥 Start a streak';
  rail.appendChild(renderStatusToken(streakText, 'neutral'));
  rail.appendChild(renderStatusToken(`today ${today} • total ${total}`, 'neutral'));
  rail.dataset.streakDays = String(metrics.streakDays);
  rail.dataset.todayStudyTime = today;
  rail.dataset.totalStudyTime = total;

  return rail;
}

function renderSourceContextRow(model: AppModel): HTMLElement {
  const row = document.createElement('div');
  row.className = 'source-context-row';
  row.setAttribute('aria-label', 'Current source context');

  const activeCue = currentKeyboardCue(model);
  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  const parts: string[] = [];
  const visibleParts: string[] = [];
  if (model.currentMedia) {
    const loadedCueEndMs = model.cues.reduce((maxEnd, cue) => Math.max(maxEnd, cue.endMs), model.currentMedia.durationMs);
    parts.push(`media: ${model.currentMedia.originalPath}`);
    parts.push(`media ${formatCompactTimeMs(0)}–${formatCompactTimeMs(loadedCueEndMs)}`);
    visibleParts.push(mediaLabel(model));
    visibleParts.push(`${formatCompactTimeMs(0)}–${formatCompactTimeMs(loadedCueEndMs)}`);
  } else {
    parts.push('no media loaded');
    visibleParts.push('no media loaded');
  }
  if (activeCue) {
    parts.push(`cue ${activeCue.cueIndex}`);
    parts.push(`cue ${formatCompactTimeMs(activeCue.startMs)}–${formatCompactTimeMs(activeCue.endMs)}`);
    visibleParts.push(`cue ${activeCue.cueIndex}`);
    visibleParts.push(`${formatCompactTimeMs(activeCue.startMs)}–${formatCompactTimeMs(activeCue.endMs)}`);
  } else {
    parts.push('no active cue');
    visibleParts.push('no active cue');
  }
  if (targetTrack) {
    parts.push(`track v${targetTrack.trackVersion}`);
    parts.push(targetTrack.transcriptStatus);
    visibleParts.push(`track v${targetTrack.trackVersion}`);
    visibleParts.push(targetTrack.transcriptStatus);
  }
  const primary = document.createElement('div');
  primary.className = 'source-context-primary';
  appendSourceDisclosure(primary, visibleParts.join(' • '), parts.join(' • '));
  row.appendChild(primary);

  if (model.currentMedia || activeCue || targetTrack) {
    const chips = document.createElement('div');
    chips.className = 'source-context-chips';
    if (model.currentMedia) chips.appendChild(renderSourceMetaChip(model.currentMedia.privacyLabel));
    if (activeCue) chips.appendChild(renderSourceMetaChip(`cue ${activeCue.cueIndex}`));
    if (targetTrack) chips.appendChild(renderSourceMetaChip(targetTrack.transcriptStatus));
    row.appendChild(chips);
  }
  return row;
}

function slugClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function renderRiskToken(label: string, tone: 'local' | 'warning' | 'draft' | 'neutral'): HTMLElement {
  const token = renderStatusToken(label, tone);
  token.classList.add('risk-token', `risk-token-${slugClass(label)}`);
  return token;
}

function lifecycleStageState(model: AppModel, index: number): 'completed' | 'active' | 'pending' {
  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  if (!targetTrack) return index === 0 ? 'active' : 'pending';
  if (targetTrack.transcriptStatus === 'approved') return 'completed';
  if (targetTrack.transcriptStatus === 'correcting') {
    if (index < 4) return 'completed';
    return 'active';
  }
  if (targetTrack.transcriptStatus === 'draft') {
    if (index < 2) return 'completed';
    if (index === 2) return 'active';
    return 'pending';
  }
  return index === 0 ? 'active' : 'pending';
}

function renderLifecycleStageRail(model: AppModel): HTMLElement {
  const rail = document.createElement('div');
  rail.className = 'lifecycle-stage-rail';
  rail.setAttribute('aria-label', 'Transcript lifecycle stages');
  ['Source candidates', 'Draft evidence', 'Cue correction', 'Word timing', 'Approval'].forEach((label, index) => {
    const stage = document.createElement('span');
    const state = lifecycleStageState(model, index);
    stage.className = `lifecycle-stage lifecycle-stage-${state}`;
    stage.dataset.state = state;
    if (state === 'active') stage.setAttribute('aria-current', 'step');
    stage.textContent = `${index + 1} ${label}`;
    rail.appendChild(stage);
  });
  return rail;
}

function renderSourceCandidateCard(title: string, body: string, risks: HTMLElement[]): HTMLElement {
  const card = document.createElement('article');
  card.className = 'source-candidate-card';
  const heading = document.createElement('h4');
  heading.textContent = title;
  const riskRail = document.createElement('div');
  riskRail.className = 'risk-token-rail';
  riskRail.append(...risks);
  const description = document.createElement('p');
  description.textContent = body;
  card.append(heading, riskRail, description);
  return card;
}

function renderTranscriptWorkbenchOverview(model: AppModel): HTMLElement {
  const overview = document.createElement('div');
  overview.className = 'transcript-workbench-overview';
  overview.appendChild(renderLifecycleStageRail(model));

  const candidates = document.createElement('div');
  candidates.className = 'source-candidate-grid';
  candidates.append(
    renderSourceCandidateCard(
      'Local files / existing subtitles',
      'Best default: use owned media and explicit subtitle files already on this machine.',
      [renderRiskToken('local safe', 'local')],
    ),
    renderSourceCandidateCard(
      'Local ASR draft',
      'Uses the loopback local service and local tools when those dependencies are installed and explicitly chosen.',
      [renderRiskToken('local dependency required', 'warning')],
    ),
    renderSourceCandidateCard(
      'Public caption draft',
      'Reads public caption metadata/text only after visible authorization; imported tracks remain drafts.',
      [renderRiskToken('public metadata read', 'warning')],
    ),
    renderSourceCandidateCard(
      'ElevenLabs Scribe v2 draft',
      'Sends extracted audio to an online provider only after explicit consent and service configuration.',
      [renderRiskToken('online audio upload', 'draft')],
    ),
  );
  overview.appendChild(candidates);

  const draftEvidence = document.createElement('div');
  draftEvidence.className = 'draft-evidence-card';
  draftEvidence.textContent = 'Drafts cannot create saved study items until corrected and approved.';
  overview.appendChild(draftEvidence);
  return overview;
}

function renderPlayerView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'study-cockpit';
  section.setAttribute('aria-label', 'Source-backed study cockpit');

  const header = document.createElement('div');
  header.className = 'study-cockpit-header card';
  const headingGroup = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = 'Study cockpit';
  const intro = document.createElement('p');
  intro.textContent = 'Study from a local video segment, keep the transcript beside it, and preserve cue/time/source context for every saved item.';
  headingGroup.append(h2, intro);
  header.append(headingGroup, renderStudyStatusRail(model));
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'player-layout study-cockpit-grid';

  const left = document.createElement('div');
  left.className = 'artifact-workbench';
  left.appendChild(renderSourceContextRow(model));
  left.appendChild(renderVideoStage(model));
  left.appendChild(renderPlayerControls(model));
  left.appendChild(renderSelectionPanel(model));
  grid.appendChild(left);

  const right = document.createElement('aside');
  right.className = 'card transcript-copilot';
  const transcriptHeading = document.createElement('h2');
  transcriptHeading.textContent = 'Transcript co-pilot';
  right.appendChild(transcriptHeading);
  right.appendChild(renderTranscriptPanel(model));
  grid.appendChild(right);

  section.appendChild(grid);
  return section;
}

function renderVideoStage(model: AppModel): HTMLElement {
  const stage = document.createElement('div');
  stage.className = `video-stage${model.currentMedia ? '' : ' video-stage-empty'}`;

  if (!model.currentMedia) {
    stage.appendChild(renderEmptyVideoPlaceholder(model));
    return stage;
  }

  if (needsMediaRelink(model)) {
    stage.appendChild(renderRelinkPlaceholder(model));
    return stage;
  }

  const video = document.createElement('video');
  video.setAttribute('controls', '');
  video.setAttribute('preload', 'metadata');
  video.setAttribute('role', 'img');
  video.setAttribute('aria-label', model.currentMedia.title);
  video.src = mediaPlaybackUrl(model);
  video.playbackRate = model.player.playbackRate;
  video.addEventListener('timeupdate', () => {
    const timeMs = Math.round(video.currentTime * 1000);
    model.player.currentTimeMs = timeMs;
    const cue = activeCueAtTime(model.cues, timeMs);
    if (cue && cue.id !== model.player.activeCueId) {
      model.player.activeCueId = cue.id;
      scrollCueIntoView(cue.id);
    }
    updateOverlay(stage, model, cue);
    const loopJump = applyLoopTolerance(timeMs, cue, model.player.loopCue, model.player.loopRange);
    if (loopJump !== null) {
      video.currentTime = loopJump / 1000;
    }
  });
  video.addEventListener('loadedmetadata', () => {
    model.player.durationMs = Math.round(video.duration * 1000) || model.player.durationMs;
    video.playbackRate = model.player.playbackRate;
    if (model.player.isPlaying) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => undefined);
      }
    }
  });
  video.addEventListener('play', () => {
    model.player.isPlaying = true;
  });
  video.addEventListener('pause', () => {
    model.player.isPlaying = false;
  });
  stage.appendChild(video);

  const overlay = document.createElement('div');
  overlay.className = 'subtitle-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');
  stage.appendChild(overlay);
  (stage as any).__overlay = overlay;

  // Initial overlay update after render tick.
  const initialCue = activeCueAtTime(model.cues, model.player.currentTimeMs);
  updateOverlay(stage, model, initialCue);

  return stage;
}

function renderEmptyVideoPlaceholder(model: AppModel): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'video-placeholder';

  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📁';
  const heading = document.createElement('h3');
  heading.textContent = 'Start with owned local media';
  const body = document.createElement('p');
  body.textContent = 'Import a video/audio file and optional subtitle tracks, or load the synthetic fixture for a private smoke test.';

  const actions = document.createElement('div');
  actions.className = 'empty-video-actions';
  const libraryBtn = document.createElement('button');
  libraryBtn.className = 'btn-primary';
  libraryBtn.type = 'button';
  libraryBtn.textContent = 'Import local files';
  libraryBtn.addEventListener('click', () => {
    setView(model, 'library');
    rerenderApp(model);
  });
  const fixtureBtn = document.createElement('button');
  fixtureBtn.className = 'btn-secondary';
  fixtureBtn.type = 'button';
  fixtureBtn.textContent = 'Load synthetic fixture';
  fixtureBtn.addEventListener('click', () => {
    void importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    )
      .then(() => {
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.append(libraryBtn, fixtureBtn);
  placeholder.append(icon, heading, body, actions);
  return placeholder;
}

function renderRelinkPlaceholder(model: AppModel): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'video-placeholder video-placeholder-relink';

  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔗';
  const heading = document.createElement('h3');
  heading.textContent = 'Relink media';
  const handleName = handleNameFromMedia(model);
  const body = document.createElement('p');
  body.textContent = handleName
    ? `The browser-granted file handle for "${handleName}" is not available for playback. Regrant the saved handle or choose the owned media file again.`
    : 'The browser-granted file handle or session object URL is not available for playback. Regrant the saved handle or choose the owned media file again.';

  const permission = document.createElement('p');
  permission.className = 'meta relink-permission-state';
  permission.textContent = `Browser permission: ${model.browserLocalMedia.permissionState}${model.browserLocalMedia.lastError ? ` — ${model.browserLocalMedia.lastError}` : ''}`;

  const actions = document.createElement('div');
  actions.className = 'empty-video-actions';
  const relinkBtn = document.createElement('button');
  relinkBtn.className = 'btn-primary';
  relinkBtn.type = 'button';
  relinkBtn.textContent = 'Relink media';
  relinkBtn.setAttribute('aria-label', 'Regrant the saved browser file handle for the current media');
  relinkBtn.addEventListener('click', () => {
    void restoreBrowserMediaHandle(model)
      .then((restored) => {
        if (!restored) {
          model.importError = model.browserLocalMedia.lastError ?? 'Saved browser media handle could not be restored. Choose the media again from Library.';
        } else {
          model.importError = null;
        }
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  const chooseAgainBtn = document.createElement('button');
  chooseAgainBtn.className = 'btn-secondary';
  chooseAgainBtn.type = 'button';
  chooseAgainBtn.textContent = 'Choose media again';
  chooseAgainBtn.addEventListener('click', () => {
    const picker = (globalThis as BrowserFilePickerGlobal).showOpenFilePicker;
    if (typeof picker !== 'function') {
      model.importError = 'This browser does not support persistent file handles. Re-import the media from the Library.';
      rerenderApp(model);
      return;
    }
    void picker({
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
        return importBrowserLocalFileHandles(model, { mediaHandle });
      })
      .then(() => {
        if (!model.importError) {
          model.importError = null;
        }
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  const libraryBtn = document.createElement('button');
  libraryBtn.className = 'btn-secondary';
  libraryBtn.type = 'button';
  libraryBtn.textContent = 'Go to Library';
  libraryBtn.addEventListener('click', () => {
    setView(model, 'library');
    rerenderApp(model);
  });
  actions.append(relinkBtn, chooseAgainBtn, libraryBtn);
  placeholder.append(icon, heading, body, permission, actions);
  return placeholder;
}

type SubtitleWord = Readonly<{
  text: string;
  charStart: number;
  charEnd: number;
  tokenIndex: number;
  startMs?: number;
  endMs?: number;
}>;

const SUBTITLE_WINDOW_MAX_WORDS = 10;
const SUBTITLE_WINDOW_MAX_CHARS = 84;
const subtitleWordPattern = /[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*|\d+(?:[,.]\d+)?/gu;

function subtitleWordsForCue(model: AppModel, cue: Cue): SubtitleWord[] {
  const timedWords = model.store
    .listTranscriptWordTimingsForCue(cue.id)
    .filter((word) => word.charStart >= 0 && word.charEnd > word.charStart && word.charStart < cue.text.length)
    .sort((a, b) => a.charStart - b.charStart || a.wordIndex - b.wordIndex);
  if (timedWords.length > 0) {
    return timedWords.map((word) => {
      const charStart = Math.max(0, Math.min(word.charStart, cue.text.length));
      const charEnd = Math.max(charStart, Math.min(word.charEnd, cue.text.length));
      return {
        text: cue.text.slice(charStart, charEnd) || word.text,
        charStart,
        charEnd,
        tokenIndex: word.wordIndex,
        startMs: word.startMs,
        endMs: word.endMs,
      };
    });
  }

  const words: SubtitleWord[] = [];
  subtitleWordPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = subtitleWordPattern.exec(cue.text)) !== null) {
    words.push({
      text: match[0],
      charStart: match.index,
      charEnd: match.index + match[0].length,
      tokenIndex: words.length,
    });
  }
  return words;
}

function activeSubtitleWordIndex(words: readonly SubtitleWord[], cue: Cue, currentTimeMs: number): number {
  if (words.length === 0) return -1;
  const timedIndex = words.findIndex((word) =>
    word.startMs !== undefined && word.endMs !== undefined && word.startMs <= currentTimeMs && word.endMs >= currentTimeMs,
  );
  if (timedIndex >= 0) return timedIndex;

  const timedCandidates = words.filter((word) => word.startMs !== undefined && word.endMs !== undefined);
  if (timedCandidates.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index]!;
      if (word.startMs === undefined || word.endMs === undefined) continue;
      const midpoint = (word.startMs + word.endMs) / 2;
      const distance = Math.abs(midpoint - currentTimeMs);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  const cueDuration = Math.max(1, cue.endMs - cue.startMs);
  const ratio = Math.max(0, Math.min(1, (currentTimeMs - cue.startMs) / cueDuration));
  const estimatedChar = ratio * cue.text.length;
  const estimatedIndex = words.findIndex((word) => word.charStart <= estimatedChar && word.charEnd >= estimatedChar);
  if (estimatedIndex >= 0) return estimatedIndex;
  const nextIndex = words.findIndex((word) => word.charStart > estimatedChar);
  return nextIndex >= 0 ? nextIndex : words.length - 1;
}

function chooseSubtitleWindow(words: readonly SubtitleWord[], cue: Cue, currentTimeMs: number): SubtitleWord[] {
  if (words.length === 0) return [];
  const fullCueIsCaptionSized = words.length <= SUBTITLE_WINDOW_MAX_WORDS && cue.text.trim().length <= SUBTITLE_WINDOW_MAX_CHARS;
  if (fullCueIsCaptionSized) return [...words];

  const activeIndex = Math.max(0, activeSubtitleWordIndex(words, cue, currentTimeMs));
  const halfWindow = Math.floor(SUBTITLE_WINDOW_MAX_WORDS / 2);
  let start = Math.max(0, Math.min(activeIndex - halfWindow, words.length - SUBTITLE_WINDOW_MAX_WORDS));
  let end = Math.min(words.length, start + SUBTITLE_WINDOW_MAX_WORDS);

  while (end - start > 1) {
    const charStart = words[start]!.charStart;
    const charEnd = words[end - 1]!.charEnd;
    if (charEnd - charStart <= SUBTITLE_WINDOW_MAX_CHARS) break;
    if (activeIndex - start > end - 1 - activeIndex) {
      start += 1;
    } else {
      end -= 1;
    }
  }

  return words.slice(start, end);
}

function clippedPlainSubtitleText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= SUBTITLE_WINDOW_MAX_CHARS) return normalized;
  return `${normalized.slice(0, SUBTITLE_WINDOW_MAX_CHARS - 1).trimEnd()}…`;
}

function appendSubtitleTargetWindow(target: HTMLElement, model: AppModel, cue: Cue): void {
  const words = subtitleWordsForCue(model, cue);
  const windowWords = chooseSubtitleWindow(words, cue, model.player.currentTimeMs);
  if (windowWords.length === 0) {
    target.textContent = clippedPlainSubtitleText(cue.text);
    return;
  }

  const targetTrack = model.targetTrackId ? model.store.getSubtitleTrack(model.targetTrackId) : null;
  const canSaveFromTargetTrack = targetTrack?.transcriptStatus === 'approved';
  const firstWord = windowWords[0]!;
  const lastWord = windowWords[windowWords.length - 1]!;
  const hasLeadingText = firstWord !== words[0];
  const hasTrailingText = lastWord !== words[words.length - 1];
  const renderStartChar = hasLeadingText ? firstWord.charStart : 0;
  const renderEndChar = hasTrailingText ? lastWord.charEnd : cue.text.length;
  target.dataset.windowStartChar = String(renderStartChar);
  target.dataset.windowEndChar = String(renderEndChar);

  if (hasLeadingText) target.appendChild(document.createTextNode('… '));
  let cursor = renderStartChar;
  for (const word of windowWords) {
    if (word.charStart > cursor) {
      target.appendChild(document.createTextNode(cue.text.slice(cursor, word.charStart)));
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subtitle-word';
    button.textContent = cue.text.slice(word.charStart, word.charEnd) || word.text;
    button.dataset.subtitleCueId = cue.id;
    button.dataset.charStart = String(word.charStart);
    button.dataset.charEnd = String(word.charEnd);
    button.dataset.tokenIndex = String(word.tokenIndex);
    button.setAttribute('aria-label', `Add ${button.textContent} to My Vocab`);
    if (!canSaveFromTargetTrack) {
      button.disabled = true;
      button.title = 'Approve this transcript before saving learner study items.';
    }
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!canSaveFromTargetTrack) return;
      try {
        const displayText = button.textContent ?? word.text;
        const item = saveLexemeFromCue(model, cue, displayText, word.charStart, word.charEnd, word.tokenIndex);
        if (item) {
          model.player.lastTokenPreview = `Saved “${item.displayText}” to My Vocab`;
        }
      } catch (err: unknown) {
        model.importError = err instanceof Error ? err.message : String(err);
      }
      rerenderApp(model);
    });
    button.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      if (!canSaveFromTargetTrack) return;
      const range = activeLoopRangeForSelection(model, cue, word.charStart, word.charEnd);
      if (range) {
        toggleLoopRange(model, range.startMs, range.endMs);
      } else {
        toggleLoopRange(model, cue.startMs, cue.endMs);
      }
      rerenderApp(model);
    });
    target.appendChild(button);
    cursor = word.charEnd;
  }
  if (cursor < renderEndChar) {
    target.appendChild(document.createTextNode(cue.text.slice(cursor, renderEndChar)));
  }
  if (hasTrailingText) target.appendChild(document.createTextNode(' …'));
}

function updateOverlay(stage: HTMLElement, model: AppModel, cue: Cue | null): void {
  const overlay = (stage as any).__overlay as HTMLElement | undefined;
  if (!overlay) return;
  if (!cue) {
    overlay.textContent = '';
    return;
  }
  overlay.innerHTML = '';
  const target = document.createElement('div');
  target.className = 'subtitle-target';
  appendSubtitleTargetWindow(target, model, cue);
  overlay.appendChild(target);

  const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
  const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
  const nativeText = nativeTextForCue(cue, nativeTrack, nativeCues);
  if (nativeText) {
    const native = document.createElement('div');
    native.className = 'subtitle-native';
    native.textContent = clippedPlainSubtitleText(nativeText);
    overlay.appendChild(native);
  }
}

function renderPlayerControls(model: AppModel): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'player-controls';

  const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;

  const playBtn = document.createElement('button');
  playBtn.textContent = model.player.isPlaying ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-label', model.player.isPlaying ? 'Pause video' : 'Play video');
  playBtn.addEventListener('click', () => {
    togglePlay(model);
    const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
    if (video) {
      if (model.player.isPlaying) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => undefined);
        }
      } else {
        video.pause();
      }
    }
    rerenderApp(model);
  });
  controls.appendChild(playBtn);

  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Prev cue';
  prevBtn.setAttribute('aria-label', 'Go to previous cue');
  const currentCueForNav = activeCueAtTime(model.cues, model.player.currentTimeMs);
  const hasPrev = currentCueForNav ? previousCue(model.cues, currentCueForNav.id) !== null : model.cues.length > 0;
  prevBtn.disabled = !hasPrev;
  prevBtn.addEventListener('click', () => {
    const cue = currentCueForNav ? previousCue(model.cues, currentCueForNav.id) ?? model.cues[0] : model.cues[0];
    if (cue) {
      seekToCue(model, cue);
      if (video) {
        video.currentTime = cue.startMs / 1000;
        if (model.player.isPlaying) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => undefined);
          }
        }
      }
      rerenderApp(model);
    }
  });
  controls.appendChild(prevBtn);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next cue';
  nextBtn.setAttribute('aria-label', 'Go to next cue');
  const hasNext = currentCueForNav ? nextCue(model.cues, currentCueForNav.id) !== null : model.cues.length > 1;
  nextBtn.disabled = !hasNext;
  nextBtn.addEventListener('click', () => {
    const cue = currentCueForNav ? nextCue(model.cues, currentCueForNav.id) ?? model.cues[model.cues.length - 1] : model.cues[0];
    if (cue) {
      seekToCue(model, cue);
      if (video) {
        video.currentTime = cue.startMs / 1000;
        if (model.player.isPlaying) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => undefined);
          }
        }
      }
      rerenderApp(model);
    }
  });
  controls.appendChild(nextBtn);

  const loopBtn = document.createElement('button');
  loopBtn.textContent = model.player.loopCue ? 'Loop on' : 'Loop off';
  loopBtn.setAttribute('aria-label', model.player.loopCue ? 'Turn cue loop off' : 'Turn cue loop on');
  loopBtn.setAttribute('aria-pressed', String(model.player.loopCue));
  loopBtn.addEventListener('click', () => {
    toggleLoopCue(model);
    rerenderApp(model);
  });
  controls.appendChild(loopBtn);

  const loopRangeBtn = document.createElement('button');
  const currentCue = currentKeyboardCue(model);
  const loopRangeActive = Boolean(model.player.loopRange && currentCue);
  loopRangeBtn.textContent = loopRangeActive ? 'Loop range on' : 'Loop range off';
  loopRangeBtn.setAttribute('aria-label', loopRangeActive ? 'Clear word-span loop range' : 'Set word-span loop range for selected words');
  loopRangeBtn.setAttribute('aria-pressed', String(loopRangeActive));
  loopRangeBtn.disabled = !currentCue;
  loopRangeBtn.dataset.testid = 'loop-range-btn';
  loopRangeBtn.addEventListener('click', () => {
    if (!currentCue) return;
    const cue = currentCue;
    if (model.player.loopRange) {
      clearLoopRange(model);
    } else {
      const selected = model.selection;
      if (selected && selected.cueId === cue.id) {
        const range = activeLoopRangeForSelection(model, cue, selected.charStart, selected.charEnd);
        if (range) {
          setLoopRange(model, range.startMs, range.endMs);
        } else {
          setLoopRange(model, cue.startMs, cue.endMs);
        }
      } else {
        setLoopRange(model, cue.startMs, cue.endMs);
      }
    }
    rerenderApp(model);
  });
  controls.appendChild(loopRangeBtn);

  const loopRangeHelp = document.createElement('span');
  loopRangeHelp.className = 'meta loop-range-help';
  loopRangeHelp.setAttribute('aria-live', 'polite');
  if (model.player.loopRange && currentCue) {
    loopRangeHelp.textContent = `Looping ${formatTimeMs(model.player.loopRange.startMs)}–${formatTimeMs(model.player.loopRange.endMs)}`;
  } else if (model.selection && currentCue && model.selection.cueId === currentCue.id) {
    loopRangeHelp.textContent = 'Click “Loop range off” to loop the selected span.';
  } else {
    loopRangeHelp.textContent = 'Select a word/phrase in the transcript, then click “Loop range off” to loop that span.';
  }
  controls.appendChild(loopRangeHelp);

  const speedLabel = document.createElement('label');
  speedLabel.textContent = 'Speed';
  speedLabel.htmlFor = 'playback-speed';
  const speedInput = document.createElement('input');
  speedInput.id = 'playback-speed';
  speedInput.name = 'playback-speed';
  speedInput.type = 'range';
  speedInput.min = String(MIN_PLAYBACK_RATE);
  speedInput.max = String(MAX_PLAYBACK_RATE);
  speedInput.step = String(PLAYBACK_RATE_STEP);
  speedInput.value = String(model.player.playbackRate);
  speedInput.setAttribute('aria-label', 'Playback speed');
  speedInput.addEventListener('input', (e) => {
    const rate = Number((e.target as HTMLInputElement).value);
    setPlaybackRate(model, rate);
    const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
    if (video) {
      video.playbackRate = model.player.playbackRate;
    }
  });
  speedLabel.appendChild(speedInput);
  controls.appendChild(speedLabel);

  const time = document.createElement('span');
  time.className = 'timeline';
  time.textContent = `${formatTimeMs(model.player.currentTimeMs)} / ${formatTimeMs(model.player.durationMs)}`;
  time.setAttribute('aria-live', 'off');
  controls.appendChild(time);

  const shortcuts = document.createElement('p');
  shortcuts.className = 'keyboard-shortcuts meta';
  shortcuts.textContent = 'Shortcuts: [ previous cue, ] next cue, R replay cue, , slower, . faster';
  controls.appendChild(shortcuts);

  return controls;
}

function seekRenderedVideoToMs(timeMs: number): void {
  const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
  if (video) {
    video.currentTime = timeMs / 1000;
  }
}

function renderCueSourceContext(model: AppModel, cue: Cue): HTMLElement {
  const context = document.createElement('div');
  context.className = 'cue-context';
  const mediaPath = model.currentMedia?.originalPath ?? 'no media';
  const compact = `${formatTimeMs(cue.startMs)}–${formatTimeMs(cue.endMs)} • ${mediaLabel(model, mediaPath)}`;
  const full = `${formatTimeMs(cue.startMs)}–${formatTimeMs(cue.endMs)} • ${mediaPath}`;
  appendSourceDisclosure(context, compact, full);
  return context;
}

function renderCueTargetText(model: AppModel, cue: Cue): HTMLElement {
  const target = document.createElement('div');
  target.className = 'cue-target';
  const wordTimings = model.store
    .listTranscriptWordTimingsForCue(cue.id)
    .filter((word) => word.charStart >= 0 && word.charEnd > word.charStart && word.charStart < cue.text.length)
    .sort((a, b) => a.charStart - b.charStart || a.wordIndex - b.wordIndex);
  if (wordTimings.length === 0) {
    target.textContent = cue.text;
    return target;
  }

  let cursor = 0;
  for (const word of wordTimings) {
    const start = Math.max(cursor, Math.min(word.charStart, cue.text.length));
    const end = Math.max(start, Math.min(word.charEnd, cue.text.length));
    if (start > cursor) {
      target.appendChild(document.createTextNode(cue.text.slice(cursor, start)));
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timed-word';
    button.dataset.wordTimingId = word.id;
    button.dataset.cueId = cue.id;
    button.dataset.startMs = String(word.startMs);
    button.dataset.endMs = String(word.endMs);
    button.textContent = cue.text.slice(start, end) || word.text;
    button.title = `Replay ${formatTimeMs(word.startMs)}–${formatTimeMs(word.endMs)}`;
    button.setAttribute('aria-label', `Replay word ${word.text} at ${formatTimeMs(word.startMs)}`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      seekToTime(model, word.startMs);
      model.player.activeCueId = cue.id;
      model.selection = {
        kind: 'lexeme',
        text: word.text,
        cueId: cue.id,
        tokenStart: word.wordIndex,
        tokenEnd: word.wordIndex + 1,
        charStart: word.charStart,
        charEnd: word.charEnd,
      };
      seekRenderedVideoToMs(word.startMs);
      rerenderApp(model);
    });
    button.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      const range = activeLoopRangeForSelection(model, cue, word.charStart, word.charEnd);
      if (range) {
        toggleLoopRange(model, range.startMs, range.endMs);
      } else {
        toggleLoopRange(model, cue.startMs, cue.endMs);
      }
      rerenderApp(model);
    });
    target.appendChild(button);
    cursor = end;
  }
  if (cursor < cue.text.length) {
    target.appendChild(document.createTextNode(cue.text.slice(cursor)));
  }
  return target;
}

function renderTranscriptPanel(model: AppModel): HTMLElement {
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
    empty.textContent = 'No transcript loaded yet. Import subtitles in the Library view, or use Generate local ASR draft after connecting the loopback local service.';
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
      void tokenizeCueText(model, cue).then((tokens: import('./model').TokenInfo[]) => {
        const surface = tokens.map((t: import('./model').TokenInfo) => t.surface).join(' | ');
        model.player.lastTokenPreview = surface;
        rerenderApp(model);
      });
    });
    actions.appendChild(tokenizeBtn);

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
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        seek();
      }
    });
    row.addEventListener('mouseup', () => {
      const selectionText = window.getSelection()?.toString().trim();
      if (selectionText) {
        void tokenizeCueText(model, cue).then((tokens: import('./model').TokenInfo[]) => {
          const lower = selectionText.toLowerCase();
          const token = tokens.find(
            (t: import('./model').TokenInfo) =>
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

function renderSelectionPanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'card selection-panel';
  const h2 = document.createElement('h2');
  h2.textContent = 'Selection';
  panel.appendChild(h2);

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

function renderCueSourceComparison(model: AppModel, cue: Cue, currentTrackId: typeof cue.trackId): HTMLElement | null {
  const currentTrack = model.store.getSubtitleTrack(currentTrackId);
  if (!currentTrack) return null;
  const sourceTracks = model.store
    .listSubtitleTracksForMedia(currentTrack.mediaId)
    .filter((track) => track.id !== currentTrackId && track.role === currentTrack.role);
  if (sourceTracks.length === 0) return null;

  const comparison = document.createElement('div');
  comparison.className = 'source-comparison';
  comparison.setAttribute('aria-label', `Cue ${cue.cueIndex} source comparison`);
  const heading = document.createElement('div');
  heading.className = 'meta';
  heading.textContent = 'Source comparison';
  comparison.appendChild(heading);

  for (const track of sourceTracks) {
    const sourceCues = model.store.listCuesForTrack(track.id);
    const sourceCue = sourceCues.find((candidate) => candidate.cueIndex === cue.cueIndex)
      ?? sourceCues.find((candidate) => candidate.startMs < cue.endMs && candidate.endMs > cue.startMs)
      ?? null;
    const row = document.createElement('p');
    row.className = 'meta source-comparison-row';
    const sourceLabel = track.provenance.parentTrackId === currentTrackId ? 'child' : 'source';
    row.textContent = `${sourceLabel} ${track.transcriptSourceKind}/${track.transcriptStatus}: ${sourceCue?.text ?? 'No aligned cue'}`;
    comparison.appendChild(row);
  }

  return comparison;
}

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
  localAsrPathLabel.textContent = 'Local service ASR media path (absolute; optional if current media already has one)';
  const localAsrPathInput = document.createElement('input');
  localAsrPathInput.id = 'local-asr-media-path';
  localAsrPathInput.name = 'local-asr-media-path';
  localAsrPathInput.type = 'text';
  localAsrPathInput.value = model.transcriptLifecycle.localAsrMediaPath;
  localAsrPathInput.placeholder = '/absolute/path/to/owned-media.webm';
  localAsrPathInput.addEventListener('input', () => {
    model.transcriptLifecycle.localAsrMediaPath = localAsrPathInput.value;
  });
  localAsrPathLabel.appendChild(localAsrPathInput);
  gateControls.appendChild(localAsrPathLabel);
  const currentMediaPath = model.currentMedia?.originalPath ?? '';
  if (currentMediaPath.startsWith('blob:') || currentMediaPath.startsWith('browser-file-handle:')) {
    const localAsrPathNote = document.createElement('p');
    localAsrPathNote.className = 'gate-note local-service-media-path-note';
    localAsrPathNote.textContent = 'Browser handles and blob URLs are playback-only; the loopback local service still needs an explicit absolute owned local media path for ASR, ffmpeg, ffprobe, and source-media snippets.';
    gateControls.appendChild(localAsrPathNote);
  }
  panel.appendChild(gateControls);

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
    const provider = makeLocalServiceYouTubeCaptionProvider(model.localService.baseUrl, {
      allowPublicRead: model.transcriptLifecycle.publicReadAuthorized,
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
        model.transcriptLifecycle.lastMessage = 'Public YouTube caption draft imported through the loopback service';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.appendChild(publicImportBtn);

  const asrBtn = document.createElement('button');
  asrBtn.className = 'btn-secondary';
  asrBtn.textContent = 'Generate local ASR draft';
  asrBtn.disabled = !model.currentMedia;
  asrBtn.addEventListener('click', () => {
    const provider = makeLocalServiceAsrProvider(model.localService.baseUrl, {
      mediaPath: model.transcriptLifecycle.localAsrMediaPath,
      modelName: 'tiny',
      alignWords: true,
    });
    void generateLocalAsrDraft(model, provider, model.transcriptLifecycle.youtubeLanguage)
      .then(() => {
        model.transcriptLifecycle.pendingCueEdits = {};
        model.transcriptLifecycle.pendingCueTimingEdits = {};
        model.transcriptLifecycle.pendingWordTimingEdits = {};
        model.transcriptLifecycle.lastMessage = 'Local service ASR draft generated';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.appendChild(asrBtn);

  const scribeBtn = document.createElement('button');
  scribeBtn.className = 'btn-secondary';
  scribeBtn.textContent = 'Generate ElevenLabs Scribe v2 draft';
  scribeBtn.disabled = !model.currentMedia;
  scribeBtn.addEventListener('click', () => {
    const provider = makeLocalServiceElevenLabsScribeProvider(model.localService.baseUrl, {
      mediaPath: model.transcriptLifecycle.localAsrMediaPath,
      modelId: 'scribe_v2',
      allowOnlineProvider: model.transcriptLifecycle.elevenLabsAuthorized,
    });
    void generateElevenLabsScribeDraft(model, provider, {
      language: model.transcriptLifecycle.youtubeLanguage,
      allowOnlineProvider: model.transcriptLifecycle.elevenLabsAuthorized,
    })
      .then(() => {
        model.transcriptLifecycle.pendingCueEdits = {};
        model.transcriptLifecycle.pendingCueTimingEdits = {};
        model.transcriptLifecycle.pendingWordTimingEdits = {};
        model.transcriptLifecycle.lastMessage = 'ElevenLabs Scribe v2 draft generated';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.appendChild(scribeBtn);
  panel.appendChild(actions);

  if (model.transcriptLifecycle.lastMessage) {
    const status = document.createElement('div');
    status.className = 'status-banner success';
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
      offsetPreview.textContent = `Preview: cue 1 ${formatTimeMs(firstCue.startMs)} → ${formatTimeMs(shifted[0]!.startMs)}, cue ${lastCue.cueIndex} ${formatTimeMs(lastCue.endMs)} → ${formatTimeMs(shifted[1]!.endMs)}`;
    }
    updateOffsetPreview();
    offsetInput.addEventListener('input', updateOffsetPreview);

    const applyOffsetBtn = document.createElement('button');
    applyOffsetBtn.className = 'btn-secondary';
    applyOffsetBtn.textContent = 'Apply offset to all cues';
    applyOffsetBtn.addEventListener('click', () => {
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
      label.textContent = `Cue ${cue.cueIndex} correction`;
      const textarea = document.createElement('textarea');
      textarea.id = `transcript-correction-cue-${cue.cueIndex}`;
      textarea.name = `transcript-correction-cue-${cue.cueIndex}`;
      textarea.value = model.transcriptLifecycle.pendingCueEdits[cue.id] ?? cue.text;
      textarea.addEventListener('input', () => {
        model.transcriptLifecycle.pendingCueEdits[cue.id] = textarea.value;
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
          model.transcriptLifecycle.pendingWordTimingEdits[word.id] = {
            text: wordText.value,
            startMs: Number(wordStart.value),
            endMs: Number(wordEnd.value),
          };
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
      splitCueButton.textContent = `Split cue ${cue.cueIndex}`;
      splitCueButton.addEventListener('click', () => {
        splitCueButton.disabled = true;
        model.transcriptLifecycle.lastMessage = `Splitting cue ${cue.cueIndex}…`;
        rerenderApp(model);
        splitTranscriptCueInCorrectedVersion(model, model.targetTrackId!, cue.id)
          .then(() => {
            model.transcriptLifecycle.pendingCueEdits = {};
            model.transcriptLifecycle.pendingCueTimingEdits = {};
            model.transcriptLifecycle.pendingWordTimingEdits = {};
            model.transcriptLifecycle.lastMessage = `Split cue ${cue.cueIndex} into a corrected version`;
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
      mergeCueButton.textContent = `Merge cue ${cue.cueIndex} with next`;
      mergeCueButton.disabled = !model.cues.some((candidate) => candidate.cueIndex === cue.cueIndex + 1);
      mergeCueButton.addEventListener('click', () => {
        mergeCueButton.disabled = true;
        model.transcriptLifecycle.lastMessage = `Merging cue ${cue.cueIndex} with next…`;
        rerenderApp(model);
        mergeTranscriptCueWithNextInCorrectedVersion(model, model.targetTrackId!, cue.id)
          .then(() => {
            model.transcriptLifecycle.pendingCueEdits = {};
            model.transcriptLifecycle.pendingCueTimingEdits = {};
            model.transcriptLifecycle.pendingWordTimingEdits = {};
            model.transcriptLifecycle.lastMessage = `Merged cue ${cue.cueIndex} with next into a corrected version`;
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
        })
        .filter((edit) => edit.text.trim().length > 0);
      void createCorrectedTranscriptVersion(model, targetTrack.id, edits)
        .then(() => {
          model.transcriptLifecycle.pendingCueEdits = {};
          model.transcriptLifecycle.pendingCueTimingEdits = {};
          model.transcriptLifecycle.pendingWordTimingEdits = {};
          model.transcriptLifecycle.lastMessage = 'Corrected transcript version created';
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
  approveBtn.disabled = targetTrack.transcriptStatus === 'approved';
  approveBtn.addEventListener('click', () => {
    approveTranscriptTrack(model, targetTrack.id);
    model.transcriptLifecycle.lastMessage = 'Transcript approved for study';
    model.importError = null;
    rerenderApp(model);
  });
  panel.appendChild(approveBtn);

  return panel;
}

function renderLibraryView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Library';
  section.appendChild(h2);
  const p = document.createElement('p');
  p.textContent = 'Load the synthetic local fixture, or choose your own local video with optional subtitle files. Browser imports stay on this device: media is opened via a local object URL and subtitles are read with File.text().';
  section.appendChild(p);

  const form = document.createElement('div');
  form.className = 'import-form';

  const loadBtn = document.createElement('button');
  loadBtn.className = 'btn-primary';
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
  form.appendChild(loadBtn);

  const localImportGroup = document.createElement('div');
  localImportGroup.className = 'local-file-import';
  const localHeading = document.createElement('h3');
  localHeading.textContent = 'Import your local files';
  const localIntro = document.createElement('p');
  localIntro.className = 'file-hint';
  localIntro.textContent = 'Everything stays in this browser session: media opens as a local object URL, subtitle files are read with File.text(), and provider drafts stay gated.';
  localImportGroup.append(localHeading, localIntro);

  const localFileGrid = document.createElement('div');
  localFileGrid.className = 'local-file-grid';

  const mediaLabel = document.createElement('label');
  mediaLabel.htmlFor = 'local-media-file';
  mediaLabel.textContent = 'Local media file';
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
        setView(model, 'player');
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  const localImportActions = document.createElement('div');
  localImportActions.className = 'local-import-actions';
  localImportActions.appendChild(localImportBtn);

  const showOpenFilePicker = (globalThis as BrowserFilePickerGlobal).showOpenFilePicker;
  if (typeof showOpenFilePicker === 'function') {
    const persistentImportBtn = document.createElement('button');
    persistentImportBtn.className = 'btn-secondary';
    persistentImportBtn.textContent = 'Import persistent media handle';
    persistentImportBtn.setAttribute('aria-label', 'Import media through a browser persistent file handle');
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
          return importBrowserLocalFileHandles(model, { mediaHandle });
        })
        .then(() => {
          if (!model.importError) {
            setView(model, 'player');
            model.importError = null;
          }
          rerenderApp(model);
        })
        .catch((err: unknown) => {
          model.importError = err instanceof Error ? err.message : String(err);
          rerenderApp(model);
        });
    });
    localImportActions.appendChild(persistentImportBtn);
  }
  localImportGroup.appendChild(localImportActions);
  form.appendChild(localImportGroup);
  form.appendChild(renderTranscriptLifecyclePanel(model));

  if (model.currentMedia) {
    const current = document.createElement('p');
    current.className = 'meta';
    current.textContent = `Current media: ${model.currentMedia.title} • ${model.currentMedia.privacyLabel}`;
    form.appendChild(current);
  }

  if (model.importError) {
    const banner = document.createElement('div');
    banner.className = 'status-banner error';
    banner.setAttribute('role', 'alert');
    banner.textContent = model.importError;
    form.appendChild(banner);
  }

  section.appendChild(form);
  return section;
}

function renderSavedView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card saved-view';

  const tabs = document.createElement('div');
  tabs.className = 'saved-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Saved item categories');
  const categories: { id: 'vocab' | 'sentences'; label: string; kinds: readonly ('lexeme' | 'phrase' | 'sentence')[] }[] = [
    { id: 'vocab', label: 'My Vocab', kinds: ['lexeme', 'phrase'] },
    { id: 'sentences', label: 'My Sentences', kinds: ['sentence'] },
  ];
  const currentTab = model.savedViewTab ?? 'vocab';
  let firstTabButton: HTMLButtonElement | null = null;
  for (const category of categories) {
    const btn = document.createElement('button');
    btn.className = `saved-tab${currentTab === category.id ? ' active' : ''}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(currentTab === category.id));
    btn.setAttribute('aria-controls', `saved-panel-${category.id}`);
    btn.id = `saved-tab-${category.id}`;
    btn.textContent = category.label;
    btn.addEventListener('click', () => {
      model.savedViewTab = category.id;
      rerenderApp(model);
    });
    tabs.appendChild(btn);
    if (!firstTabButton) firstTabButton = btn;
  }
  section.appendChild(tabs);

  const allItems = Object.values(model.store.snapshot().savedItems) as SavedItem[];
  const selectedKinds = categories.find((c) => c.id === currentTab)?.kinds ?? ['lexeme', 'phrase'];
  const items = allItems.filter((i) => selectedKinds.includes(i.kind) && !i.archivedAt);

  const heading = document.createElement('h2');
  heading.textContent = currentTab === 'vocab' ? 'My Vocab' : 'My Sentences';
  heading.id = 'saved-heading';
  section.appendChild(heading);

  const panel = document.createElement('div');
  panel.className = 'saved-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.id = `saved-panel-${currentTab}`;
  panel.setAttribute('aria-labelledby', `saved-tab-${currentTab}`);

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = currentTab === 'vocab'
      ? 'No words or phrases saved yet. Select text in a transcript cue to save it.'
      : 'No sentences saved yet. Click “Save sentence” on a transcript cue.';
    panel.appendChild(empty);
    section.appendChild(panel);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'saved-list';
  for (const item of items) {
    const occurrences = model.savedOccurrenceService.listOccurrencesForItem(item.id);
    const card = document.createElement('article');
    card.className = 'saved-item';
    const title = document.createElement('h3');
    title.textContent = item.displayText;
    card.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${item.kind} • ${item.language} • ${occurrences.length} occurrence${occurrences.length === 1 ? '' : 's'}`;
    card.appendChild(meta);
    if (item.meaning) {
      const meaning = document.createElement('div');
      meaning.className = 'meta meaning';
      meaning.textContent = `Meaning: ${item.meaning}`;
      card.appendChild(meaning);
    }

    const occurrenceGroup = document.createElement('div');
    occurrenceGroup.className = 'occurrence-group';
    for (const occurrence of occurrences) {
      const link = document.createElement('a');
      link.className = 'occurrence-link';
      link.href = '#';
      const cue = model.store.getCue(occurrence.cueId);
      const cueText = cue?.text ?? occurrence.selectionText;
      link.textContent = `▶ ${formatTimeMs(occurrence.startMs)} — ${cueText}`;
      link.setAttribute('aria-label', `Jump to ${formatTimeMs(occurrence.startMs)} in ${occurrence.sourceContext.mediaPath}`);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        setView(model, 'player');
        model.player.currentTimeMs = occurrence.startMs;
        model.player.activeCueId = occurrence.cueId;
        model.targetTrackId = occurrence.sourceContext.subtitleTrackId;
        model.nativeTrackId = model.currentMedia?.id === occurrence.sourceContext.mediaId ? model.nativeTrackId : null;
        if (model.currentMedia?.id !== occurrence.sourceContext.mediaId) {
          const asset = model.store.getMediaAsset(occurrence.sourceContext.mediaId);
          if (asset) {
            model.currentMedia = asset;
            model.cues = model.store.listCuesForTrack(occurrence.sourceContext.subtitleTrackId);
          }
        }
        const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
        if (video) {
          video.currentTime = occurrence.startMs / 1000;
        }
        rerenderApp(model);
      });
      occurrenceGroup.appendChild(link);

      const contextLine = document.createElement('div');
      contextLine.className = 'occurrence-context';
      const tokenSpanText = occurrence.sourceContext.tokenSpan.startToken === occurrence.sourceContext.tokenSpan.endToken - 1
        ? `token ${occurrence.sourceContext.tokenSpan.startToken}`
        : `tokens ${occurrence.sourceContext.tokenSpan.startToken}–${occurrence.sourceContext.tokenSpan.endToken - 1}`;
      appendSourceDisclosure(
        contextLine,
        `${compactPathLabel(occurrence.sourceContext.mediaPath)} • ${tokenSpanText} • chars ${occurrence.sourceContext.charSpan.start}–${occurrence.sourceContext.charSpan.end}`,
        `${occurrence.sourceContext.mediaPath} • ${tokenSpanText} • chars ${occurrence.sourceContext.charSpan.start}–${occurrence.sourceContext.charSpan.end}`,
      );
      occurrenceGroup.appendChild(contextLine);
    }
    card.appendChild(occurrenceGroup);

    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn-secondary';
    reviewBtn.textContent = 'Create review card';
    reviewBtn.addEventListener('click', () => {
      const occurrence = occurrences[0];
      if (occurrence) {
        createReviewCardForSavedItem(model, item, occurrence, 'recognition');
        setView(model, 'review');
        setReviewBucketAsOf(model, new Date());
        model.review.activeCardId = null;
        rerenderApp(model);
      }
    });
    card.appendChild(reviewBtn);
    list.appendChild(card);
  }
  panel.appendChild(list);
  section.appendChild(panel);
  return section;
}

function renderReviewView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card review-card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Review';
  section.appendChild(h2);

  const buckets = listReviewBuckets(model, model.review.bucketAsOf);
  const counts = {
    newCards: buckets.newCards.length,
    learning: buckets.learning.length,
    review: buckets.review.length,
    relearning: buckets.relearning.length,
    mastered: buckets.mastered.length,
  };

  section.appendChild(renderBucketTabs(model, counts));

  const activeCardId = model.review.activeCardId;
  let active = activeCardId
    ? [...buckets.newCards, ...buckets.learning, ...buckets.review, ...buckets.relearning, ...buckets.mastered].find(
        (cs) => cs.card.id === activeCardId,
      )
    : null;

  if (!active) {
    active = pickNextDueCard(model, model.review.bucketAsOf);
    if (active) {
      model.review.activeCardId = active.card.id;
    }
  }

  if (!active) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = counts.mastered > 0
      ? 'No cards due right now. Mastered cards are hidden until their next review.'
      : 'No cards ready for review.';
    section.appendChild(empty);
    return section;
  }

  const { card, savedItem, occurrence, state } = active;
  const currentCue = model.store.getCue(occurrence.cueId);
  const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
  const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
  const nativeText = currentCue ? nativeTextForCue(currentCue, nativeTrack, nativeCues) : undefined;

  const prompt = document.createElement('div');
  prompt.className = 'review-prompt';
  prompt.setAttribute('role', 'alert');
  prompt.setAttribute('aria-live', 'polite');
  prompt.textContent = card.promptTemplate;
  section.appendChild(prompt);

  if (model.review.revealed) {
    const reveal = document.createElement('div');
    reveal.className = 'review-reveal';

    const targetLine = document.createElement('p');
    targetLine.className = 'review-target';
    targetLine.textContent = savedItem.displayText;
    reveal.appendChild(targetLine);

    if (savedItem.meaning) {
      const meaning = document.createElement('p');
      meaning.className = 'review-meaning';
      meaning.textContent = `Meaning: ${savedItem.meaning}`;
      reveal.appendChild(meaning);
    }

    if (currentCue) {
      const context = document.createElement('div');
      context.className = 'review-context';
      const time = document.createElement('p');
      time.className = 'meta';
      time.textContent = `Source: ${formatTimeMs(currentCue.startMs)} – ${formatTimeMs(currentCue.endMs)}`;
      context.appendChild(time);
      const targetContext = document.createElement('p');
      targetContext.className = 'review-target-context';
      targetContext.textContent = currentCue.text;
      context.appendChild(targetContext);
      if (nativeText) {
        const nativeContext = document.createElement('p');
        nativeContext.className = 'review-native-context';
        nativeContext.textContent = nativeText;
        context.appendChild(nativeContext);
      }
      const sourceNote = document.createElement('p');
      sourceNote.className = 'meta';
      appendSourceDisclosure(sourceNote, `Media: ${compactPathLabel(occurrence.sourceContext.mediaPath)}`, occurrence.sourceContext.mediaPath);
      context.appendChild(sourceNote);
      reveal.appendChild(context);
    }
    section.appendChild(reveal);
  }

  const controls = document.createElement('div');
  controls.className = 'review-controls';

  const revealBtn = document.createElement('button');
  revealBtn.className = 'btn-secondary';
  revealBtn.textContent = model.review.revealed ? 'Hide answer' : 'Show answer / context';
  revealBtn.addEventListener('click', () => {
    toggleReviewReveal(model);
    rerenderApp(model);
  });
  controls.appendChild(revealBtn);

  const replayBtn = document.createElement('button');
  replayBtn.className = 'btn-secondary';
  replayBtn.textContent = 'Replay source cue';
  replayBtn.setAttribute('aria-label', 'Jump back to the source cue in the player');
  replayBtn.disabled = !currentCue;
  replayBtn.addEventListener('click', () => {
    if (!currentCue) return;
    setView(model, 'player');
    model.player.currentTimeMs = currentCue.startMs;
    model.player.activeCueId = currentCue.id;
    model.player.isPlaying = false;
    const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
    if (video) {
      video.currentTime = currentCue.startMs / 1000;
    }
    rerenderApp(model);
  });
  controls.appendChild(replayBtn);
  section.appendChild(controls);

  if (model.review.revealed) {
    const buttons = document.createElement('div');
    buttons.className = 'review-buttons';
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', 'Rate your recall');
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const btn = document.createElement('button');
      btn.className = rating;
      btn.textContent = rating.charAt(0).toUpperCase() + rating.slice(1);
      btn.setAttribute('aria-label', `Rate ${rating}`);
      btn.addEventListener('click', () => {
        submitReviewRating(model, card.id, rating, model.review.bucketAsOf);
        model.review.activeCardId = null;
        rerenderApp(model);
      });
      buttons.appendChild(btn);
    }
    section.appendChild(buttons);
  }

  const stats = document.createElement('p');
  stats.className = 'meta';
  const totalCards = Object.keys(model.store.snapshot().reviewCards).length;
  stats.textContent = `${totalCards} card${totalCards === 1 ? '' : 's'} in local deck • state: ${state.state} • due: ${formatDueAt(state.dueAt)}`;
  section.appendChild(stats);

  return section;
}

function renderBucketTabs(
  _model: AppModel,
  counts: Record<'newCards' | 'learning' | 'review' | 'relearning' | 'mastered', number>,
): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'review-buckets';
  tabs.setAttribute('role', 'region');
  tabs.setAttribute('aria-label', 'Review bucket counts');
  const buckets: { id: keyof typeof counts; label: string }[] = [
    { id: 'newCards', label: 'New' },
    { id: 'learning', label: 'Learning' },
    { id: 'review', label: 'Review' },
    { id: 'relearning', label: 'Relearning' },
    { id: 'mastered', label: 'Mastered' },
  ];
  for (const bucket of buckets) {
    const chip = document.createElement('div');
    chip.className = 'bucket-chip';
    const label = document.createElement('span');
    label.className = 'bucket-label';
    label.textContent = bucket.label;
    const count = document.createElement('span');
    count.className = 'bucket-count';
    count.textContent = String(counts[bucket.id]);
    chip.append(label, count);
    tabs.appendChild(chip);
  }
  return tabs;
}

function renderSettingsView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Settings';
  section.appendChild(h2);
  const p = document.createElement('p');
  p.textContent = 'Online providers, cloud sync, and external integrations are disabled by default. Enable them only after an explicit privacy review.';
  section.appendChild(p);

  const list = document.createElement('ul');
  const items = [
    'Dictionary / translation adapters: disabled',
    'Cloud sync / backups: disabled',
    'AnkiConnect / external export: disabled',
    'Speech recognition / shadowing: disabled',
  ];
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  section.appendChild(list);

  const servicePanel = document.createElement('div');
  servicePanel.className = 'local-service-panel';
  const serviceHeading = document.createElement('h3');
  serviceHeading.textContent = 'Local service / SQLite durable state';
  servicePanel.appendChild(serviceHeading);

  const serviceDescription = document.createElement('p');
  serviceDescription.textContent = 'Connect to the loopback-only local service when you want SQLite-backed state, local transcription jobs, and scratch-artifact cleanup. This is explicit so default browser tests make no network calls.';
  servicePanel.appendChild(serviceDescription);

  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'Local service URL';
  urlLabel.htmlFor = 'local-service-url';
  const urlInput = document.createElement('input');
  urlInput.id = 'local-service-url';
  urlInput.name = 'local-service-url';
  urlInput.type = 'url';
  urlInput.value = model.localService.baseUrl;
  urlInput.addEventListener('input', () => {
    setLocalServiceBaseUrl(model, urlInput.value);
  });
  urlLabel.appendChild(urlInput);
  servicePanel.appendChild(urlLabel);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';
  const connectButton = document.createElement('button');
  connectButton.className = 'btn-primary';
  connectButton.textContent = 'Connect local service';
  connectButton.disabled = model.localService.status === 'connecting';
  connectButton.addEventListener('click', () => {
    void connectLocalService(model, model.localService.baseUrl).then(() => rerenderApp(model));
    rerenderApp(model);
  });
  buttonRow.appendChild(connectButton);

  const saveButton = document.createElement('button');
  saveButton.className = 'btn-secondary';
  saveButton.textContent = 'Save state now';
  saveButton.addEventListener('click', () => {
    void saveModelToLocalService(model, model.localService.baseUrl).then(() => rerenderApp(model));
  });
  buttonRow.appendChild(saveButton);
  servicePanel.appendChild(buttonRow);

  const autosaveLabel = document.createElement('label');
  autosaveLabel.htmlFor = 'local-service-autosave';
  const autosaveCheckbox = document.createElement('input');
  autosaveCheckbox.type = 'checkbox';
  autosaveCheckbox.id = 'local-service-autosave';
  autosaveCheckbox.name = 'local-service-autosave';
  autosaveCheckbox.checked = model.localService.autosaveEnabled;
  autosaveCheckbox.addEventListener('change', () => {
    setLocalServiceAutosave(model, autosaveCheckbox.checked);
    rerenderApp(model);
  });
  autosaveLabel.appendChild(autosaveCheckbox);
  autosaveLabel.append(' Autosave to local service after supported study-state changes');
  servicePanel.appendChild(autosaveLabel);

  const serviceStatus = document.createElement('div');
  serviceStatus.className = `status-banner ${model.localService.status === 'error' ? 'error' : model.localService.status === 'connected' ? 'success' : ''}`;
  serviceStatus.setAttribute('role', 'status');
  serviceStatus.textContent = model.localService.status === 'connected'
    ? `Connected to local service. SQLite durable state is available.${model.localService.lastSavedAt ? ` Last saved: ${model.localService.lastSavedAt}` : ''}`
    : model.localService.lastMessage ?? 'Local service not connected.';
  servicePanel.appendChild(serviceStatus);
  section.appendChild(servicePanel);

  const status = document.createElement('div');
  status.className = 'status-banner';
  status.setAttribute('role', 'status');
  status.textContent = model.providerPolicy.onlineProvidersEnabled
    ? 'Online providers enabled — review privacy settings.'
    : 'Local-only mode active. No network calls are made.';
  section.appendChild(status);
  return section;
}

let currentRoot: HTMLElement | null = null;

export function rerenderApp(model: AppModel): void {
  const app = document.getElementById('app');
  if (!app) return;
  const previousView = model.view;
  const focused = document.activeElement?.id ?? '';
  if (currentRoot && currentRoot.parentNode === app) {
    app.removeChild(currentRoot);
  }
  currentRoot = renderApp(model);
  const nav = currentRoot.querySelector('.lingotorte-nav');
  if (nav) setActiveNav(nav as HTMLElement, previousView);
  app.appendChild(currentRoot);
  if (focused) {
    const el = document.getElementById(focused);
    el?.focus();
  }
  scrollCueIntoView(model.player.activeCueId);
}

function scrollCueIntoView(cueId: string | null): void {
  if (!cueId) return;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(cueId) : cueId.replace(/"/g, '\\"');
  const row = document.querySelector(`[data-cue-id="${escaped}"]`);
  if (row && typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ behavior: 'auto', block: 'center' });
  }
}
