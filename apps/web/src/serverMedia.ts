// lt-192.4 (plan §4.2, design lt-zt0 §5.5-§5.6): server-managed media playback in the browser.
// Per-model, non-serialised state (never in snapshots, exports, localStorage or logs): availability, the last M3
// result per media id for the CURRENT pairing origin, and the bounded re-mint bookkeeping. The media cookie itself is
// HttpOnly and never visible here; M1/M2 go through the paired transport (the only 'same-origin' credential calls),
// and M4 is loaded only by the <video> element.
import type { AppModel } from './uiTypes';
import { capturedTransport, MEDIA_SESSION_PATH, PairingRequiredError, type PairedTransport } from './pairedTransport.ts';

export type ServerStorage =
  | Readonly<{ state: 'none' }> | Readonly<{ state: 'bytes-missing' }>
  | Readonly<{ state: 'complete'; sizeBytes: number; mimeType: string }>;
export type PlaybackSource =
  | Readonly<{ kind: 'local'; src: string }>
  | Readonly<{ kind: 'server'; src: string }>
  | Readonly<{ kind: 'relink'; note?: string }>
  | Readonly<{ kind: 'message'; text: string }>;
export type ServiceReach = 'paired' | 'unpaired' | 'unreachable';

export const BROWSER_HANDLE_PREFIX = 'browser-file-handle:';
export const MANAGED_PREFIX = 'managed:';
export const SERVER_COPY_MISSING_NOTE = 'The server copy is missing; upload the same file again to restore it.';
export const MANAGED_BYTES_MISSING = 'Stored bytes are missing on the server. Upload the same file again to restore them.';
export const MANAGED_NOT_STORED = 'This media is not stored on the connected local service.';
export const MANAGED_PAIR = 'Pair with the local service (same-origin web address) to play this server-stored media.';
export const MANAGED_UNREACHABLE = 'Local service unreachable; server-stored media cannot be checked or played until it is reachable. No decode problem is assumed.';
export const CHECKING_ACCESS = 'Checking access to the server copy…';
export const PAIR_AGAIN_MEDIA = 'Pair again to play server media.';
export const SERVER_UNDECODABLE = 'Stored on the server, but this browser cannot decode its format; no conversion is performed.';
export const SERVER_NETWORK = 'The server copy could not be loaded over the network; check the connection and try again.';
export const SERVER_ABORTED = 'Loading the server copy was aborted before the browser finished reading it.';
export const SERVER_REFUSED = 'The local service refused a new media access session; server playback is unavailable.';
export const MEDIA_NOT_REVOKED = 'Media access on this browser could not be revoked; it ends when the service restarts.';
export const MEDIA_REVOKED = 'Media access on this browser was revoked.';

type State = {
  /** The pairing origin these facts belong to; facts of another origin are never used. */
  origin: string | null;
  available: boolean | null;
  storage: Map<string, ServerStorage>;
  inflight: Map<string, Promise<void>>;
  /** Media ids whose M3 already ran under this pairing without a usable answer (one check per media per pairing). */
  attempted: Set<string>;
  unreachable: boolean;
  /** A server-media check (M3/M1) of this origin got 401: the pairing ended (restart). Cleared by the next status OK. */
  pairingLost: boolean;
  /** The pairing's M1 (mint) in flight; M3 waits for it so the first M4 already carries the new cookie. */
  ready: Promise<unknown>;
  remintUsed: Set<string>;
  recovering: Set<string>;
  /** Outstanding M1 requests (background and recovery). The final M2 waits for every one of them to settle. */
  mints: Set<Promise<CallResult>>;
  /** M1 requests started so far; orders an M1 against an uncertain earlier one. */
  mintSeq: number;
  /** Set when an M1 ended without a definite HTTP answer (timeout, network, stale): its Set-Cookie may exist. Holds the
   *  mintSeq at that moment; only an M1 that STARTED later and got 204 rotated that value away (server M1 rotation). */
  uncertainAfter: number | null;
  /** An M1 was sent from this page and no confirmed M2 followed: a media value may still be valid in this browser. */
  mayHoldValue: boolean;
  /** The M2 in progress (Disconnect and Forget share one). No M1 starts meanwhile. */
  revoking?: Promise<RevokeResult> | undefined;
  /** Whether any caller of the M2 in progress is a Disconnect (then no M1 at all for that transport afterwards). */
  revokeBlocksAll?: boolean;
  /** After Disconnect no M1 at all for that transport; after Forget (bearer kept) no background M1, recovery only. */
  mintBlocked?: Readonly<{ transport: PairedTransport; all: boolean }>;
  rerender?: () => void;
  video?: { element: HTMLVideoElement; mediaId: string; source: string };
};
const states = new WeakMap<AppModel, State>();
function state(model: AppModel): State {
  let s = states.get(model);
  if (!s) {
    s = { origin: null, available: null, storage: new Map(), inflight: new Map(), attempted: new Set(), unreachable: false, pairingLost: false, ready: Promise.resolve(),
      remintUsed: new Set(), recovering: new Set(), mints: new Set(), mintSeq: 0, uncertainAfter: null, mayHoldValue: false };
    states.set(model, s);
  }
  return s;
}

