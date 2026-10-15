import type { AppModel } from '../../uiTypes';
import type { Cue } from '@lingotorte/domain';
import {
  activeCueAtTime,
  activeLoopRangeForSelection,
  applyLoopTolerance,
  importFixtureMediaAndSubtitles,
  importBrowserLocalFileHandles,
  nativeTextForCue,
  setView,
  toggleLoopRange,
  mediaPlaybackUrl,
  needsMediaRelink,
  handleNameFromMedia,
  restoreBrowserMediaHandle,
  persistIfLocalServiceAutosaveEnabled,
} from '../../model';
import { rerenderApp, scrollCueIntoView } from '../../appShell.ts';
import { mutedByModel, syncPlayButton, syncPlayerTransport, syncTranscriptCurrentWord } from './controls.ts';
import { type BrowserFilePickerGlobal, renderSourceContextRow, renderStudyStatusFooter, renderStudyStatusRail } from '../../ui/common.ts';
import { clearPendingMediaNameConflict, handleMediaImportError, renderMediaNameConflict } from '../../ui/mediaConflict.ts';
import { openCapture } from '../../ui/capture.ts';
import { dropKeyed, keyed, peekKeyed, peekKeyedKey } from '../../ui/keyed.ts';
import { renderPlayerControls, renderSourceRangePanel } from './controls.ts';
import { renderSelectionPanel, renderTranscriptPanel } from './transcript.ts';

export function renderPlayerView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'study-cockpit';
  section.setAttribute('aria-label', 'Study player');

  const header = document.createElement('div');
  header.className = 'study-cockpit-header card';
  const headingGroup = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = 'Player';
  const intro = document.createElement('p');
  intro.textContent = 'Watch a local video with its transcript beside it. Every word you save remembers the video and time it came from.';
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
  // lt-dlf.5: while a capture is open the form renders at the top of the transcript aside (sticky,
  // next to the clicked line) so the video and the line stay on screen; otherwise it stays here.
  const captureOpen = Boolean(model.selection);
  if (!captureOpen) left.appendChild(renderSelectionPanel(model));
  left.appendChild(renderSourceToolsDisclosure(model));
  grid.appendChild(left);

  const right = document.createElement('aside');
  right.className = `card transcript-copilot${captureOpen ? ' capture-open' : ''}`;
  const transcriptHeading = document.createElement('h2');
  transcriptHeading.textContent = 'Transcript';
  right.appendChild(transcriptHeading);
  if (captureOpen) right.appendChild(renderSelectionPanel(model));
  right.appendChild(renderTranscriptPanel(model));
  grid.appendChild(right);

  section.appendChild(grid);
  section.appendChild(renderStudyStatusFooter(model));
  return section;
}

/** lt-dlf.6: genuine user toggles of the clip/audio tools disclosure, remembered per session. */
const sourceToolsOpenByUser = new WeakMap<AppModel, boolean>();

/**
 * lt-dlf.6: source range + source-audio tools live in a closed-by-default disclosure at the end of the
 * left column. Active state (a loop range or an edited source range) forces it open so it is never hidden.
 * The 'toggle' event also fires when `open` is set at render (lt-1ur), so only a change away from the
 * rendered state is recorded as a user choice.
 */
function renderSourceToolsDisclosure(model: AppModel): HTMLElement {
  const details = document.createElement('details');
  details.className = 'source-tools-disclosure';
  details.dataset.testid = 'source-tools-disclosure';
  const summary = document.createElement('summary');
  summary.textContent = 'Clip and audio tools (loop a range, prepare audio for practice)';
  details.appendChild(summary);
  details.appendChild(renderSourceRangePanel(model));
  // An active range always opens the panel (never hide active state); closing it while a range is active
  // lasts until the next render. The remembered user choice applies again once the range is cleared.
  const active = model.player.loopRange !== null || model.player.sourceRange !== null;
  const renderedOpen = active || (sourceToolsOpenByUser.get(model) ?? false);
  details.open = renderedOpen;
  details.addEventListener('toggle', () => {
    if (details.open === renderedOpen) return;
    sourceToolsOpenByUser.set(model, details.open);
  });
  return details;
}

