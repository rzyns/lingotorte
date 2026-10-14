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

  const servicePanel = document.createElement('div');
  servicePanel.className = 'local-service-panel';
  const serviceHeading = document.createElement('h3');
  serviceHeading.textContent = 'Local service / SQLite durable state';
  servicePanel.appendChild(serviceHeading);

  const serviceDescription = document.createElement('p');
  serviceDescription.textContent = 'Connect to the configured private local service when you want SQLite-backed state, local transcription jobs, and scratch-artifact cleanup. Use Docker for same-origin access on a trusted private LAN, never the public internet. This connection is explicit; browser handles are playback-only and Docker media paths start with /media/.';
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
  autosaveLabel.append(' Autosave to local service after supported study-state changes');
  servicePanel.appendChild(autosaveLabel);

  const serviceStatus = document.createElement('div');
  serviceStatus.className = `status-banner ${model.localService.status === 'error' ? 'error' : model.localService.status === 'connected' ? 'success' : ''}`;
  serviceStatus.setAttribute('role', 'status');
  serviceStatus.dataset.localServiceSync = 'true';
  serviceStatus.textContent = model.localService.lastMessage ?? 'Local service not connected.';
  servicePanel.appendChild(serviceStatus);
  section.appendChild(servicePanel);

  const status = document.createElement('div');
  status.className = 'status-banner';
  status.setAttribute('role', 'status');
  status.textContent = model.providerPolicy.onlineProvidersEnabled
    ? 'Online providers enabled — review privacy settings.'
    : 'Local-only mode active. No network calls are made.';
  section.appendChild(status);
  return section;
}
