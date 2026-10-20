import type { AppModel } from '../uiTypes';
import { PAIR_AGAIN, type PairedTransport } from '../pairedTransport.ts';
import type { Cue, LearnerExportManifest } from '@lingotorte/domain';
import { formatTimeMs } from '../uiTypes';
import {
  activeCueAtTime,
  captureLocalServiceTransport,
  learnerProgress,
  studyMetrics,
  formatCompactDurationMs,
  STUDY_ESTIMATE_MS_PER_ACTION,
  currentTargetTrack,
  mediaAssetById,
  openMediaAsset,
} from '../model';
import { rerenderApp } from '../appShell.ts';

export function captureUiServiceOwner(model: AppModel): PairedTransport | null {
  try { return captureLocalServiceTransport(model); }
  catch { model.localService.lastMessage = PAIR_AGAIN; rerenderApp(model); return null; }
}
export function uiOwnerCurrent(transport: PairedTransport): boolean {
  try { transport.assertCurrent(); return true; } catch { return false; }
}
export type BrowserFileHandleLike = Readonly<{
  name: string;
  getFile(): Promise<File>;
  queryPermission?: (opts: { mode: 'read' }) => Promise<string>;
  requestPermission?: (opts: { mode: 'read' }) => Promise<string>;
}>;

export type BrowserFilePickerGlobal = typeof globalThis & Readonly<{
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

export type BrowserFileSavePickerGlobal = typeof globalThis & Readonly<{
  showSaveFilePicker?: (options?: unknown) => Promise<BrowserFileSaveHandleLike>;
}>;

export function appendDefinitionRow(list: HTMLDListElement, term: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  list.append(dt, dd);
}

export function shortHash(hash: string): string {
  const digest = hash.startsWith('sha256:') ? hash.slice('sha256:'.length) : hash;
  return digest.length > 16 ? `${digest.slice(0, 12)}…${digest.slice(-8)}` : hash;
}

export function readPreviewManifest(model: AppModel): LearnerExportManifest | null {
  if (!model.exportImport.manifestJson) return null;
  try {
    return JSON.parse(model.exportImport.manifestJson) as LearnerExportManifest;
  } catch {
    return null;
  }
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}

export function currentKeyboardCue(model: AppModel): Cue | null {
  if (model.player.activeCueId) {
    return model.cues.find((cue) => cue.id === model.player.activeCueId) ?? null;
  }
  return activeCueAtTime(model.cues, model.player.currentTimeMs) ?? model.cues[0] ?? null;
}

export function seekRenderedVideoToCue(cue: Cue): void {
  const video = document.querySelector('.video-stage video') as HTMLVideoElement | null;
  if (video) {
    video.currentTime = cue.startMs / 1000;
  }
}

export function renderStatusToken(label: string, tone: 'local' | 'approved' | 'draft' | 'warning' | 'neutral' = 'neutral'): HTMLElement {
  const token = document.createElement('span');
  token.className = `status-token status-token-${tone}`;
  token.textContent = label;
  return token;
}

export function formatCompactTimeMs(ms: number): string {
  return formatTimeMs(ms).replace(/\.00$/, '');
}

export function compactPathLabel(path: string): string {
  if (path.startsWith('blob:')) return 'browser-local media';
  if (path.startsWith('youtube:')) return path;
  const withoutQuery = path.split(/[?#]/)[0] ?? path;
  const parts = withoutQuery.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

/** lt-unl: learner-facing media name: asset title, else the path's file name; never a data URL or hash. */
export function mediaDisplayName(model: AppModel, mediaId: string | undefined, mediaPath: string): string {
  const title = mediaId ? mediaAssetById(model, mediaId)?.title : undefined;
  if (title) return title;
  if (mediaPath.startsWith('data:')) return 'media file';
  const name = compactPathLabel(mediaPath);
  return /[A-Za-z0-9+/]{20,}={0,2}/.test(name) ? 'media file' : name;
}

export function mediaLabel(model: AppModel, fallbackPath?: string): string {
  if (model.currentMedia?.title) return model.currentMedia.title;
  if (fallbackPath) return compactPathLabel(fallbackPath);
  if (model.currentMedia?.originalPath) return compactPathLabel(model.currentMedia.originalPath);
  return 'No media loaded';
}

export function renderUnresolvedSource(mediaPath: string): HTMLElement {
  const note = document.createElement('p');
  note.className = 'status-banner warning source-unresolved';
  note.setAttribute('role', 'status');
  note.dataset.testid = 'source-unresolved';
  appendSourceDisclosure(note, `Source line/media not available in this app; playback unresolved. Captured reference: ${compactPathLabel(mediaPath)}`, mediaPath.startsWith('blob:') ? '' : mediaPath);
  return note;
}

/**
 * lt-584.5: a saved occurrence whose media is stored but whose transcripts have not been loaded from the
 * service yet. The button opens that media (openMediaAsset loads its transcripts) and re-renders the view.
 */
export function renderTranscriptNotLoaded(model: AppModel, mediaId: string): HTMLElement {
  const note = document.createElement('p');
  note.className = 'status-banner warning transcript-not-loaded';
  note.setAttribute('role', 'status');
  note.dataset.testid = 'transcript-not-loaded';
  const text = document.createElement('span');
  text.textContent = model.transcriptLoading?.mediaId === mediaId ? 'Loading transcript…' : 'Open media to load transcript';
  note.appendChild(text);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-secondary';
  button.textContent = 'Open media';
  button.dataset.action = 'open-media-transcript';
  button.dataset.mediaId = mediaId;
  button.disabled = model.transcriptLoading?.mediaId === mediaId;
  button.addEventListener('click', () => {
    const opened = openMediaAsset(model, mediaId);
    rerenderApp(model);
    void opened.then(() => rerenderApp(model));
  });
  note.appendChild(button);
  return note;
}

export function appendSourceDisclosure(container: HTMLElement, summaryText: string, detailText: string): void {
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

export function renderSourceMetaChip(text: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'source-meta-chip';
  chip.textContent = text;
  return chip;
}

export function renderStudyStatusRail(model: AppModel): HTMLElement {
  const rail = document.createElement('div');
  rail.className = 'status-token-rail';
  rail.setAttribute('aria-label', 'Study status');

  const targetTrack = currentTargetTrack(model);
  const transcriptStatus = targetTrack?.transcriptStatus ?? 'no transcript';
  const statusTone = transcriptStatus === 'approved'
    ? 'approved'
    : transcriptStatus === 'draft'
      ? 'draft'
      : transcriptStatus === 'correcting'
        ? 'warning'
        : 'neutral';
  // lt-unl: hero rail holds at most 3 chips (transcript readiness, N saved, due today); the rest is in a details footer.
  const readiness = transcriptStatus === 'approved'
    ? 'Transcript ready'
    : transcriptStatus === 'no transcript'
      ? 'No transcript yet'
      : 'Transcript draft — approve before saving words';
  rail.appendChild(renderStatusToken(readiness, statusTone));

  const progress = learnerProgress(model, model.clock());
  rail.appendChild(renderStatusToken(`${progress.savedItems} saved`, 'neutral'));
  rail.appendChild(renderStatusToken(`${progress.dueCards} due today`, 'neutral'));
  return rail;
}

/** lt-unl: secondary study status (privacy, transcript source, activity, streak, time estimate), collapsed by default. */
export function renderStudyStatusFooter(model: AppModel): HTMLElement {
  const footer = document.createElement('details');
  footer.className = 'study-status-footer';
  const summary = document.createElement('summary');
  summary.textContent = 'More study status';
  const rail = document.createElement('div');
  rail.className = 'status-token-rail study-status-footer-rail';
  rail.appendChild(renderStatusToken('local/private', 'local'));
  const targetTrack = currentTargetTrack(model);
  const sourceLabel = targetTrack?.transcriptSourceKind ?? 'local import ready';
  rail.appendChild(renderStatusToken(sourceLabel, targetTrack?.transcriptStatus === 'draft' ? 'warning' : 'neutral'));
  const progress = learnerProgress(model, model.clock());
  const progressParts: string[] = [];
  if (progress.totalReviews > 0) progressParts.push(`${progress.totalReviews} reviews`);
  if (progress.practiceAttempts > 0) progressParts.push(`${progress.practiceAttempts} practice`);
  if (progressParts.length > 0) rail.appendChild(renderStatusToken(progressParts.join(' • '), 'neutral'));

  const metrics = studyMetrics(model);
  const today = formatCompactDurationMs(metrics.todayStudyTimeMs);
  const total = formatCompactDurationMs(metrics.totalStudyTimeMs);
  const streakText = metrics.streakDays > 0 ? `🔥 ${metrics.streakDays} day streak` : '🔥 Start a streak';
  rail.appendChild(renderStatusToken(streakText, 'neutral'));
  const timeToken = renderStatusToken(`~${today} today • ~${total} total (estimated)`, 'neutral');
  timeToken.title = `Estimated study time: ${STUDY_ESTIMATE_MS_PER_ACTION / 1000} seconds per study action, from local events only`;
  timeToken.setAttribute('aria-label', `Estimated study time: about ${today} today, about ${total} total`);
  timeToken.dataset.estimate = 'true';
  rail.appendChild(timeToken);
  rail.dataset.streakDays = String(metrics.streakDays);
  rail.dataset.todayStudyTime = today;
  rail.dataset.totalStudyTime = total;
  footer.append(summary, rail);
  return footer;
}

/** lt-unl: 1-based position in the loaded cue list (stored cueIndex may be 0-based, e.g. VTT without ids). */
export function linePosition(model: AppModel, cue: Cue): number {
  const idx = model.cues.findIndex((candidate) => candidate.id === cue.id);
  return idx >= 0 ? idx + 1 : cue.cueIndex;
}

export function renderSourceContextRow(model: AppModel): HTMLElement {
  const row = document.createElement('div');
  row.className = 'source-context-row';
  row.setAttribute('aria-label', 'Current source context');

  const activeCue = currentKeyboardCue(model);
  const targetTrack = currentTargetTrack(model);
  const parts: string[] = [];
  const visibleParts: string[] = [];
  if (model.currentMedia) {
    const loadedCueEndMs = model.cues.reduce((maxEnd, cue) => Math.max(maxEnd, cue.endMs), model.currentMedia.durationMs);
    // lt-dlf.13 (P8): video title and time range, never the raw path/blob: URL.
    parts.push(mediaLabel(model));
    parts.push(`${formatCompactTimeMs(0)}–${formatCompactTimeMs(loadedCueEndMs)}`);
    visibleParts.push(mediaLabel(model));
    visibleParts.push(`${formatCompactTimeMs(0)}–${formatCompactTimeMs(loadedCueEndMs)}`);
  } else {
    parts.push('no media loaded');
    visibleParts.push('no media loaded');
  }
  if (activeCue) {
    parts.push(`line ${linePosition(model, activeCue)}`);
    parts.push(`${formatCompactTimeMs(activeCue.startMs)}–${formatCompactTimeMs(activeCue.endMs)}`);
    visibleParts.push(`line ${linePosition(model, activeCue)}`);
    visibleParts.push(`${formatCompactTimeMs(activeCue.startMs)}–${formatCompactTimeMs(activeCue.endMs)}`);
  } else {
    parts.push('no active cue');
    visibleParts.push('no current line');
  }
  if (targetTrack) {
    parts.push(`track v${targetTrack.trackVersion}`);
    parts.push(targetTrack.transcriptStatus);
    // lt-dlf.11 (P3): transcript readiness is shown once, in the Player hero status rail.
  }
  const primary = document.createElement('div');
  primary.className = 'source-context-primary';
  appendSourceDisclosure(primary, visibleParts.join(' • '), parts.join(' • '));
  row.appendChild(primary);

  if (model.currentMedia) {
    const chips = document.createElement('div');
    chips.className = 'source-context-chips';
    if (model.currentMedia) chips.appendChild(renderSourceMetaChip(model.currentMedia.privacyLabel));
    // lt-dlf.11 (P3): "line N" already appears in the summary, so no duplicate line chip.
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
  const targetTrack = currentTargetTrack(model);
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
  ['Source candidates', 'Draft evidence', 'Line correction', 'Word timing', 'Approval'].forEach((label, index) => {
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

export function renderTranscriptWorkbenchOverview(model: AppModel): HTMLElement {
  const overview = document.createElement('div');
  overview.className = 'transcript-workbench-overview';
  overview.appendChild(renderLifecycleStageRail(model));

  const candidates = document.createElement('div');
  candidates.className = 'source-candidate-grid';
  candidates.append(
    renderSourceCandidateCard(
      'Local files / existing subtitles',
      'Best default: use your own videos and subtitle files already on this computer.',
      [renderRiskToken('local safe', 'local')],
    ),
    renderSourceCandidateCard(
      'Local auto-transcript draft',
      'Uses the configured local service and local tools when those dependencies are installed and explicitly chosen.',
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
