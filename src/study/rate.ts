/**
 * Works out everything that should be saved when a card is rated.
 * Pure logic: it builds the records, src/data/db.ts saves them.
 */
import type { CardMarks, ReviewRecord, StoredCard } from '../types';
import { isLeechSchedule, leechFlag } from './leech';
import type { RatingOutcome } from './scheduler';

/** The parts of a card that a review can change, so that Undo can put them back. */
export type ReviewableState = Pick<StoredCard, 'scheduling' | 'leech' | 'flag'>;

export interface RatedCard {
  /** The entry for the review history. */
  review: ReviewRecord;
  /** The card's leech mark and flag after this review. */
  marks: Pick<CardMarks, 'leech' | 'flag'>;
  /** True only for the one review that turns the card into a leech. */
  becameLeech: boolean;
}

export function rateCard(card: StoredCard, outcome: RatingOutcome, revealedAt: Date, durationMs: number): RatedCard {
  const becameLeech = !card.leech && isLeechSchedule(outcome.after);
  return {
    review: {
      cardId: card.id,
      rating: outcome.rating,
      timestamp: revealedAt.toISOString(),
      durationMs,
      before: card.scheduling,
      after: outcome.after,
    },
    marks: {
      leech: card.leech || becameLeech,
      // A flag you wrote yourself is never overwritten by the automatic one.
      flag: becameLeech && !card.flag ? leechFlag(revealedAt) : card.flag,
    },
    becameLeech,
  };
}
