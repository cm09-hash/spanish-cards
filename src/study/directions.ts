/**
 * Cards in two directions.
 *
 * Vocab and phrase cards are studied two ways, each with its own schedule and history:
 *   recognition  Spanish → English   (the card as written)
 *   production   English → Spanish   (the card turned round)
 * Every other type of card has just the one direction, as written.
 *
 * The queue and the Review screen don't work with whole cards but with
 * "study items": one card in one direction. Pure logic, no database.
 */
import { PRODUCTION_DELAY_DAYS } from '../config';
import type { CardType, Direction, SchedulingState, StoredCard } from '../types';
import { startOfStudyDay } from './time';

/** One card, studied one way round. */
export interface StudyItem {
  /** Unique name for this item, e.g. "vocab-perro" or "vocab-perro#production". */
  key: string;
  card: StoredCard;
  direction: Direction;
  scheduling: SchedulingState;
  /** True if the whole card or just this direction is paused. */
  paused: boolean;
  introducedAt: string | null;
}

/** Do cards of this type get a production direction unless the import file says otherwise? */
export function hasTwoDirections(type: CardType): boolean {
  return type === 'vocab' || type === 'phrase';
}

/** The id ts-fsrs knows a direction by. Also used as the study item's key. */
export function schedulingId(cardId: string, direction: Direction): string {
  return direction === 'production' ? `${cardId}#production` : cardId;
}

/**
 * The state of something that has never been studied.
 * (Written out by hand rather than asked from ts-fsrs, so that upgrading the
 * database never has to wait for the scheduler. A test checks the two agree.)
 */
export function blankSchedulingState(cardId: string, now: Date): SchedulingState {
  return {
    cardId,
    state: 0,
    scheduleStatus: 'new',
    dueAt: now.toISOString(),
    lastReviewAt: null,
    stability: 0,
    stabilityFast: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningStep: 0,
    reps: 0,
    lapses: 0,
  };
}

/** A card's directions as study items: one for most cards, two for vocab and phrase cards. */
export function itemsOf(card: StoredCard): StudyItem[] {
  const items: StudyItem[] = [
    {
      key: schedulingId(card.id, 'recognition'),
      card,
      direction: 'recognition',
      scheduling: card.scheduling,
      paused: card.paused || card.recognitionPaused,
      introducedAt: card.introducedAt,
    },
  ];
  if (card.production) {
    items.push({
      key: schedulingId(card.id, 'production'),
      card,
      direction: 'production',
      scheduling: card.production.scheduling,
      paused: card.paused || card.production.paused,
      introducedAt: card.production.introducedAt,
    });
  }
  return items;
}

export function itemOf(card: StoredCard, direction: Direction): StudyItem | null {
  return itemsOf(card).find((item) => item.direction === direction) ?? null;
}

/** What to change on a card so that one of its directions gets a new schedule (and first-studied time). */
export function directionChange(
  card: StoredCard,
  direction: Direction,
  scheduling: SchedulingState,
  introducedAt: string | null,
): Partial<StoredCard> {
  if (direction === 'recognition') return { scheduling, introducedAt };
  if (!card.production) throw new Error(`Card "${card.id}" has no production direction.`);
  return { production: { ...card.production, scheduling, introducedAt } };
}

/**
 * May this never-studied item be introduced as a new card yet?
 * Recognition: always. Production: only PRODUCTION_DELAY_DAYS days after the
 * recognition side was first studied, so the two never start on the same day.
 */
export function readyToIntroduce(item: StudyItem, now: Date): boolean {
  if (item.direction === 'recognition') return true;
  const { card } = item;
  // If the recognition side is switched off and was never studied, there is nothing to wait for.
  if (card.recognitionPaused && card.introducedAt === null) return true;
  const startsOn = productionStartDay(card);
  return startsOn !== null && startOfStudyDay(now) >= startsOn;
}

/** The first day the production direction may be introduced, or null if that isn't known yet. */
export function productionStartDay(card: StoredCard): Date | null {
  if (card.introducedAt === null) return null;
  const day = startOfStudyDay(new Date(card.introducedAt));
  day.setDate(day.getDate() + PRODUCTION_DELAY_DAYS);
  return day;
}
