import type { AppModel } from '../uiTypes';
import {
  connectLocalService,
  pairLocalService,
  resolveLocalServiceConnection,
  saveModelToLocalService,
  setLocalServiceAutosave,
  setLocalServiceBaseUrl,
} from '../model';
import { rerenderApp } from '../appShell.ts';
import {
  REMEMBERED_PAIRING_NOTE,
  REMEMBER_PAIRING_LABEL,
  REMEMBER_PAIRING_NEXT_CONNECT_HINT,
  forgetRememberedPairing,
  noteExplicitPairing,
  pairingIsRemembered,
  rememberPairingOptedIn,
  setRememberPairingOptIn,
} from '../rememberedPairing.ts';
import { clearSnapshotCache, suspendSnapshotCacheWrites, type SnapshotCacheBackend } from '../browserSnapshotCache.ts';

export const CLEAR_CACHE_BUTTON_LABEL = "Clear this browser's cached state";
export const CLEAR_CACHE_EXPLANATION = "Removes the copy of your saved words, transcripts, review progress and connection preferences that this browser keeps so a reload can show your last work. Nothing stored in the local service is deleted, and remembered pairing and remembered video files are not affected. The page reloads afterwards; reconnect to the local service to load your saved state.";
export const CLEAR_CACHE_CONFIRM_TEXT = 'Clear the cached copy in this browser and reload the page?';
export const CLEAR_CACHE_UNSAVED_WARNING = 'You have changes that are not yet saved to the local service. Clearing will lose them permanently. Use “Save state now” first to keep them.';
export const CLEAR_CACHE_CONFIRM_LABEL = 'Yes, clear it';
export const CLEAR_CACHE_DONE_MESSAGE = "Cleared this browser's cached state. Reloading…";
export const CLEAR_CACHE_FAILED_MESSAGE = "Could not clear this browser's cached state (browser storage unavailable). Nothing was changed in the local service. Browser caching is paused until you reload the page.";

/** Injection points for tests; production uses IndexedDB and a real page reload. */
export const clearCacheDeps: { backend: SnapshotCacheBackend | null | undefined; reload: () => void } = {
  backend: undefined,
  reload: () => window.location.reload(),
};

type ClearPhase = 'idle' | 'confirm' | 'clearing' | 'done' | 'failed';
const clearPhase = new WeakMap<AppModel, ClearPhase>();

function hasUnsavedServiceChanges(model: AppModel): boolean {
  return ['unsaved', 'saving', 'choice', 'conflict', 'error'].includes(model.localService.syncState ?? '');
}

function renderClearCachePanel(model: AppModel): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'clear-cache-panel';
  panel.dataset.clearCache = 'true';
  const heading = document.createElement('h3');
  heading.textContent = 'Browser cache';
  panel.appendChild(heading);
  const explain = document.createElement('p');
  explain.textContent = CLEAR_CACHE_EXPLANATION;
  panel.appendChild(explain);
  const phase = clearPhase.get(model) ?? 'idle';
  const rerender = (next: ClearPhase) => { clearPhase.set(model, next); rerenderApp(model); };
  if (phase === 'confirm' || phase === 'clearing') {
    const confirm = document.createElement('div');
    confirm.setAttribute('role', 'group');
    confirm.setAttribute('aria-label', 'Confirm clearing browser cache');
    const text = document.createElement('p');
    text.textContent = CLEAR_CACHE_CONFIRM_TEXT;
    confirm.appendChild(text);
    if (hasUnsavedServiceChanges(model)) {
      const warn = document.createElement('p');
      warn.className = 'clear-cache-warning';
      warn.dataset.clearCacheUnsaved = 'true';
      warn.textContent = CLEAR_CACHE_UNSAVED_WARNING;
      confirm.appendChild(warn);
    }
    const row = document.createElement('div');
    row.className = 'button-row';
    const yes = document.createElement('button');
    yes.className = 'btn-danger';
    yes.textContent = CLEAR_CACHE_CONFIRM_LABEL;
    yes.dataset.clearCacheConfirm = 'true';
    yes.disabled = phase === 'clearing';
    yes.addEventListener('click', () => {
      // Suspend first so no debounced/pagehide write can restore the record before the reload.
      suspendSnapshotCacheWrites();
      rerender('clearing');
      void clearSnapshotCache(clearCacheDeps.backend).then((ok) => {
        rerender(ok ? 'done' : 'failed');
        if (ok) clearCacheDeps.reload();
      });
    });
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.dataset.clearCacheCancel = 'true';
    cancel.disabled = phase === 'clearing';
    cancel.addEventListener('click', () => rerender('idle'));
    row.append(yes, cancel);
    confirm.appendChild(row);
    panel.appendChild(confirm);
  } else {
    const button = document.createElement('button');
    button.className = 'btn-danger-secondary';
    button.textContent = CLEAR_CACHE_BUTTON_LABEL;
    button.dataset.clearCacheStart = 'true';
    button.disabled = phase === 'done';
    button.addEventListener('click', () => rerender('confirm'));
    panel.appendChild(button);
  }
  if (phase === 'done' || phase === 'failed') {
    const result = document.createElement('div');
    result.className = `status-banner ${phase === 'failed' ? 'error' : 'success'}`;
    result.setAttribute('role', 'status');
    result.dataset.clearCacheResult = phase;
    result.textContent = phase === 'done' ? CLEAR_CACHE_DONE_MESSAGE : CLEAR_CACHE_FAILED_MESSAGE;
    panel.appendChild(result);
  }
  return panel;
}