const isBrowserOnlyLabel = (label: string) => label.startsWith(BROWSER_HANDLE_PREFIX) || label.startsWith('blob:');
const contentPath = (mediaId: string) => `/api/media/${mediaId}/content`;
const pageOrigin = () => globalThis.location?.origin;

/** Pure selection (design §5.5). A `managed:` label never becomes a src. */
export function playbackSource(input: Readonly<{ objectUrl: string | null; label: string; mediaId: string; storage?: ServerStorage; serverOrigin?: string; reach: ServiceReach;
  /** A server copy was confirmed complete under the last pairing of this origin, which is now gone or unreachable. */
  serverCopyKnown?: boolean;
  /** A server-media check of this origin was answered 401 (pairing ended), even if this media was never checked. */
  pairingLost?: boolean }>): PlaybackSource {
  if (input.objectUrl) return { kind: 'local', src: input.objectUrl };
  if (input.storage?.state === 'complete' && input.serverOrigin && input.reach === 'paired') return { kind: 'server', src: `${input.serverOrigin}${contentPath(input.mediaId)}` };
  const lostServerCopy = (input.serverCopyKnown || input.pairingLost) && input.reach !== 'paired' ? (input.reach === 'unreachable' ? MANAGED_UNREACHABLE : PAIR_AGAIN_MEDIA) : undefined;
  if (isBrowserOnlyLabel(input.label)) {
    if (input.storage?.state === 'bytes-missing') return { kind: 'relink', note: SERVER_COPY_MISSING_NOTE };
    return lostServerCopy ? { kind: 'relink', note: lostServerCopy } : { kind: 'relink' };
  }
  if (input.label.startsWith(MANAGED_PREFIX)) {
    if (input.storage?.state === 'bytes-missing') return { kind: 'message', text: MANAGED_BYTES_MISSING };
    if (lostServerCopy) return { kind: 'message', text: lostServerCopy };
    if (input.reach === 'unreachable') return { kind: 'message', text: MANAGED_UNREACHABLE };
    if (input.reach === 'paired' && input.storage?.state === 'none') return { kind: 'message', text: MANAGED_NOT_STORED };
    return { kind: 'message', text: MANAGED_PAIR };
  }
  return { kind: 'local', src: input.label };
}

/** The current pairing's transport when it is the exact same-origin profile with managed media available. */
function serverTransport(model: AppModel): PairedTransport | undefined {
  const s = state(model);
  let transport: PairedTransport;
  try { transport = capturedTransport(model, model.localService.baseUrl); } catch { return undefined; }
  if (transport.origin !== pageOrigin() || s.origin !== transport.origin || s.available !== true) return undefined;
  return transport;
}

export function currentPlaybackSource(model: AppModel): PlaybackSource | null {
  const media = model.currentMedia;
  if (!media) return null;
  const s = state(model);
  const transport = serverTransport(model);
  const reach: ServiceReach = transport ? (s.unreachable ? 'unreachable' : 'paired') : s.unreachable ? 'unreachable' : 'unpaired';
  const storage = transport ? s.storage.get(media.id) : undefined;
  // A confirmed server copy whose pairing is gone (restart/401, Disconnect) or whose service became unreachable.
  const serverCopyKnown = (!transport || s.unreachable) && s.origin !== null && s.origin === pageOrigin() && s.storage.get(media.id)?.state === 'complete';
  const pairingLost = !transport && s.pairingLost && s.origin !== null && s.origin === pageOrigin();
  return playbackSource({ objectUrl: model.browserLocalMedia.objectUrl, label: media.originalPath, mediaId: media.id, ...(storage ? { storage } : {}),
    ...(transport ? { serverOrigin: transport.origin } : {}), reach, serverCopyKnown, pairingLost });
}

