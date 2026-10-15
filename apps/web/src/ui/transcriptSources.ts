import { readNativePathPolicy, NATIVE_PATH_COMPATIBILITY_MESSAGE } from '../../../../packages/domain/src/nativePaths.ts';
import type { AppModel } from '../uiTypes';
import type { Cue } from '@lingotorte/domain';
import {
  extractSelectedEmbeddedSubtitleDraft,
  isStaleEmbeddedSubtitleOperationError,
  listEmbeddedSubtitleTracksFromService,
  selectEmbeddedSubtitleTrack,
  setEmbeddedSubtitleMediaPath,
} from '../model';
import { rerenderApp } from '../appShell.ts';
import { captureUiServiceOwner, uiOwnerCurrent } from './common.ts';
import { hasNativeInputPath } from './snippets.ts';

export function renderCueSourceComparison(model: AppModel, cue: Cue, currentTrackId: typeof cue.trackId): HTMLElement | null {
  const currentTrack = model.store.getSubtitleTrack(currentTrackId);
  if (!currentTrack) return null;
  const sourceTracks = model.store
    .listSubtitleTracksForMedia(currentTrack.mediaId)
    .filter((track) => track.id !== currentTrackId && track.role === currentTrack.role);
  if (sourceTracks.length === 0) return null;

  const comparison = document.createElement('div');
  comparison.className = 'source-comparison';
  comparison.setAttribute('aria-label', `Line ${cue.cueIndex} source comparison`);
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
    row.textContent = `${sourceLabel} ${track.transcriptSourceKind}/${track.transcriptStatus}: ${sourceCue?.text ?? 'No aligned line'}`;
    comparison.appendChild(row);
  }

  return comparison;
}

