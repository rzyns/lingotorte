import { readNativePathPolicy, NATIVE_PATH_COMPATIBILITY_MESSAGE } from '../../../../packages/domain/src/nativePaths.ts';
import type { AppModel } from '../uiTypes';
import { formatDueAt, formatTimeMs } from '../uiTypes';
import {
  prepareSourceAudioSnippet,
  redactSourceAudioSnippetError,
  releaseSourceAudioSnippet,
  type SourceAudioSnippetLifecycle,
} from '../sourceAudioSnippet.ts';
import {
  nativeTextForCue,
  setView,
  resolveActiveDueCard,
  setPracticeMode,
  setPracticePendingAnswer,
  submitPracticeAttempt,
  prepareSentenceBuilderForCue,
  setSentenceBuilderTokens,
  submitSentenceBuilderAttempt,
  practiceChoicesFor,
  practiceContractFor,
  syncPracticeCard,
  revealPracticeAnswer,
  PRACTICE_SPEAKING_UNAVAILABLE,
} from '../model';
import { PRACTICE_SUCCESSORS, requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { appendSourceDisclosure, captureUiServiceOwner, mediaDisplayName, renderUnresolvedSource } from '../ui/common.ts';
import { hasNativeInputPath, invalidatePracticeSnippet, practiceSnippetContextKey, practiceSnippetStates, synchronizePracticeSnippet } from '../ui/snippets.ts';

export function renderPracticeView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card practice-card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Practice';
  section.appendChild(h2);

  const active = resolveActiveDueCard(model, model.clock());
  // lt-0g9: per-card answer/tokens/choices/reveal never carry over to a different card; the previous
  // submission's feedback is shown only until the next card changes or is submitted.
  syncPracticeCard(model, active?.card.id ?? null);
  if (practiceSnippetStates.has(model)) synchronizePracticeSnippet(model);

  const last = model.practice.lastAttemptResult;
  if (last) {
    const feedback = document.createElement('div');
    feedback.className = `practice-feedback ${last.correct ? 'success' : 'error'}`;
    feedback.id = 'practice-feedback';
    feedback.tabIndex = -1;
    feedback.setAttribute('role', 'status');
    const verdict = last.correct ? `Result: ${last.result} ✓` : `Result: ${last.result}`;
    feedback.textContent = last.expected !== undefined ? `Previous card — ${verdict}. Expected: ${last.expected}` : verdict;
    section.appendChild(feedback);
  }

  if (!active) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.id = 'practice-empty';
    empty.tabIndex = -1;
    empty.textContent = 'No cards due right now. Add more saved items or wait for scheduled reviews.';
    section.appendChild(empty);
    return section;
  }

  const { occurrence, state, card } = active;
  const contract = practiceContractFor(model, active);
  const currentCue = model.store.getCue(occurrence.cueId);
  const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
  const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
  const nativeText = currentCue ? nativeTextForCue(currentCue, nativeTrack, nativeCues) : undefined;

  const prompt = document.createElement('div');
  prompt.className = 'practice-prompt';
  prompt.id = 'practice-prompt';
  prompt.tabIndex = -1;
  prompt.setAttribute('role', 'alert');
  prompt.setAttribute('aria-live', 'polite');
  prompt.textContent = contract ? contract.prompt : PRACTICE_SPEAKING_UNAVAILABLE;
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
  const modes: { value: import('../uiTypes').PracticeMode; label: string }[] = [
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
    setPracticeMode(model, modeSelect.value as import('../uiTypes').PracticeMode);
    rerenderApp(model);
  });
  modeLabel.appendChild(modeSelect);
  modeRow.appendChild(modeLabel);
  section.appendChild(modeRow);

  const typedEnabled = model.practice.mode === 'typed-input' || model.practice.typedAttemptsEnabled;

  if (!contract) {
    const unavailable = document.createElement('p');
    unavailable.className = 'practice-unavailable';
    unavailable.setAttribute('role', 'status');
    unavailable.textContent = 'Speaking is not available. No microphone is requested or used.';
    section.appendChild(unavailable);
  } else if (model.practice.mode === 'multiple-choice') {
    const choices = practiceChoicesFor(model, card.id, contract.expected);
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
        submitPracticeAttempt(model, choices[i]!, model.clock());
        requestFocusAfterRender(model, ...PRACTICE_SUCCESSORS);
        rerenderApp(model);
      });
      choiceGroup.appendChild(choiceBtn);
    }
    section.appendChild(choiceGroup);
  } else if (model.practice.mode === 'audio-recall') {
    const audioGroup = document.createElement('div');
    audioGroup.className = 'practice-audio-recall';
    const snippet = synchronizePracticeSnippet(model);
    const pathLabel = document.createElement('label');
    pathLabel.htmlFor = 'practice-audio-media-path';
    pathLabel.textContent = 'Owned local media path';
    const pathInput = document.createElement('input');
    pathInput.id = 'practice-audio-media-path';
    pathInput.name = 'practice-audio-media-path';
    pathInput.type = 'text';
    pathInput.value = snippet.mediaPath;
    pathInput.placeholder = 'Absolute path (kept only in this session)';
    pathInput.addEventListener('input', () => {
      const hadAudio = snippet.objectUrl !== null || snippet.status === 'preparing';
      snippet.mediaPath = pathInput.value;
      invalidatePracticeSnippet(model, pathInput.value.trim() ? 'Media path changed; prepare fresh source audio.' : 'Provide an explicit absolute owned local media path.');
      if (hadAudio) rerenderApp(model);
    });
    pathLabel.appendChild(pathInput);
    audioGroup.appendChild(pathLabel);
    const prepareButton = document.createElement('button');
    prepareButton.type = 'button';
    prepareButton.className = 'btn-primary';
    prepareButton.textContent = 'Prepare source audio';
    prepareButton.disabled = model.localService.status !== 'connected' || !currentCue || !hasNativeInputPath(model, snippet.mediaPath);
    pathInput.addEventListener('input', () => {
      prepareButton.disabled = model.localService.status !== 'connected' || !currentCue || !hasNativeInputPath(model, pathInput.value);
    });
    prepareButton.addEventListener('click', () => {
      const operationPath = snippet.mediaPath;
      if (!currentCue || !hasNativeInputPath(model, operationPath)) { snippet.status = 'path-required'; snippet.message = 'An explicit absolute owned local media path is required.'; rerenderApp(model); return; }
      const transport = captureUiServiceOwner(model); if (!transport) return;
      const stillOwned = () => { try { transport.assertCurrent(); return true; } catch { return false; } };
      transport.onInvalidate(() => invalidatePracticeSnippet(model, 'Local service pairing changed; transient browser audio cleaned.'));
      releaseSourceAudioSnippet(snippet);
      const generation = ++snippet.generation;
      const contextKey = practiceSnippetContextKey(model, snippet);
      snippet.contextKey = contextKey;
      const current = () => stillOwned() && snippet.generation === generation && practiceSnippetContextKey(model, snippet) === contextKey;
      const operationLifecycle: SourceAudioSnippetLifecycle = { objectUrl: null };
      snippet.status = 'preparing'; snippet.message = 'Preparing cue-bounded source audio…'; rerenderApp(model);
      void prepareSourceAudioSnippet({ transport, pathPolicy: model.localService.pathPolicy, mediaPath: operationPath, startMs: currentCue.startMs, endMs: currentCue.endMs, lifecycle: operationLifecycle }).then(() => {
        if (!current()) { releaseSourceAudioSnippet(operationLifecycle); return; }
        snippet.objectUrl = operationLifecycle.objectUrl;
        operationLifecycle.objectUrl = null;
        snippet.status = 'ready'; snippet.message = 'Source audio ready; service scratch copy was deleted.';
        rerenderApp(model);
      }).catch((error: unknown) => {
        releaseSourceAudioSnippet(operationLifecycle);
        if (!current()) return;
        snippet.status = 'failed'; snippet.message = redactSourceAudioSnippetError(error);
        rerenderApp(model);
      });
    });
    audioGroup.appendChild(prepareButton);
    if (snippet.objectUrl) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.autoplay = false;
      audio.src = snippet.objectUrl;
      audio.addEventListener('play', () => { snippet.status = 'playing'; });
      audioGroup.appendChild(audio);
      const cleanButton = document.createElement('button');
      cleanButton.type = 'button'; cleanButton.textContent = 'Clean browser audio';
      cleanButton.addEventListener('click', () => { releaseSourceAudioSnippet(snippet); snippet.status = 'cleaned'; snippet.message = 'Transient browser audio cleaned.'; rerenderApp(model); });
      audioGroup.appendChild(cleanButton);
    }
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = model.localService.status !== 'connected' ? 'Local storage service unavailable or disconnected.' : !readNativePathPolicy(model.localService.pathPolicy) ? NATIVE_PATH_COMPATIBILITY_MESSAGE : snippet.message;
    audioGroup.appendChild(status);
    const privacy = document.createElement('p');
    privacy.className = 'meta';
    privacy.textContent = 'Source snippets use transient local scratch, bounded session cleanup, and are not exported.';
    audioGroup.appendChild(privacy);
    const answerLabel = document.createElement('label'); answerLabel.htmlFor = 'practice-answer'; answerLabel.textContent = 'Your answer';
    const answerInput = document.createElement('input');
    answerInput.id = 'practice-answer'; answerInput.name = 'practice-answer'; answerInput.type = 'text'; answerInput.value = model.practice.pendingAnswer;
    answerInput.addEventListener('input', () => setPracticePendingAnswer(model, answerInput.value));
    answerLabel.appendChild(answerInput); audioGroup.appendChild(answerLabel);
    section.appendChild(audioGroup);
  } else if (model.practice.mode === 'sentence-builder') {
    const expectedText = contract.expected;
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
  replayBtn.textContent = 'Replay source line';
  replayBtn.setAttribute('aria-label', 'Jump back to the source line in the player');
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
  skipBtn.setAttribute('aria-label', 'Skip this practice attempt (no schedule change)');
  skipBtn.disabled = !contract;
  skipBtn.addEventListener('click', () => {
    submitPracticeAttempt(model, '', model.clock());
    requestFocusAfterRender(model, ...PRACTICE_SUCCESSORS);
    rerenderApp(model);
  });
  controls.appendChild(skipBtn);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Submit attempt';
  submitBtn.setAttribute('aria-label', 'Submit practice attempt');
  submitBtn.disabled = !contract;
  section.appendChild(controls);

  if (model.practice.mode === 'sentence-builder') {
    submitBtn.addEventListener('click', () => {
      submitSentenceBuilderAttempt(model, model.practice.sentenceBuilder.orderedTokens, model.clock());
      requestFocusAfterRender(model, ...PRACTICE_SUCCESSORS);
      rerenderApp(model);
    });
  } else {
    submitBtn.addEventListener('click', () => {
      submitPracticeAttempt(model, model.practice.pendingAnswer, model.clock());
      requestFocusAfterRender(model, ...PRACTICE_SUCCESSORS);
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
    // lt-0g9: the source cue (and native line, which may translate it) is hidden before submission in
    // every mode because it contains or determines the expected answer; revealing grades a later submit as fail.
    const hideAnswer = !model.practice.revealed;
    if (hideAnswer) {
      const revealButton = document.createElement('button');
      revealButton.type = 'button'; revealButton.className = 'btn-secondary'; revealButton.textContent = 'Reveal answer';
      revealButton.setAttribute('aria-label', 'Reveal answer (a later submission counts as fail)');
      revealButton.addEventListener('click', () => { revealPracticeAnswer(model); requestFocusAfterRender(model, 'practice-revealed-answer'); rerenderApp(model); });
      context.appendChild(revealButton);
    } else {
      const targetContext = document.createElement('p');
      targetContext.className = 'review-target-context';
      targetContext.id = 'practice-revealed-answer';
      targetContext.tabIndex = -1;
      targetContext.setAttribute('aria-label', `Revealed answer: ${currentCue.text}`);
      targetContext.textContent = currentCue.text;
      context.appendChild(targetContext);
      if (nativeText) {
        const nativeContext = document.createElement('p');
        nativeContext.className = 'review-native-context';
        nativeContext.textContent = nativeText;
        context.appendChild(nativeContext);
      }
    }
    const sourceNote = document.createElement('p');
    sourceNote.className = 'meta';
    appendSourceDisclosure(sourceNote, `Video: ${mediaDisplayName(model, occurrence.sourceContext.mediaId, occurrence.sourceContext.mediaPath)}`, occurrence.sourceContext.mediaPath);
    context.appendChild(sourceNote);
  } else {
    context.appendChild(renderUnresolvedSource(occurrence.sourceContext.mediaPath));
  }
  section.appendChild(context);

  const stats = document.createElement('p');
  stats.className = 'meta';
  const attemptCount = model.store.listPracticeAttemptsForCard(card.id).length;
  stats.textContent = `${attemptCount} attempt${attemptCount === 1 ? '' : 's'} recorded • state: ${state.state} • due: ${formatDueAt(state.dueAt)}`;
  section.appendChild(stats);

  return section;
}
