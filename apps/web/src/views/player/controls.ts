import { readNativePathPolicy, NATIVE_PATH_COMPATIBILITY_MESSAGE } from '../../../../../packages/domain/src/nativePaths.ts';
import type { AppModel } from '../../uiTypes';
import type { Cue } from '@lingotorte/domain';
import { formatTimeMs } from '../../uiTypes';
import {
  prepareSourceAudioSnippet,
  redactSourceAudioSnippetError,
  releaseSourceAudioSnippet,
  type SourceAudioSnippetLifecycle,
} from '../../sourceAudioSnippet.ts';
import {
  activeCueAtTime,
  activeLoopRangeForSelection,
  clearLoopRange,
  cueWordTokens,
  clearVisualSourceRange,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  nextCue,
  PLAYBACK_RATE_STEP,
  previousCue,
  seekToCue,
  seekToTime,
  setLoopRange,
  setPlaybackRate,
  setVisualSourceRange,
  toggleLoopCue,
  toggleLoopRange,
  togglePlay,
} from '../../model';
import { rerenderApp } from '../../appShell.ts';
import { appendSourceDisclosure, captureUiServiceOwner, currentKeyboardCue, mediaLabel } from '../../ui/common.ts';
import { hasExtractableCurrentMedia, hasNativeInputPath, invalidateSourceRangeSnippet, sourceRangeContextKey, synchronizeSourceRangeSnippet } from '../../ui/snippets.ts';