export const CC_BY_SA_4_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

/** lt-foe.3.4: Credits. Dictionary attribution only when the paired service reported an available gloss source. */
function renderCredits(model: AppModel): HTMLElement {
  const credits = document.createElement('section');
  credits.className = 'credits';
  credits.id = 'settings-credits';
  credits.setAttribute('aria-labelledby', 'settings-credits-heading');
  const heading = document.createElement('h3');
  heading.id = 'settings-credits-heading';
  heading.textContent = 'Credits';
  credits.appendChild(heading);
  const gloss = model.localService.glossCapability;
  const p = document.createElement('p');
  if (gloss?.state === 'available' && gloss.source) {
    p.className = 'credits-dictionary';
    p.dataset.credit = 'dictionary';
    const text = document.createElement('span');
    text.className = 'credits-attribution';
    text.textContent = gloss.source.attribution;
    const link = document.createElement('a');
    link.href = CC_BY_SA_4_URL;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.textContent = 'CC BY-SA 4.0 licence';
    p.append(text, ' ', link);
  } else {
    p.dataset.credit = 'no-dictionary';
    p.textContent = 'No dictionary installed.';
  }
  credits.appendChild(p);
  return credits;
}

export function renderSettingsView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = 'Settings';
  section.appendChild(h2);
  const p = document.createElement('p');
  p.textContent = 'Online providers, cloud sync, and external integrations are disabled by default. Enable them only after an explicit privacy review.';
  section.appendChild(p);

  const list = document.createElement('ul');
  const items = [
    'Dictionary / translation adapters: disabled',
    'Cloud sync / backups: disabled',
    'AnkiConnect / external export: disabled',
    'Speech recognition / shadowing: disabled',
  ];
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  section.appendChild(list);

  section.appendChild(renderCredits(model));

  const servicePanel = document.createElement('div');
  servicePanel.className = 'local-service-panel';
  const serviceHeading = document.createElement('h3');
  serviceHeading.textContent = 'Local service / SQLite durable state';
  servicePanel.appendChild(serviceHeading);

  const serviceDescription = document.createElement('p');
  serviceDescription.textContent = 'Connect to the configured private local service when you want SQLite-backed state, local transcription jobs, and scratch-artifact cleanup. Use Docker for same-origin access on a trusted private LAN, never the public internet. This connection is explicit; files you choose in the browser are for playback only, and Docker media paths start with /media/.';
  servicePanel.appendChild(serviceDescription);

  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'Local service URL';
  urlLabel.htmlFor = 'local-service-url';
  const urlInput = document.createElement('input');
  urlInput.id = 'local-service-url';
  urlInput.name = 'local-service-url';
  urlInput.type = 'url';
  urlInput.value = model.localService.baseUrl === '/' ? window.location.origin : model.localService.baseUrl;
  urlInput.addEventListener('input', () => {
    capabilityInput.value = '';
    void forgetRememberedPairing(model);
    setLocalServiceBaseUrl(model, urlInput.value);
  });
  urlLabel.appendChild(urlInput);
  servicePanel.appendChild(urlLabel);

  const capabilityLabel = document.createElement('label');
  capabilityLabel.textContent = 'Session capability (private pairing)';
  const capabilityInput = document.createElement('input');
  capabilityInput.id = 'local-service-capability';
  capabilityInput.type = 'password';
  capabilityInput.autocomplete = 'off';
  capabilityLabel.appendChild(capabilityInput);
  servicePanel.appendChild(capabilityLabel);
  const warning = document.createElement('p');
  warning.textContent = 'Pair only with the exact selected origin on an operator-trusted private network. HTTP sends capability and learner data unencrypted; no public internet use.' + (pairingIsRemembered(model) ? '' : ' Reload requires fresh pairing.');
  servicePanel.appendChild(warning);
  const rememberLabel = document.createElement('label');
  rememberLabel.htmlFor = 'local-service-remember-pairing';
  const rememberCheckbox = document.createElement('input');
  rememberCheckbox.type = 'checkbox';
  rememberCheckbox.id = 'local-service-remember-pairing';
  rememberCheckbox.name = 'local-service-remember-pairing';
  rememberCheckbox.checked = rememberPairingOptedIn(model);
  rememberCheckbox.addEventListener('change', () => {
    void setRememberPairingOptIn(model, rememberCheckbox.checked).then(() => rerenderApp(model));
  });
  rememberLabel.appendChild(rememberCheckbox);
  rememberLabel.append(` ${REMEMBER_PAIRING_LABEL}`);
  servicePanel.appendChild(rememberLabel);
  if (rememberPairingOptedIn(model) && !pairingIsRemembered(model)) {
    // The capability is not retained after connect, so a tick only applies to the next Connect.
    const hint = document.createElement('p');
    hint.dataset.rememberPairingHint = 'true';
    hint.textContent = REMEMBER_PAIRING_NEXT_CONNECT_HINT;
    servicePanel.appendChild(hint);
  }
  if (pairingIsRemembered(model)) {
    const remembered = document.createElement('p');
    remembered.dataset.rememberedPairing = 'true';
    remembered.textContent = `${REMEMBERED_PAIRING_NOTE}.`;
    servicePanel.appendChild(remembered);
    const forget = document.createElement('button');
    forget.textContent = 'Forget pairing';
    forget.addEventListener('click', () => { void forgetRememberedPairing(model).then(() => rerenderApp(model)); });
    servicePanel.appendChild(forget);
  }
  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';
  const connectButton = document.createElement('button');
  connectButton.className = 'btn-primary';
  connectButton.textContent = 'Connect local service';
  connectButton.disabled = model.localService.status === 'connecting';
  connectButton.addEventListener('click', () => {
    const capability = capabilityInput.value;
    capabilityInput.value = '';
    try { pairLocalService(model, capability, urlInput.value); noteExplicitPairing(model, capability, model.localService.baseUrl); }
    catch { model.localService.lastMessage = 'Select an exact HTTP origin and enter its private session capability.'; rerenderApp(model); return; }
    void connectLocalService(model, model.localService.baseUrl).then(() => rerenderApp(model));
    rerenderApp(model);
  });
  buttonRow.appendChild(connectButton);
  const disconnect = document.createElement('button');
  disconnect.textContent = 'Disconnect local service';
  disconnect.addEventListener('click', () => { capabilityInput.value = ''; void forgetRememberedPairing(model); setLocalServiceBaseUrl(model, model.localService.baseUrl); rerenderApp(model); });
  buttonRow.appendChild(disconnect);

  const saveButton = document.createElement('button');
  saveButton.className = 'btn-secondary';
  saveButton.textContent = 'Save state now';
  saveButton.dataset.localServiceSave = 'true';
  saveButton.disabled = model.localService.status === 'connecting' || ['choice', 'conflict', 'saving'].includes(model.localService.syncState ?? '');
  saveButton.addEventListener('click', () => {
    void saveModelToLocalService(model, model.localService.baseUrl).then(() => rerenderApp(model));
  });
  buttonRow.appendChild(saveButton);
  servicePanel.appendChild(buttonRow);

  if (model.localService.syncState === 'choice') {
    const choices = document.createElement('div');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'Confirm browser and durable state choice');
    for (const [choice, label] of [
      ['browser', 'Keep browser work'],
      ['service', 'Load service state (discard browser edits)'],
      ['cancel', 'Cancel connection'],
    ] as const) {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => { resolveLocalServiceConnection(model, choice); rerenderApp(model); });
      choices.appendChild(button);
    }
    servicePanel.appendChild(choices);
  }

  const autosaveLabel = document.createElement('label');
  autosaveLabel.htmlFor = 'local-service-autosave';
  const autosaveCheckbox = document.createElement('input');
  autosaveCheckbox.type = 'checkbox';
  autosaveCheckbox.id = 'local-service-autosave';
  autosaveCheckbox.name = 'local-service-autosave';
  autosaveCheckbox.checked = model.localService.autosaveEnabled;
  autosaveCheckbox.addEventListener('change', () => {
    setLocalServiceAutosave(model, autosaveCheckbox.checked);
    rerenderApp(model);
  });
  autosaveLabel.appendChild(autosaveCheckbox);
  autosaveLabel.append(` Autosave to local service (${model.localService.autosaveEnabled ? 'on' : 'off'}) — saves after each change once connected`);
  servicePanel.appendChild(autosaveLabel);

  const serviceStatus = document.createElement('div');
  serviceStatus.className = `status-banner ${model.localService.status === 'error' ? 'error' : model.localService.status === 'connected' ? 'success' : ''}`;
  serviceStatus.setAttribute('role', 'status');
  serviceStatus.dataset.localServiceSync = 'true';
  serviceStatus.textContent = model.localService.lastMessage ?? 'Local service not connected.';
  servicePanel.appendChild(serviceStatus);
  section.appendChild(servicePanel);
  section.appendChild(renderClearCachePanel(model));

  const status = document.createElement('div');
  status.className = 'status-banner';
  status.setAttribute('role', 'status');
  status.textContent = model.providerPolicy.onlineProvidersEnabled
    ? 'Online providers enabled — review privacy settings.'
    : 'Local-only mode active. No network calls are made.';
  section.appendChild(status);
  return section;
}
