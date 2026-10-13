import { validateLearnerExportManifest, buildRestorePreview, defaultPrivacyWarnings, type LearnerExportManifest, type ReviewEvent, type PracticeAttempt } from '@lingotorte/domain';
import type { LocalStoreSnapshot } from './localStore.ts';
import { sameHistoryPayload } from './learnerAudit.ts';

export type RestoreMode = 'merge' | 'replace-active';
export type RestoreAudit = { reviewEvents: ReviewEvent[]; practiceAttempts: PracticeAttempt[] };
const collections = ['savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'reviewEvents', 'practiceAttempts'] as const;
type Collection = typeof collections[number];
type RecordValue = { id?: string; cardId?: string; [key: string]: unknown };
const key = (r: RecordValue, name: Collection): string => (name === 'reviewCardStates' ? r.cardId : r.id) as string;
const equal = sameHistoryPayload;

/** Pure, detached preflight. No store writes, rerating or provider calls. */
export function planLearnerRestore(input: unknown, mode: RestoreMode, active: LocalStoreSnapshot, audit: RestoreAudit = active.learnerAudit ?? { reviewEvents: [], practiceAttempts: [] }) {
  if (mode !== 'merge' && mode !== 'replace-active') throw new TypeError('Unknown restore mode');
  const validated = validateLearnerExportManifest(input);
  const content = structuredClone(validated.content);
  const candidate = structuredClone(active);
  const retained = structuredClone(audit);
  const coalesced = Object.fromEntries(collections.map(name => [name, 0])) as Record<Collection, number>;
  const effects = {} as Record<Collection, { added: number; updated: number; skippedIdentical: number; removedFromActive: number; reactivated: number; activeAfter: number }>;
  for (const name of collections) {
    const incoming = content[name] as unknown as RecordValue[];
    const unique = new Map<string, RecordValue>();
    for (const r of incoming) {
      const id = key(r, name); const prior = unique.get(id);
      if (prior && !equal(prior, r)) throw new TypeError(`Restore conflict: duplicate ${name} ID`);
      if (prior) coalesced[name]++; else unique.set(id, r);
    }
    (content as unknown as Record<string, unknown>)[name] = [...unique.values()];
    const history = name === 'reviewEvents' || name === 'practiceAttempts';
    const current = new Map<string, RecordValue>((history ? active[name] : Object.values(active[name])) .map(r => [key(r as unknown as RecordValue, name), r as unknown as RecordValue]));
    const archive = new Map<string, RecordValue>();
    if (history) for (const r of [...retained[name], ...active[name]]) {
      const value = r as unknown as RecordValue; const id = key(value, name);
      if (archive.has(id) && !equal(archive.get(id), value)) throw new TypeError(`Restore conflict: retained ${name} ID`);
      archive.set(id, value);
    }
    const next = mode === 'merge' ? new Map(current) : new Map<string, RecordValue>();
    const count = { added: 0, updated: 0, skippedIdentical: 0, removedFromActive: 0, reactivated: 0, activeAfter: 0 };
    for (const [id, r] of unique) {
      const prior = current.get(id); const immutable = archive.get(id);
      if (history && immutable && !equal(immutable, r)) throw new TypeError(`Restore conflict: immutable ${name} ID`);
      if (prior && !history) {
        const anchors = name === 'savedItems' ? ['kind', 'language', 'createdAt'] : name === 'savedOccurrences' ? ['savedItemId', 'mediaId', 'cueId', 'startMs', 'endMs', 'selectionKind', 'selectionText', 'createdAt', 'sourceContext'] : name === 'reviewCards' ? ['savedItemId', 'savedOccurrenceId', 'cardType', 'createdAt'] : ['cardId'];
        if (anchors.some(field => !equal(prior[field], r[field]))) throw new TypeError(`Restore conflict: ${name} identity anchor`);
      }
      if (prior) { if (equal(prior, r)) count.skippedIdentical++; else count.updated++; }
      else if (history && immutable) count.reactivated++; else count.added++;
      next.set(id, r); if (history) archive.set(id, r);
    }
    count.removedFromActive = mode === 'replace-active' ? [...current.keys()].filter(id => !unique.has(id)).length : 0;
    count.activeAfter = next.size; effects[name] = count;
    const historyOrder = (a: RecordValue, b: RecordValue) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)) || String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id));
    (candidate as unknown as Record<string, unknown>)[name] = history ? [...next.values()].sort(historyOrder) : Object.fromEntries(next);
    if (history) (retained as unknown as Record<string, unknown>)[name] = [...archive.values()].sort(historyOrder);
  }
  const requireRef = (ok: unknown, name: string) => { if (!ok) throw new TypeError(`Restore invalid reference: ${name}`); };
  // Validate introduced records against the resulting active dataset, retaining legacy orphans unchanged.
  const own = <T>(records: Record<string, T>, id: string): T | undefined => Object.hasOwn(records, id) ? records[id] : undefined;
  for (const o of content.savedOccurrences) requireRef(own(candidate.savedItems, o.savedItemId), 'occurrence item');
  for (const c of content.reviewCards) { const o = own(candidate.savedOccurrences, c.savedOccurrenceId); requireRef(own(candidate.savedItems, c.savedItemId) && o?.savedItemId === c.savedItemId, 'card ownership'); }
  for (const s of content.reviewCardStates) requireRef(own(candidate.reviewCards, s.cardId), 'state card');
  for (const e of content.reviewEvents) requireRef(own(candidate.reviewCards, e.cardId), 'review card');
  for (const a of content.practiceAttempts) { requireRef(own(candidate.reviewCards, a.cardId), 'practice card'); if (a.eventLink.reviewEventId !== undefined) requireRef(candidate.reviewEvents.some(e => e.id === a.eventLink.reviewEventId && e.cardId === a.cardId), 'practice review'); }
  const manifest = { ...validated, content } as LearnerExportManifest;
  const preview = buildRestorePreview(manifest, active);
  const warnings = [...new Map([...defaultPrivacyWarnings(false).filter(w => w.kind !== 'export-file-is-unencrypted'), ...preview.warnings].map(w => [w.kind, w])).values()];
  if (mode === 'replace-active') warnings.push({ kind: 'restore-overwrites-local-data', severity: 'critical', message: 'Removes current active learner records not in this file. Prior review/practice history is retained locally as inactive audit. This does not erase private data.' });
  const auditEffects = {
    reviewEvents: { appended: retained.reviewEvents.length - new Set([...audit.reviewEvents, ...active.reviewEvents].map(e => e.id)).size, retained: retained.reviewEvents.length, inactiveAfter: retained.reviewEvents.filter(e => !candidate.reviewEvents.some(a => a.id === e.id)).length },
    practiceAttempts: { appended: retained.practiceAttempts.length - new Set([...audit.practiceAttempts, ...active.practiceAttempts].map(e => e.id)).size, retained: retained.practiceAttempts.length, inactiveAfter: retained.practiceAttempts.filter(e => !candidate.practiceAttempts.some(a => a.id === e.id)).length },
  };
  const authoritative = { ...candidate, learnerAudit: { version: 1 as const, ...retained } };
  return { candidate: authoritative, audit: retained, auditEffects, preview: { ...preview, warnings, mode, effects, auditEffects, coalesced, durability: 'preview-only' as const, integrity: 'semantic-hash-verified' as const }, mode, effects, coalesced, integrity: 'semantic-hash-verified' as const, durability: 'preview-only' as const };
}
