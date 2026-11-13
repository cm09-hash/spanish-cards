import { describe, expect, it } from 'vitest';
import { LEECH_THRESHOLD } from '../src/config';
import { rateCard } from '../src/study/rate';
import type { RatingOutcome } from '../src/study/scheduler';
import type { CardFlag, SchedulingState } from '../src/types';
import { makeCard } from './helpers';

const revealedAt = new Date('2026-04-01T08:00:00.000Z');

/** A card that has been forgotten `lapses` times, and the outcome of forgetting it once more. */
function forgetOnceMore(lapses: number, other = {}) {
  const card = makeCard('c', { state: 2, scheduleStatus: 'review', scheduledDays: 5, reps: 10, lapses }, 1, other);
  const after: SchedulingState = { ...card.scheduling, state: 3, lapses: lapses + 1, reps: 11 };
  const outcome: RatingOutcome = { rating: 1, after };
  return { card, outcome };
}

describe('rateCard', () => {
  it('builds the history entry with the state before and after', () => {
    const { card, outcome } = forgetOnceMore(0);
    const { review } = rateCard(card, outcome, revealedAt, 3500);
    expect(review).toEqual({
      cardId: 'c',
      rating: 1,
      timestamp: revealedAt.toISOString(),
      durationMs: 3500,
      before: card.scheduling,
      after: outcome.after,
    });
  });

  it('leaves an ordinary card unmarked', () => {
    const { card, outcome } = forgetOnceMore(LEECH_THRESHOLD - 2);
    expect(rateCard(card, outcome, revealedAt, 0)).toMatchObject({
      becameLeech: false,
      marks: { leech: false, flag: null },
    });
  });

  it(`turns a card into a leech the moment it has been forgotten ${LEECH_THRESHOLD} times, and flags it`, () => {
    const { card, outcome } = forgetOnceMore(LEECH_THRESHOLD - 1);
    const rated = rateCard(card, outcome, revealedAt, 0);
    expect(rated.becameLeech).toBe(true);
    expect(rated.marks.leech).toBe(true);
    expect(rated.marks.flag).toMatchObject({ by: 'leech', flaggedAt: revealedAt.toISOString() });
    expect(rated.marks.flag?.reason).toContain(String(LEECH_THRESHOLD));
  });

  it('announces a leech only once', () => {
    const { card, outcome } = forgetOnceMore(LEECH_THRESHOLD, { leech: true });
    const rated = rateCard(card, outcome, revealedAt, 0);
    expect(rated.becameLeech).toBe(false);
    expect(rated.marks.leech).toBe(true);
  });

  it('does not put the flag back if you removed it from a leech', () => {
    const { card, outcome } = forgetOnceMore(LEECH_THRESHOLD + 2, { leech: true, flag: null });
    expect(rateCard(card, outcome, revealedAt, 0).marks.flag).toBeNull();
  });

  it('never overwrites a flag you wrote yourself', () => {
    const mine: CardFlag = { reason: 'translation seems wrong', flaggedAt: '2026-03-01T00:00:00.000Z', by: 'you' };
    const { card, outcome } = forgetOnceMore(LEECH_THRESHOLD - 1, { flag: mine });
    const rated = rateCard(card, outcome, revealedAt, 0);
    expect(rated.becameLeech).toBe(true);
    expect(rated.marks.flag).toEqual(mine);
  });

  it('does not pause a leech', () => {
    const { card, outcome } = forgetOnceMore(LEECH_THRESHOLD - 1);
    expect(rateCard(card, outcome, revealedAt, 0).marks).not.toHaveProperty('paused');
  });
});
