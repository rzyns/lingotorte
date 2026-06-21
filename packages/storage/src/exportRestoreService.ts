import {
  buildLearnerExportContent,
  buildRestorePreview,
  computeExportIntegrity,
  defaultPrivacyWarnings,
  makeExportFilePath,
  makeLearnerExportManifest,
  requireRestoreConfirmation,
  validateLearnerExportManifest,
  type LearnerExportManifest,
  type RestoreConfirmation,
  type RestorePreview,
  type UUID,
} from '@lingotorte/domain';
import type { LocalStore, LocalStoreSnapshot } from './localStore';

export type ExportLearnerStateResult = Readonly<{
  manifest: LearnerExportManifest;
  filePath: string;
}>;

export class ExportService {
  constructor(
    private readonly store: LocalStore,
    private readonly applicationVersion: string,
    private readonly deviceId?: string,
  ) {}

  buildManifest(): LearnerExportManifest {
    const snapshot = this.store.snapshot();
    const content = buildLearnerExportContent({
      savedItems: Object.values(snapshot.savedItems),
      savedOccurrences: Object.values(snapshot.savedOccurrences),
      reviewCards: Object.values(snapshot.reviewCards),
      reviewCardStates: Object.values(snapshot.reviewCardStates),
      reviewEvents: [...snapshot.reviewEvents],
      practiceAttempts: [...snapshot.practiceAttempts],
    });
    const integrity = computeExportIntegrity(content);
    const manifestInput: Parameters<typeof makeLearnerExportManifest>[0] = {
      applicationVersion: this.applicationVersion,
      privacyWarnings: defaultPrivacyWarnings(true),
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
  constructor(private readonly store: LocalStore) {}

  preview(manifest: LearnerExportManifest): RestorePreview {
    const localHasData =
      Object.keys(this.store.snapshot().savedItems).length > 0 ||
      Object.keys(this.store.snapshot().reviewCards).length > 0 ||
      this.store.snapshot().practiceAttempts.length > 0;
    return buildRestorePreview(manifest, localHasData);
  }

  restore(manifest: LearnerExportManifest, confirmation: RestoreConfirmation): LocalStoreSnapshot {
    if (!confirmation.confirmOverwrite) {
      throw new TypeError('Restore refused: merge/update confirmation not supplied');
    }
    const preview = this.preview(manifest);
    if (preview.overwriteConfirmationRequired && !confirmation.confirmOverwrite) {
      throw new TypeError('Restore refused: local data exists and merge/update was not confirmed');
    }
    const acknowledged = new Set(confirmation.acknowledgedWarnings);
    for (const warning of preview.warnings) {
      if (!acknowledged.has(warning.kind)) {
        throw new TypeError(`Restore refused: warning ${warning.kind} not acknowledged`);
      }
    }

    for (const item of manifest.content.savedItems) {
      this.store.putSavedItem(item);
    }
    for (const occurrence of manifest.content.savedOccurrences) {
      this.store.putSavedOccurrence(occurrence);
    }
    for (const card of manifest.content.reviewCards) {
      this.store.putReviewCard(card);
    }
    for (const state of manifest.content.reviewCardStates) {
      this.store.putReviewCardState(state);
    }
    for (const event of manifest.content.reviewEvents) {
      this.store.addReviewEvent(event);
    }
    for (const attempt of manifest.content.practiceAttempts) {
      this.store.addPracticeAttempt(attempt);
    }

    return this.store.snapshot();
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
