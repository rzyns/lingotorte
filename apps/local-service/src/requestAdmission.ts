import { timingSafeEqual } from 'node:crypto';
import { isIP, Socket } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** lt-elf: per-route body caps tighter than the gate-wide MAX_BODY_BYTES. */
export const ROUTE_BODY_LIMITS: Readonly<Record<string, number>> = Object.freeze({ '/api/language/morphology': 16 * 1024, '/api/language/gloss': 16 * 1024, '/api/export/anki': 4 * 1024 * 1024 });
export class AdmissionError extends Error {
  readonly status: number;
  constructor(status: number, message = 'Request rejected.') { super(message); this.status = status; }
}
export function canonicalOrigin(value: string): string {
  if (!/^http:\/\/[^/?#@\\\s]+$/.test(value)) throw new TypeError('Invalid exact HTTP origin configuration.');
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError('Invalid exact HTTP origin configuration.'); }
  const host = url.hostname;
  if (url.origin !== value || host.endsWith('.') || !host || host.includes('*')) throw new TypeError('Noncanonical HTTP origin.');
  if (host.startsWith('[')) {
    if (isIP(host.slice(1, -1)) !== 6) throw new TypeError('Invalid IPv6 origin.');
  } else if (isIP(host) !== 4 && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
    throw new TypeError('Invalid DNS origin.');
  }
  return value;
}
export function canonicalAuthority(value: string): string {
  if (!value || /[\s/@?#\\]/.test(value) || value.endsWith('.')) throw new AdmissionError(400);
  const match = /^(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/.exec(value);
  if (!match || (match[2] && Number(match[2]) > 65535)) throw new AdmissionError(400);
  const host = match[1]!.toLowerCase();
  const origin = `http://${host}${match[2] && match[2] !== '80' ? `:${match[2]}` : ''}`;
  try { canonicalOrigin(origin); } catch { throw new AdmissionError(400); }
  return new URL(origin).host;
}
export type AdmissionPolicy = Readonly<{
  authorities: readonly string[];
  origins: readonly string[];
  healthAuthority?: string;
  privateNetworkOrigins?: readonly string[];
  /** lt-192.4: M1-M4 exist only when a managed library is configured; otherwise those paths stay 404. */
  managedMedia?: boolean;
}>;
export function freezePolicy(origins: readonly string[], uiOrigins: readonly string[], healthAuthority?: string, pna: readonly string[] = [], options: { managedMedia?: boolean } = {}): AdmissionPolicy {
  if (!origins.length || !uiOrigins.length) throw new TypeError('Exact origins must be nonempty.');
  const publicOrigins = origins.map(canonicalOrigin);
  const allowedOrigins = uiOrigins.map(canonicalOrigin);
  if (pna.some(origin => !allowedOrigins.includes(canonicalOrigin(origin)))) throw new TypeError('Private-network origin must be explicitly allowed.');
  return Object.freeze({ authorities: Object.freeze(publicOrigins.map(origin => new URL(origin).host)),
    origins: Object.freeze(allowedOrigins), privateNetworkOrigins: Object.freeze([...pna]),
    ...(healthAuthority ? { healthAuthority: canonicalAuthority(healthAuthority) } : {}),
    ...(options.managedMedia ? { managedMedia: true } : {}) });
}
export function rawHeaders(request: IncomingMessage): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const key = request.rawHeaders[index]!.toLowerCase();
    fields.set(key, [...(fields.get(key) ?? []), request.rawHeaders[index + 1]!]);
  }
  // lt-192.4: cookie/range/if-range/sec-fetch-site join the raw duplicate rule on every route, whatever the credential.
  for (const key of ['host', 'origin', 'authorization', 'content-type', 'content-length', 'content-encoding',
    'access-control-request-method', 'access-control-request-headers', 'access-control-request-private-network',
    'cookie', 'range', 'if-range', 'sec-fetch-site']) {
    if ((fields.get(key)?.length ?? 0) > 1) throw new AdmissionError(400);
  }
  const origin = fields.get('origin')?.[0];
  if (origin !== undefined && origin !== 'null') {
    if (/[\s,]/.test(origin)) throw new AdmissionError(400);
    try { new URL(origin); } catch { throw new AdmissionError(400); }
  }
  return fields;
}
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
export const MEDIA_SESSION_ROUTE = '/api/media/session';
export const MEDIA_STORAGE_ROUTE = new RegExp(`^/api/media/(${uuid})/storage$`);
export const MEDIA_CONTENT_ROUTE = new RegExp(`^/api/media/(${uuid})/content$`);
export function routeMethods(path: string, managedMedia = false): readonly string[] | undefined {
  if (path === '/api/health' || path === '/api/status') return ['GET'];
  if (path === '/api/state') return ['GET', 'PUT'];
  if (path === '/api/restore/preview' || path === '/api/restore/commit') return ['POST'];
  if (path === '/api/learner/operations') return ['POST'];
  if (path === '/api/jobs' || path === '/api/artifacts/cleanup') return ['POST'];
  if (path === '/api/language/morphology' || path === '/api/language/gloss' || path === '/api/export/anki') return ['POST'];
  if (new RegExp(`^/api/jobs/${uuid}$`).test(path)) return ['GET'];
  if (new RegExp(`^/api/jobs/${uuid}/cancel$`).test(path)) return ['POST'];
  if (new RegExp(`^/api/snippets/${uuid}$`).test(path)) return ['GET', 'DELETE'];
  if (new RegExp(`^/api/media/${uuid}/transcripts$`).test(path)) return ['GET'];
  if (new RegExp(`^/api/tracks/${uuid}/transcript$`).test(path)) return ['PUT'];
  if (managedMedia) {
    if (path === MEDIA_SESSION_ROUTE) return ['POST', 'DELETE'];
    if (MEDIA_STORAGE_ROUTE.test(path)) return ['GET'];
    if (MEDIA_CONTENT_ROUTE.test(path)) return ['GET', 'HEAD'];
  }
  return undefined;
}
export type AdmittedRequest = Readonly<{ path: string; body?: Record<string, unknown>; preflight: boolean; credential?: 'bearer' | 'media-cookie' }>;
/** lt-192.4: the media cookie check, injected by the server only when a managed library is configured. */
export type MediaCookieChecker = Readonly<{ check(cookieHeader: string | undefined): 'absent' | 'valid' | 'invalid' }>;

function unauthorized(response: ServerResponse): never {
  response.setHeader('www-authenticate', 'Bearer realm="lingotorte-local"'); throw new AdmissionError(401, 'Pair again.');
}
async function bearerValid(auth: string | undefined, capability: Buffer, deliveryReady: () => Promise<boolean>): Promise<boolean> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(auth ?? '');
  const value = match ? Buffer.from(match[1]!, 'base64url') : Buffer.alloc(0);
  return value.length === 32 && value.toString('base64url') === match?.[1] && timingSafeEqual(value, capability) && await deliveryReady();
}

export async function admit(request: IncomingMessage, response: ServerResponse, policy: AdmissionPolicy,
  capability: Buffer, deliveryReady: () => Promise<boolean>, expectContinue = false, mediaSessions?: MediaCookieChecker): Promise<AdmittedRequest> {
  const fields = rawHeaders(request);
  if (fields.get('host')?.length !== 1) throw new AdmissionError(400);
  const host = canonicalAuthority(fields.get('host')![0]!);
  const path = request.url ?? '';
  if (!/^\/api\/[A-Za-z0-9/-]+$/.test(path) || /\/\//.test(path) || path.includes('/../') || path.includes('/./')) throw new AdmissionError(400);
  const health = path === '/api/health' && request.method === 'GET';
  if (!policy.authorities.includes(host) && !(health && host === policy.healthAuthority)) throw new AdmissionError(403);
  const origin = fields.get('origin')?.[0];
  if (origin !== undefined && !policy.origins.includes(origin)) throw new AdmissionError(403);
  response.setHeader('cache-control', 'no-store');
  if (origin !== undefined) { response.setHeader('access-control-allow-origin', origin); response.setHeader('vary', 'Origin'); }
  const methods = routeMethods(path, policy.managedMedia === true);
  if (!methods) throw new AdmissionError(404);
  const method = request.method ?? '';
  if (method !== 'OPTIONS' && !methods.includes(method)) {
    response.setHeader('allow', [...methods, 'OPTIONS'].join(', ')); throw new AdmissionError(405);
  }
  // lt-192.4: M1/M2 set or expire the app's own cookie; a present Origin must be this request's own exact origin.
  if (path === MEDIA_SESSION_ROUTE && origin !== undefined && origin !== `http://${host}`) throw new AdmissionError(403);
  let credential: AdmittedRequest['credential'];
  const mediaContent = policy.managedMedia === true && (method === 'GET' || method === 'HEAD') && MEDIA_CONTENT_ROUTE.test(path);
  if (mediaContent) {
    // lt-192.4, M4 only: Fetch Metadata before either credential; a bearer never exempts a request from it.
    const site = fields.get('sec-fetch-site')?.[0];
    if (site !== undefined && site !== 'same-origin') throw new AdmissionError(403);
  }
  if (method !== 'OPTIONS' && !health) {
    const auth = fields.get('authorization');
    if (auth !== undefined || !mediaContent) {
      // A present Authorization alone decides; an invalid one is 401 and never falls back to the cookie.
      if (!await bearerValid(auth?.[0], capability, deliveryReady)) unauthorized(response);
      credential = 'bearer';
    } else {
      // Only an absent Authorization consults the media cookie (exactly one valid lt_media pair).
      if (mediaSessions?.check(fields.get('cookie')?.[0]) !== 'valid' || !await deliveryReady()) unauthorized(response);
      credential = 'media-cookie';
    }
  }
  if (fields.has('content-encoding')) throw new AdmissionError(415);
  const json = method === 'POST' || method === 'PUT';
  const type = fields.get('content-type')?.[0];
  if (json ? !/^\s*application\/json\s*(?:;\s*charset\s*=\s*(?:utf-8|"utf-8")\s*)?$/i.test(type ?? '') : type !== undefined) throw new AdmissionError(415);
  if (!json && (fields.has('transfer-encoding') || (fields.has('content-length') && fields.get('content-length')![0] !== '0'))) throw new AdmissionError(400);
  if (method === 'OPTIONS') {
    const requested = fields.get('access-control-request-method')?.[0];
    if (!origin || !requested) throw new AdmissionError(400);
    if (!methods.includes(requested)) throw new AdmissionError(403);
    const headerText = fields.get('access-control-request-headers')?.[0] ?? '';
    const headers = headerText ? headerText.split(',').map(value => value.trim().toLowerCase()) : [];
    if (headers.some(value => !/^[a-z-]+$/.test(value)) || new Set(headers).size !== headers.length) throw new AdmissionError(400);
    if (headers.some(value => !['authorization', 'content-type'].includes(value)) ||
      (path !== '/api/health' && !headers.includes('authorization')) ||
      (['PUT', 'POST'].includes(requested) && !headers.includes('content-type'))) throw new AdmissionError(403);
    const pna = fields.get('access-control-request-private-network')?.[0];
    if (pna !== undefined && pna !== 'true') throw new AdmissionError(400);
    if (pna === 'true' && !policy.privateNetworkOrigins?.includes(origin)) throw new AdmissionError(403);
    response.setHeader('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network');
    response.setHeader('access-control-allow-methods', requested);
    if (headers.length) response.setHeader('access-control-allow-headers', headers.join(', '));
    if (pna === 'true') response.setHeader('access-control-allow-private-network', 'true');
    return { path, preflight: true };
  }
  if (!json) return { path, preflight: false, ...(credential ? { credential } : {}) };
  const limit = ROUTE_BODY_LIMITS[path] ?? MAX_BODY_BYTES;
  if (Number(fields.get('content-length')?.[0] ?? 0) > limit) throw new AdmissionError(413);
  if (expectContinue) response.writeContinue();
  const chunks = await readBoundedBody(request, limit);
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new AdmissionError(400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdmissionError(400);
  if ((path.endsWith('/cancel') || path === '/api/artifacts/cleanup' || path === MEDIA_SESSION_ROUTE) && Object.keys(body).length) throw new AdmissionError(400);
  return { path, body: body as Record<string, unknown>, preflight: false, ...(credential ? { credential } : {}) };
}
// lt-04k.1: bounded read that never destroys the request on overflow (an async-iterator throw would
// destroy the IncomingMessage and its socket, resetting the connection before the 413 is delivered).
// On overflow the stream is paused with listeners removed; deny() then discards the remainder.
function readBoundedBody(request: IncomingMessage, limit: number): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0; let settled = false;
    const done = (error?: unknown) => {
      if (settled) return; settled = true;
      request.off('data', onData); request.off('end', onEnd); request.off('error', onError); request.off('close', onClose);
      if (error) { request.pause(); reject(error); } else resolve(chunks);
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) done(new AdmissionError(413)); else chunks.push(bytes);
    };
    const onEnd = () => done(); const onError = (error: unknown) => done(error);
    // Client aborted mid-body ('aborted' always precedes 'close'): reject like the former async
    // iterator did (ERR_STREAM_PREMATURE_CLOSE, a non-AdmissionError, which deny() maps to 400).
    const onClose = () => { if (!request.complete) done(Object.assign(new Error('Premature close'), { code: 'ERR_STREAM_PREMATURE_CLOSE' })); };
    request.on('data', onData); request.once('end', onEnd); request.once('error', onError); request.once('close', onClose);
  });
}
/** lt-04k.1: bounded lingering close for denials sent before the request body was consumed. */
export const DENIAL_LINGER_MS = 2_000;
/** Byte cap for body-limit (413) denials; must exceed realistic oversized uploads (lt2t4 sends 30 MiB). */
export const DENIAL_LINGER_BYTES = 64 * 1024 * 1024;
/** Smaller byte cap for header-stage denials (400/401/403/404/405/415): those clients sent no admissible body. */
export const DENIAL_LINGER_HEADER_STAGE_BYTES = 8 * 1024 * 1024;
export type DenialLinger = Readonly<{ ms: number; bytes: number; headerStageBytes: number; sockets?: Set<Socket> }>;
const DEFAULT_LINGER: DenialLinger = Object.freeze({ ms: DENIAL_LINGER_MS, bytes: DENIAL_LINGER_BYTES, headerStageBytes: DENIAL_LINGER_HEADER_STAGE_BYTES });
// Closing a socket with unread inbound bytes sends RST; on Windows the RST also discards the
// already-delivered denial from the client's receive buffer (ECONNRESET instead of e.g. 413).
// Half-close after the denial and discard (never buffer or parse) the remainder at the transport
// level, bounded by time and bytes, then destroy. No handler runs; no application state is touched.
// Design: linger applies to every denial with an unread body, including header-stage ones (an
// unauthenticated client gets at most ms/headerStageBytes of discard per socket). There is no
// separate linger concurrency cap: the server's existing bounds apply (headersTimeout 10s,
// requestTimeout/timeout 15s; maxConnections is not set), and each lingering socket is bounded
// by wall clock, so the linger adds no more exposure than a slow request already has. Limits are
// code constants (tests may pass smaller ones); nothing derived from the request selects them.
// Sockets are registered in `sockets` (when given) so service shutdown can destroy them promptly.
function lingerUnreadBody(response: ServerResponse, byteCap: number, linger: DenialLinger): void {
  const request = response.req; const socket = response.socket;
  if (!request || request.complete || !socket || socket.destroyed) return;
  let discarded = 0;
  const stop = () => { clearTimeout(timer); socket.destroy(); };
  const timer = setTimeout(stop, linger.ms); timer.unref();
  linger.sockets?.add(socket);
  socket.once('close', () => { clearTimeout(timer); linger.sockets?.delete(socket); });
  // Node's HTTP server calls socket.destroySoon() after a `connection: close` response, which would
  // destroy the socket with the unread body still inbound (RST). Overriding it relies on Node HTTP
  // internals; if a future Node stops calling destroySoon, this override is simply unused and the
  // server falls back to its own close (an immediate close/RST, i.e. the pre-fix behavior) while the
  // timer/byte bounds still destroy the socket: it fails safe, never leaks an unbounded socket.
  // lingerUsesDestroySoon() lets tests detect the dependency disappearing.
  socket.destroySoon = () => { if (socket.writable) socket.end(); };
  request.on('data', (chunk: Buffer) => { discarded += chunk.length; if (discarded > byteCap) stop(); });
  request.once('end', () => { if (socket.writableFinished) stop(); else socket.once('finish', stop); });
  request.once('error', stop);
  request.resume();
}
/** Test hook: true while Node's net.Socket still exposes the destroySoon the linger overrides. */
export function lingerUsesDestroySoon(): boolean { return typeof (Socket.prototype as { destroySoon?: unknown }).destroySoon === 'function'; }
export function deny(response: ServerResponse, error: unknown, linger: DenialLinger = DEFAULT_LINGER): void {
  const status = error instanceof AdmissionError ? error.status : 400;
  lingerUnreadBody(response, status === 413 ? linger.bytes : linger.headerStageBytes, linger);
  response.setHeader('connection', 'close');
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  // lt-192.4 (RFC 9110 §9.3.2): a HEAD response never carries content, whatever the status.
  response.end(response.req?.method === 'HEAD' ? undefined : JSON.stringify({ ok: false, error: status === 401 ? 'Pair again.' : 'Request rejected.' }));
}
