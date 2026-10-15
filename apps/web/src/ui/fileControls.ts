// lt-dlf.8: app-styled file controls and subtitle auto-assignment.

/**
 * N5: hides a native file input visually (it stays in the DOM, focusable and keyboard-operable, so
 * setInputFiles/CDP still work) and shows an app-styled button label plus the chosen file name.
 * The browser-language "Choose file"/"Wybierz plik" text never renders.
 */
export function renderFilePicker(input: HTMLInputElement, buttonText: string): HTMLElement {
  input.classList.add('file-input-hidden');
  const wrap = document.createElement('div');
  wrap.className = 'file-picker';
  const button = document.createElement('label');
  button.className = 'file-picker-button';
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

/**
 * Task A: assign picked subtitle files to roles. One file is the target track. Two files are assigned
 * only when filename language/role tags (e.g. .pl/.en, .target/.native) identify exactly one target and one native file; otherwise the
 * result is ambiguous and nothing is guessed.
 */
export function assignSubtitleFiles(files: readonly File[], targetLanguage: string, nativeLanguage: string): SubtitleAssignment {
  if (files.length === 0) return { target: null, native: null, ambiguous: false };
  if (files.length === 1) return { target: files[0]!, native: null, ambiguous: false };
  if (files.length > 2) return { target: null, native: null, ambiguous: true };
  const [a, b] = files as [File, File];
  // Explicit role tags (.target/.native) win over language words, which can appear in both names.
  const aRole = roleTag(a.name);
  const bRole = roleTag(b.name);
  if (aRole && bRole && aRole !== bRole) return aRole === 'target' ? { target: a, native: b, ambiguous: false } : { target: b, native: a, ambiguous: false };
  const aTarget = matchesLanguage(a.name, targetLanguage, 'target');
  const aNative = matchesLanguage(a.name, nativeLanguage, 'native');
  const bTarget = matchesLanguage(b.name, targetLanguage, 'target');
  const bNative = matchesLanguage(b.name, nativeLanguage, 'native');
  if (aTarget && !aNative && bNative && !bTarget) return { target: a, native: b, ambiguous: false };
  if (bTarget && !bNative && aNative && !aTarget) return { target: b, native: a, ambiguous: false };
  if (aTarget && !aNative && !bTarget) return { target: a, native: b, ambiguous: false };
  if (bTarget && !bNative && !aTarget) return { target: b, native: a, ambiguous: false };
  return { target: null, native: null, ambiguous: true };
}
