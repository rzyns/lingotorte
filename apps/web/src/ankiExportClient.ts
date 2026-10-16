// lt-dxo: client for POST /api/export/anki through the paired transport. Returns the .apkg bytes or a typed, redacted failure.
import { ANKI_MAX_NOTES, type AnkiNoteRow } from '@lingotorte/domain';
import { PairingRequiredError, type PairedTransport } from './pairedTransport.ts';

export type AnkiPackageResult =
  | Readonly<{ status: 'ok'; bytes: ArrayBuffer }>
  | Readonly<{ status: 'unavailable'; reason: 'not-paired' | 'service-unreachable' }>
  | Readonly<{ status: 'error'; code: 'rejected' | 'invalid-response' | 'invalid-request' | 'failed' }>;

export async function requestAnkiPackage(transport: PairedTransport | null | undefined, notes: readonly AnkiNoteRow[], fetchImpl?: typeof fetch): Promise<AnkiPackageResult> {
  if (!transport) return { status: 'unavailable', reason: 'not-paired' };
  if (notes.length === 0 || notes.length > ANKI_MAX_NOTES) return { status: 'error', code: 'invalid-request' };
  let response: Response;
  try {
    response = await transport.request('/api/export/anki', { method: 'POST', body: JSON.stringify({ notes }) }, fetchImpl);
  } catch (error) {
    if (error instanceof PairingRequiredError) return { status: 'unavailable', reason: 'not-paired' };
    return { status: 'unavailable', reason: 'service-unreachable' };
  }
  if (response.status === 404) return { status: 'unavailable', reason: 'service-unreachable' };
  if (response.status === 400 || response.status === 413) return { status: 'error', code: 'rejected' };
  if (!response.ok) return { status: 'error', code: 'failed' };
  let bytes: ArrayBuffer;
  try { bytes = await response.arrayBuffer(); } catch { return { status: 'error', code: 'invalid-response' }; }
  // A zip starts with the local-file-header signature PK\x03\x04.
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) return { status: 'error', code: 'invalid-response' };
  return { status: 'ok', bytes };
}

export function ankiPackageMessage(result: Exclude<AnkiPackageResult, { status: 'ok' }>): string {
  if (result.status === 'unavailable') return result.reason === 'not-paired'
    ? 'Anki package needs a paired local service. Pair it in Settings, or download the Anki text file instead.'
    : 'Local service unreachable. Try again, or download the Anki text file instead.';
  if (result.code === 'rejected' || result.code === 'invalid-request') return 'The local service rejected the Anki export (too many notes or a field too long).';
  return 'Anki package export failed. Nothing was downloaded.';
}
