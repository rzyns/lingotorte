// Module layout (lt-939): app.ts re-exports this shell. The shell imports views; views import
// from ui/, model and this shell, never from each other. Views use `rerenderApp`,
// `requestFocusAfterRender` etc. via ES live-binding imports from this module, and only call them
// inside event handlers / render functions (never at module top level), so the shell<->view import
// cycle is safe at evaluation time. Module state (WeakMaps, keyboard lets) lives in exactly one module.
import type { AppModel, ViewName } from './uiTypes';
import {
  nextCue,
  PLAYBACK_RATE_STEP,
  previousCue,
  seekToCue,
  setPlaybackRate,
  setView,
  nextReviewDueAfter,
  observeLocalServiceSync,
  saveModelToLocalService,
} from './model';
import { renderToastRegion } from './ui/toast.ts';
import { currentKeyboardCue, isEditableShortcutTarget, seekRenderedVideoToCue } from './ui/common.ts';
import { invalidateSourceRangeSnippet, practiceSnippetStates, sourceRangeSnippetStates, synchronizePracticeSnippet, synchronizeSourceRangeSnippet } from './ui/snippets.ts';
import { renderExportImportView } from './views/exportImport.ts';
import { renderLibraryView } from './views/library.ts';
import { pausePersistentVideoOffPlayer, renderPlayerView, resumePersistentVideoAfterRender } from './views/player/stage.ts';
import { togglePlaybackInPlace } from './views/player/controls.ts';
import { renderPracticeView } from './views/practice.ts';
import { renderReviewView } from './views/review.ts';
import { renderSavedView } from './views/saved.ts';
import { renderSettingsView } from './views/settings.ts';

export function renderApp(model: AppModel): HTMLElement {
  installGlobalKeyboardShortcuts(model);
  // lt-2zm: the cached video survives off-player renders; stop playback like the old teardown did.
  pausePersistentVideoOffPlayer(model);
  if (sourceRangeSnippetStates.has(model)) {
    const snippet = synchronizeSourceRangeSnippet(model);
    if (model.view !== 'player' && snippet.objectUrl) {
      invalidateSourceRangeSnippet(model, 'Transient browser audio cleaned after leaving Player.');
    }
  }
  if (practiceSnippetStates.has(model)) synchronizePracticeSnippet(model);
  const root = document.createElement('div');
  root.className = 'lingotorte-app';
  root.appendChild(renderHeader(model));
  const syncStatus = document.createElement('div');
  syncStatus.dataset.localServiceSync = 'true';
  syncStatus.setAttribute('role', 'status');
  root.appendChild(syncStatus);
  const updateSyncStatus = () => {
    for (const node of root.querySelectorAll<HTMLElement>('[data-local-service-sync]')) {
      renderSyncBannerContent(model, node);
      node.dataset.syncState = model.localService.syncState ?? 'idle';
      node.className = `status-banner ${model.localService.status === 'error' ? 'error' : ''}`;
      node.hidden = model.localService.status === 'disconnected' && !model.localService.syncState;
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-local-service-save]')) {
      button.disabled = model.localService.status === 'connecting' || ['choice', 'conflict', 'saving'].includes(model.localService.syncState ?? '');
    }
  };
  root.appendChild(renderMain(model));
  observeLocalServiceSync(model, updateSyncStatus);
  updateSyncStatus();
  root.appendChild(renderFooter());
  // lt-e0j: one persistent live region (keyed), re-appended into each new root.
  root.appendChild(renderToastRegion(model));
  return root;
}

/**
 * lt-e0j (H2): the unsaved banner says what to do. Save now only when connected; otherwise point at Settings.
 * The Save now button carries [data-local-service-save] so updateSyncStatus keeps its disabled state honest.
 */
function renderSyncBannerContent(model: AppModel, node: HTMLElement): void {
  const retryable = model.localService.syncState === 'error' && model.localService.status === 'connected';
  if (model.localService.syncState !== 'unsaved' && !retryable) {
    node.textContent = model.localService.lastMessage;
    return;
  }
  node.replaceChildren();
  const connected = model.localService.status === 'connected';
  // The lead keeps any specific sync message (cache restore, kept browser work); only the actions are added.
  node.append(`${model.localService.lastMessage} \u2014 ${connected ? '' : 'connect in '}`);
  if (connected) {
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn-link';
    save.textContent = 'Save now';
    save.dataset.localServiceSave = 'true';
    save.addEventListener('click', () => {
      if (model.localService.syncState === 'saving') return;
      save.disabled = true;
      // A rejected save is surfaced through the existing sync error state; the rerender re-enables the button.
      void saveModelToLocalService(model, model.localService.baseUrl)
        .catch((err: unknown) => {
          model.localService.syncState = 'error';
          model.localService.lastMessage = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
        })
        .finally(() => rerenderApp(model));
    });
    node.append(save, ' \u00b7 ');
  }
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'btn-link';
  settings.textContent = 'Settings';
  settings.addEventListener('click', () => { setView(model, 'settings'); rerenderApp(model); });
  node.append(settings);
  if (!connected) node.append(' to save');
}

