/**
 * The on-device database (IndexedDB, through the Dexie library).
 * Every read and write of saved data goes through the functions in this file.
 */
import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../config';
import { blankSchedulingState, itemOf, schedulingId } from '../study/directions';
import type { CardContent, CardFlag, Direction, ReviewRecord, Settings, Sprint, StoredCard } from '../types';
import {
  addMissingReviewFields,
  addRound1Fields,
  addRound2Fields,
  type CardFromAnyVersion,
  type ReviewFromAnyVersion,
} from './cardUpgrade';

interface SettingRow {
  key: string;
  value: unknown;
}

export const db = new Dexie('spanish-cards') as Dexie & {
  cards: EntityTable<StoredCard, 'id'>;
  reviews: EntityTable<ReviewRecord, 'id'>;
  settings: EntityTable<SettingRow, 'key'>;
  sprints: EntityTable<Sprint, 'id'>;
};

// The text after each table name lists what the table can be looked up by.
// Never edit a version that has already been released: phones that have it won't
// notice the change. Add a new db.version(n) below it instead.
db.version(1).stores({
  cards: 'id',
  reviews: '++id, cardId, timestamp',
  settings: 'key',
});

// Version 2 (Round 1): cards gained "paused", "leech", "flag" and "editedAt".
// The tables themselves are unchanged; every existing card just gets the new fields filled in.
db.version(2).upgrade(async (transaction) => {
  const now = new Date();
  await transaction
    .table<CardFromAnyVersion, string>('cards')
    .toCollection()
    .modify((card) => {
      Object.assign(card, addRound1Fields(card, now));
    });
});

// Version 3 (Round 2): cards in two directions, and topic sprints.
//  - A new table for sprints.
//  - Every review is labelled with its direction. All existing ones are "recognition".
//  - Every card keeps what it has learned, as its recognition direction; vocab and phrase
//    cards gain a production direction that starts as a new card.
// Nothing that is already saved is changed or removed, only added to.
db.version(3)
  .stores({ sprints: 'id' })
  .upgrade(async (transaction) => {
    const now = new Date();

    // While labelling the reviews, note when each card was first studied.
    const firstReviewedAt = new Map<string, string>();
    await transaction
      .table<ReviewFromAnyVersion, number>('reviews')
      .toCollection()
      .modify((review) => {
        Object.assign(review, addMissingReviewFields(review));
        const known = firstReviewedAt.get(review.cardId);
        if (review.direction === 'recognition' && (known === undefined || review.timestamp < known)) {
          firstReviewedAt.set(review.cardId, review.timestamp);
        }
      });

    await transaction
      .table<CardFromAnyVersion, string>('cards')
      .toCollection()
      .modify((card) => {
        Object.assign(card, addRound2Fields(card, now, firstReviewedAt.get(card.id) ?? null));
      });
  });

// ---------- Cards ----------

export function getAllCards(): Promise<StoredCard[]> {
  return db.cards.toArray();
}

export function getCard(id: string): Promise<StoredCard | undefined> {
  return db.cards.get(id);
}

export function countCards(): Promise<number> {
  return db.cards.count();
}

export async function addCards(cards: StoredCard[]): Promise<void> {
  await db.cards.bulkAdd(cards);
}

/** Adds imported cards and, if the file named one, creates or updates its sprint. All-or-nothing. */
export async function addImportedCards(cards: StoredCard[], sprint: Sprint | null): Promise<void> {
  await db.transaction('rw', db.cards, db.sprints, async () => {
    await db.cards.bulkAdd(cards);
    if (sprint) await db.sprints.put(sprint);
  });
}

/** Changes some fields of one card, and complains if the card isn't there. */
async function changeCard(id: string, changes: Partial<StoredCard>): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(id);
    if (!card) throw new Error(`Card "${id}" no longer exists.`);
    await db.cards.put({ ...card, ...changes });
  });
}

/** Saves edited text. The card's schedule, history and marks are left exactly as they are. */
export async function editCard(
  id: string,
  content: Pick<CardContent, 'front' | 'back' | 'tags' | 'note'>,
  now: Date,
): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(id);
    if (!card) throw new Error(`Card "${id}" no longer exists.`);
    const { note: _oldNote, ...rest } = card;
    await db.cards.put({
      ...rest,
      front: content.front,
      back: content.back,
      tags: content.tags,
      ...(content.note ? { note: content.note } : {}),
      editedAt: now.toISOString(),
    });
  });
}

/** Pauses or unpauses the whole card (both directions). */
export function setCardPaused(id: string, paused: boolean): Promise<void> {
  return changeCard(id, { paused });
}

/** Pauses or unpauses just one direction of a card. */
export async function setDirectionPaused(id: string, direction: Direction, paused: boolean): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(id);
    if (!card) throw new Error(`Card "${id}" no longer exists.`);
    if (direction === 'recognition') await db.cards.put({ ...card, recognitionPaused: paused });
    else if (card.production) await db.cards.put({ ...card, production: { ...card.production, paused } });
    else throw new Error(`Card "${id}" has no production direction.`);
  });
}

/** Pass null to remove the flag. */
export function setCardFlag(id: string, flag: CardFlag | null): Promise<void> {
  return changeCard(id, { flag });
}

