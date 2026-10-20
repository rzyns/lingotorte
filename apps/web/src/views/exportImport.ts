import type { AppModel } from '../uiTypes';
import { verifyExportIntegrity, buildAnkiExportPlan, buildAnkiTextExport, DICTIONARY_TEXT_NOTICE } from '@lingotorte/domain';
import { requestAnkiPackage, ankiPackageMessage } from '../ankiExportClient.ts';
import {
  exportLearnerState,
  previewRestoreManifest,
  previewDurableRestore,
  restoreIsBusy,
  hasCurrentDurableRestorePreview,
  previewPendingSessionRestore,
  confirmRestore,
  clearRestorePreview,
  setExportImportAcknowledgedWarning,
  setExportImportConfirmOverwrite,
  setExportImportConfirmReplace,
  setExportImportError,
  captureLocalServiceTransport,
  hasPendingRestoreIntent,
  listAllSavedItemsAndOccurrences,
  cueById,
} from '../model';
import { captureFocusContinuation, requestFocusAfterRender, rerenderApp } from '../appShell.ts';
import { type BrowserFileSavePickerGlobal, appendDefinitionRow, readPreviewManifest, shortHash } from '../ui/common.ts';

export function renderExportImportView(model: AppModel): HTMLElement {
  const section = document.createElement('section');
  section.className = 'card export-import-card';

  const h2 = document.createElement('h2');
  h2.textContent = 'Export / Import';
  section.appendChild(h2);

  const intro = document.createElement('p');
  intro.textContent = 'Learner-state export v1 (learner subset) is local-only JSON. Included: saved items, saved occurrences, review cards, review-card states, active review events and active practice attempts, with their captured source context (cue references, media paths, content hashes, notes and timestamps). Excluded: media files, media assets/observations, subtitle tracks, cues, word timings, retained inactive review/practice audit, import/export jobs and provider policy. It is not a full backup or full recovery; it copies no media and contacts no cloud providers.';
  section.appendChild(intro);

  const exportGroup = document.createElement('div');
  exportGroup.className = 'export-import-group';
  const exportHeading = document.createElement('h3');
  exportHeading.textContent = 'Export learner state';
  exportGroup.appendChild(exportHeading);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-primary';
  exportBtn.textContent = 'Generate local export';
  exportBtn.setAttribute('aria-label', 'Generate local learner export manifest');
  exportBtn.addEventListener('click', () => {
    try {
      exportLearnerState(model);
      rerenderApp(model);
    } catch (err: unknown) {
      setExportImportError(model, err instanceof Error ? err.message : String(err));
      rerenderApp(model);
    }
  });
  exportGroup.appendChild(exportBtn);

  if (model.exportImport.lastExport) {
    const summary = document.createElement('div');
    summary.className = 'status-banner success export-summary';
    summary.setAttribute('role', 'status');
    summary.textContent = `Learner-state export v1 ready: ${model.exportImport.lastExport.fileName} • ${model.exportImport.lastExport.recordCount} records • ${model.exportImport.lastExport.warningCount} privacy warnings • ${model.exportImport.lastExport.manifestIntegrityVerified ? 'manifest integrity verified (semantic integrity verified, sha256-per-record; not a physical-file check)' : 'manifest integrity warning'} • no media files copied`;
    exportGroup.appendChild(summary);

    const exportMetadata = document.createElement('dl');
    exportMetadata.className = 'export-metadata';
    appendDefinitionRow(exportMetadata, 'Schema', model.exportImport.lastExport.schemaVersion);
    appendDefinitionRow(exportMetadata, 'App version', model.exportImport.lastExport.applicationVersion);
    appendDefinitionRow(exportMetadata, 'Exported at', model.exportImport.lastExport.exportedAt);
    appendDefinitionRow(exportMetadata, 'Integrity root hash', shortHash(model.exportImport.lastExport.rootHash));
    exportGroup.appendChild(exportMetadata);

    const exportNote = document.createElement('p');
    exportNote.className = 'meta';
    exportNote.textContent = 'Physical-file verification is separate: download or choose a file explicitly. File System Access saves are verified by readback; browser downloads are not read back by Lingotorte.';
    exportGroup.appendChild(exportNote);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-secondary';
    downloadBtn.textContent = 'Download export JSON';
    downloadBtn.setAttribute('aria-label', `Download learner export JSON as ${model.exportImport.lastExport.fileName}`);
    downloadBtn.addEventListener('click', () => {
      downloadTextFile(model.exportImport.lastExport!.fileName, model.exportImport.lastExport!.manifestJson);
    });
    exportGroup.appendChild(downloadBtn);

    const showSaveFilePicker = (globalThis as BrowserFileSavePickerGlobal).showSaveFilePicker;
    if (typeof showSaveFilePicker === 'function') {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn-secondary';
      saveBtn.textContent = 'Save export to chosen file';
      saveBtn.setAttribute('aria-label', 'Save learner export JSON through a browser File System Access save picker with readback verification');
      saveBtn.addEventListener('click', () => {
        const manifestJson = model.exportImport.lastExport!.manifestJson;
        const fileName = model.exportImport.lastExport!.fileName;
        void showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'Lingotorte export JSON',
              accept: { 'application/json': ['.json'] },
            },
          ],
        })
          .then(async (handle) => {
            const writable = await handle.createWritable();
            try {
              await writable.write(manifestJson);
            } finally {
              await writable.close();
            }
            const savedFile = await handle.getFile();
            const savedText = await savedFile.text();
            if (savedText !== manifestJson) {
              throw new Error('Export file readback did not match the written manifest.');
            }
            model.exportImport.lastSaveVerified = {
              fileName: savedFile.name,
              verifiedAt: new Date().toISOString(),
            };
            model.exportImport.lastError = null;
            rerenderApp(model);
          })
          .catch((err: unknown) => {
            setExportImportError(model, err instanceof Error ? err.message : String(err));
            rerenderApp(model);
          });
      });
      exportGroup.appendChild(saveBtn);
    }

    if (model.exportImport.lastSaveVerified) {
      const verifyBanner = document.createElement('div');
      verifyBanner.className = 'status-banner success export-verified';
      verifyBanner.setAttribute('role', 'status');
      verifyBanner.textContent = `Verified: ${model.exportImport.lastSaveVerified.fileName} saved and readback matched at ${model.exportImport.lastSaveVerified.verifiedAt}. This verifies the learner-state JSON file only; media files remain referenced, not copied.`;
      exportGroup.appendChild(verifyBanner);
    }
  }

  section.appendChild(exportGroup);
  section.appendChild(renderAnkiExportGroup(model));
  const importGroup = document.createElement('div');
  importGroup.className = 'export-import-group';
  const importHeading = document.createElement('h3');
  importHeading.textContent = 'Import / restore learner state';
  importGroup.appendChild(importHeading);

  const importLabel = document.createElement('label');
  importLabel.textContent = 'Paste export manifest JSON';
  importLabel.htmlFor = 'import-manifest';
  importGroup.appendChild(importLabel);

  const importTextarea = document.createElement('textarea');
  importTextarea.id = 'import-manifest';
  importTextarea.name = 'import-manifest';
  importTextarea.placeholder = '{"schemaVersion":"lingotorte.learner-export.v1",...}';
  importTextarea.setAttribute('aria-label', 'Export manifest JSON');
  importTextarea.value = model.exportImport.manifestJson ?? '';
  importTextarea.disabled = restoreIsBusy(model);
  importTextarea.addEventListener('input', () => {
    try { clearRestorePreview(model); model.exportImport.manifestJson = importTextarea.value; setExportImportError(model, 'Restore input changed; preview and confirm again.');
      for (const button of importGroup.querySelectorAll<HTMLButtonElement>('.restore-preview button')) button.disabled = true;
    } catch (err) { setExportImportError(model, err instanceof Error ? err.message : 'Restore unresolved.'); }
  });
  importGroup.appendChild(importTextarea);

  const previewBtn = document.createElement('button');
  previewBtn.className = 'btn-secondary';
  previewBtn.id = 'restore-preview-action';
  previewBtn.textContent = 'Preview restore';
  previewBtn.setAttribute('aria-label', 'Preview restore from manifest JSON');
  previewBtn.disabled = restoreIsBusy(model);
  previewBtn.addEventListener('click', () => {
    try {
      previewRestoreManifest(model, importTextarea.value);
      setExportImportError(model, null);
    } catch (err: unknown) {
      if (!restoreIsBusy(model)) { model.exportImport.preview = null; model.exportImport.manifestJson = importTextarea.value; model.exportImport.lastRestore = null; }
      setExportImportError(model, err instanceof Error ? err.message : String(err));
    }
    requestFocusAfterRender(model, 'restore-error', 'restore-preview'); rerenderApp(model);
  });
  importGroup.appendChild(previewBtn);
  if (hasPendingRestoreIntent(model)) {
    const resume = document.createElement('button'); resume.textContent = 'Preview pending session restore for durable save';
    resume.addEventListener('click', () => { try { previewPendingSessionRestore(model); } catch (err) { setExportImportError(model, err instanceof Error ? err.message : 'Pending intent changed.'); } requestFocusAfterRender(model, 'restore-error', 'restore-preview'); rerenderApp(model); });
    importGroup.appendChild(resume);
  }

  if (model.exportImport.preview) {
    const previewManifest = readPreviewManifest(model);
    const previewPanel = document.createElement('div');
    previewPanel.className = 'restore-preview';
    previewPanel.id = 'restore-preview'; previewPanel.tabIndex = -1;
    previewPanel.setAttribute('role', 'region');
    previewPanel.setAttribute('aria-label', 'Restore preview');

    const previewHeading = document.createElement('h3');
    previewHeading.textContent = 'Restore preview';
    previewPanel.appendChild(previewHeading);

    if (previewManifest) {
      const restoreMetadata = document.createElement('dl');
      restoreMetadata.className = 'restore-metadata';
      appendDefinitionRow(restoreMetadata, 'Schema', previewManifest.schemaVersion);
      appendDefinitionRow(restoreMetadata, 'App version', previewManifest.applicationVersion);
      appendDefinitionRow(restoreMetadata, 'Exported at', previewManifest.exportedAt);
      appendDefinitionRow(restoreMetadata, 'Integrity records', String(previewManifest.integrity.recordCount));
      appendDefinitionRow(restoreMetadata, 'Integrity root hash', shortHash(previewManifest.integrity.rootHash));
      previewPanel.appendChild(restoreMetadata);
    }

    const modeNote = document.createElement('p');
    modeNote.className = 'meta';
    modeNote.textContent = 'Metadata-only restore preview: no media files are copied or restored. Existing media references may need relinking after import. Scope: learner subset only (saved items, saved occurrences, review cards, review-card states, review events, practice attempts); library, media, cues, word timings, jobs and provider policy are not restored. Semantic integrity is not physical-file or durable-save verification.';
    previewPanel.appendChild(modeNote);

    const counts = model.exportImport.preview.counts;
    const countsList = document.createElement('ul');
    for (const [key, count] of Object.entries(counts)) {
      const li = document.createElement('li');
      li.textContent = `${key}: ${count}`;
      countsList.appendChild(li);
    }
    previewPanel.appendChild(countsList);
    previewPanel.appendChild(renderRestoreOperationPreview(model.exportImport.preview));

    const safe = document.createElement('p');
    safe.className = model.exportImport.preview.safeToRestore ? 'status-banner success' : 'status-banner warning';
    safe.setAttribute('role', 'status');
    safe.textContent = model.exportImport.preview.safeToRestore
      ? 'Safe to restore: local learner state is empty.'
      : 'Local learner state exists. Resolve the conflict below before restoring.';
    previewPanel.appendChild(safe);

    const integrity = document.createElement('p');
    integrity.className = 'status-banner success';
    integrity.setAttribute('role', 'status');
    integrity.dataset.testid = 'restore-integrity';
    if (previewManifest) {
      const verified = verifyExportIntegrity(previewManifest);
      integrity.textContent = verified
        ? `Manifest integrity verified: ${previewManifest.integrity.recordCount} records, root hash matches. This verifies the semantic content of the manifest (sha256-per-record), not the browser file write.`
        : 'Manifest integrity warning: recomputed hash does not match the manifest root hash. The file may have been altered. The manifest content (sha256-per-record) does not match the stored integrity hash.';
      integrity.className = verified ? 'status-banner success' : 'status-banner error';
      integrity.dataset.integrityVerified = String(verified);
    } else {
      integrity.textContent = 'Manifest integrity check unavailable: manifest JSON is not valid.';
      integrity.className = 'status-banner error';
      integrity.dataset.integrityVerified = 'false';
    }
    previewPanel.appendChild(integrity);

    if (model.exportImport.preview.overwriteConfirmationRequired) {
      const conflictHeading = document.createElement('h4');
      conflictHeading.textContent = 'Resolve restore conflict';
      previewPanel.appendChild(conflictHeading);

      const conflictNote = document.createElement('p');
      conflictNote.className = 'meta';
      conflictNote.textContent = 'Choose exactly one mode. Merge/update preserves unrelated active learner records. Replace active learner data removes current active learner records absent from this file. Prior review/practice history is retained locally as inactive audit; this does not erase private data and is not a complete undo archive. Library, media, jobs and provider policy are not replaced.';
      previewPanel.appendChild(conflictNote);

      const overwriteLabel = document.createElement('label');
      overwriteLabel.htmlFor = 'restore-confirm-overwrite';
      const overwriteCheckbox = document.createElement('input');
      overwriteCheckbox.type = 'checkbox';
      overwriteCheckbox.id = 'restore-confirm-overwrite';
      overwriteCheckbox.name = 'restore-confirm-overwrite';
      overwriteCheckbox.checked = model.exportImport.confirmOverwrite;
      overwriteCheckbox.addEventListener('change', () => {
        setExportImportConfirmOverwrite(model, overwriteCheckbox.checked);
        if (overwriteCheckbox.checked) setExportImportConfirmReplace(model, false);
        rerenderApp(model);
      });
      overwriteLabel.appendChild(overwriteCheckbox);
      overwriteLabel.append(' Merge/update: add new records and update changed records in my current local learner state. Unrelated local records are preserved.');
      previewPanel.appendChild(overwriteLabel);

      const replaceLabel = document.createElement('label');
      replaceLabel.htmlFor = 'restore-confirm-replace';
      const replaceCheckbox = document.createElement('input');
      replaceCheckbox.type = 'checkbox';
      replaceCheckbox.id = 'restore-confirm-replace';
      replaceCheckbox.name = 'restore-confirm-replace';
      replaceCheckbox.checked = model.exportImport.confirmReplace;
      replaceCheckbox.addEventListener('change', () => {
        setExportImportConfirmReplace(model, replaceCheckbox.checked);
        if (replaceCheckbox.checked) setExportImportConfirmOverwrite(model, false);
        rerenderApp(model);
      });
      replaceLabel.appendChild(replaceCheckbox);
      replaceLabel.append(' Replace active learner data: remove active learner records absent from this file. Retain review/practice payloads as inactive local audit, not in normal learner export. This does not erase private data.');
      previewPanel.appendChild(replaceLabel);

      const conflictError = document.createElement('p');
      conflictError.className = 'status-banner error';
      conflictError.setAttribute('role', 'status');
      conflictError.textContent = 'Restore requires one of the options above to be selected.';
      conflictError.style.display = model.exportImport.confirmOverwrite || model.exportImport.confirmReplace ? 'none' : 'block';
      previewPanel.appendChild(conflictError);
    } else {
      const confirmLabel = document.createElement('label');
      confirmLabel.htmlFor = 'restore-confirm';
      const confirmCheckbox = document.createElement('input');
      confirmCheckbox.type = 'checkbox';
      confirmCheckbox.id = 'restore-confirm';
      confirmCheckbox.name = 'restore-confirm';
      confirmCheckbox.checked = model.exportImport.confirmOverwrite;
      confirmCheckbox.addEventListener('change', () => {
        setExportImportConfirmOverwrite(model, confirmCheckbox.checked);
        rerenderApp(model);
      });
      confirmLabel.appendChild(confirmCheckbox);
      confirmLabel.append(' I confirm this restore.');
      previewPanel.appendChild(confirmLabel);
    }

    const warningHeading = document.createElement('h4');
    warningHeading.textContent = 'Privacy warnings';
    previewPanel.appendChild(warningHeading);

    const warningList = document.createElement('ul');
    for (const warning of model.exportImport.preview.warnings) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const warningCheckboxId = `restore-warning-${warning.kind}`;
      label.htmlFor = warningCheckboxId;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = warningCheckboxId;
      checkbox.name = 'restore-warning';
      checkbox.value = warning.kind;
      checkbox.checked = model.exportImport.acknowledgedWarnings.includes(warning.kind);
      checkbox.addEventListener('change', () => {
        setExportImportAcknowledgedWarning(model, warning.kind, checkbox.checked);
        rerenderApp(model);
      });
      label.appendChild(checkbox);
      label.append(` ${warning.severity.toUpperCase()}: ${warning.message}`);
      li.appendChild(label);
      warningList.appendChild(li);
    }
    previewPanel.appendChild(warningList);

    const allWarningsAcknowledged = model.exportImport.preview.warnings.every((w) =>
      model.exportImport.acknowledgedWarnings.includes(w.kind),
    );
    const canRestore = allWarningsAcknowledged && (model.exportImport.confirmOverwrite || model.exportImport.confirmReplace);

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn-primary';
    restoreBtn.textContent = 'Restore now';
    restoreBtn.setAttribute('aria-label', 'Restore learner state from manifest');
    restoreBtn.disabled = !canRestore || restoreIsBusy(model) || (model.localService.status !== 'disconnected' && !hasCurrentDurableRestorePreview(model));
    restoreBtn.addEventListener('click', () => {
      let focusOutcome = () => {};
      try {
        const completion = confirmRestore(model);
        if (completion) {
          restoreBtn.disabled = true;
          void completion.then(() => { setExportImportError(model, null); focusOutcome(); rerenderApp(model); }, err => { setExportImportError(model, err instanceof Error ? err.message : 'Restore failed.'); focusOutcome(); rerenderApp(model); });
        } else setExportImportError(model, null);
      } catch (err: unknown) {
        setExportImportError(model, err instanceof Error ? err.message : String(err));
      }
      requestFocusAfterRender(model, 'restore-error', 'restore-receipt', 'restore-preview'); rerenderApp(model);
      focusOutcome = captureFocusContinuation(model, 'restore-error', 'restore-receipt', 'restore-preview');
    });
    if (model.localService.status !== 'disconnected') {
      const refresh = document.createElement('button'); refresh.textContent = 'Refresh authoritative service preview'; refresh.disabled = restoreIsBusy(model);
      refresh.addEventListener('click', () => {
        refresh.disabled = true;
        const focusOutcome = captureFocusContinuation(model, 'restore-error', 'restore-preview');
        void previewDurableRestore(model).then(() => { focusOutcome(); rerenderApp(model); }, err => { setExportImportError(model, err instanceof Error ? err.message : 'Preview failed.'); focusOutcome(); rerenderApp(model); });
      });
      previewPanel.appendChild(refresh);
    }
    previewPanel.appendChild(restoreBtn);

    importGroup.appendChild(previewPanel);
  }

  if (model.exportImport.lastRestore) {
    importGroup.appendChild(renderRestoreReceipt(model.exportImport.lastRestore));
  }

  if (model.exportImport.lastError) {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'status-banner error';
    errorBanner.id = 'restore-error'; errorBanner.tabIndex = -1;
    errorBanner.setAttribute('role', 'alert');
    errorBanner.textContent = model.exportImport.lastError;
    importGroup.appendChild(errorBanner);
  }

  section.appendChild(importGroup);
  return section;
}

