/**
 * The numbers behind the Stats screen and the weekly report.
 * Pure logic: every function works from the cards and reviews it is given.
 *
 * "Retention" here always means TRUE retention: of the reviews of cards you had
 * already learned (cards in the "review" state), the share you remembered
 * (Hard, Good or Easy rather than Again). Reviews of cards you were still
 * learning don't count, because getting those wrong is part of learning them.
 */
import { AREA_WINDOW_DAYS, MATURE_INTERVAL_DAYS, MAX_SECONDS_PER_CARD, MIN_REVIEWS_FOR_AREA } from '../config';
import type { CardType, Direction, ReviewRecord, SchedulingState, StoredCard, StudyDay } from '../types';
import { addDays, dateRange, daysBetween, studyDate } from './dates';
import { hasTwoDirections, itemsOf } from './directions';
import { endOfStudyDay, startOfStudyDay } from './time';

// ---------- Time windows ----------

/** The start of a window covering today and the `days - 1` study days before it. */
export function windowStart(now: Date, days: number): Date {
  const start = startOfStudyDay(now);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

/** The reviews made at or after `since`. */
export function reviewsSince(reviews: ReviewRecord[], since: Date): ReviewRecord[] {
  const from = since.toISOString();
  return reviews.filter((review) => review.timestamp >= from);
}

// ---------- Retention ----------

export interface Retention {
  /** Reviews of cards that had already been learned. */
  reviews: number;
  /** How many of those were remembered (Hard, Good or Easy). */
  remembered: number;
  /** remembered ÷ reviews, from 0 to 1. null when there were no such reviews. */
  rate: number | null;
}

const wasLearned = (review: ReviewRecord) => review.before.state === 2;
const wasRemembered = (review: ReviewRecord) => review.rating > 1;

export function retention(reviews: ReviewRecord[]): Retention {
  const learned = reviews.filter(wasLearned);
  const remembered = learned.filter(wasRemembered).length;
  return { reviews: learned.length, remembered, rate: learned.length === 0 ? null : remembered / learned.length };
}

/** "92%", or "–" when there is nothing to go on. */
export function percent(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)}%`;
}

/**
 * Retention for each direction, side by side. To compare like with like, only vocab and phrase
 * cards are counted: they are the ones studied both ways.
 */
export function retentionByDirection(
  reviews: ReviewRecord[],
  cards: Map<string, StoredCard>,
): Record<Direction, Retention> {
  const twoWay = reviews.filter((review) => {
    const card = cards.get(review.cardId);
    return card !== undefined && hasTwoDirections(card.type);
  });
  return {
    recognition: retention(twoWay.filter((review) => review.direction === 'recognition')),
    production: retention(twoWay.filter((review) => review.direction === 'production')),
  };
}

// ---------- Activity ----------

/** Reviews on each of the last `days` days, oldest first, today last. Days without study are 0. */
export function reviewsPerDay(studyDays: StudyDay[], now: Date, days: number): StudyDay[] {
  const counts = new Map(studyDays.map((day) => [day.date, day.reviews]));
  const today = studyDate(now);
  return dateRange(addDays(today, -(days - 1)), today).map((date) => ({ date, reviews: counts.get(date) ?? 0 }));
}

/** The average time per card in seconds (null if there are no reviews). Very long pauses are capped. */
export function averageSeconds(reviews: ReviewRecord[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + Math.min(review.durationMs / 1000, MAX_SECONDS_PER_CARD), 0);
  return total / reviews.length;
}

// ---------- Cards learned over time ----------

export interface LearnedPoint {
  date: string;
  /** How many cards had reached the "review" state by the end of that day. */
  total: number;
}

/**
 * How the number of learned cards has grown. A card counts from the first day
 * any direction of it reached the "review" state, and stays counted.
 * One point per day on which the number changed.
 */
export function learnedOverTime(reviews: ReviewRecord[]): LearnedPoint[] {
  const firstLearned = new Map<string, string>();
  for (const review of reviews) {
    if (review.after.state !== 2) continue;
    const known = firstLearned.get(review.cardId);
    if (known === undefined || review.timestamp < known) firstLearned.set(review.cardId, review.timestamp);
  }
  const perDay = new Map<string, number>();
  for (const timestamp of firstLearned.values()) {
    const date = studyDate(new Date(timestamp));
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }
  let total = 0;
  return [...perDay.keys()].sort().map((date) => ({ date, total: (total += perDay.get(date)!) }));
}

/** How many cards first reached the "review" state between two dates (both included). */
export function learnedBetween(points: LearnedPoint[], from: string, to: string): number {
  const totalBy = (date: string) => points.filter((point) => point.date <= date).at(-1)?.total ?? 0;
  return totalBy(to) - totalBy(addDays(from, -1));
}

// ---------- Card counts ----------

export interface StageCounts {
  new: number;
  learning: number;
  /** In review, coming back in under MATURE_INTERVAL_DAYS days. */
  young: number;
  /** In review, coming back in MATURE_INTERVAL_DAYS days or more. */
  mature: number;
}

export interface CardCounts {
  total: number;
  /** Every card, by the stage of the card as written (for vocab and phrase cards: Spanish → English). */
  cards: StageCounts;
  /** The English → Spanish sides of vocab and phrase cards, by stage. */
  production: StageCounts;
  productionTotal: number;
  /** These two overlap with the stages above: a paused card is still new, learning or in review. */
  paused: number;
  leeches: number;
}

function stage(scheduling: SchedulingState): keyof StageCounts {
  if (scheduling.state === 0) return 'new';
  if (scheduling.state !== 2) return 'learning';
  return scheduling.scheduledDays >= MATURE_INTERVAL_DAYS ? 'mature' : 'young';
}

export function cardCounts(cards: StoredCard[]): CardCounts {
  const counts: CardCounts = {
    total: cards.length,
    cards: { new: 0, learning: 0, young: 0, mature: 0 },
    production: { new: 0, learning: 0, young: 0, mature: 0 },
    productionTotal: 0,
    paused: 0,
    leeches: 0,
  };
  for (const card of cards) {
    counts.cards[stage(card.scheduling)]++;
    if (card.production) {
      counts.production[stage(card.production.scheduling)]++;
      counts.productionTotal++;
    }
    if (card.paused) counts.paused++;
    if (card.leech) counts.leeches++;
  }
  return counts;
}

// ---------- Forecast ----------

export interface ForecastDay {
  date: string;
  /** Reviews due that day. Today also holds everything that is overdue. */
  due: number;
}

/**
 * How many reviews are due on each of the next `days` days, starting today.
 * Only cards already being studied are counted (new cards have no due date yet), and nothing paused.
 */
export function forecast(cards: StoredCard[], now: Date, days: number): ForecastDay[] {
  const today = studyDate(now);
  const endOfToday = endOfStudyDay(now).getTime();
  const result = dateRange(today, addDays(today, days - 1)).map((date) => ({ date, due: 0 }));
  for (const item of cards.flatMap(itemsOf)) {
    if (item.paused || item.scheduling.state === 0) continue;
    const due = new Date(item.scheduling.dueAt);
    const daysAway = due.getTime() < endOfToday ? 0 : daysBetween(today, studyDate(due));
    if (daysAway < days) result[daysAway].due++;
  }
  return result;
}

// ---------- Strengths and weaknesses ----------

/** One tag or one card type, and how its learned cards did. */
export interface Area {
  kind: 'tag' | 'type';
  name: string;
  /** Reviews of learned cards in this area. */
  reviews: number;
  remembered: number;
  /** Times a learned card in this area was forgotten (rated Again). */
  lapses: number;
  /** remembered ÷ reviews, from 0 to 1. */
  rate: number;
}

/** Retention and lapses for every tag and every card type that has at least one review of a learned card. */
export function areaStats(reviews: ReviewRecord[], cards: Map<string, StoredCard>): Area[] {
  const tallies = new Map<string, Area>();
  const count = (kind: Area['kind'], name: string, remembered: boolean) => {
    const key = `${kind}\n${name}`;
    const area = tallies.get(key) ?? { kind, name, reviews: 0, remembered: 0, lapses: 0, rate: 0 };
    area.reviews++;
    if (remembered) area.remembered++;
    else area.lapses++;
    tallies.set(key, area);
  };

  for (const review of reviews.filter(wasLearned)) {
    const card = cards.get(review.cardId);
    if (!card) continue;
    count('type', card.type, wasRemembered(review));
    for (const tag of card.tags) count('tag', tag, wasRemembered(review));
  }
  return [...tallies.values()]
    .map((area) => ({ ...area, rate: area.remembered / area.reviews }))
    .sort((a, b) => b.reviews - a.reviews || a.name.localeCompare(b.name));
}

export interface StrongAndWeak {
  strongest: Area[];
  weakest: Area[];
}

/**
 * The (up to) 3 strongest and 3 weakest areas, judged by retention.
 *  - Areas with fewer than MIN_REVIEWS_FOR_AREA reviews are ignored: too little to go on.
 *  - No area is listed on both sides, so with only a few areas each list is shorter.
 *  - An area that was never forgotten is not called a weakness.
 */
export function strongestAndWeakest(areas: Area[]): StrongAndWeak {
  const ranked = areas
    .filter((area) => area.reviews >= MIN_REVIEWS_FOR_AREA)
    .sort((a, b) => b.rate - a.rate || b.reviews - a.reviews || a.name.localeCompare(b.name));
  const strongest = ranked.slice(0, Math.min(3, Math.ceil(ranked.length / 2)));
  const weakest = ranked
    .slice(strongest.length)
    .filter((area) => area.lapses > 0)
    .slice(-3)
    .reverse();
  return { strongest, weakest };
}

/** The start of the period the strengths and weaknesses look at. */
export function areaWindowStart(now: Date): Date {
  return windowStart(now, AREA_WINDOW_DAYS);
}

/** Looking a card up by id, for the functions above. */
export function byId(cards: StoredCard[]): Map<string, StoredCard> {
  return new Map(cards.map((card) => [card.id, card]));
}

/** The names of the card types, for labels. */
export const TYPE_NAMES: Record<CardType, string> = {
  vocab: 'Vocab',
  phrase: 'Phrases',
  conjugation: 'Conjugation',
  grammar: 'Grammar',
  listening: 'Listening',
  cloze: 'Fill in the blank',
};
