import { canonicalJson, validateReviewEvent, validatePracticeAttempt, type ReviewEvent, type PracticeAttempt } from '@lingotorte/domain';

export type LearnerAudit = Readonly<{ version: 1; reviewEvents: ReviewEvent[]; practiceAttempts: PracticeAttempt[] }>;
export type History = { reviewEvents: ReviewEvent[]; practiceAttempts: PracticeAttempt[] };
export const sameHistoryPayload = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
export function unionHistory<T extends { id: string }>(name: string, ...groups: readonly T[][]): T[] {
  const records = new Map<string, T>();
  for (const group of groups) for (const record of group) {
    const prior = records.get(record.id);
    if (prior && !sameHistoryPayload(prior, record)) throw new TypeError(`Immutable history conflict: ${name === 'reviewEvents' ? 'append-only review event' : name} ${record.id}`);
    records.set(record.id, record);
  }
  return structuredClone([...records.values()]);
}
export function normalizeLearnerAudit(value: unknown, active: History): LearnerAudit {
  let validatedActive: History;
  try { validatedActive = { reviewEvents: active.reviewEvents.map(validateReviewEvent), practiceAttempts: active.practiceAttempts.map(v => validatePracticeAttempt(v)) }; }
  catch { throw new TypeError('Invalid active learner history payload'); }
  if (value === undefined) return { version: 1, reviewEvents: unionHistory('reviewEvents', validatedActive.reviewEvents), practiceAttempts: unionHistory('practiceAttempts', validatedActive.practiceAttempts) };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid internal learner audit');
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || Object.keys(record).some(k => !['version', 'reviewEvents', 'practiceAttempts'].includes(k)) || !Array.isArray(record.reviewEvents) || !Array.isArray(record.practiceAttempts)) throw new TypeError('Unsupported internal learner audit format');
  let reviews: ReviewEvent[]; let attempts: PracticeAttempt[];
  try { reviews = record.reviewEvents.map(validateReviewEvent); attempts = record.practiceAttempts.map(v => validatePracticeAttempt(v)); }
  catch { throw new TypeError('Invalid internal learner audit payload'); }
  return { version: 1, reviewEvents: unionHistory('reviewEvents', reviews, validatedActive.reviewEvents), practiceAttempts: unionHistory('practiceAttempts', attempts, validatedActive.practiceAttempts) };
}