const VIDEO_STAGE_SLOT = 'player-video-stage';

/**
 * lt-2zm: the stage (and its <video>) is mounted once per media identity (currentMedia.id + playback
 * URL) through keyed(); rerenders re-append the same element and refresh only rate/label/overlay/alert.
 * src is assigned once per media selection. Leaving the Player view pauses the persistent video
 * (pausePersistentVideoOffPlayer); returning reattaches the same element at its position without reload.
 */
function renderVideoStage(model: AppModel): HTMLElement {
  if (!model.currentMedia || needsMediaRelink(model)) {
    dropKeyed(model, VIDEO_STAGE_SLOT);
    const stage = document.createElement('div');
    stage.className = `video-stage${model.currentMedia ? '' : ' video-stage-empty'}`;
    stage.appendChild(model.currentMedia ? renderRelinkPlaceholder(model) : renderEmptyVideoPlaceholder(model));
    return stage;
  }
  const key = videoStageKey(model)!;
  return keyed(model, VIDEO_STAGE_SLOT, key, () => createVideoStage(model), (stage) => updateVideoStage(stage, model), releaseVideoStage);
}

function videoStageKey(model: AppModel): string | null {
  if (!model.currentMedia || needsMediaRelink(model)) return null;
  return `${model.currentMedia.id}\u0000${mediaPlaybackUrl(model)}`;
}

function stageVideo(stage: HTMLElement): HTMLVideoElement | null {
  return stage.querySelector('video');
}

// Object URLs are owned and revoked by model.ts (relink revokes the replaced URL); release only frees the element.
function releaseVideoStage(stage: HTMLElement): void {
  const video = stageVideo(stage);
  if (!video) return;
  try { video.pause(); } catch { /* jsdom */ }
  video.removeAttribute('src');
  try { video.load(); } catch { /* jsdom: load() not implemented */ }
}

/**
 * lt-2zm: called by renderApp for non-player views; the cached video would otherwise keep playing off-screen.
 * The element stays loaded (src kept) so returning to the Player resumes at the same position without a reload.
 */
export function pausePersistentVideoOffPlayer(model: AppModel): void {
  if (model.view === 'player') return;
  const stage = peekKeyed<HTMLElement>(model, VIDEO_STAGE_SLOT);
  const video = stage ? stageVideo(stage) : null;
  if (video && !video.paused) {
    try { video.pause(); } catch { /* jsdom */ }
  }
  // Off the Player nothing plays; clear a stale 'playing' too, so returning never auto-resumes.
  if (video && model.player.isPlaying) model.player.isPlaying = false;
}

/** lt-2zm: post-attach safety net; a browser that paused the element during the move gets it back. */
export function resumePersistentVideoAfterRender(model: AppModel): void {
  if (model.view !== 'player' || !model.player.isPlaying) return;
  const stage = peekKeyed<HTMLElement>(model, VIDEO_STAGE_SLOT);
  const video = stage ? stageVideo(stage) : null;
  if (!video || !video.isConnected || !video.paused) return;
  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      if (!video.isConnected || !video.paused) return;
      model.player.isPlaying = false;
      syncPlayButton(false);
    });
  }
}

/**
 * lt-dlf.2: the persistent stage element (if any) when it, or a node inside it, is the fullscreen element.
 * rerenderApp defers its root swap while this is non-null, because moving the stage out of the document
 * makes the browser exit fullscreen.
 */
export function fullscreenPersistentStage(model: AppModel): HTMLElement | null {
  const fs = typeof document !== 'undefined' ? document.fullscreenElement : null;
  const stage = peekKeyed<HTMLElement>(model, VIDEO_STAGE_SLOT);
  if (!fs || !stage || !stage.isConnected) return null;
  return stage === fs || stage.contains(fs) ? stage : null;
}