export function renderEmbeddedSubtitleControls(model: AppModel): HTMLElement {
  const state = model.transcriptLifecycle.embeddedSubtitle;
  const section = document.createElement('section');
  section.className = 'embedded-subtitle-controls';

  const heading = document.createElement('h4');
  heading.textContent = 'Embedded subtitle tracks';
  const boundary = document.createElement('p');
  boundary.className = 'gate-note';
  boundary.textContent = 'Enter the full path to the video file on this computer. The path stays in this browser session and is never saved as transcript provenance.';

  const pathLabel = document.createElement('label');
  pathLabel.htmlFor = 'embedded-subtitle-media-path';
  pathLabel.textContent = 'Full path to the video file';
  const pathInput = document.createElement('input');
  pathInput.id = 'embedded-subtitle-media-path';
  pathInput.name = 'embedded-subtitle-media-path';
  pathInput.type = 'text';
  pathInput.value = state.mediaPath;
  pathInput.placeholder = model.localService.pathPolicy?.platform === 'win32' ? 'C:\\Media\\owned-media.mkv' : '/full/path/to/video.mkv';
  pathLabel.appendChild(pathInput);

  const languageLabel = document.createElement('label');
  languageLabel.htmlFor = 'embedded-subtitle-language';
  languageLabel.textContent = 'Draft language';
  const languageInput = document.createElement('input');
  languageInput.id = 'embedded-subtitle-language';
  languageInput.name = 'embedded-subtitle-language';
  languageInput.type = 'text';
  languageInput.value = state.language;
  languageLabel.appendChild(languageInput);

  const trackList = document.createElement('div');
  trackList.className = 'embedded-subtitle-track-list';
  trackList.setAttribute('role', 'radiogroup');
  trackList.setAttribute('aria-label', 'Embedded subtitle tracks');

  const extractionEnabled = () => model.localService.status === 'connected'
    && hasNativeInputPath(model, state.mediaPath)
    && state.language.trim().length > 0
    && state.tracks.some((track) => track.streamIndex === state.selectedStreamIndex && track.isSupported);

  const extractButton = document.createElement('button');
  extractButton.type = 'button';
  extractButton.className = 'btn-secondary';
  extractButton.textContent = 'Extract selected track as draft';
  extractButton.disabled = !extractionEnabled();

  pathInput.addEventListener('input', () => {
    setEmbeddedSubtitleMediaPath(model, pathInput.value);
    for (const input of trackList.querySelectorAll<HTMLInputElement>('input[type="radio"]')) input.checked = false;
    extractButton.disabled = true;
  });
  languageInput.addEventListener('input', () => {
    state.language = languageInput.value;
    extractButton.disabled = !extractionEnabled();
  });

  for (const track of state.tracks) {
    const row = document.createElement('label');
    row.className = `embedded-subtitle-track ${track.isSupported ? 'supported' : 'unsupported'}`;
    const choice = document.createElement('input');
    choice.type = 'radio';
    choice.name = 'embedded-subtitle-track';
    choice.value = String(track.streamIndex);
    choice.checked = state.selectedStreamIndex === track.streamIndex;
    choice.disabled = !track.isSupported;
    choice.addEventListener('change', () => {
      if (!choice.checked) return;
      selectEmbeddedSubtitleTrack(model, track.streamIndex);
      languageInput.value = state.language;
      extractButton.disabled = !extractionEnabled();
    });
    const markers = [
      track.language ? `language ${track.language}` : null,
      track.title ? `title ${track.title}` : null,
      track.isDefault ? 'default' : null,
      track.isForced ? 'forced' : null,
      track.isSupported ? 'supported' : 'unsupported',
    ].filter((value): value is string => value !== null);
    const text = document.createElement('span');
    text.textContent = `stream ${track.streamIndex} • ${track.codecName} • ${markers.join(' • ')}`;
    row.append(choice, text);
    if (track.extractionHint) {
      const hint = document.createElement('small');
      hint.textContent = track.extractionHint;
      row.appendChild(hint);
    }
    trackList.appendChild(row);
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions transcript-action-row';
  const listButton = document.createElement('button');
  listButton.type = 'button';
  listButton.className = 'btn-secondary';
  listButton.textContent = 'List embedded subtitle tracks';
  listButton.disabled = !readNativePathPolicy(model.localService.pathPolicy) || state.listingStatus === 'listing' || state.extractionStatus === 'extracting';
  if (!readNativePathPolicy(model.localService.pathPolicy)) boundary.textContent = NATIVE_PATH_COMPATIBILITY_MESSAGE;
  listButton.addEventListener('click', () => {
    const transport = captureUiServiceOwner(model); if (!transport) return;
    void listEmbeddedSubtitleTracksFromService(model)
      .then(() => {
        if (!uiOwnerCurrent(transport)) return;
        model.importError = null;
        rerenderApp(model);
      })
      .catch((error: unknown) => {
        if (!uiOwnerCurrent(transport)) return;
        if (isStaleEmbeddedSubtitleOperationError(error)) return;
        model.importError = error instanceof Error ? error.message : String(error);
        rerenderApp(model);
      });
  });
  extractButton.addEventListener('click', () => {
    const transport = captureUiServiceOwner(model); if (!transport) return;
    extractButton.disabled = true;
    void extractSelectedEmbeddedSubtitleDraft(model)
      .then(() => {
        if (!uiOwnerCurrent(transport)) return;
        model.importError = null;
        model.transcriptLifecycle.lastMessage = state.statusMessage;
        rerenderApp(model);
      })
      .catch((error: unknown) => {
        if (!uiOwnerCurrent(transport)) return;
        if (isStaleEmbeddedSubtitleOperationError(error)) return;
        model.importError = error instanceof Error ? error.message : String(error);
        rerenderApp(model);
      });
  });
  actions.append(listButton, extractButton);

  section.append(heading, boundary, pathLabel, languageLabel, actions, trackList);
  if (state.statusMessage) {
    const status = document.createElement('div');
    status.className = `status-banner ${state.listingStatus === 'failed' || state.extractionStatus === 'failed' ? 'error' : 'success'}`;
    status.setAttribute('role', state.listingStatus === 'failed' || state.extractionStatus === 'failed' ? 'alert' : 'status');
    status.textContent = state.statusMessage;
    section.appendChild(status);
  }
  return section;
}
