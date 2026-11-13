/**
 * The on-device database (IndexedDB, through the Dexie library).
 * Every read and write of saved data goes through the functions in this file.
 */
import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../config';
import type { ReviewRecord, Settings, StoredCard } from '../types';

interface SettingRow {
  key: string;
  value: unknown;
}

const db = new Dexie('spanish-cards') as Dexie & {
  cards: EntityTable<StoredCard, 'id'>;
  reviews: EntityTable<ReviewRecord, 'id'>;
  settings: EntityTable<SettingRow, 'key'>;
};

// The text after each table name lists what the table can be looked up by.
// If you ever change these, add a new db.version(2) below instead of editing version 1.
db.version(1).stores({
  cards: 'id',
  reviews: '++id, cardId, timestamp',
  settings: 'key',
});

// ---------- Cards ----------

export function getAllCards(): Promise<StoredCard[]> {
  return db.cards.toArray();
}

export function countCards(): Promise<number> {
  return db.cards.count();
}

export async function addCards(cards: StoredCard[]): Promise<void> {
  await db.cards.bulkAdd(cards);
}

// ---------- Reviews ----------

/**
 * Saves one review: the card's new schedule and the history entry are
 * written together, so one can never be saved without the other.
 */
export async function saveReview(review: ReviewRecord): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    const updated = await db.cards.update(review.cardId, { scheduling: review.after });
    if (updated === 0) throw new Error(`Card "${review.cardId}" no longer exists.`);
    await db.reviews.add(review);
  });
}

/** All reviews made at or after the given moment, oldest first. */
export function getReviewsSince(since: Date): Promise<ReviewRecord[]> {
  return db.reviews.where('timestamp').aboveOrEqual(since.toISOString()).toArray();
}

export function countReviews(): Promise<number> {
  return db.reviews.count();
}

// ---------- Settings ----------

const DEFAULT_SETTINGS: Settings = {
  newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
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