/** lt-dlf.2: refresh the persistent stage in place (rate, label, alert, overlay) without moving it. */
// If the media changed under the fullscreen stage (e.g. an import finished), the old stage must not be
// fed the new media's data (that would also clear the new media's error); exit fullscreen instead and let
// the deferred rerender rebuild the stage.
export function updatePersistentStageInPlace(model: AppModel): void {
  const stage = peekKeyed<HTMLElement>(model, VIDEO_STAGE_SLOT);
  if (!stage) return;
  if (peekKeyedKey(model, VIDEO_STAGE_SLOT) !== videoStageKey(model)) {
    if (typeof document.exitFullscreen === 'function') {
      try {
        const result = document.exitFullscreen();
        if (result && typeof result.catch === 'function') result.catch(() => undefined);
      } catch { /* not fullscreen / unsupported */ }
    }
    return;
  }
  updateVideoStage(stage, model);
}

function updateVideoStage(stage: HTMLElement, model: AppModel): void {
  const video = stageVideo(stage);
  if (!video || !model.currentMedia) return;
  if (video.playbackRate !== model.player.playbackRate) video.playbackRate = model.player.playbackRate;
  if (video.getAttribute('aria-label') !== model.currentMedia.title) video.setAttribute('aria-label', model.currentMedia.title);
  renderMediaErrorAlert(stage, model, model.currentMedia.id, mediaPlaybackUrl(model));
  updateOverlay(stage, model, activeCueAtTime(model.cues, model.player.currentTimeMs));
}

function renderMediaErrorAlert(stage: HTMLElement, model: AppModel, mediaId: string, mediaSource: string): void {
  stage.querySelector('.media-error-alert')?.remove();
  const mediaError = model.player.mediaError;
  if (mediaError && (mediaError.mediaId !== mediaId || mediaError.source !== mediaSource)) {
    model.player.mediaError = null;
  } else if (mediaError) {
    const alert = document.createElement('p');
    alert.className = 'status-banner error media-error-alert';
    // Assertive role=alert only on the first render after the error; later re-renders use role=status so
    // unrelated rerenders don't re-announce it.
    alert.setAttribute('role', mediaError.announced ? 'status' : 'alert');
    mediaError.announced = true;
    alert.textContent = mediaError.message;
    const overlay = (stage as any).__overlay as HTMLElement | undefined;
    if (overlay && overlay.parentNode === stage) stage.insertBefore(alert, overlay);
    else stage.appendChild(alert);
  }
}

