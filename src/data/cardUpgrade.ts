/**
 * Bringing cards and reviews saved by an older version of the app up to date.
 * Used both when the database is upgraded and when an old backup file is restored,
 * so the two can never disagree.
 *
 * The rule throughout: fill in what is missing, never change what is already there.
 */
import { blankSchedulingState, hasTwoDirections, schedulingId } from '../study/directions';
import { isLeechSchedule, leechFlag } from '../study/leech';
import type { CardMarks, ReviewRecord, StoredCard } from '../types';

/** The fields that Round 1 added to cards (database version 2). */
type Round1Fields = keyof CardMarks | 'editedAt';
/** The fields that Round 2 added to cards (database version 3). */
type Round2Fields = 'introducedAt' | 'recognitionPaused' | 'production';

/** A card as any version of the app may have saved it: the newer fields might be missing. */
export type CardFromAnyVersion = Omit<StoredCard, Round1Fields | Round2Fields> &
  Partial<Pick<StoredCard, Round1Fields | Round2Fields>>;

/** A review as any version of the app may have saved it. */
export type ReviewFromAnyVersion = Omit<ReviewRecord, 'direction' | 'typed' | 'typedResult'> &
  Partial<Pick<ReviewRecord, 'direction' | 'typed' | 'typedResult'>>;

/**
 * Round 1: paused, leech, flag and editedAt.
 * Cards from before leeches existed are checked now: if one has already been
 * forgotten often enough, it is marked and flagged straight away.
 */
export function addRound1Fields<Card extends CardFromAnyVersion>(card: Card, now: Date) {
  const leech = card.leech ?? isLeechSchedule(card.scheduling);
  const newlyFoundLeech = card.leech === undefined && leech;
  return {
    ...card,
    paused: card.paused ?? false,
    leech,
    flag: card.flag ?? (newlyFoundLeech ? leechFlag(now) : null),
    editedAt: card.editedAt ?? null,
  };
}

/**
 * Round 2: cards in two directions.
 *  - Everything a card has learned so far stays where it is, as its recognition direction.
 *  - Vocab and phrase cards gain a production direction (English → Spanish) that starts as a new card.
 *  - `firstReviewedAt` is when the card was first studied, taken from the review history.
 */
export function addRound2Fields<Card extends CardFromAnyVersion>(
  card: Card,
  now: Date,
  firstReviewedAt: string | null,
) {
  const everStudied = card.scheduling.state !== 0;
  const introducedAt = everStudied ? (firstReviewedAt ?? card.scheduling.lastReviewAt ?? card.addedAt) : null;
  const newProduction = hasTwoDirections(card.type)
    ? { scheduling: blankSchedulingState(schedulingId(card.id, 'production'), now), paused: false, introducedAt: null }
    : null;
  return {
    ...card,
    introducedAt: card.introducedAt !== undefined ? card.introducedAt : introducedAt,
    recognitionPaused: card.recognitionPaused ?? false,
    production: card.production !== undefined ? card.production : newProduction,
  };
}

/** Everything at once, for cards coming out of a backup file of any age. */
export function addMissingCardFields(
  card: CardFromAnyVersion,
  now: Date,
  firstReviewedAt: string | null = null,
): StoredCard {
  return addRound2Fields(addRound1Fields(card, now), now, firstReviewedAt);
}

/** Reviews from before cards had two directions were all of the card as written: "recognition". */
export function addMissingReviewFields(review: ReviewFromAnyVersion): ReviewRecord {
  return {
    ...review,
    direction: review.direction ?? 'recognition',
    typed: review.typed ?? null,
    typedResult: review.typedResult ?? null,
  };
}

/** For each card, the time of its earliest recognition review. */
export function firstReviewTimes(reviews: ReviewFromAnyVersion[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const review of reviews) {
    if ((review.direction ?? 'recognition') !== 'recognition') continue;
    const known = first.get(review.cardId);
    if (known === undefined || review.timestamp < known) first.set(review.cardId, review.timestamp);
  }
  return first;
}

/** A freshly imported card: nothing studied yet. */
export function newStoredCard(
  content: StoredCard | CardFromAnyVersion | Omit<CardFromAnyVersion, 'addedAt' | 'position' | 'scheduling'>,
  details: { now: Date; position: number; production: boolean },
): StoredCard {
  const { now, position } = details;
  return {
    ...content,
    addedAt: now.toISOString(),
    position,
    scheduling: blankSchedulingState(content.id, now),
    introducedAt: null,
    recognitionPaused: false,
    production: details.production
      ? {
          scheduling: blankSchedulingState(schedulingId(content.id, 'production'), now),
          paused: false,
          introducedAt: null,
        }
      : null,
    paused: false,
    leech: false,
    flag: null,
    editedAt: null,
  };
}
