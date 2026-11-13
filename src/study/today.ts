/** Loads what the Home and Review screens need to know about today. */
import { getAllCards, getReviewsSince, getSettings } from '../data/db';
import type { StoredCard } from '../types';
import type { QueueOptions } from './queue';
import { startOfStudyDay } from './time';

export interface Today {
  cards: StoredCard[];
  reviewsToday: number;
  /** Ready to hand to the functions in queue.ts. */
  queueOptions: QueueOptions;
}

export async function loadToday(now: Date): Promise<Today> {
  const [cards, settings, reviews] = await Promise.all([
    getAllCards(),
    getSettings(),
    getReviewsSince(startOfStudyDay(now)),
  ]);
  return {
    cards,
    reviewsToday: reviews.length,
    queueOptions: {
      now,
      newCardsPerDay: settings.newCardsPerDay,
      // A card counts as "introduced today" if it was brand new before one of today's reviews.
      newCardsDoneToday: reviews.filter((review) => review.before.state === 0).length,
    },
  };
}