export function renderPlayerControls(model: AppModel): HTMLElement {
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

export function renderSourceRangePanel(model: AppModel): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'card source-range-panel';
  panel.dataset.testid = 'source-range-panel';
  panel.setAttribute('aria-label', 'Visual source range');

  const heading = document.createElement('h3');
  heading.textContent = 'Source range';
  panel.appendChild(heading);

  const durationMs = Math.max(0, Math.round(model.player.durationMs));
  const range = model.player.sourceRange;
  const snippet = synchronizeSourceRangeSnippet(model);
  const displayed = range ?? { startMs: 0, endMs: durationMs };
  const handles = document.createElement('div');
  handles.className = 'source-range-handles';
  const makeHandle = (kind: 'start' | 'end'): HTMLLabelElement => {
    const label = document.createElement('label');
    label.textContent = kind === 'start' ? 'Start handle' : 'End handle';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(durationMs);
    input.step = '10';
    input.value = String(kind === 'start' ? displayed.startMs : displayed.endMs);
    input.disabled = durationMs <= 0;
    input.setAttribute('aria-label', kind === 'start' ? 'Source range start' : 'Source range end');
    input.addEventListener('input', () => {
      const nextStart = kind === 'start' ? Number(input.value) : displayed.startMs;
      const nextEnd = kind === 'end' ? Number(input.value) : displayed.endMs;
      setVisualSourceRange(model, nextStart, nextEnd);
      rerenderApp(model);
    });
    label.appendChild(input);
    return label;
  };
  handles.append(makeHandle('start'), makeHandle('end'));
  panel.appendChild(handles);

  const visual = document.createElement('div');
  visual.className = 'source-range-visual';
  visual.setAttribute('aria-hidden', 'true');
  const visualSelection = document.createElement('span');
  visualSelection.className = 'source-range-visual-selection';
  const visualStartPercent = durationMs > 0 ? (displayed.startMs / durationMs) * 100 : 0;
  const visualEndPercent = durationMs > 0 ? (displayed.endMs / durationMs) * 100 : 0;
  visualSelection.style.left = `${visualStartPercent}%`;
  visualSelection.style.width = `${Math.max(0, visualEndPercent - visualStartPercent)}%`;
  visual.appendChild(visualSelection);
  panel.appendChild(visual);

  const summary = document.createElement('p');
  summary.className = 'source-range-summary';
  summary.textContent = range
    ? `Start ${formatTimeMs(range.startMs)} • End ${formatTimeMs(range.endMs)} • Duration ${formatTimeMs(range.endMs - range.startMs)}`
    : durationMs > 0
      ? 'Move either handle to select a source range.'
      : 'Media duration/range unavailable.';
  panel.appendChild(summary);

  const actions = document.createElement('div');
  actions.className = 'source-range-actions';
  const loopSelected = document.createElement('button');
  loopSelected.type = 'button';
  loopSelected.textContent = 'Loop selected range';
  loopSelected.disabled = range === null;
  loopSelected.addEventListener('click', () => {
    if (!model.player.sourceRange) return;
    setLoopRange(model, model.player.sourceRange.startMs, model.player.sourceRange.endMs);
    rerenderApp(model);
  });
  const clearLoop = document.createElement('button');
  clearLoop.type = 'button';
  clearLoop.textContent = 'Clear loop';
  clearLoop.disabled = model.player.loopRange === null;
  clearLoop.addEventListener('click', () => {
    clearLoopRange(model);
    rerenderApp(model);
  });
  const clearRange = document.createElement('button');
  clearRange.type = 'button';
  clearRange.textContent = 'Clear selected range';
  clearRange.disabled = range === null;
  clearRange.addEventListener('click', () => {
    clearVisualSourceRange(model);
    invalidateSourceRangeSnippet(model, 'Selected range cleared; transient browser audio cleaned.');
    rerenderApp(model);
  });
  const useTranscriptSelection = document.createElement('button');
  useTranscriptSelection.type = 'button';
  useTranscriptSelection.textContent = 'Use transcript selection';
  useTranscriptSelection.disabled = model.selection === null;
  useTranscriptSelection.addEventListener('click', () => {
    const selected = model.selection;
    const cue = selected ? model.cues.find((candidate) => candidate.id === selected.cueId) : undefined;
    const selectedRange = selected && cue
      ? activeLoopRangeForSelection(model, cue, selected.charStart, selected.charEnd)
      : null;
    if (!selectedRange || !setVisualSourceRange(model, selectedRange.startMs, selectedRange.endMs)) {
      snippet.status = 'failed';
      snippet.message = 'The transcript selection has no usable word timings. Manual timeline selection remains available.';
    }
    rerenderApp(model);
  });
  actions.append(loopSelected, clearLoop, clearRange, useTranscriptSelection);
  panel.appendChild(actions);

  const active = document.createElement('p');
  active.className = 'meta source-range-active-loop';
  active.textContent = model.player.loopRange
    ? `Active loop ${formatTimeMs(model.player.loopRange.startMs)}–${formatTimeMs(model.player.loopRange.endMs)}`
    : 'Active loop: none';
  panel.appendChild(active);

  const pathLabel = document.createElement('label');
  pathLabel.htmlFor = 'source-range-media-path';
  pathLabel.textContent = 'Owned local media path';
  const pathInput = document.createElement('input');
  pathInput.id = 'source-range-media-path';
  pathInput.name = 'source-range-media-path';
  pathInput.type = 'text';
  pathInput.value = snippet.mediaPath;
  pathInput.placeholder = 'Absolute path (session only)';
  pathInput.addEventListener('input', () => {
    snippet.mediaPath = pathInput.value;
    invalidateSourceRangeSnippet(model, hasNativeInputPath(model, pathInput.value)
      ? 'Media path changed; prepare fresh source audio.'
      : 'An explicit absolute owned local media path is required.');
    rerenderApp(model);
  });
  pathLabel.appendChild(pathInput);
  panel.appendChild(pathLabel);

  const selectedDurationMs = range ? range.endMs - range.startMs : 0;
  const rangeTooLong = selectedDurationMs > 30_000;
  const pathValid = hasNativeInputPath(model, snippet.mediaPath);
  const mediaExtractable = hasExtractableCurrentMedia(model);
  const prepare = document.createElement('button');
  prepare.type = 'button';
  prepare.className = 'btn-primary';
  prepare.textContent = 'Prepare source audio';
  prepare.disabled = range === null || rangeTooLong || !pathValid || !mediaExtractable || model.localService.status !== 'connected' || snippet.status === 'preparing';
  prepare.addEventListener('click', () => {
    const operationRange = model.player.sourceRange;
    const operationPath = snippet.mediaPath;
    if (!operationRange || operationRange.endMs - operationRange.startMs > 30_000 || !hasNativeInputPath(model, operationPath) || !hasExtractableCurrentMedia(model) || model.localService.status !== 'connected') return;
    const transport = captureUiServiceOwner(model); if (!transport) return;
    const stillOwned = () => { try { transport.assertCurrent(); return true; } catch { return false; } };
    transport.onInvalidate(() => releaseSourceAudioSnippet(snippet));
    releaseSourceAudioSnippet(snippet);
    const generation = ++snippet.generation;
    const contextKey = sourceRangeContextKey(model, snippet);
    snippet.contextKey = contextKey;
    snippet.status = 'preparing';
    snippet.message = 'Preparing range-bounded transient source audio…';
    const operationLifecycle: SourceAudioSnippetLifecycle = { objectUrl: null };
    rerenderApp(model);
    void prepareSourceAudioSnippet({
      transport, pathPolicy: model.localService.pathPolicy,
      mediaPath: operationPath,
      startMs: operationRange.startMs,
      endMs: operationRange.endMs,
      lifecycle: operationLifecycle,
    }).then(() => {
      if (!stillOwned() || snippet.generation !== generation || sourceRangeContextKey(model, snippet) !== contextKey) {
        releaseSourceAudioSnippet(operationLifecycle);
        return;
      }
      snippet.objectUrl = operationLifecycle.objectUrl;
      operationLifecycle.objectUrl = null;
      snippet.status = 'ready';
      snippet.message = 'Source audio ready; service scratch copy was deleted after browser retrieval.';
      rerenderApp(model);
    }).catch((error: unknown) => {
      releaseSourceAudioSnippet(operationLifecycle);
      if (!stillOwned() || snippet.generation !== generation || sourceRangeContextKey(model, snippet) !== contextKey) return;
      snippet.status = 'failed';
      snippet.message = redactSourceAudioSnippetError(error);
      rerenderApp(model);
    });
  });
  panel.appendChild(prepare);

  if (snippet.objectUrl) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.autoplay = false;
    audio.src = snippet.objectUrl;
    panel.appendChild(audio);
    const clean = document.createElement('button');
    clean.type = 'button';
    clean.textContent = 'Clean browser audio';
    clean.addEventListener('click', () => {
      invalidateSourceRangeSnippet(model, 'Transient browser audio cleaned.');
      rerenderApp(model);
    });
    panel.appendChild(clean);
  }

  const status = document.createElement('p');
  status.className = 'source-range-status';
  status.setAttribute('role', 'status');
  if (snippet.status === 'failed') status.textContent = snippet.message;
  else if (durationMs <= 0) status.textContent = 'Media duration/range unavailable.';
  else if (model.localService.status !== 'connected') status.textContent = 'Local service unavailable or disconnected.';
  else if (!readNativePathPolicy(model.localService.pathPolicy)) status.textContent = NATIVE_PATH_COMPATIBILITY_MESSAGE;
  else if (!mediaExtractable) status.textContent = 'Source audio requires a current owned or synthetic media asset.';
  else if (!pathValid) status.textContent = 'An explicit absolute owned local media path is required.';
  else if (rangeTooLong) status.textContent = `Source audio has a 30-second maximum; current duration is ${formatTimeMs(selectedDurationMs)}. This range can still be looped.`;
  else status.textContent = snippet.message;
  panel.appendChild(status);

  const privacy = document.createElement('p');
  privacy.className = 'meta';
  privacy.textContent = 'Browser handles and object URLs are playback-only. The configured service needs an absolute path to the same owned local media. Snippets are transient, never autoplay, and are not saved, exported, or backed up.';
  panel.appendChild(privacy);
  return panel;
}

