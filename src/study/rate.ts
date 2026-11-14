/**
 * Works out everything that should be saved when a card is rated.
 * Pure logic: it builds the records, src/data/db.ts saves them.
 */
import type { AnswerResult, ReviewRecord, StoredCard } from '../types';
import { directionChange, type StudyItem } from './directions';
import { isLeechSchedule, leechFlag } from './leech';
import type { RatingOutcome } from './scheduler';

/** A typed answer and how it compared, to be kept with the review. */
export interface TypedAnswer {
  typed: string;
  result: AnswerResult;
}

export interface RatedCard {
  /** The entry for the review history. */
  review: ReviewRecord;
  /** What changes on the card: the schedule of the direction studied, and the leech mark and flag. */
  changes: Partial<StoredCard>;
  /** The same fields as they were before, so that Undo can put them back. */
  previous: Partial<StoredCard>;
  /** True only for the one review that turns the card into a leech. */
  becameLeech: boolean;
}

export function rateCard(
  item: StudyItem,
  outcome: RatingOutcome,
  revealedAt: Date,
  durationMs: number,
  answer: TypedAnswer | null = null,
): RatedCard {
  const { card, direction } = item;
  const becameLeech = !card.leech && isLeechSchedule(outcome.after);
  // The first review is the moment the card (in this direction) is "introduced".
  const introducedAt = item.introducedAt ?? revealedAt.toISOString();

  return {
    review: {
      cardId: card.id,
      direction,
      rating: outcome.rating,
      timestamp: revealedAt.toISOString(),
      durationMs,
      typed: answer?.typed ?? null,
      typedResult: answer?.result ?? null,
      before: item.scheduling,
      after: outcome.after,
    },
    changes: {
      ...directionChange(card, direction, outcome.after, introducedAt),
      leech: card.leech || becameLeech,
      // A flag you wrote yourself is never overwritten by the automatic one.
      flag: becameLeech && !card.flag ? leechFlag(revealedAt) : card.flag,
    },
    previous: {
      ...directionChange(card, direction, item.scheduling, item.introducedAt),
      leech: card.leech,
      flag: card.flag,
    },
    becameLeech,
  };
}