/** Library relink gate for a non-current asset: true only when this pairing already confirmed a complete server copy
 *  (from an earlier stage/Library check). Never issues a request: unknown storage keeps the existing Relink offer. */
export function serverCopyReady(model: AppModel, mediaId: string): boolean {
  const s = state(model);
  return Boolean(serverTransport(model)) && !s.unreachable && s.storage.get(mediaId)?.state === 'complete';
}

type CallResult = 'ok' | 'unauthorized' | 'unreachable' | 'refused';
/** Per-call abort bound; the revoke drain waits slightly longer for every outstanding M1 to settle. */
const CALL_TIMEOUT_MS = 5000;
export const MINT_DRAIN_MS = CALL_TIMEOUT_MS + 1000;
async function call(transport: PairedTransport, path: string, init: RequestInit): Promise<{ result: CallResult; response?: Response }> {
  try {
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(CALL_TIMEOUT_MS) : undefined;
    const response = await transport.request(path, { ...init, ...(signal ? { signal } : {}) });
    return { result: response.ok ? 'ok' : 'refused', response };
  } catch (error) {
    if (error instanceof PairingRequiredError) return { result: 'unauthorized' };
    return { result: 'unreachable' };
  }
}

/**
 * M1, tracked per model so that M2 can be ordered after it: a Set-Cookie that arrives after the final M2 can never be
 * undone by any later check. Refused (no request) while an M2 runs, after Disconnect, and for background mints after
 * Forget. An M1 without a definite HTTP answer leaves the jar uncertain until a later M1 rotated it away.
 */
export async function mintMediaSession(model: AppModel, transport: PairedTransport, kind: 'background' | 'recovery'): Promise<CallResult> {
  const s = state(model);
  if (s.revoking || (s.mintBlocked?.transport === transport && (s.mintBlocked.all || kind === 'background'))) return 'refused';
  try { transport.assertCurrent(); } catch { return 'unreachable'; } // nothing is sent for a stale transport
  const seq = ++s.mintSeq;
  s.mayHoldValue = true;
  const attempt = call(transport, MEDIA_SESSION_PATH, { method: 'POST', body: '{}' }).then(({ result, response }) => {
    if (!response && result !== 'unauthorized') s.uncertainAfter = s.mintSeq;
    else if (result === 'ok' && s.uncertainAfter !== null && seq > s.uncertainAfter) s.uncertainAfter = null;
    return result;
  });
  s.mints.add(attempt);
  try { return await attempt; } finally { s.mints.delete(attempt); }
}

/** Bounded wait for every outstanding M1; true when all settled. No new M1 starts while an M2 runs. */
async function settleMints(s: State): Promise<boolean> {
  const deadline = Date.now() + MINT_DRAIN_MS;
  while (s.mints.size > 0) {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled([...s.mints]), new Promise<void>(resolve => { timer = setTimeout(resolve, left); })]);
    clearTimeout(timer);
  }
  return true;
}

export async function refreshMediaStorage(model: AppModel, transport: PairedTransport, mediaId: string): Promise<ServerStorage | 'unauthorized' | 'unreachable' | 'refused'> {
  const { result, response } = await call(transport, `/api/media/${mediaId}/storage`, { method: 'GET' });
  if (result === 'unauthorized' && state(model).origin === transport.origin) state(model).pairingLost = true;
  if (result !== 'ok') return result;
  let body: Record<string, unknown>;
  try { body = await response!.json() as Record<string, unknown>; } catch { return 'refused'; }
  const s = state(model);
  if (s.origin !== transport.origin) return 'refused';
  const parsed: ServerStorage | undefined = body.state === 'none' || body.state === 'bytes-missing' ? { state: body.state }
    : body.state === 'complete' && Number.isSafeInteger(body.sizeBytes) && typeof body.mimeType === 'string' ? { state: 'complete', sizeBytes: body.sizeBytes as number, mimeType: body.mimeType } : undefined;
  if (!parsed) return 'refused';
  s.unreachable = false;
  s.storage.set(mediaId, parsed);
  return parsed;
}

