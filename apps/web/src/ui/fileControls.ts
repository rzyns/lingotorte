// lt-dlf.8: app-styled file controls and subtitle auto-assignment.

/**
 * N5: hides a native file input visually (it stays in the DOM, focusable and keyboard-operable, so
 * setInputFiles/CDP still work) and shows an app-styled button label plus the chosen file name.
 * The browser-language "Choose file"/"Wybierz plik" text never renders.
 */
export type FilePickerVariant = 'default' | 'primary' | 'secondary';

export function renderFilePicker(input: HTMLInputElement, buttonText: string, variant: FilePickerVariant = 'default'): HTMLElement {
  input.classList.add('file-input-hidden');
  const wrap = document.createElement('div');
  wrap.className = 'file-picker';
  const button = document.createElement('label');
  // lt-dlf.12: primary/secondary variants rank competing pickers (e.g. the two video paths).
  button.className = variant === 'default' ? 'file-picker-button' : `file-picker-button file-picker-button-${variant}`;
  if (input.id) button.htmlFor = input.id;
  button.textContent = buttonText;
  button.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'file-picker-name';
  name.setAttribute('aria-live', 'polite');
  const sync = (): void => {
    const files = Array.from(input.files ?? []);
    name.textContent = files.length ? files.map((file) => file.name).join(', ') : 'No file chosen';
  };
  sync();
  input.addEventListener('change', sync);
  wrap.append(input, button, name);
  return wrap;
}

export type SubtitleAssignment = Readonly<{
  target: File | null;
  native: File | null;
  /** True when files were picked but roles could not be decided safely. */
  ambiguous: boolean;
}>;

const LANGUAGE_WORDS: Readonly<Record<string, readonly string[]>> = {
  pl: ['pl', 'pol', 'polish', 'polski'],
  en: ['en', 'eng', 'english'],
  de: ['de', 'deu', 'ger', 'german', 'deutsch'],
  es: ['es', 'spa', 'spanish', 'espanol'],
  fr: ['fr', 'fra', 'fre', 'french', 'francais'],
  it: ['it', 'ita', 'italian', 'italiano'],
};

function languageTags(fileName: string): Set<string> {
  const stem = fileName.toLocaleLowerCase('en').replace(/\.[^.]+$/, '');
  return new Set(stem.split(/[^a-z]+/).filter(Boolean));
}

function roleTag(fileName: string): 'target' | 'native' | null {
  const tags = languageTags(fileName);
  if (tags.has('target') === tags.has('native')) return null;
  return tags.has('target') ? 'target' : 'native';
}

function matchesLanguage(fileName: string, language: string, roleWord: 'target' | 'native'): boolean {
  const words = [...(LANGUAGE_WORDS[language.toLocaleLowerCase('en')] ?? [language.toLocaleLowerCase('en')]), roleWord];
  const tags = languageTags(fileName);
  return words.some((word) => tags.has(word));
}

type SubtitleRole = 'target' | 'native' | null;

/** Positively identifies one file's role: an explicit .target/.native tag wins, else exactly one language match. */
function identifyRole(fileName: string, targetLanguage: string, nativeLanguage: string): SubtitleRole {
  const explicit = roleTag(fileName);
  if (explicit) return explicit;
  const isTarget = matchesLanguage(fileName, targetLanguage, 'target');
  const isNative = matchesLanguage(fileName, nativeLanguage, 'native');
  if (isTarget === isNative) return null;
  return isTarget ? 'target' : 'native';
}

/**
 * Task A: assign picked subtitle files to roles. Nothing is guessed:
 * - one file becomes the target track unless its name positively identifies it as native
 *   (e.g. movie.en.srt, movie.native.srt); then it is ambiguous so the user places it with the per-role inputs
 *   rather than importing a native-only track as the target;
 * - two files are assigned only when BOTH are positively identified with opposite roles (.pl + .en,
 *   .target + .native). Same tags, an unrecognised tag (movie.pl.srt + movie.de.srt) or an untagged file is ambiguous;
 * - three or more files are ambiguous.
 */
export function assignSubtitleFiles(files: readonly File[], targetLanguage: string, nativeLanguage: string): SubtitleAssignment {
  if (files.length === 0) return { target: null, native: null, ambiguous: false };
  if (files.length === 1) {
    const only = files[0]!;
    return identifyRole(only.name, targetLanguage, nativeLanguage) === 'native'
      ? { target: null, native: null, ambiguous: true }
      : { target: only, native: null, ambiguous: false };
  }
  if (files.length > 2) return { target: null, native: null, ambiguous: true };
  const [a, b] = files as [File, File];
  const aRole = identifyRole(a.name, targetLanguage, nativeLanguage);
  const bRole = identifyRole(b.name, targetLanguage, nativeLanguage);
  if (aRole === 'target' && bRole === 'native') return { target: a, native: b, ambiguous: false };
  if (aRole === 'native' && bRole === 'target') return { target: b, native: a, ambiguous: false };
  return { target: null, native: null, ambiguous: true };
}
