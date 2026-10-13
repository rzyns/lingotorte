import { afterEach, describe, expect, it } from 'vitest';
import {
  createAppModel,
  studyMetrics,
  computeStudyMetricsFromEvents,
  fixedOffsetDayKey,
  localDayKey,
  studyActionInstants,
  timeZoneDayKey,
  STUDY_ESTIMATE_MS_PER_ACTION,
} from '../../apps/web/src/model';

const E = STUDY_ESTIMATE_MS_PER_ACTION;
const NY = timeZoneDayKey('America/New_York');

describe('lt-8vu study metrics policy', () => {
  it('counts a practice attempt and its linked review event as one action', () => {
    const reviews = [
      { id: 'r-linked', reviewedAt: '2026-10-12T15:00:00.000Z' },
      { id: 'r-plain', reviewedAt: '2026-10-12T15:01:00.000Z' },
    ];
    const practice = [
      { reviewedAt: '2026-10-12T15:00:00.000Z', eventLink: { reviewEventId: 'r-linked' } },
      { reviewedAt: '2026-10-12T15:02:00.000Z', eventLink: {} }, // skipped / updateFsrs false
    ];
    const actions = studyActionInstants(reviews, practice);
    expect(actions).toHaveLength(3);
    const m = computeStudyMetricsFromEvents(actions, new Date('2026-10-12T16:00:00.000Z'), NY);
    expect(m.totalStudyTimeMs).toBe(3 * E);
    expect(m.todayStudyTimeMs).toBe(3 * E);
    expect(m.streakDays).toBe(1);
  });

  it('keeps a review whose linking practice attempt references an unknown id', () => {
    const actions = studyActionInstants([{ id: 'r1', reviewedAt: '2026-10-12T15:00:00.000Z' }], [
      { reviewedAt: '2026-10-12T15:00:00.000Z', eventLink: { reviewEventId: 'missing' } },
    ]);
    expect(actions).toHaveLength(2);
  });

  it('uses the learner local day, not UTC, near local midnight', () => {
    // 2026-10-13T02:30Z is 22:30 on Oct 12 in New York (EDT, UTC-4).
    const asOf = new Date('2026-10-13T03:00:00.000Z'); // 23:00 Oct 12 local
    const m = computeStudyMetricsFromEvents(['2026-10-13T02:30:00.000Z'], asOf, NY);
    expect(m.todayStudyTimeMs).toBe(E);
    expect(m.lastStudyDate).toBe('2026-10-12');
    // Fixed-offset injection agrees.
    expect(computeStudyMetricsFromEvents(['2026-10-13T02:30:00.000Z'], asOf, fixedOffsetDayKey(-240)).todayStudyTimeMs).toBe(E);
  });

  it('today vs yesterday across the local midnight boundary', () => {
    const lateYesterday = '2026-10-12T03:59:00.000Z'; // 23:59 Oct 11 NY
    const afterMidnight = new Date('2026-10-12T04:01:00.000Z'); // 00:01 Oct 12 NY
    const m = computeStudyMetricsFromEvents([lateYesterday], afterMidnight, NY);
    expect(m.todayStudyTimeMs).toBe(0);
    expect(m.streakDays).toBe(1); // yesterday keeps the streak alive
    expect(m.lastStudyDate).toBe('2026-10-11');
  });

  it('streak across consecutive local days and a gap breaks it', () => {
    const days = ['2026-10-09T23:30:00.000Z', '2026-10-11T01:00:00.000Z', '2026-10-12T14:00:00.000Z'];
    // NY local: Oct 9, Oct 10 (21:00), Oct 12 -> gap on Oct 11.
    const asOf = new Date('2026-10-12T20:00:00.000Z');
    expect(computeStudyMetricsFromEvents(days, asOf, NY).streakDays).toBe(1);
    const consecutive = [...days, '2026-10-11T15:00:00.000Z'];
    expect(computeStudyMetricsFromEvents(consecutive, asOf, NY).streakDays).toBe(4);
    // Two-day gap since last study resets the streak.
    expect(computeStudyMetricsFromEvents(days, new Date('2026-10-14T20:00:00.000Z'), NY).streakDays).toBe(0);
  });

  it('DST fall-back (23h/25h days) still counts consecutive calendar days', () => {
    // US DST ends 2026-11-01 02:00 local. Events at local 00:30 on Oct 31, Nov 1, Nov 2.
    const events = ['2026-10-31T04:30:00.000Z', '2026-11-01T04:30:00.000Z', '2026-11-02T05:30:00.000Z'];
    const m = computeStudyMetricsFromEvents(events, new Date('2026-11-02T06:00:00.000Z'), NY);
    expect(m.streakDays).toBe(3);
    expect(m.todayStudyTimeMs).toBe(E);
  });

  it('default day key uses runtime local calendar fields', () => {
    const d = new Date(2026, 9, 12, 0, 5);
    expect(localDayKey(d)).toBe('2026-10-12');
  });
});

describe('lt-8vu studyMetrics over the persisted store (public API)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz; });

  const review = (id: string, at: string) => ({ id, cardId: 'card-1', reviewedAt: at, rating: 'good', previousStateJson: '{}', nextStateJson: '{}', createdAt: at });
  const attempt = (id: string, at: string, link: Record<string, string>) => ({ id, cardId: 'card-1', mode: 'cloze', reviewedAt: at, createdAt: at, response: 'x', eventLink: link });

  it('linked practice+review counts once; unlinked attempt and plain review once each', () => {
    const m = createAppModel();
    m.clock = () => new Date('2026-10-12T16:00:00.000Z');
    // Synthetic persisted-store view: metrics derive only from snapshot().
    const base = m.store.snapshot();
    m.store.snapshot = (() => ({
      ...base,
      reviewEvents: [review('r-linked', '2026-10-12T15:00:00.000Z'), review('r-plain', '2026-10-12T15:01:00.000Z')],
      practiceAttempts: [
        attempt('p-linked', '2026-10-12T15:00:00.000Z', { reviewEventId: 'r-linked' }),
        attempt('p-skip', '2026-10-12T15:02:00.000Z', {}),
      ],
    })) as never;
    expect(studyMetrics(m).totalStudyTimeMs).toBe(3 * E);
  });

  it('default day is runtime-local (TZ=America/New_York), not the UTC date', () => {
    process.env.TZ = 'America/New_York';
    const m = createAppModel();
    m.clock = () => new Date('2026-10-13T03:00:00.000Z'); // 23:00 Oct 12 NY, already Oct 13 UTC
    m.store.addReviewEvent(review('r-evening', '2026-10-12T22:00:00.000Z') as never); // 18:00 Oct 12 NY
    const got = studyMetrics(m);
    expect(got.todayStudyTimeMs).toBe(E);
    expect(got.lastStudyDate).toBe('2026-10-12');
  });
});
