/** Loads what the Home and Review screens need to know about today. */
import { getAllCards, getReviewsSince, getSettings, getSprints } from '../data/db';
import type { Settings, Sprint, StoredCard } from '../types';
import { schedulingId } from './directions';
import type { QueueOptions } from './queue';
import { activeSprintTags, hasAnyTag } from './sprints';
import { startOfStudyDay } from './time';

export interface Today {
  cards: StoredCard[];
  settings: Settings;
  /** Every sprint, running or finished. */
  sprints: Sprint[];
  reviewsToday: number;
  /** The keys of the study items (card + direction) reviewed today, each listed once. */
  reviewedTodayKeys: string[];
  /** Ready to hand to the functions in queue.ts. */
  queueOptions: QueueOptions;
}

export async function loadToday(now: Date): Promise<Today> {
  const [cards, settings, sprints, reviews] = await Promise.all([
    getAllCards(),
    getSettings(),
    getSprints(),
    getReviewsSince(startOfStudyDay(now)),
  ]);

  // A card (in one direction) counts as "introduced today" if it was brand new before one of today's reviews.
  const introducedToday = reviews.filter((review) => review.before.state === 0);
  const sprintTags = activeSprintTags(sprints, now);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const fromSprints = introducedToday.filter((review) => {
    const card = cardsById.get(review.cardId);
    return card !== undefined && hasAnyTag(card, sprintTags);
  });

  return {
    cards,
    settings,
    sprints,
    reviewsToday: reviews.length,
    reviewedTodayKeys: [...new Set(reviews.map((review) => schedulingId(review.cardId, review.direction)))],
    queueOptions: {
      now,
      newCardsPerDay: settings.newCardsPerDay,
      newCardsDoneToday: introducedToday.length,
      sprintTags,
      sprintNewDoneToday: fromSprints.length,
    },
  };
}