function renderRestoreReceipt(receipt: NonNullable<AppModel['exportImport']['lastRestore']>): HTMLElement {
  const container = document.createElement('div');
  container.className = 'restore-receipt';
  container.id = 'restore-receipt'; container.tabIndex = -1;
  container.setAttribute('role', 'status');
  container.dataset.testid = 'restore-receipt';

  const heading = document.createElement('h3');
  heading.textContent = receipt.durablySaved ? 'Restore complete — durable readback verified' : 'Restore complete — session-only / not durably saved';
  container.appendChild(heading);

  const modeLabel = receipt.mode === 'replace-all'
    ? 'Replace active learner data (omitted learner records removed from active state; review/practice audit retained locally; not erasure or full undo)'
    : receipt.mode === 'merge-update'
      ? 'Merge/update (unrelated local records preserved; matched records added or updated)'
      : 'Initial import (local learner state was empty)';
  const modePara = document.createElement('p');
  modePara.className = 'meta';
  modePara.textContent = `Mode: ${modeLabel}.`;
  container.appendChild(modePara);

  const integrityPara = document.createElement('p');
  integrityPara.className = receipt.manifestIntegrityVerified ? 'status-banner success' : 'status-banner error';
  integrityPara.dataset.testid = 'restore-receipt-integrity';
  integrityPara.textContent = receipt.manifestIntegrityVerified
    ? `Manifest integrity verified: ${receipt.manifestRecordCount} records, root hash matches. This verifies the semantic content of the manifest only; it does not verify the browser file write.`
    : `Manifest integrity warning: recomputed hash does not match the manifest root hash. The imported data may have been altered.`;
  container.appendChild(integrityPara);

  const operationHeading = document.createElement('h4');
  operationHeading.textContent = 'Operation counts';
  container.appendChild(operationHeading);
  const operationList = document.createElement('ul');
  const operationRows: { key: keyof typeof receipt.operationCounts; label: string }[] = [
    { key: 'savedItems', label: 'savedItems' },
    { key: 'savedOccurrences', label: 'savedOccurrences' },
    { key: 'reviewCards', label: 'reviewCards' },
    { key: 'reviewCardStates', label: 'reviewCardStates' },
    { key: 'reviewEvents', label: 'reviewEvents' },
    { key: 'practiceAttempts', label: 'practiceAttempts' },
    { key: 'sourceContexts', label: 'sourceContexts' },
  ];
  for (const row of operationRows) {
    const counts = receipt.operationCounts[row.key];
    const li = document.createElement('li');
    const effects = row.key === 'sourceContexts' ? undefined : receipt.effects?.[row.key];
    li.textContent = effects ? `${row.label}: ${effects.added} added, ${effects.updated} updated, ${effects.skippedIdentical} skipped identical, ${effects.removedFromActive} removed from active, ${effects.reactivated} reactivated, ${effects.activeAfter} active after; ${receipt.coalesced?.[row.key as keyof NonNullable<typeof receipt.coalesced>] ?? 0} duplicate inputs coalesced` : `${row.label}: ${counts.added} supporting context records (not learner events)`;
    operationList.appendChild(li);
  }
  container.appendChild(operationList);
  if (receipt.auditEffects) for (const [name, audit] of Object.entries(receipt.auditEffects)) {
    const note = document.createElement('p'); note.textContent = `${name} audit: ${audit.appended} newly appended, ${audit.retained} total retained, ${audit.inactiveAfter} inactive after. Nothing deleted from audit.`; container.appendChild(note);
  }

  const warningPara = document.createElement('p');
  warningPara.className = 'meta';
  warningPara.textContent = `Acknowledged warnings: ${receipt.acknowledgedWarningKinds.length > 0 ? receipt.acknowledgedWarningKinds.join(', ') : 'none'}.`;
  container.appendChild(warningPara);

  const mediaNote = document.createElement('p');
  mediaNote.className = 'status-banner info';
  mediaNote.textContent = 'No media files were copied or restored. Media references may need relinking after import.';
  container.appendChild(mediaNote);

  const scopeNote = document.createElement('p');
  scopeNote.className = 'meta';
  scopeNote.dataset.testid = 'restore-receipt-scope';
  scopeNote.textContent = 'Learner subset restored; not a full recovery: library, media, cues, jobs and provider policy were not restored, so missing source media/cues remain unresolved until re-imported or relinked. Retained inactive audit stays local and is not included in learner export.';
  container.appendChild(scopeNote);

  return container;
}

