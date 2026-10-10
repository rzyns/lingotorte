import { describe, expect, it } from 'vitest';
import { win32, posix } from 'node:path';
import { isNativePath, nativePathPolicy, readNativePathPolicy, validateNativePath, type NativePathPurpose } from '../../packages/domain/src/nativePaths.ts';

const purposes: NativePathPurpose[] = ['input-file', 'output-file', 'directory'];
const commonRejected: unknown[] = ['', ' ', null, {}, ':memory:', 'clip.mp4', './clip.mp4', '../clip.mp4', 'C:clip.mp4', 'C:', 'C:../clip.mp4', '\\clip.mp4', '/', '//server/share/clip.mp4', '\\\\server\\share\\clip.mp4', '\\\\?\\C:\\clip.mp4', '\\\\?\\UNC\\server\\share\\clip.mp4', '\\\\.\\C:\\clip.mp4', '~/clip.mp4', '~other/clip.mp4', '$HOME/clip.mp4', '%USERPROFILE%\\clip.mp4', 'file:///C:/Media/clip.mp4', 'file:///media/clip.mp4', 'https://example.invalid/clip.mp4', 'http://127.0.0.1:5173/fixture.webm', 'blob:http://127.0.0.1:5173/id', 'data:video/webm;base64,...', 'browser-file-handle:clip.mp4', 'fixtures/media/clip.webm'];
const windowsAccepted = ['C:\\Synthetic Media\\żółć.mp4', 'C:/Synthetic Media/żółć.mp4', 'D:/fixture outputs/state.db', 'C:/Media/part/../clip.mp4', 'C:/Media//./clip.mp4', 'c:/media/COM10.mp4'];
const linuxAccepted = ['/home/test/Media/żółć.mp4', '/media/a:b.mp4', '/media/part/../clip.mp4', '/clip.mp4', '/c/Media/clip.mp4', '/mnt/c/Media/clip.mp4', '/media//./clip.mp4', '/media/a\\b.mp4', '/media/NUL.mp4'];
const windowsRejected = ['/clip.mp4', '/c/Media/clip.mp4', '/mnt/c/Media/clip.mp4', 'C:\\', 'C:/', 'C:/Media/../', 'C:/Media/clip.mp4:stream', 'C:/Media/NUL.mp4', 'C:/Media/clip.', 'C:/Media/part /file', 'C:/Media/part./file', 'C:/fakepath/clip.mp4', 'C:/Media/<clip>.mp4', 'C:/Media/a|b.mp4', 'C:/Media/a?b.mp4', 'C:/Media/a*b.mp4', 'C:/Media/a"b.mp4', ...['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM9', 'LPT1', 'LPT9', 'COM¹', 'COM²', 'LPT³'].map((name) => `C:/Media/${name.toLowerCase()}.mp4`)];

for (const platform of ['win32', 'linux'] as const) {
  for (const purpose of purposes) {
    describe(`${platform} ${purpose} shared lexical matrix`, () => {
      const valid = platform === 'win32' ? windowsAccepted : linuxAccepted;
      it.each(valid)('accepts and normalizes %s without I/O', (value) => {
        expect(validateNativePath(value, platform, purpose)).toBe((platform === 'win32' ? win32 : posix).normalize(value));
        expect(isNativePath(value, nativePathPolicy(platform), purpose)).toBe(true);
      });
      const rejected = [...commonRejected, ...(platform === 'win32' ? [...windowsRejected, ...linuxAccepted] : [...windowsAccepted, ...windowsRejected.filter((v) => !v.startsWith('/')), '/media/..'])];
      it.each(rejected)('rejects raw %j before normalization', (value) => {
        expect(() => validateNativePath(value, platform, purpose)).toThrow(/path/);
        expect(isNativePath(value, nativePathPolicy(platform), purpose)).toBe(false);
      });
      it.each([' ', '\n', '\u0000', '\u007f'])('rejects whitespace/control %j', (extra) => {
        expect(() => validateNativePath(extra + valid[0], platform, purpose)).toThrow();
        expect(() => validateNativePath(valid[0] + extra, platform, purpose)).toThrow();
      });
      it('rejects shell quotes and normalized root', () => {
        expect(() => validateNativePath(`"${valid[0]}"`, platform, purpose)).toThrow();
        expect(() => validateNativePath(`'${valid[0]}'`, platform, purpose)).toThrow();
      });
    });
  }
}

describe('versioned service capability', () => {
  it.each([undefined, null, {}, { version: 2, platform: 'win32', fullyQualifiedOnly: true, uncAllowed: false }, { version: 1, platform: 'darwin', fullyQualifiedOnly: true, uncAllowed: false }, { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: true }])('fails closed for %j', (value) => {
    expect(readNativePathPolicy(value)).toBeNull();
    expect(isNativePath('C:/Media/clip.mp4', value)).toBe(false);
  });
});
