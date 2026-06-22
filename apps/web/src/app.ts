import type { AppModel, ViewName } from './uiTypes';
import type { Cue, SavedItem } from '@lingotorte/domain';
import { formatDueAt, formatTimeMs } from './uiTypes';
import {
  activeCueAtTime,
  applyLoopTolerance,
  clearSelection,
  createReviewCardForSavedItem,
  importFixtureMediaAndSubtitles,
  importBrowserLocalFiles,
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
  seekToCue,
  setPlaybackRate,
  setPendingMeaning,
  setPendingNotes,
  setReviewBucketAsOf,
  setTranscriptQuery,
  setView,
  submitReviewRating,
  toggleLoopCue,
  togglePlay,
  toggleReviewReveal,
  tokenizeCueText,
  setPracticeMode,
  setPracticePendingAnswer,
  submitPracticeAttempt,
  exportLearnerState,
  previewRestoreManifest,
  confirmRestore,
  setExportImportAcknowledgedWarning,
  setExportImportConfirmOverwrite,
  setExportImportError,
  approveTranscriptTrack,
  createCorrectedTranscriptVersion,
  generateLocalAsrDraft,
  importYouTubeCaptionCandidate,
  makeFakeLocalAsrProvider,
  makeFakeYouTubeCaptionProvider,
} from './model';

