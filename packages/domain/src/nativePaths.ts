/** Lexical policy only: never establishes ownership, identity or physical locality. Browser safe. */
export type NativePlatform = 'win32' | 'linux';
export type NativePathPurpose = 'input-file' | 'output-file' | 'directory';
export type NativePathPolicy = Readonly<{ version: 1; platform: NativePlatform; fullyQualifiedOnly: true; uncAllowed: false }>;
export const NATIVE_PATH_COMPATIBILITY_MESSAGE = 'Native file jobs require a compatible local service path policy (version 1). Reconnect or update the local service.';

export function nativePathPolicy(platform: string): NativePathPolicy {
  if (platform !== 'win32' && platform !== 'linux') throw new TypeError('Unsupported native path platform.');
  return { version: 1, platform, fullyQualifiedOnly: true, uncAllowed: false };
}

export function readNativePathPolicy(value: unknown): NativePathPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  return p.version === 1 && (p.platform === 'win32' || p.platform === 'linux') && p.fullyQualifiedOnly === true && p.uncAllowed === false
    ? nativePathPolicy(p.platform) : null;
}

export function validateNativePath(value: unknown, platform: string, purpose: NativePathPurpose): string {
  const fail = (): never => { throw new TypeError(`${purpose} path must be a fully qualified absolute local path under native policy v1.`); };
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return fail();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return fail();
  let prefix: string;
  let parts: string[];
  let separator: string;
  if (platform === 'win32') {
    if (!/^[A-Za-z]:[\\/]/.test(value)) return fail();
    prefix = value.slice(0, 2);
    separator = '\\';
    parts = value.slice(3).split(/[\\/]+/);
    for (const part of parts) {
      if (part === '' || part === '.' || part === '..') continue;
      if (/[<>:"|?*]/.test(part) || /[ .]$/.test(part) || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(part)) return fail();
    }
    // File-picker display placeholders are not service paths.
    if (parts[0]?.toLowerCase() === 'fakepath') return fail();
  } else if (platform === 'linux') {
    if (!value.startsWith('/') || value.startsWith('//')) return fail();
    prefix = '';
    separator = '/';
    parts = value.slice(1).split('/');
  } else return fail();
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop();
    else normalized.push(part);
  }
  if (!normalized.length || (platform === 'win32' && normalized[0]?.toLowerCase() === 'fakepath')) return fail();
  return prefix + separator + normalized.join(separator);
}

export function isNativePath(value: unknown, policy: unknown, purpose: NativePathPurpose = 'input-file'): boolean {
  const capability = readNativePathPolicy(policy);
  if (!capability) return false;
  try { validateNativePath(value, capability.platform, purpose); return true; } catch { return false; }
}

export function requireServiceNativePath(value: unknown, policy: unknown, purpose: NativePathPurpose = 'input-file'): string {
  const capability = readNativePathPolicy(policy);
  if (!capability) throw new TypeError(NATIVE_PATH_COMPATIBILITY_MESSAGE);
  return validateNativePath(value, capability.platform, purpose);
}