function createVideoStage(model: AppModel): HTMLElement {
  const currentMedia = model.currentMedia!;
  const stage = document.createElement('div');
  stage.className = 'video-stage';
  const video = document.createElement('video');
  // lt-xlr: no native `controls` (its bar sat under the subtitle overlay); the custom row in
  // renderPlayerControls owns play/seek/mute/fullscreen. The aria-label stays the accessible name.
  video.setAttribute('preload', 'metadata');
  // lt-xlr: a stage rebuild (media change) must not silently unmute; carry the last element's mute state over.
  if (mutedByModel.get(model)) video.muted = true;
  video.setAttribute('aria-label', currentMedia.title);
  // lt-2zm: the only src assignment for this media selection.
  video.src = mediaPlaybackUrl(model);
  video.playbackRate = model.player.playbackRate;
  const mediaId = currentMedia.id;
  const mediaSource = mediaPlaybackUrl(model);
  // Ignore events from a replaced element or a previous media item/source (lt-r4k.1).
  const isCurrentVideo = () => video.isConnected
    && model.currentMedia?.id === mediaId
    && mediaPlaybackUrl(model) === mediaSource
    && document.querySelector('.video-stage video') === video;
  video.addEventListener('timeupdate', () => {
    if (!isCurrentVideo()) return; // lt-dlf.1
    const timeMs = Math.round(video.currentTime * 1000);
    model.player.currentTimeMs = timeMs;
    const cue = activeCueAtTime(model.cues, timeMs);
    if (cue && cue.id !== model.player.activeCueId) {
      model.player.activeCueId = cue.id;
      scrollCueIntoView(cue.id);
    }
    updateOverlay(stage, model, cue);
    syncTranscriptCurrentWord(model.player.activeCueId, timeMs);
    syncPlayerTransport(video);
    const loopJump = applyLoopTolerance(timeMs, cue, model.player.loopCue, model.player.loopRange);
    if (loopJump !== null) {
      video.currentTime = loopJump / 1000;
    }
  });
  video.addEventListener('error', () => {
    if (!isCurrentVideo()) return;
    const code = video.error?.code ?? 0;
    // lt-r4k.4: a re-rendered <video> with the same src fails again in real browsers. An error already
    // recorded for this media/source/code is a repeat: no state replacement, no rerender, no re-announce.
    const existing = model.player.mediaError;
    if (existing && existing.mediaId === mediaId && existing.source === mediaSource && existing.code === code) return;
    model.player.mediaError = { mediaId, source: mediaSource, code, message: mediaErrorMessage(code) };
    model.player.isPlaying = false;
    rerenderApp(model);
  });
  video.addEventListener('loadedmetadata', () => {
    if (isCurrentVideo() && model.player.mediaError) {
      model.player.mediaError = null;
      stage.querySelector('.media-error-alert')?.remove();
    }
    model.player.durationMs = Math.round(video.duration * 1000) || model.player.durationMs;
    // lt-dlf.3: correct a stored duration guess once the element knows the real one (only on >250 ms drift).
    if (isCurrentVideo() && Number.isFinite(video.duration) && video.duration > 0) {
      const actualMs = Math.round(video.duration * 1000);
      const stored = model.store.getMediaAsset(mediaId);
      if (stored && Math.abs(stored.durationMs - actualMs) > 250) {
        const corrected = { ...stored, durationMs: actualMs };
        model.store.putMediaAsset(corrected);
        if (model.currentMedia?.id === mediaId) model.currentMedia = corrected;
        persistIfLocalServiceAutosaveEnabled(model);
      }
    }
    // lt-dlf.1: a rebuilt <video> starts at 0; restore the model position (incl. intended seeks).
    const targetS = model.player.currentTimeMs / 1000;
    if (isCurrentVideo() && targetS > 0 && Math.abs(video.currentTime - targetS) > 0.05) {
      const durationS = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : model.player.durationMs > 0 ? model.player.durationMs / 1000 : Infinity;
      video.currentTime = Math.min(targetS, durationS);
    }
    syncPlayerTransport(video);
    video.playbackRate = model.player.playbackRate;
    if (isCurrentVideo() && model.player.isPlaying) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          if (!isCurrentVideo() || !video.paused) return;
          model.player.isPlaying = false;
          syncPlayButton(false);
        });
      }
    }
  });
  video.addEventListener('durationchange', () => syncPlayerTransport(video));
  video.addEventListener('volumechange', () => {
    mutedByModel.set(model, video.muted);
    syncPlayerTransport(video);
  });
  // lt-dlf.1: a detached element (rerender) fires 'pause'; only the live element owns play state.
  video.addEventListener('play', () => {
    if (!isCurrentVideo()) return;
    model.player.isPlaying = true;
    syncPlayButton(true);
  });
  video.addEventListener('pause', () => {
    // lt-2zm: isCurrentVideo() is false while the persistent element is mid-move between roots.
    if (!isCurrentVideo()) return;
    model.player.isPlaying = false;
    syncPlayButton(false);
  });
  stage.appendChild(video);

  const overlay = document.createElement('div');
  overlay.className = 'subtitle-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');
  stage.appendChild(overlay);
  (stage as any).__overlay = overlay;

  renderMediaErrorAlert(stage, model, mediaId, mediaSource);
  // Initial overlay update after render tick.
  updateOverlay(stage, model, activeCueAtTime(model.cues, model.player.currentTimeMs));
  return stage;
}

// MediaError codes: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED. The codec is never guessed.
function mediaErrorMessage(code: number): string {
  const advice = ' The imported record is kept; relink or choose another file.';
  switch (code) {
    case 1: return `This media file could not load: playback was aborted before the browser finished reading it.${advice}`;
    case 2: return `This media file could not load: the browser could not read the file (it may have moved or become unavailable).${advice}`;
    case 3: return `This media file could not be played: the browser could not decode it (the file may be corrupt or use an unsupported codec).${advice}`;
    case 4: return `This media file could not be played: the browser does not support its format or codec.${advice}`;
    default: return `This media file could not be played: the browser reported an unknown media error.${advice}`;
  }
}