/** Non-blocking M3 for the current media when no local object URL exists (no network when one does). */
export function ensureServerMediaStorage(model: AppModel, rerender: () => void): void {
  const s = state(model);
  s.rerender = rerender;
  const media = model.currentMedia;
  if (!media || model.browserLocalMedia.objectUrl) return;
  const transport = serverTransport(model);
  // No retry loop: one M3 per media per pairing (reconnect resets), and none while the service is unreachable.
  if (!transport || s.unreachable || s.storage.has(media.id) || s.inflight.has(media.id) || s.attempted.has(media.id)) return;
  s.attempted.add(media.id);
  const work = (async () => {
    await s.ready;
    const result = await refreshMediaStorage(model, transport, media.id);
    if (result === 'unreachable') s.unreachable = true;
  })().finally(() => { s.inflight.delete(media.id); if (model.currentMedia?.id === media.id) s.rerender?.(); });
  s.inflight.set(media.id, work);
}

/**
 * Called by connectLocalService after a status OK. Facts are bound to this pairing origin; in the same-origin
 * profile with managed media available, mint (M1) and then refresh the current media (M3), without blocking connect.
 */
export function noteServerMediaStatus(model: AppModel, transport: PairedTransport, status: Record<string, unknown>): Promise<void> | undefined {
  const s = state(model);
  s.origin = transport.origin;
  s.available = (status.managedMedia as { available?: unknown } | undefined)?.available === true;
  s.storage.clear(); s.attempted.clear(); s.unreachable = false; s.pairingLost = false;
  if (!s.available || transport.origin !== pageOrigin()) return undefined;
  const minting = (async () => {
    const minted = await mintMediaSession(model, transport, 'background');
    if (minted !== 'ok') return;
    renewServerPlayback(model);
  })();
  s.ready = minting.catch(() => undefined);
  // The rendered stage then runs M3 (ensureServerMediaStorage) after the mint has settled.
  return minting.finally(() => s.rerender?.());
}

/** After a fresh mint: an errored server <video> for the current media reloads once with the new cookie. */
function renewServerPlayback(model: AppModel): void {
  const s = state(model);
  const video = s.video;
  if (!video || !video.element.isConnected || model.currentMedia?.id !== video.mediaId) return;
  const error = model.player.mediaError;
  if (!error || error.mediaId !== video.mediaId || error.source !== video.source) return;
  s.remintUsed.delete(`${video.mediaId}\u0000${video.source}`);
  model.player.mediaError = null;
  try { video.element.load(); } catch { /* jsdom */ }
}

export function registerServerVideo(model: AppModel, element: HTMLVideoElement, mediaId: string, source: string): void {
  state(model).video = { element, mediaId, source };
}
/** Verified playback (time advanced while playing, not merely metadata) ends the error sequence: a later failure may
 *  re-mint once again. Metadata alone must not reset it, or a metadata-readable undecodable file loops M1/load(). */
export function noteServerPlaybackHealthy(model: AppModel, mediaId: string, source: string): void {
  state(model).remintUsed.delete(`${mediaId}\u0000${source}`);
}

function finalMessage(code: number): string {
  if (code === 2) return SERVER_NETWORK;
  if (code === 1) return SERVER_ABORTED;
  return SERVER_UNDECODABLE;
}

/**
 * Design §5.6: a native <video> request never reaches the transport's 401 handling, so an auth failure looks like a
 * codec failure. checking-access -> M3 -> (401: pair again | missing | unreachable | complete -> one M1 -> load()).
 * At most one re-mint per media, source and error sequence; a second error reports the code honestly.
 */
