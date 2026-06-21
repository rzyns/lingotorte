import { describe, expect, it } from 'vitest';
import { recomputeStateFromEvents, defaultFsrsConfig, ReviewScheduler } from '../../packages/review/src';
import { withNoNetwork } from './networkTrap';

describe('P5 review no-network behavior', () => {
  it('schedules reviews without any network calls', async () => {
    const scheduler = new ReviewScheduler(defaultFsrsConfig());
    const cardId = 'no-net-card-1';
    const t0 = new Date('2026-06-21T12:00:00.000Z');
    const state = scheduler.createInitialState(cardId);

    const result = await withNoNetwork(() =>
      scheduler.applyRating(cardId, state, 'good', t0),
    );

    expect(result.networkAttempts).toEqual([]);
    expect(result.value.nextState.state).toBe('learning');
  });

  it('recomputes state from events without any network calls', async () => {
    const t0 = new Date('2026-06-21T12:00:00.000Z');
    const result = await withNoNetwork(() =>
      recomputeStateFromEvents('recompute-no-net', [
        { reviewedAt: t0.toISOString(), rating: 'good' },
        { reviewedAt: new Date(t0.valueOf() + 86_400_000).toISOString(), rating: 'good' },
      ]),
    );

    expect(result.networkAttempts).toEqual([]);
    expect(result.value.state).toBe('learning');
  });
});
