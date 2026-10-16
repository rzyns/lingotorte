import {
  buildLearnerExportContent,
  captureLearnerExportWire,
  computeExportIntegrity,
  defaultPrivacyWarnings,
  dictionaryTextWarnings,
  makeExportFilePath,
  makeLearnerExportManifest,
  requireRestoreConfirmation,
  validateLearnerExportManifest,
  type LearnerExportManifest,
  type RestoreConfirmation,
  type UUID,
} from '@lingotorte/domain';
import type { LocalStore, LocalStoreSnapshot } from './localStore.ts';
import { planLearnerRestore, type RestoreMode } from './restorePlanner.ts';
export { planLearnerRestore } from './restorePlanner.ts';

export type ExportLearnerStateResult = Readonly<{
  manifest: LearnerExportManifest;
  filePath: string;
}>;

export class ExportService {
  private readonly store: LocalStore;

  private readonly applicationVersion: string;

  private readonly deviceId: string | undefined;

  constructor(store: LocalStore, applicationVersion: string, deviceId?: string) {
    this.store = store;
    this.applicationVersion = applicationVersion;
    this.deviceId = deviceId;
  }

  buildManifest(): LearnerExportManifest {
    const snapshot = this.store.snapshot();
    const content = buildLearnerExportContent({
      savedItems: Object.values(snapshot.savedItems),
      savedOccurrences: Object.values(snapshot.savedOccurrences),
      reviewCards: Object.values(snapshot.reviewCards),
      reviewCardStates: Object.values(snapshot.reviewCardStates),
      reviewEvents: [...snapshot.reviewEvents],
      practiceAttempts: snapshot.practiceAttempts,
    });
    const integrity = computeExportIntegrity(content);
    const manifestInput: Parameters<typeof makeLearnerExportManifest>[0] = {
      applicationVersion: this.applicationVersion,
      privacyWarnings: [...defaultPrivacyWarnings(true), ...dictionaryTextWarnings(content.savedItems)],
      content,
      integrity,
    };
    if (this.deviceId !== undefined) {
      (manifestInput as unknown as Record<string, string>).deviceId = this.deviceId;
    }
    return makeLearnerExportManifest(manifestInput);
  }

  exportToFile(directory: string): ExportLearnerStateResult {
    const manifest = this.buildManifest();
    const filePath = makeExportFilePath(directory, manifest.exportedAt);
    return { manifest, filePath };
  }
}

export class RestoreService {
  private readonly store: LocalStore;

  constructor(store: LocalStore) {
    this.store = store;
  }

  plan(manifest: unknown, mode: RestoreMode = 'merge') {
    return planLearnerRestore(manifest, mode, this.store.snapshot(), this.store.snapshotRestoreAudit());
  }

  preview(manifest: LearnerExportManifest, mode: RestoreMode = 'merge') {
    return this.plan(manifest, mode).preview;
  }

  restoreWithReceipt(manifest: LearnerExportManifest, confirmation: RestoreConfirmation) {
    if (confirmation.confirmOverwrite && confirmation.confirmReplace) throw new TypeError('Restore refused: merge/update and replace-all are mutually exclusive; choose exactly one');
    if (!confirmation.confirmOverwrite && !confirmation.confirmReplace) throw new TypeError('Restore refused: merge/update or replace confirmation not supplied');
    const plan = this.plan(manifest, confirmation.confirmReplace ? 'replace-active' : 'merge');
    const acknowledged = new Set(confirmation.acknowledgedWarnings);
    for (const warning of plan.preview.warnings) if (!acknowledged.has(warning.kind)) throw new TypeError(`Restore refused: warning ${warning.kind} not acknowledged`);
    const snapshot = this.store.installRestoreCandidate(plan.candidate, plan.audit, { mode: plan.mode, manifest: captureLearnerExportWire(manifest) });
    return { snapshot, receipt: { mode: plan.mode, effects: plan.effects, auditEffects: plan.auditEffects, coalesced: plan.coalesced, integrity: plan.integrity, durability: 'session-only' as const, durablySaved: false as const } };
  }

  restore(manifest: LearnerExportManifest, confirmation: RestoreConfirmation): LocalStoreSnapshot {
    return this.restoreWithReceipt(manifest, confirmation).snapshot;
  }

  static validateManifest(value: unknown): LearnerExportManifest {
    return validateLearnerExportManifest(value);
  }

  static requireConfirmation(value: unknown): RestoreConfirmation {
    return requireRestoreConfirmation(value);
  }
}

export function extractDeviceId(deviceId: UUID | undefined): UUID | undefined {
  return deviceId;
}