export async function recoverServerPlayback(model: AppModel, video: HTMLVideoElement, error: Readonly<{ mediaId: string; source: string; code: number }>, rerender: () => void): Promise<void> {
  const s = state(model);
  const key = `${error.mediaId}\u0000${error.source}`;
  if (s.recovering.has(key)) return;
  const stillCurrent = () => model.currentMedia?.id === error.mediaId && currentPlaybackSource(model)?.kind === 'server'
    && (currentPlaybackSource(model) as { src: string }).src === error.source;
  const show = (message: string) => { model.player.mediaError = { mediaId: error.mediaId, source: error.source, code: error.code, message }; model.player.isPlaying = false; rerender(); };
  if (s.remintUsed.has(key)) { show(finalMessage(error.code)); return; }
  s.recovering.add(key);
  try {
    show(CHECKING_ACCESS);
    const transport = serverTransport(model);
    if (!transport) { show(PAIR_AGAIN_MEDIA); return; }
    const storage = await refreshMediaStorage(model, transport, error.mediaId);
    if (storage === 'unauthorized') { show(PAIR_AGAIN_MEDIA); return; }
    if (storage === 'unreachable') { s.unreachable = true; show(MANAGED_UNREACHABLE); return; }
    if (storage === 'refused') { show(SERVER_REFUSED); return; }
    if (storage.state !== 'complete') { model.player.mediaError = null; rerender(); return; }
    if (!stillCurrent()) return;
    const minted = await mintMediaSession(model, transport, 'recovery');
    if (minted === 'unauthorized') { s.pairingLost = true; show(PAIR_AGAIN_MEDIA); return; }
    if (minted === 'unreachable') { s.unreachable = true; show(MANAGED_UNREACHABLE); return; }
    if (minted === 'refused') { show(SERVER_REFUSED); return; }
    if (!stillCurrent()) return;
    s.remintUsed.add(key);
    // Clear the recorded error first, so the stage's repeat-error check cannot swallow the next failure.
    model.player.mediaError = null;
    rerender();
    try { video.load(); } catch { /* jsdom */ }
  } finally { s.recovering.delete(key); }
}

export type RevokeResult = 'revoked' | 'not-revoked' | 'not-applicable';
/**
 * M2 before Forget/Disconnect. Serialised with M1: concurrent callers share one M2, no M1 starts meanwhile, and every
 * outstanding M1 settles (bounded) BEFORE M2 is sent, so no later Set-Cookie can follow a confirmed revocation.
 * "revoked" needs a 204 with no unsettled or uncertain M1. A 401 is never proof: unready private delivery answers 401
 * without rotating anything, and so does a pairing already lost after a mint. A 404 (no managed library) or a
 * known-unavailable service means this process holds no media value.
 */
export function revokeMediaSession(model: AppModel, intent: 'disconnect' | 'forget' = 'disconnect'): Promise<RevokeResult> {
  const s = state(model);
  if (s.revoking) { if (intent === 'disconnect') s.revokeBlocksAll = true; return s.revoking; }
  s.revokeBlocksAll = intent === 'disconnect';
  let started: PairedTransport | undefined;
  try { started = capturedTransport(model, model.localService.baseUrl); } catch { /* judged after the drain */ }
  const revoking = (async (): Promise<RevokeResult> => {
    const settled = await settleMints(s);
    const sameOriginFacts = s.origin !== null && s.origin === pageOrigin() && s.available !== false;
    let transport: PairedTransport;
    try { transport = capturedTransport(model, model.localService.baseUrl); }
    catch { return sameOriginFacts && s.mayHoldValue ? 'not-revoked' : 'not-applicable'; }
    if (transport.origin !== pageOrigin() || s.origin !== transport.origin || s.available === false) return 'not-applicable';
    const { result, response } = await call(transport, MEDIA_SESSION_PATH, { method: 'DELETE' });
    if (result === 'refused' && response?.status === 404) return 'not-applicable';
    if (result !== 'ok' || response?.status !== 204) return 'not-revoked';
    if (!settled || s.uncertainAfter !== null) return 'not-revoked';
    s.mayHoldValue = false;
    s.remintUsed.clear();
    return 'revoked';
  })().finally(() => {
    if (started) s.mintBlocked = { transport: started, all: s.revokeBlocksAll === true };
    s.revoking = undefined;
  });
  s.revoking = revoking;
  return revoking;
}

/** Test/inspection seam: facts only (never a cookie or capability). */
export function serverMediaFacts(model: AppModel): Readonly<{ origin: string | null; available: boolean | null; storage: Record<string, ServerStorage>; unreachable: boolean }> {
  const s = state(model);
  return { origin: s.origin, available: s.available, storage: Object.fromEntries(s.storage), unreachable: s.unreachable };
}
