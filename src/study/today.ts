/** Loads what the Home and Review screens need to know about today. */
import { getAllCards, getReviewsSince, getSettings } from '../data/db';
import type { Settings, StoredCard } from '../types';
import type { QueueOptions } from './queue';
import { startOfStudyDay } from './time';

export interface Today {
  cards: StoredCard[];
  settings: Settings;
  reviewsToday: number;
  /** The ids of the cards reviewed today (each listed once). */
  reviewedTodayIds: string[];
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
    settings,
    reviewsToday: reviews.length,
    reviewedTodayIds: [...new Set(reviews.map((review) => review.cardId))],
    queueOptions: {
      now,
      newCardsPerDay: settings.newCardsPerDay,
      // A card counts as "introduced today" if it was brand new before one of today's reviews.
      newCardsDoneToday: reviews.filter((review) => review.before.state === 0).length,
    },
  };
}