function renderRestoreOperationPreview(preview: NonNullable<AppModel['exportImport']['preview']>): HTMLElement {
  const container = document.createElement('div');
  container.className = 'restore-operation-preview';
  const heading = document.createElement('h4');
  heading.textContent = 'Restore operation preview';
  container.appendChild(heading);
  if (preview.auditEffects) for (const [name, audit] of Object.entries(preview.auditEffects)) {
    const note = document.createElement('p'); note.textContent = `${name} audit preview: ${audit.appended} newly appended, ${audit.retained} total retained, ${audit.inactiveAfter} inactive after; retained locally, excluded from normal learner export.`; container.appendChild(note);
  }

  const operationList = document.createElement('ul');
  const operationRows: { key: keyof typeof preview.operations; label: string }[] = [
    { key: 'savedItems', label: 'savedItems' },
    { key: 'savedOccurrences', label: 'savedOccurrences' },
    { key: 'reviewCards', label: 'reviewCards' },
    { key: 'reviewCardStates', label: 'reviewCardStates' },
    { key: 'reviewEvents', label: 'reviewEvents' },
    { key: 'practiceAttempts', label: 'practiceAttempts' },
    { key: 'sourceContexts', label: 'sourceContexts' },
  ];
  for (const row of operationRows) {
    const counts = preview.operations[row.key];
    const li = document.createElement('li');
    const effects = row.key === 'sourceContexts' ? undefined : preview.effects?.[row.key];
    li.textContent = effects ? `${row.label}: ${effects.added} added, ${effects.updated} updated, ${effects.skippedIdentical} skipped identical, ${effects.removedFromActive} removed from active, ${effects.reactivated} reactivated, ${effects.activeAfter} active after; ${preview.coalesced?.[row.key as keyof NonNullable<typeof preview.coalesced>] ?? 0} duplicate inputs coalesced` : `${row.label}: ${counts.added} supporting context records (not learner events)`;
    operationList.appendChild(li);
  }
  container.appendChild(operationList);

  if (preview.details.savedItems.length > 0) {
    const detailHeading = document.createElement('h5');
    detailHeading.textContent = 'Saved item changes';
    container.appendChild(detailHeading);
    const detailList = document.createElement('ul');
    for (const detail of preview.details.savedItems) {
      const li = document.createElement('li');
      li.textContent = `${detail.label}: ${detail.action}`;
      detailList.appendChild(li);
    }
    container.appendChild(detailList);
  }

  return container;
}