export function renderEmptyVideoPlaceholder(model: AppModel): HTMLElement {
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

/** Re-pick media through the persistent file picker (Relink placeholder's 'Choose media again'; also Library Relink). */
export function chooseMediaAgainViaPicker(model: AppModel): void {
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
      return importBrowserLocalFileHandles(model, { mediaHandle })
        .catch((err: unknown) => {
          handleMediaImportError(model, err, () => importBrowserLocalFileHandles(model, { mediaHandle }, { onNameConflict: 'import-new' }));
          throw null;
        });
    })
    .then(() => {
      clearPendingMediaNameConflict();
      rerenderApp(model);
    })
    .catch((err: unknown) => {
      if (err === null) return;
      model.importError = err instanceof Error ? err.message : String(err);
      rerenderApp(model);
    });
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
    ? `"${handleName}" needs to be reconnected before it can play. Reconnect it, or choose the video file again.`
    : 'This video needs to be reconnected before it can play. Reconnect it, or choose the video file again.';

  const permission = document.createElement('p');
  permission.className = 'meta relink-permission-state';
  permission.textContent = `Browser permission: ${model.browserLocalMedia.permissionState}${model.browserLocalMedia.lastError ? ` — ${model.browserLocalMedia.lastError}` : ''}`;

  const boundary = document.createElement('p');
  boundary.className = 'meta relink-boundary-note';
  const boundaryDetails = document.createElement('details');
  boundaryDetails.className = 'relink-boundary-details';
  const boundarySummary = document.createElement('summary');
  boundarySummary.textContent = 'technical details';
  boundaryDetails.append(boundarySummary, boundary);
  boundary.textContent = 'Browser file handles are playback and relink identity only. For local-service ASR, ffmpeg, ffprobe, embedded subtitle extraction, and source-media snippets, provide an explicit absolute owned local media path in Library → Transcript lifecycle.';

  const actions = document.createElement('div');
  actions.className = 'empty-video-actions';
  const relinkBtn = document.createElement('button');
  relinkBtn.className = 'btn-primary';
  relinkBtn.type = 'button';
  // lt-aot: at boot a 'prompt' permission needs one user gesture to reconnect.
  relinkBtn.textContent = model.browserLocalMedia.permissionState === 'prompt' && handleName ? `Reconnect ${handleName}` : 'Relink media';
  // lt-unl: the accessible name is the visible text (WCAG 2.5.3); the purpose goes in the description.
  relinkBtn.title = relinkBtn.textContent.startsWith('Reconnect')
    ? `Reconnect ${handleName}: allow this app to read the file again`
    : 'Relink media: choose the file for this video again';
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
  chooseAgainBtn.addEventListener('click', () => chooseMediaAgainViaPicker(model));
  const libraryBtn = document.createElement('button');
  libraryBtn.className = 'btn-secondary';
  libraryBtn.type = 'button';
  libraryBtn.textContent = 'Go to Library';
  libraryBtn.addEventListener('click', () => {
    setView(model, 'library');
    rerenderApp(model);
  });
  actions.append(relinkBtn, chooseAgainBtn, libraryBtn);
  placeholder.append(icon, heading, body, permission, boundaryDetails, actions);
  if (model.importError) {
    const banner = document.createElement('p');
    banner.className = 'status-banner error relink-error';
    banner.setAttribute('role', 'alert');
    banner.textContent = model.importError;
    placeholder.appendChild(banner);
  }
  const conflictBox = renderMediaNameConflict(model);
  if (conflictBox) placeholder.appendChild(conflictBox);
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
    button.setAttribute('aria-label', `Capture ${button.textContent}`);
    if (!canSaveFromTargetTrack) {
      button.disabled = true;
      button.title = 'Approve this transcript before saving learner study items.';
    }
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!canSaveFromTargetTrack) return;
      // lt-cms: route through the shared capture form; nothing persists until Save occurrence.
      openCapture(model, {
        kind: 'lexeme',
        text: button.textContent ?? word.text,
        cueId: cue.id,
        tokenStart: word.tokenIndex,
        tokenEnd: word.tokenIndex + 1,
        charStart: word.charStart,
        charEnd: word.charEnd,
      });
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