/**
 * Makes a card "new" again, in both directions. Its review history is kept as a record
 * of what happened. It stops being a leech, and the automatic leech flag (if any) is
 * removed; a flag you wrote yourself stays, and so do any pauses.
 */
export async function resetCardProgress(id: string, now: Date): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(id);
    if (!card) throw new Error(`Card "${id}" no longer exists.`);
    await db.cards.put({
      ...card,
      scheduling: blankSchedulingState(card.id, now),
      introducedAt: null,
      production: card.production && {
        ...card.production,
        scheduling: blankSchedulingState(schedulingId(card.id, 'production'), now),
        introducedAt: null,
      },
      leech: false,
      flag: card.flag?.by === 'leech' ? null : card.flag,
    });
  });
}

/** Deletes a card together with its review history, all-or-nothing. */
export async function deleteCard(id: string): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.reviews.where('cardId').equals(id).delete();
    await db.cards.delete(id);
  });
}

// ---------- Reviews ----------

/**
 * Saves one review: the changes to the card (its new schedule and marks) and the
 * history entry are written together, so one can never be saved without the other.
 * Returns the id of the new history entry (needed to undo it).
 */
export function saveReview(review: ReviewRecord, changes: Partial<StoredCard>): Promise<number> {
  return db.transaction('rw', db.cards, db.reviews, async () => {
    await changeCard(review.cardId, changes);
    return (await db.reviews.add(review)) as number;
  });
}

/**
 * Undoes one review: removes it from the history and puts the card back
 * the way it was. `previous` holds the card's fields as they were before the review.
 * All-or-nothing: if anything is not as expected, nothing at all is changed and an error is thrown.
 */
export async function undoReview(reviewId: number, previous: Partial<StoredCard>): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    const review = await db.reviews.get(reviewId);
    if (!review) throw new Error('That review has already been removed.');

    const card = await db.cards.get(review.cardId);
    if (!card) throw new Error(`Card "${review.cardId}" no longer exists.`);

    // Only the most recent review of a card (in that direction) can be undone. If it has moved
    // on since this review (reviewed again, or its progress was reset), leave it alone.
    const current = itemOf(card, review.direction)?.scheduling;
    const untouched =
      current !== undefined &&
      current.dueAt === review.after.dueAt &&
      current.reps === review.after.reps &&
      current.lastReviewAt === review.after.lastReviewAt;
    if (!untouched) throw new Error('This card has changed since that review, so it cannot be undone.');

    await db.cards.put({ ...card, ...previous });
    await db.reviews.delete(reviewId);
  });
}

/** All reviews made at or after the given moment, oldest first. */
export function getReviewsSince(since: Date): Promise<ReviewRecord[]> {
  return db.reviews.where('timestamp').aboveOrEqual(since.toISOString()).toArray();
}

/** The full history of one card, oldest first. */
export function getReviewsForCard(cardId: string): Promise<ReviewRecord[]> {
  return db.reviews.where('cardId').equals(cardId).sortBy('timestamp');
}

export function countReviews(): Promise<number> {
  return db.reviews.count();
}

// ---------- Sprints ----------

export function getSprints(): Promise<Sprint[]> {
  return db.sprints.toArray();
}

/** Adds a sprint, or replaces the one with the same id. */
export async function saveSprint(sprint: Sprint): Promise<void> {
  await db.sprints.put(sprint);
}

/** Removes a sprint. Its cards are not touched: they simply become normal cards. */
export async function deleteSprint(id: string): Promise<void> {
  await db.sprints.delete(id);
}

// ---------- Settings ----------

const DEFAULT_SETTINGS: Settings = {
  newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
  soundsOn: true,
  autoPlayAudio: true,
  speechSpeed: 'normal',
  typeAnswers: true,
  voiceTipSeen: false,
  lastBackupAt: null,
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function updateSettings(changes: Partial<Settings>): Promise<void> {
  const rows = Object.entries(changes).map(([key, value]) => ({ key, value }));
  await db.settings.bulkPut(rows);
}

// ---------- Backup ----------

export interface EverythingSaved {
  cards: StoredCard[];
  reviews: ReviewRecord[];
  sprints: Sprint[];
  settings: Settings;
}

/** Reads all cards, the full review history, the sprints and the settings in one consistent snapshot. */
export function readEverything(): Promise<EverythingSaved> {
  return db.transaction('r', db.cards, db.reviews, db.sprints, db.settings, async () => ({
    cards: await db.cards.toArray(),
    reviews: await db.reviews.orderBy('id').toArray(),
    sprints: await db.sprints.toArray(),
    settings: await getSettings(),
  }));
}

/**
 * Wipes the database and fills it from a backup. This is all-or-nothing:
 * if anything goes wrong part-way, the data that was there before is kept.
 */
export async function replaceEverything(data: EverythingSaved): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, db.sprints, db.settings, async () => {
    await Promise.all([db.cards.clear(), db.reviews.clear(), db.sprints.clear(), db.settings.clear()]);
    await db.cards.bulkAdd(data.cards);
    await db.reviews.bulkAdd(data.reviews);
    await db.sprints.bulkAdd(data.sprints);
    await updateSettings(data.settings);
  });
}