function downloadTextFile(fileName: string, text: string, type = 'application/json'): void {
  downloadBlob(fileName, new Blob([text], { type }));
}

function downloadBlob(fileName: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// lt-dxo: Anki file export. Per-model transient UI state (not serialized into the app model).
type AnkiUiState = { acknowledged: boolean; busy: boolean; error: string | null; done: string | null };
const ankiUi = new WeakMap<AppModel, AnkiUiState>();
function ankiState(model: AppModel): AnkiUiState {
  let state = ankiUi.get(model);
  if (!state) { state = { acknowledged: false, busy: false, error: null, done: null }; ankiUi.set(model, state); }
  return state;
}
function pairedTransportOrNull(model: AppModel) {
  try { return captureLocalServiceTransport(model); } catch { return null; }
}

function renderAnkiExportGroup(model: AppModel): HTMLElement {
  const state = ankiState(model);
  const group = document.createElement('div');
  group.className = 'export-import-group anki-export-group';
  group.dataset.ankiExportGroup = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Export to Anki';
  group.appendChild(heading);

  const { savedItems, savedOccurrences } = listAllSavedItemsAndOccurrences(model);
  const plan = buildAnkiExportPlan(savedItems, savedOccurrences, cueId => cueById(model, cueId)?.text);
  const counts = document.createElement('p');
  counts.className = 'meta anki-export-counts';
  counts.dataset.ankiExportCounts = '';
  counts.textContent = `${plan.noteCount} notes • ${plan.cardCount} cards (recognition for every note; production only for notes with a meaning) • ${plan.excludedArchived} archived items excluded`;
  group.appendChild(counts);

  const warnings = document.createElement('ul');
  warnings.className = 'anki-export-warnings';
  const lines = [
    'The file is unencrypted. It contains your saved words and phrases, the context sentences taken from your subtitles, your meanings and your notes.',
    'If you import it into Anki and sync, Anki uploads these to AnkiWeb (Ankitects). Lingotorte itself never syncs or contacts Anki.',
    'No media, audio, file names, timestamps or review history are included.',
    'Lingotorte remains the source of truth: Anki reviews do not flow back. Re-importing updates the same notes by their stable ID.',
  ];
  if (plan.hasDictionaryMeaning) lines.push(DICTIONARY_TEXT_NOTICE);
  for (const line of lines) { const li = document.createElement('li'); li.textContent = line; warnings.appendChild(li); }
  group.appendChild(warnings);

  const ackLabel = document.createElement('label');
  const ack = document.createElement('input');
  ack.type = 'checkbox';
  ack.checked = state.acknowledged;
  ack.dataset.ankiExportAck = '';
  ack.addEventListener('change', () => { state.acknowledged = ack.checked; state.error = null; state.done = null; rerenderApp(model); });
  ackLabel.appendChild(ack);
  ackLabel.appendChild(document.createTextNode(' I understand what the Anki file contains and that syncing it in Anki uploads it.'));
  group.appendChild(ackLabel);

  const transport = pairedTransportOrNull(model);
  const empty = plan.noteCount === 0;
  const apkgBtn = document.createElement('button');
  apkgBtn.className = 'btn-primary';
  apkgBtn.textContent = 'Download Anki package (.apkg)';
  apkgBtn.dataset.ankiExport = 'apkg';
  apkgBtn.disabled = !state.acknowledged || empty || !transport || state.busy;
  apkgBtn.addEventListener('click', () => {
    if (apkgBtn.disabled) return;
    state.busy = true; state.error = null; state.done = null; rerenderApp(model);
    void requestAnkiPackage(transport, plan.notes).then((result) => {
      state.busy = false;
      if (result.status === 'ok') {
        downloadBlob('lingotorte.apkg', new Blob([result.bytes], { type: 'application/octet-stream' }));
        state.done = `Anki package downloaded: ${plan.noteCount} notes, ${plan.cardCount} cards.`;
      } else state.error = ankiPackageMessage(result);
      rerenderApp(model);
    }, () => { state.busy = false; state.error = 'Anki package export failed. Nothing was downloaded.'; rerenderApp(model); });
  });
  group.appendChild(apkgBtn);

  const txtBtn = document.createElement('button');
  txtBtn.className = 'btn-secondary';
  txtBtn.textContent = 'Download Anki text file (.txt)';
  txtBtn.dataset.ankiExport = 'txt';
  txtBtn.disabled = !state.acknowledged || empty;
  txtBtn.addEventListener('click', () => {
    if (txtBtn.disabled) return;
    downloadTextFile('lingotorte-anki.txt', buildAnkiTextExport(plan.notes), 'text/plain;charset=utf-8');
    state.error = null;
    state.done = `Anki text file downloaded: ${plan.noteCount} notes (import into Anki with File > Import). It targets the built-in English notetype "Basic (optional reversed card)"; in a non-English Anki, pick the matching notetype when importing, or use the .apkg.`;
    rerenderApp(model);
  });
  group.appendChild(txtBtn);

  const reason = empty ? 'Nothing to export: save words or phrases first (archived items are excluded).'
    : !transport ? 'The .apkg package is built by the paired local service, which is not paired or available. Use the Anki text file (.txt) instead.'
    : !state.acknowledged ? 'Tick the acknowledgement to enable the downloads.' : '';
  if (reason) { const p = document.createElement('p'); p.className = 'meta'; p.dataset.ankiExportReason = ''; p.textContent = reason; group.appendChild(p); }
  if (state.error) { const e = document.createElement('div'); e.className = 'status-banner error'; e.setAttribute('role', 'alert'); e.dataset.ankiExportError = ''; e.textContent = state.error; group.appendChild(e); }
  if (state.done) { const d = document.createElement('div'); d.className = 'status-banner success'; d.setAttribute('role', 'status'); d.dataset.ankiExportDone = ''; d.textContent = state.done; group.appendChild(d); }
  return group;
}
