// lt-dlf.8 H10: keyboard shortcut help overlay, opened by a '?' button or the '?' key.
// The list mirrors the keydown handlers in appShell.ts (Player) and views/review.ts (Review).

export const SHORTCUT_HELP: ReadonlyArray<Readonly<{ section: string; items: ReadonlyArray<readonly [string, string]> }>> = [
  {
    section: 'Player',
    items: [
      ['Space', 'Play / pause'],
      ['[', 'Previous line'],
      [']', 'Next line'],
      ['R', 'Replay current line'],
      [',', 'Slower'],
      ['.', 'Faster'],
    ],
  },
  {
    section: 'Review',
    items: [
      ['Space', 'Show answer'],
      ['1 – 4', 'Rate: Again, Hard, Good, Easy'],
    ],
  },
  { section: 'Anywhere', items: [['?', 'Show this help'], ['Esc', 'Close this help']] },
];

let opener: HTMLElement | null = null;

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  dialog.remove();
  const back = opener;
  opener = null;
  if (back && back.isConnected) {
    back.focus();
    return;
  }
  // The opener was re-rendered away: focus a stable fallback rather than dropping focus to <body>.
  const button = document.querySelector<HTMLElement>('.shortcut-help-button');
  if (button) {
    button.focus();
    return;
  }
  const landmark = document.querySelector<HTMLElement>('h1') ?? document.querySelector<HTMLElement>('main');
  if (!landmark) return;
  if (!landmark.hasAttribute('tabindex')) {
    landmark.setAttribute('tabindex', '-1');
    landmark.addEventListener('blur', () => landmark.removeAttribute('tabindex'), { once: true });
  }
  landmark.focus();
}

export function isShortcutHelpOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('dialog.shortcut-help') !== null;
}

export function openShortcutHelp(from: HTMLElement | null): void {
  if (isShortcutHelpOpen()) return;
  opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dialog = document.createElement('dialog') as HTMLDialogElement;
  dialog.className = 'shortcut-help';
  dialog.setAttribute('aria-labelledby', 'shortcut-help-title');
  const title = document.createElement('h2');
  title.id = 'shortcut-help-title';
  title.textContent = 'Keyboard shortcuts';
  dialog.appendChild(title);
  for (const group of SHORTCUT_HELP) {
    const heading = document.createElement('h3');
    heading.textContent = group.section;
    const list = document.createElement('dl');
    list.className = 'shortcut-help-list';
    for (const [key, action] of group.items) {
      const dt = document.createElement('dt');
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      dt.appendChild(kbd);
      const dd = document.createElement('dd');
      dd.textContent = action;
      list.append(dt, dd);
    }
    dialog.append(heading, list);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn-secondary shortcut-help-close';
  close.textContent = 'Close';
  close.addEventListener('click', () => closeDialog(dialog));
  dialog.appendChild(close);
  dialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog(dialog);
    }
  });
  // Native Esc on a modal dialog fires `cancel`; route it through the same focus-restoring close.
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); });
  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  close.focus();
}

export function renderShortcutHelpButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shortcut-help-button';
  button.textContent = '?';
  button.setAttribute('aria-label', 'Show keyboard shortcuts');
  button.setAttribute('aria-keyshortcuts', 'Shift+Slash');
  button.addEventListener('click', () => openShortcutHelp(button));
  return button;
}
