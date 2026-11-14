import { describe, expect, it } from 'vitest';
import { LEECH_THRESHOLD } from '../src/config';
import { itemOf } from '../src/study/directions';
import { rateCard } from '../src/study/rate';
import type { RatingOutcome } from '../src/study/scheduler';
import type { CardFlag, Direction, SchedulingState, StoredCard } from '../src/types';
import { makeCard, makeProduction } from './helpers';

const revealedAt = new Date('2026-04-01T08:00:00.000Z');
const learned = { state: 2, scheduleStatus: 'review', scheduledDays: 5, reps: 10 } as const;

/** A card that has been forgotten `lapses` times, and the outcome of forgetting it once more. */
function forgetOnceMore(lapses: number, other: Partial<StoredCard> = {}, direction: Direction = 'recognition') {
  const card = makeCard('c', { ...learned, lapses }, 1, {
    introducedAt: '2026-01-05T08:00:00.000Z',
    production: makeProduction('c', { ...learned, lapses }),
    ...other,
  });
  const item = itemOf(card, direction)!;
  const after: SchedulingState = { ...item.scheduling, state: 3, lapses: lapses + 1, reps: 11 };
  const outcome: RatingOutcome = { rating: 1, after };
  return { card, item, outcome };
}

describe('rateCard', () => {
  it('builds the history entry with the direction and the state before and after', () => {
    const { card, item, outcome } = forgetOnceMore(0);
    const { review } = rateCard(item, outcome, revealedAt, 3500);
    expect(review).toEqual({
      cardId: 'c',
      direction: 'recognition',
      rating: 1,
      timestamp: revealedAt.toISOString(),
      durationMs: 3500,
      typed: null,
      typedResult: null,
      before: card.scheduling,
      after: outcome.after,
    });
  });

  it('keeps what was typed and how it compared', () => {
    const { item, outcome } = forgetOnceMore(0, {}, 'production');
    const { review } = rateCard(item, outcome, revealedAt, 0, { typed: 'el tablro', result: 'wrong' });
    expect(review).toMatchObject({ direction: 'production', typed: 'el tablro', typedResult: 'wrong' });
  });

  it('changes only the direction that was studied', () => {
    const { card, item, outcome } = forgetOnceMore(0, {}, 'production');
    const { changes, previous } = rateCard(item, outcome, revealedAt, 0);

    expect(changes.production?.scheduling).toEqual(outcome.after);
    expect(changes).not.toHaveProperty('scheduling'); // the Spanish → English side is left alone
    expect(previous.production).toEqual(card.production);

    const recognition = forgetOnceMore(0);
    const rated = rateCard(recognition.item, recognition.outcome, revealedAt, 0);
    expect(rated.changes.scheduling).toEqual(recognition.outcome.after);
    expect(rated.changes).not.toHaveProperty('production');
  });

  it('notes the first time a card is studied, and never changes it afterwards', () => {
    const fresh = makeCard('n');
    const outcome: RatingOutcome = { rating: 3, after: { ...fresh.scheduling, state: 1, reps: 1 } };
    const first = rateCard(itemOf(fresh, 'recognition')!, outcome, revealedAt, 0);
    expect(first.changes.introducedAt).toBe(revealedAt.toISOString());
    expect(first.previous.introducedAt).toBeNull(); // so Undo makes it "never studied" again

    const { item, outcome: again } = forgetOnceMore(0);
    expect(rateCard(item, again, revealedAt, 0).changes.introducedAt).toBe('2026-01-05T08:00:00.000Z');
  });

  it('leaves an ordinary card unmarked', () => {
    const { item, outcome } = forgetOnceMore(LEECH_THRESHOLD - 2);
    expect(rateCard(item, outcome, revealedAt, 0)).toMatchObject({
      becameLeech: false,
      changes: { leech: false, flag: null },
    });
  });

  it(`turns a card into a leech the moment it has been forgotten ${LEECH_THRESHOLD} times, and flags it`, () => {
    for (const direction of ['recognition', 'production'] as const) {
      const { item, outcome } = forgetOnceMore(LEECH_THRESHOLD - 1, {}, direction);
      const rated = rateCard(item, outcome, revealedAt, 0);
      expect(rated.becameLeech).toBe(true);
      expect(rated.changes.leech).toBe(true);
      expect(rated.changes.flag).toMatchObject({ by: 'leech', flaggedAt: revealedAt.toISOString() });
      expect(rated.changes.flag?.reason).toContain(String(LEECH_THRESHOLD));
      expect(rated.previous).toMatchObject({ leech: false, flag: null });
    }
  });

  it('announces a leech only once', () => {
    const { item, outcome } = forgetOnceMore(LEECH_THRESHOLD, { leech: true });
    const rated = rateCard(item, outcome, revealedAt, 0);
    expect(rated.becameLeech).toBe(false);
    expect(rated.changes.leech).toBe(true);
  });

  it('does not put the flag back if you removed it from a leech', () => {
    const { item, outcome } = forgetOnceMore(LEECH_THRESHOLD + 2, { leech: true, flag: null });
    expect(rateCard(item, outcome, revealedAt, 0).changes.flag).toBeNull();
  });

  it('never overwrites a flag you wrote yourself', () => {
    const mine: CardFlag = { reason: 'translation seems wrong', flaggedAt: '2026-03-01T00:00:00.000Z', by: 'you' };
    const { item, outcome } = forgetOnceMore(LEECH_THRESHOLD - 1, { flag: mine });
    const rated = rateCard(item, outcome, revealedAt, 0);
    expect(rated.becameLeech).toBe(true);
    expect(rated.changes.flag).toEqual(mine);
  });

  it('does not pause a leech', () => {
    const { item, outcome } = forgetOnceMore(LEECH_THRESHOLD - 1);
    expect(rateCard(item, outcome, revealedAt, 0).changes).not.toHaveProperty('paused');
  });
});