let keyboardShortcutsDocument: Document | null = null;
let keyboardShortcutsModel: AppModel | null = null;
let keyboardShortcutsHandler: ((event: KeyboardEvent) => void) | null = null;

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
    if (event.key === ' ' || event.key === 'Spacebar') {
      // lt-xlr: Space toggles play/pause, but never steals activation from buttons, role=button
      // spans (cue words), cue rows, links or the seek/speed sliders. `[tabindex]` also intentionally
      // covers .cue-word spans while focusCueWord gives them a temporary tabindex=-1.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button, [role="button"], a[href], summary, .cue-row, [tabindex]:not(body)')) return;
      const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
      if (!video) return;
      event.preventDefault();
      // In-place toggle: a full rerender would detach the playing <video> (lt-dlf.1).
      togglePlaybackInPlace(currentModel);
      return;
    } else if (event.key === 'r' || event.key === 'R') {
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

let currentRoot: HTMLElement | null = null;
let learningWakeTimer: ReturnType<typeof setTimeout> | null = null;
// Re-check at least this often so sleep/clock jumps cannot strand an open queue.
const LEARNING_WAKE_MAX_DELAY_MS = 60_000;

function scheduleLearningWake(model: AppModel): void {
  if (learningWakeTimer !== null) {
    clearTimeout(learningWakeTimer);
    learningWakeTimer = null;
  }
  if (model.view !== 'review' && model.view !== 'practice') return;
  const nextDue = nextReviewDueAfter(model, model.clock());
  if (!nextDue) return;
  const delay = Math.min(Math.max(nextDue.valueOf() - model.clock().valueOf(), 0), LEARNING_WAKE_MAX_DELAY_MS);
  learningWakeTimer = setTimeout(() => {
    learningWakeTimer = null;
    // Only the still-mounted app for this model may re-render; a detached root is a no-op.
    if (!currentRoot || !currentRoot.isConnected) return;
    if (model.view !== 'review' && model.view !== 'practice') return;
    if (model.clock().valueOf() >= nextDue.valueOf()) rerenderApp(model);
    else scheduleLearningWake(model);
  }, delay);
  (learningWakeTimer as { unref?: () => void }).unref?.();
}

// lt-r4k.2: actions that remove or replace the activated control request an explicit focus successor.
// Only user-action handlers call this; timer/wake/autosave renders never set it, so they never move focus.
const pendingFocusRequests = new WeakMap<AppModel, readonly string[]>();
export const PRACTICE_SUCCESSORS = ['practice-feedback', 'practice-empty', 'practice-prompt'] as const;

/** Ask the next rerenderApp(model) to focus the first of `ids` that exists after rendering. */
// Callers must request immediately before a synchronous rerenderApp. If a request is ever made before an
// await, add an activeElement check so focus is not pulled away from where the user has since moved.
export function requestFocusAfterRender(model: AppModel, ...ids: string[]): void {
  pendingFocusRequests.set(model, ids);
}

export function rerenderApp(model: AppModel): void {
  // Consume the one-time focus request first, so it can never survive to a later, unrelated render.
  const requested = pendingFocusRequests.get(model);
  pendingFocusRequests.delete(model);
  const app = document.getElementById('app');
  if (!app) return;
  const previousView = model.view;
  const focused = document.activeElement?.id ?? '';
  // lt-2zm: build the new root before detaching the old one; persistent nodes (the video stage) move
  // from the old root into the new tree, then a single swap attaches it.
  const oldRoot = currentRoot;
  currentRoot = renderApp(model);
  const nav = currentRoot.querySelector('.lingotorte-nav');
  if (nav) setActiveNav(nav as HTMLElement, previousView);
  if (oldRoot && oldRoot.parentNode === app) app.replaceChild(currentRoot, oldRoot);
  else app.appendChild(currentRoot);
  // A browser may have paused the moved <video> while it was detached; resume if the model says playing.
  resumePersistentVideoAfterRender(model);
  const successor = requested?.map((id) => document.getElementById(id)).find((el): el is HTMLElement => el !== null);
  if (successor) {
    successor.focus();
  } else if (focused) {
    const el = document.getElementById(focused);
    // lt-z8s: word spans have no tabindex at rest; give a temporary one (removed on blur) so focus sticks.
    if (el?.classList.contains('cue-word') && !el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
      el.addEventListener('focusout', () => el.removeAttribute('tabindex'), { once: true });
    }
    el?.focus();
  }
  scrollCueIntoView(model.player.activeCueId);
  scheduleLearningWake(model);
}

export function scrollCueIntoView(cueId: string | null): void {
  if (!cueId) return;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(cueId) : cueId.replace(/"/g, '\\"');
  const row = document.querySelector(`[data-cue-id="${escaped}"]`);
  if (row && typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ behavior: 'auto', block: 'center' });
  }
}
