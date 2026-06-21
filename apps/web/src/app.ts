import type { AppModel, ViewName } from './uiTypes';
import type { Cue, SavedItem, ReviewCard } from '@lingotorte/domain';
import { formatTimeMs } from './uiTypes';
import {
  activeCueAtTime,
  applyLoopTolerance,
  clearSelection,
  createReviewCardForSavedItem,
  importFixtureMediaAndSubtitles,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  nativeTextForCue,
  nextCue,
  PLAYBACK_RATE_STEP,
  previousCue,
  recordReviewEvent,
  saveSelection,
  saveSentenceFromCue,
  seekToCue,
  setPlaybackRate,
  setPendingMeaning,
  setPendingNotes,
  setSelection,
  setTranscriptQuery,
  setView,
  toggleLoopCue,
  togglePlay,
  tokenizeCueText,
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
    case 'settings':
      main.appendChild(renderSettingsView(model));
      break;
  }
  return main;
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
  const speedInput = document.createElement('input');
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
    saveSentenceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void saveSentenceFromCue(model, cue).then(() => rerenderApp(model));
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
            setSelection(model, {
              kind: 'lexeme',
              text: token.surface,
              cueId: cue.id,
              tokenStart: token.tokenIndex,
              tokenEnd: token.tokenIndex + 1,
              charStart: token.charStart,
              charEnd: token.charEnd,
            } as import('./model').SelectionNonNull);
          } else {
            const phraseStart = cue.text.toLowerCase().indexOf(lower);
            setSelection(model, {
              kind: 'phrase',
              text: selectionText,
              cueId: cue.id,
              tokenStart: 0,
              tokenEnd: tokens.length,
              charStart: phraseStart >= 0 ? phraseStart : 0,
              charEnd: phraseStart >= 0 ? phraseStart + selectionText.length : cue.text.length,
            } as import('./model').SelectionNonNull);
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

function renderLibraryView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Library';
  section.appendChild(h2);
  const p = document.createElement('p');
  p.textContent = 'Load the synthetic local fixture to preview the player and study UI.';
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
  section.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Saved items';
  section.appendChild(h2);

  const items = Object.values(model.store.snapshot().savedItems) as SavedItem[];
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing saved yet. Select words or phrases while watching.';
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'saved-list';
  for (const item of items) {
    const occurrences = model.store.listSavedOccurrencesForItem(item.id);
    const card = document.createElement('div');
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
      meaning.className = 'meta';
      meaning.textContent = `Meaning: ${item.meaning}`;
      card.appendChild(meaning);
    }
    for (const occurrence of occurrences) {
      const link = document.createElement('a');
      link.className = 'occurrence-link';
      link.href = '#';
      link.textContent = `▶ ${occurrence.sourceContext.mediaPath} @ ${formatTimeMs(occurrence.startMs)}`;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        setView(model, 'player');
        model.player.currentTimeMs = occurrence.startMs;
        model.player.activeCueId = occurrence.cueId;
        const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
        if (video) {
          video.currentTime = occurrence.startMs / 1000;
        }
        rerenderApp(model);
      });
      card.appendChild(link);
    }
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn-secondary';
    reviewBtn.textContent = 'Create review card';
    reviewBtn.addEventListener('click', () => {
      const occurrence = occurrences[0];
      if (occurrence) {
        createReviewCardForSavedItem(model, item, occurrence, 'recognition');
        setView(model, 'review');
        rerenderApp(model);
      }
    });
    card.appendChild(reviewBtn);
    list.appendChild(card);
  }
  section.appendChild(list);
  return section;
}

function renderReviewView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card review-card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Review';
  section.appendChild(h2);

  const cards = Object.values(model.store.snapshot().reviewCards) as ReviewCard[];
  if (cards.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No review cards yet. Create one from a saved item.';
    section.appendChild(empty);
    return section;
  }

  const current = cards[0];
  if (!current) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No cards ready for review.';
    section.appendChild(empty);
    return section;
  }

  const item = model.store.getSavedItem(current.savedItemId);
  const prompt = document.createElement('div');
  prompt.className = 'review-prompt';
  prompt.setAttribute('role', 'alert');
  prompt.setAttribute('aria-live', 'polite');
  prompt.textContent = current.promptTemplate;
  section.appendChild(prompt);

  if (item?.meaning) {
    const hint = document.createElement('p');
    hint.style.textAlign = 'center';
    hint.textContent = `Meaning hint: ${item.meaning}`;
    section.appendChild(hint);
  }

  const buttons = document.createElement('div');
  buttons.className = 'review-buttons';
  for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
    const btn = document.createElement('button');
    btn.className = rating;
    btn.textContent = rating.charAt(0).toUpperCase() + rating.slice(1);
    btn.addEventListener('click', () => {
      recordReviewEvent(model, current, rating);
      rerenderApp(model);
    });
    buttons.appendChild(btn);
  }
  section.appendChild(buttons);

  const stats = document.createElement('p');
  stats.className = 'meta';
  stats.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'} in local deck`;
  section.appendChild(stats);

  return section;
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