function seekRenderedVideoToMs(timeMs: number): void {
  const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
  if (video) {
    video.currentTime = timeMs / 1000;
  }
}

export function renderCueSourceContext(model: AppModel, cue: Cue): HTMLElement {
  const context = document.createElement('div');
  context.className = 'cue-context';
  const mediaPath = model.currentMedia?.originalPath ?? 'no media';
  const compact = `${formatTimeMs(cue.startMs)}–${formatTimeMs(cue.endMs)} • ${mediaLabel(model, mediaPath)}`;
  const full = `${formatTimeMs(cue.startMs)}–${formatTimeMs(cue.endMs)} • ${mediaPath}`;
  appendSourceDisclosure(context, compact, full);
  return context;
}

export function renderCueTargetText(model: AppModel, cue: Cue): HTMLElement {
  // lt-z8s: every word/number token is a focusable <span role="button"> (class cue-word; a real <button> blocks native drag text-selection in Chrome) whether or not the cue has word timings;
  // punctuation and whitespace stay plain text nodes so the element's textContent equals cue.text.
  // Clicks/keys are handled by one delegated listener on the transcript panel (views/player/transcript.ts).
  const target = document.createElement('div');
  target.className = 'cue-target';
  const wordTimings = model.store
    .listTranscriptWordTimingsForCue(cue.id)
    .filter((word) => word.charStart >= 0 && word.charEnd > word.charStart && word.charStart < cue.text.length)
    .sort((a, b) => a.charStart - b.charStart || a.wordIndex - b.wordIndex);
  const selection = model.selection && model.selection.cueId === cue.id && model.selection.kind !== 'sentence' ? model.selection : null;
  const isActiveCue = cue.id === model.player.activeCueId;
  let cursor = 0;
  for (const token of cueWordTokens(cue.text)) {
    if (token.tokenKind !== 'word' && token.tokenKind !== 'number') continue;
    if (token.charStart > cursor) target.appendChild(document.createTextNode(cue.text.slice(cursor, token.charStart)));
    const button = document.createElement('span');
    button.setAttribute('role', 'button');
    button.className = 'cue-word';
    button.id = `cue-word-${cue.id}-${token.tokenIndex}`;
    button.tabIndex = -1;
    button.dataset.wordCueId = cue.id;
    button.dataset.tokenIndex = String(token.tokenIndex);
    button.dataset.charStart = String(token.charStart);
    button.dataset.charEnd = String(token.charEnd);
    button.textContent = token.surface;
    const pressed = !!selection && token.tokenIndex >= selection.tokenStart && token.tokenIndex < selection.tokenEnd;
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    const word = wordTimings.find((w) => w.charStart < token.charEnd && w.charEnd > token.charStart);
    if (word) {
      button.classList.add('timed-word');
      button.dataset.wordTimingId = word.id;
      button.dataset.startMs = String(word.startMs);
      button.dataset.endMs = String(word.endMs);
      button.title = `Alt+click to replay ${formatTimeMs(word.startMs)}–${formatTimeMs(word.endMs)}`;
      if (isActiveCue && word.startMs <= model.player.currentTimeMs && model.player.currentTimeMs < word.endMs) {
        button.classList.add('current-word');
      }
    }
    target.appendChild(button);
    cursor = token.charEnd;
  }
  if (cursor < cue.text.length) target.appendChild(document.createTextNode(cue.text.slice(cursor)));
  // Roving tabindex: one word per cue is reachable with Tab; arrows move within the cue.
  const first = (target.querySelector('.cue-word[aria-pressed="true"]') ?? target.querySelector('.cue-word')) as HTMLElement | null;
  if (first) first.tabIndex = 0;
  return target;
}

/** lt-z8s: toggle the current-word highlight in place during playback (no rerender). */
export function syncTranscriptCurrentWord(cueId: string | null, timeMs: number): void {
  for (const button of Array.from(document.querySelectorAll<HTMLElement>('.transcript-panel .cue-word.timed-word'))) {
    const start = Number(button.dataset.startMs);
    const end = Number(button.dataset.endMs);
    button.classList.toggle('current-word', button.dataset.wordCueId === cueId && start <= timeMs && timeMs < end);
  }
}

export function seekToTimedWord(model: AppModel, cue: Cue, startMs: number): void {
  seekToTime(model, startMs);
  model.player.activeCueId = cue.id;
  seekRenderedVideoToMs(startMs);
  rerenderApp(model);
}

export function toggleLoopForWord(model: AppModel, cue: Cue, charStart: number, charEnd: number): void {
  const range = activeLoopRangeForSelection(model, cue, charStart, charEnd);
  if (range) toggleLoopRange(model, range.startMs, range.endMs);
  else toggleLoopRange(model, cue.startMs, cue.endMs);
  rerenderApp(model);
}