export function renderApp(model: AppModel): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lingotorte-app';
  root.appendChild(renderHeader(model));
  root.appendChild(renderMain(model));
  root.appendChild(renderFooter());
  return root;
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

  if (typedEnabled) {
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
  submitBtn.addEventListener('click', () => {
    submitPracticeAttempt(model, model.practice.pendingAnswer, model.review.bucketAsOf);
    rerenderApp(model);
  });
  controls.appendChild(submitBtn);
  section.appendChild(controls);

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
    sourceNote.textContent = `Media: ${occurrence.sourceContext.mediaPath}`;
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
    summary.textContent = `Export ready: ${model.exportImport.lastExport.fileName} • ${model.exportImport.lastExport.recordCount} records • ${model.exportImport.lastExport.warningCount} privacy warnings • destination: downloaded via your browser`;
    exportGroup.appendChild(summary);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-secondary';
    downloadBtn.textContent = 'Download export JSON';
    downloadBtn.setAttribute('aria-label', `Download learner export JSON as ${model.exportImport.lastExport.fileName}`);
    downloadBtn.addEventListener('click', () => {
      downloadTextFile(model.exportImport.lastExport!.fileName, model.exportImport.lastExport!.manifestJson);
    });
    exportGroup.appendChild(downloadBtn);
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
    safe.className = model.exportImport.preview.safeToRestore ? 'status-banner success' : 'status-banner error';
    safe.setAttribute('role', 'status');
    safe.textContent = model.exportImport.preview.safeToRestore
      ? 'Safe to restore: local learner state is empty.'
      : 'Local learner state exists. Restore will merge/update imported records into current data.';
    previewPanel.appendChild(safe);

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

    if (model.exportImport.preview.overwriteConfirmationRequired) {
      const overwriteLabel = document.createElement('label');
      overwriteLabel.htmlFor = 'restore-confirm-overwrite';
      const overwriteCheckbox = document.createElement('input');
      overwriteCheckbox.type = 'checkbox';
      overwriteCheckbox.id = 'restore-confirm-overwrite';
      overwriteCheckbox.name = 'restore-confirm-overwrite';
      overwriteCheckbox.checked = model.exportImport.confirmOverwrite;
      overwriteCheckbox.addEventListener('change', () => {
        setExportImportConfirmOverwrite(model, overwriteCheckbox.checked);
        rerenderApp(model);
      });
      overwriteLabel.appendChild(overwriteCheckbox);
      overwriteLabel.append(' I confirm this restore will merge/update imported records into my current local learner state.');
      previewPanel.appendChild(overwriteLabel);
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

    const allWarningsAcknowledged = model.exportImport.preview.warnings.every((w) =>
      model.exportImport.acknowledgedWarnings.includes(w.kind),
    );
    const canRestore = allWarningsAcknowledged && model.exportImport.confirmOverwrite;

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

function renderPlayerView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'player-layout';

  const left = document.createElement('div');
  left.appendChild(renderVideoStage(model));
  left.appendChild(renderPlayerControls(model));
  left.appendChild(renderSelectionPanel(model));
  section.appendChild(left);

  const right = document.createElement('div');
  right.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Transcript';
  right.appendChild(h2);
  right.appendChild(renderTranscriptPanel(model));
  section.appendChild(right);

  return section;
}

function renderVideoStage(model: AppModel): HTMLElement {
  const stage = document.createElement('div');
  stage.className = 'video-stage';
  const video = document.createElement('video');
  video.setAttribute('controls', '');
  video.setAttribute('preload', 'metadata');
  video.setAttribute('role', 'img');
  video.setAttribute('aria-label', model.currentMedia?.title ?? 'Video player');
  if (model.currentMedia) {
    video.src = model.currentMedia.originalPath;
    video.playbackRate = model.player.playbackRate;
  }
  video.addEventListener('timeupdate', () => {
    const timeMs = Math.round(video.currentTime * 1000);
    model.player.currentTimeMs = timeMs;
    const cue = activeCueAtTime(model.cues, timeMs);
    if (cue && cue.id !== model.player.activeCueId) {
      model.player.activeCueId = cue.id;
      scrollCueIntoView(cue.id);
    }
    updateOverlay(stage, model, cue);
    const loopJump = applyLoopTolerance(timeMs, cue, model.player.loopCue);
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

  if (!model.currentMedia) {
    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.innerHTML = `<span aria-hidden="true">📁</span><p>Import a local video in the Library view to begin.</p>`;
    stage.appendChild(placeholder);
  }

  return stage;
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
  target.textContent = cue.text;
  overlay.appendChild(target);

  const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
  const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
  const nativeText = nativeTextForCue(cue, nativeTrack, nativeCues);
  if (nativeText) {
    const native = document.createElement('div');
    native.className = 'subtitle-native';
    native.textContent = nativeText;
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

  return controls;
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
    empty.textContent = 'No transcript loaded. Import media and subtitles in the Library view.';
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

    const target = document.createElement('div');
    target.className = 'cue-target';
    target.textContent = cue.text;
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

    const context = document.createElement('div');
    context.className = 'cue-context';
    context.setAttribute('aria-hidden', 'true');
    context.textContent = `${formatTimeMs(cue.startMs)}–${formatTimeMs(cue.endMs)} • ${model.currentMedia?.originalPath ?? 'no media'}`;
    row.appendChild(context);

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

function renderSelectionPanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'card selection-panel';
  const h2 = document.createElement('h2');
  h2.textContent = 'Selection';
  panel.appendChild(h2);

  if (model.player.lastTokenPreview) {
    const preview = document.createElement('div');
    preview.className = 'token-preview';
    const label = document.createElement('strong');
    label.textContent = 'Token preview:';
    const value = document.createElement('span');
    value.textContent = model.player.lastTokenPreview;
    preview.append(label, value);
    panel.appendChild(preview);
  }

  if (!model.selection) {
    const p = document.createElement('p');
    p.textContent = 'Select a word or phrase in a transcript cue to save it with source context.';
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

function renderTranscriptLifecyclePanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'transcript-lifecycle-panel';

  const heading = document.createElement('h3');
  heading.textContent = 'Transcript lifecycle';
  panel.appendChild(heading);

  const intro = document.createElement('p');
  intro.textContent = 'Provider/ASR transcripts enter as drafts. Correct and approve a transcript before creating learner study items from it.';
  panel.appendChild(intro);

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
  panel.appendChild(urlLabel);

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
  panel.appendChild(authLabel);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const importBtn = document.createElement('button');
  importBtn.className = 'btn-primary';
  importBtn.textContent = 'Import fake YouTube caption draft';
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

  const asrBtn = document.createElement('button');
  asrBtn.className = 'btn-secondary';
  asrBtn.textContent = 'Generate fake local ASR draft';
  asrBtn.disabled = !model.currentMedia;
  asrBtn.addEventListener('click', () => {
    const provider = makeFakeLocalAsrProvider({
      engine: 'fake-local-asr',
      modelName: 'tiny-test-model',
      language: model.transcriptLifecycle.youtubeLanguage,
      segments: [
        { startMs: 0, endMs: 1600, text: 'Lokalny szkic ASR.' },
        { startMs: 1600, endMs: 3200, text: 'Drugi szkic ASR.' },
      ],
    });
    void generateLocalAsrDraft(model, provider, model.transcriptLifecycle.youtubeLanguage)
      .then(() => {
        model.transcriptLifecycle.pendingCueEdits = {};
        model.transcriptLifecycle.lastMessage = 'Local ASR draft generated';
        model.importError = null;
        rerenderApp(model);
      })
      .catch((err: unknown) => {
        model.importError = err instanceof Error ? err.message : String(err);
        rerenderApp(model);
      });
  });
  actions.appendChild(asrBtn);
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

  const trackMeta = document.createElement('p');
  trackMeta.className = 'meta';
  trackMeta.textContent = `Current transcript: ${targetTrack.transcriptStatus} • ${targetTrack.transcriptSourceKind} • warnings: ${targetTrack.provenance.warningFlags.join(', ') || 'none'}`;
  panel.appendChild(trackMeta);

  if (targetTrack.transcriptStatus !== 'approved') {
    const correctionGroup = document.createElement('div');
    correctionGroup.className = 'transcript-correction-list';
    for (const cue of model.cues) {
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
      correctionGroup.appendChild(label);
    }
    panel.appendChild(correctionGroup);

    const correctBtn = document.createElement('button');
    correctBtn.className = 'btn-secondary';
    correctBtn.textContent = 'Create corrected transcript version';
    correctBtn.addEventListener('click', () => {
      const edits = model.cues
        .map((cue) => ({ cueId: cue.id, text: model.transcriptLifecycle.pendingCueEdits[cue.id] ?? cue.text }))
        .filter((edit) => edit.text.trim().length > 0);
      void createCorrectedTranscriptVersion(model, targetTrack.id, edits)
        .then(() => {
          model.transcriptLifecycle.pendingCueEdits = {};
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
  p.textContent = 'Load the synthetic local fixture, or choose your own local video and subtitle files. Browser imports stay on this device: media is opened via a local object URL and subtitles are read with File.text().';
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
  localImportGroup.appendChild(localHeading);

  const mediaLabel = document.createElement('label');
  mediaLabel.htmlFor = 'local-media-file';
  mediaLabel.textContent = 'Local media file';
  const mediaInput = document.createElement('input');
  mediaInput.id = 'local-media-file';
  mediaInput.name = 'local-media-file';
  mediaInput.type = 'file';
  mediaInput.accept = 'video/*,audio/*,.mp4,.m4v,.webm,.mkv,.mov,.mp3,.m4a,.wav';
  localImportGroup.append(mediaLabel, mediaInput);

  const targetLabel = document.createElement('label');
  targetLabel.htmlFor = 'local-target-subtitle-file';
  targetLabel.textContent = 'Target subtitle file (.srt)';
  const targetInput = document.createElement('input');
  targetInput.id = 'local-target-subtitle-file';
  targetInput.name = 'local-target-subtitle-file';
  targetInput.type = 'file';
  targetInput.accept = '.srt,text/plain,application/x-subrip';
  localImportGroup.append(targetLabel, targetInput);

  const nativeLabel = document.createElement('label');
  nativeLabel.htmlFor = 'local-native-subtitle-file';
  nativeLabel.textContent = 'Native subtitle file (.srt, optional)';
  const nativeInput = document.createElement('input');
  nativeInput.id = 'local-native-subtitle-file';
  nativeInput.name = 'local-native-subtitle-file';
  nativeInput.type = 'file';
  nativeInput.accept = '.srt,text/plain,application/x-subrip';
  localImportGroup.append(nativeLabel, nativeInput);

  const localImportBtn = document.createElement('button');
  localImportBtn.className = 'btn-primary';
  localImportBtn.textContent = 'Import local media';
  localImportBtn.setAttribute('aria-label', 'Import selected local media and subtitle files');
  localImportBtn.addEventListener('click', () => {
    const mediaFile = mediaInput.files?.[0];
    const targetSubtitleFile = targetInput.files?.[0];
    const nativeSubtitleFile = nativeInput.files?.[0] ?? null;
    if (!mediaFile || !targetSubtitleFile) {
      model.importError = 'Choose a local media file and a target .srt subtitle file before importing.';
      rerenderApp(model);
      return;
    }
    void importBrowserLocalFiles(model, { mediaFile, targetSubtitleFile, nativeSubtitleFile })
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
  localImportGroup.appendChild(localImportBtn);
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
      contextLine.setAttribute('aria-hidden', 'true');
      const tokenSpanText = occurrence.sourceContext.tokenSpan.startToken === occurrence.sourceContext.tokenSpan.endToken - 1
        ? `token ${occurrence.sourceContext.tokenSpan.startToken}`
        : `tokens ${occurrence.sourceContext.tokenSpan.startToken}–${occurrence.sourceContext.tokenSpan.endToken - 1}`;
      contextLine.textContent = `${occurrence.sourceContext.mediaPath} • ${tokenSpanText} • chars ${occurrence.sourceContext.charSpan.start}–${occurrence.sourceContext.charSpan.end}`;
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
      sourceNote.textContent = `Media: ${occurrence.sourceContext.mediaPath}`;
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
