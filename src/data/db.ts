/**
 * The on-device database (IndexedDB, through the Dexie library).
 * Every read and write of saved data goes through the functions in this file.
 */
import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../config';
import type { ReviewableState } from '../study/rate';
import type { CardContent, CardFlag, CardMarks, ReviewRecord, SchedulingState, Settings, StoredCard } from '../types';
import { addMissingCardFields, type CardFromAnyVersion } from './cardUpgrade';

interface SettingRow {
  key: string;
  value: unknown;
}

export const db = new Dexie('spanish-cards') as Dexie & {
  cards: EntityTable<StoredCard, 'id'>;
  reviews: EntityTable<ReviewRecord, 'id'>;
  settings: EntityTable<SettingRow, 'key'>;
};

// The text after each table name lists what the table can be looked up by.
// Never edit a version that has already been released: phones that have it won't
// notice the change. Add a new db.version(n) below it instead.
db.version(1).stores({
  cards: 'id',
  reviews: '++id, cardId, timestamp',
  settings: 'key',
});

// Version 2: cards gained "paused", "leech", "flag" and "editedAt".
// The tables themselves are unchanged; every existing card just gets the new fields filled in.
db.version(2).upgrade(async (transaction) => {
  const now = new Date();
  await transaction
    .table<CardFromAnyVersion, string>('cards')
    .toCollection()
    .modify((card) => {
      Object.assign(card, addMissingCardFields(card, now));
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

export function setCardPaused(id: string, paused: boolean): Promise<void> {
  return changeCard(id, { paused });
}

/** Pass null to remove the flag. */
export function setCardFlag(id: string, flag: CardFlag | null): Promise<void> {
  return changeCard(id, { flag });
}

/**
 * Makes a card "new" again. Its review history is kept as a record of what happened.
 * It stops being a leech, and the automatic leech flag (if any) is removed;
 * a flag you wrote yourself stays.
 */
export async function resetCardProgress(id: string, fresh: SchedulingState): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(id);
    if (!card) throw new Error(`Card "${id}" no longer exists.`);
    await db.cards.put({
      ...card,
      scheduling: fresh,
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
 * Saves one review: the card's new schedule and marks, and the history entry,
 * are written together, so one can never be saved without the other.
 * Returns the id of the new history entry (needed to undo it).
 */
export function saveReview(review: ReviewRecord, marks: Pick<CardMarks, 'leech' | 'flag'>): Promise<number> {
  return db.transaction('rw', db.cards, db.reviews, async () => {
    await changeCard(review.cardId, { scheduling: review.after, ...marks });
    return (await db.reviews.add(review)) as number;
  });
}

/**
 * Undoes one review: removes it from the history and puts the card back
 * the way it was. All-or-nothing: if anything is not as expected,
 * nothing at all is changed and an error is thrown.
 */
export async function undoReview(reviewId: number, previous: ReviewableState): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    const review = await db.reviews.get(reviewId);
    if (!review) throw new Error('That review has already been removed.');

    const card = await db.cards.get(review.cardId);
    if (!card) throw new Error(`Card "${review.cardId}" no longer exists.`);

    // Only the most recent review of a card can be undone. If the card has moved on
    // since this review (reviewed again, or its progress was reset), leave it alone.
    const untouched =
      card.scheduling.dueAt === review.after.dueAt &&
      card.scheduling.reps === review.after.reps &&
      card.scheduling.lastReviewAt === review.after.lastReviewAt;
    if (!untouched) throw new Error('This card has changed since that review, so it cannot be undone.');

    await db.cards.put({
      ...card,
      scheduling: previous.scheduling,
      leech: previous.leech,
      flag: previous.flag,
    });
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

// ---------- Settings ----------

const DEFAULT_SETTINGS: Settings = {
  newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
  soundsOn: true,
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
  settings: Settings;
}

/** Reads all cards, the full review history and the settings in one consistent snapshot. */
export function readEverything(): Promise<EverythingSaved> {
  return db.transaction('r', db.cards, db.reviews, db.settings, async () => ({
    cards: await db.cards.toArray(),
    reviews: await db.reviews.orderBy('id').toArray(),
    settings: await getSettings(),
  }));
}

/**
 * Wipes the database and fills it from a backup. This is all-or-nothing:
 * if anything goes wrong part-way, the data that was there before is kept.
 */
export async function replaceEverything(data: EverythingSaved): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, db.settings, async () => {
    await Promise.all([db.cards.clear(), db.reviews.clear(), db.settings.clear()]);
    await db.cards.bulkAdd(data.cards);
    await db.reviews.bulkAdd(data.reviews);
    await updateSettings(data.settings);
  });
}
