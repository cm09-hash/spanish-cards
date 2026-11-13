/**
 * The most important test in the project: data saved by version 1 of the app
 * must survive, untouched, when the app is updated.
 *
 * It builds a version-1 database exactly as the first release did, fills it with
 * the contents of a real version-1 backup, and then opens it with today's code.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { LEECH_THRESHOLD } from '../src/config';
import backupFromVersion1 from './fixtures/backup-v1.json';

it('upgrades a version-1 database without losing or changing anything', async () => {
  // --- The database as version 1 of the app created it ---
  const old = new Dexie('spanish-cards');
  old.version(1).stores({ cards: 'id', reviews: '++id, cardId, timestamp', settings: 'key' });

  const oldCards = structuredClone(backupFromVersion1.cards);
  oldCards[1].scheduling.lapses = LEECH_THRESHOLD; // pretend one card had already been forgotten a lot
  await old.table('cards').bulkAdd(oldCards);
  await old.table('reviews').bulkAdd(structuredClone(backupFromVersion1.reviews));
  await old.table('settings').bulkPut([
    { key: 'newCardsPerDay', value: 4 },
    { key: 'lastBackupAt', value: '2026-11-13T03:37:39.000Z' },
  ]);
  old.close();

  // --- Open it with the current app ---
  const { getAllCards, getSettings, readEverything } = await import('../src/data/db');
  const cards = await getAllCards();

  expect(cards).toHaveLength(oldCards.length);
  for (const oldCard of oldCards) {
    const card = cards.find((candidate) => candidate.id === oldCard.id)!;
    expect(card).toMatchObject(oldCard); // every old field, unchanged
    expect(card.paused).toBe(false);
    expect(card.editedAt).toBeNull();
  }

  const leech = cards.find((card) => card.id === oldCards[1].id)!;
  expect(leech).toMatchObject({ leech: true, flag: { by: 'leech' } });
  expect(cards.filter((card) => card.leech)).toHaveLength(1);
  expect(cards.filter((card) => card.flag)).toHaveLength(1);

  const everything = await readEverything();
  expect(everything.reviews).toEqual(backupFromVersion1.reviews);
  expect(await getSettings()).toEqual({
    newCardsPerDay: 4,
    soundsOn: true, // new setting: starts switched on
    lastBackupAt: '2026-11-13T03:37:39.000Z',
  });
});
