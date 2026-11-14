/**
 * The most important tests in the project: data saved by earlier releases of the app
 * must survive, untouched, when the app is updated.
 *
 * Each test builds a database exactly as an earlier release left it, fills it with the
 * contents of a real backup from that release, and then opens it with today's code.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEECH_THRESHOLD } from '../src/config';
import type { CardFromAnyVersion } from '../src/data/cardUpgrade';
import backupFromVersion1 from './fixtures/backup-v1.json';
import backupFromRound1 from './fixtures/backup-v2.json';
import backupFromRound2 from './fixtures/backup-v3.json';

const TABLES = { cards: 'id', reviews: '++id, cardId, timestamp', settings: 'key' };

/** Opens the database with the current code, as the app does when it starts. */
async function openWithCurrentApp() {
  vi.resetModules(); // forget the previous test's connection
  return import('../src/data/db');
}

afterEach(async () => {
  const { db } = await import('../src/data/db');
  db.close();
  await Dexie.delete('spanish-cards');
});

describe('upgrading from Round 2 (database version 3)', () => {
  /** The database as Round 2 left it, holding what a real Round 2 backup holds. */
  async function round2Database() {
    const old = new Dexie('spanish-cards');
    old.version(1).stores(TABLES);
    old.version(2).stores(TABLES);
    old.version(3).stores({ ...TABLES, sprints: 'id' });
    await old.table('cards').bulkAdd(structuredClone(backupFromRound2.cards));
    await old.table('reviews').bulkAdd(structuredClone(backupFromRound2.reviews));
    await old.table('sprints').bulkAdd(structuredClone(backupFromRound2.sprints));
    await old
      .table('settings')
      .bulkPut([
        ...Object.entries(backupFromRound2.settings).map(([key, value]) => ({ key, value })),
        { key: 'lastBackupAt', value: '2026-11-14T16:04:00.000Z' },
        { key: 'voiceTipSeen', value: true },
      ]);
    old.close();
  }

  it('leaves every card, review, sprint and setting exactly as it was', async () => {
    await round2Database();
    const { readEverything, getSettings } = await openWithCurrentApp();
    const now = await readEverything();

    // Not "contains": exactly equal. This upgrade adds two new tables and touches nothing else.
    const byId = <Row extends { id?: string | number }>(rows: Row[]) =>
      [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(byId(now.cards)).toEqual(byId(backupFromRound2.cards));
    expect(now.reviews).toEqual(backupFromRound2.reviews);
    expect(byId(now.sprints)).toEqual(byId(backupFromRound2.sprints));

    expect(await getSettings()).toMatchObject({
      ...backupFromRound2.settings,
      lastBackupAt: '2026-11-14T16:04:00.000Z',
      voiceTipSeen: true,
      // New settings start with their defaults.
      goalKind: 'all',
      goalReviews: 20,
      lastReportAt: null,
    });
  });

  it('fills in the days studied from the review history, so the streak carries straight on', async () => {
    await round2Database();
    const { getStudyDays } = await openWithCurrentApp();
    const { studyDate } = await import('../src/study/dates');
    const { computeStreak } = await import('../src/study/streak');

    const expected = new Map<string, number>();
    for (const review of backupFromRound2.reviews) {
      const date = studyDate(new Date(review.timestamp));
      expected.set(date, (expected.get(date) ?? 0) + 1);
    }
    const days = await getStudyDays();
    expect(days).toEqual([...expected].sort().map(([date, reviews]) => ({ date, reviews })));
    expect(days.reduce((sum, day) => sum + day.reviews, 0)).toBe(backupFromRound2.reviews.length);

    // On the last day studied, the streak counts that day.
    const lastDay = days.at(-1)!.date;
    expect(
      computeStreak(
        days.map((day) => day.date),
        lastDay,
      ),
    ).toMatchObject({ studiedToday: true });
    expect(
      computeStreak(
        days.map((day) => day.date),
        lastDay,
      ).current,
    ).toBeGreaterThanOrEqual(1);
  });

  it('starts with an empty capture log, and the upgraded data can be backed up and restored', async () => {
    await round2Database();
    const { getCaptures, readEverything, replaceEverything, getSettings } = await openWithCurrentApp();
    const { buildBackup, parseBackup } = await import('../src/data/backupFile');
    expect(await getCaptures()).toEqual([]);

    const before = await readEverything();
    const file = buildBackup(before, new Date());
    expect(file.formatVersion).toBe(4);
    await replaceEverything(parseBackup(JSON.stringify(file), await getSettings()));
    const after = await readEverything();
    expect(after.cards).toEqual(before.cards);
    expect(after.studyDays).toEqual(before.studyDays);
    expect(after.sprints).toEqual(before.sprints);
    expect(after.reviews.map(({ id: _id, ...rest }) => rest)).toEqual(
      before.reviews.map(({ id: _id, ...rest }) => rest),
    );
  });
});

describe('upgrading from Round 1 (database version 2)', () => {
  /** The database as Round 1 created it, holding what a real Round 1 backup holds. */
  async function round1Database() {
    const old = new Dexie('spanish-cards');
    old.version(1).stores(TABLES);
    old.version(2).stores(TABLES);
    await old.table('cards').bulkAdd(structuredClone(backupFromRound1.cards));
    await old.table('reviews').bulkAdd(structuredClone(backupFromRound1.reviews));
    await old.table('settings').bulkPut([
      { key: 'newCardsPerDay', value: 9 },
      { key: 'soundsOn', value: false },
      { key: 'lastBackupAt', value: '2026-11-13T22:27:00.000Z' },
    ]);
    old.close();
  }

  it('keeps every card, review and setting exactly as it was', async () => {
    await round1Database();
    const { getAllCards, getSettings, readEverything } = await openWithCurrentApp();
    const cards = await getAllCards();

    expect(cards).toHaveLength(backupFromRound1.cards.length);
    for (const oldCard of backupFromRound1.cards) {
      // Every field Round 1 saved is still there with the same value: text, tags, schedule, paused, flag, edits.
      expect(cards.find((card) => card.id === oldCard.id)).toMatchObject(oldCard);
    }

    const { reviews } = await readEverything();
    expect(reviews).toHaveLength(backupFromRound1.reviews.length);
    reviews.forEach((review, index) => expect(review).toMatchObject(backupFromRound1.reviews[index]));

    expect(await getSettings()).toMatchObject({
      newCardsPerDay: 9,
      soundsOn: false,
      lastBackupAt: '2026-11-13T22:27:00.000Z',
      // New settings start with their defaults.
      autoPlayAudio: true,
      speechSpeed: 'normal',
      typeAnswers: true,
    });
  });

  it('keeps existing progress as Spanish → English, and adds English → Spanish as a new card', async () => {
    await round1Database();
    const { getAllCards } = await openWithCurrentApp();

    for (const card of await getAllCards()) {
      expect(card.recognitionPaused).toBe(false);
      if (card.type === 'vocab' || card.type === 'phrase') {
        expect(card.production).toMatchObject({
          paused: false,
          introducedAt: null,
          scheduling: { cardId: `${card.id}#production`, state: 0, scheduleStatus: 'new', reps: 0, lapses: 0 },
        });
      } else {
        expect(card.production).toBeNull();
      }
    }
  });

  it('labels every existing review as Spanish → English and works out when each card was first studied', async () => {
    await round1Database();
    const { getAllCards, readEverything } = await openWithCurrentApp();

    const { reviews } = await readEverything();
    expect(reviews.every((review) => review.direction === 'recognition')).toBe(true);
    expect(reviews.every((review) => review.typed === null && review.typedResult === null)).toBe(true);

    for (const card of await getAllCards()) {
      const times = backupFromRound1.reviews
        .filter((review) => review.cardId === card.id)
        .map((review) => review.timestamp);
      expect(card.introducedAt).toBe(card.scheduling.state === 0 ? null : times.sort()[0]);
    }
  });

  it('gains an empty list of sprints, and the upgraded data can be backed up and restored', async () => {
    await round1Database();
    const { getSprints, readEverything, replaceEverything, getSettings } = await openWithCurrentApp();
    const { buildBackup, parseBackup } = await import('../src/data/backupFile');
    expect(await getSprints()).toEqual([]);

    const before = await readEverything();
    const file = JSON.stringify(buildBackup(before, new Date()));
    await replaceEverything(parseBackup(file, await getSettings()));
    const after = await readEverything();
    expect(after.cards).toEqual(before.cards);
    expect(after.reviews.map(({ id: _id, ...rest }) => rest)).toEqual(
      before.reviews.map(({ id: _id, ...rest }) => rest),
    );
  });
});

describe('upgrading straight from the first release (database version 1)', () => {
  it('brings everything up to date in one go, without losing or changing anything', async () => {
    const old = new Dexie('spanish-cards');
    old.version(1).stores(TABLES);
    const oldCards: CardFromAnyVersion[] = structuredClone(backupFromVersion1.cards) as CardFromAnyVersion[];
    oldCards[1].scheduling.lapses = LEECH_THRESHOLD; // pretend one card had already been forgotten a lot
    await old.table('cards').bulkAdd(oldCards);
    await old.table('reviews').bulkAdd(structuredClone(backupFromVersion1.reviews));
    await old.table('settings').bulkPut([
      { key: 'newCardsPerDay', value: 4 },
      { key: 'lastBackupAt', value: '2026-11-13T03:37:39.000Z' },
    ]);
    old.close();

    const { getAllCards, getSettings, readEverything } = await openWithCurrentApp();
    const cards = await getAllCards();

    expect(cards).toHaveLength(oldCards.length);
    for (const oldCard of oldCards) {
      const card = cards.find((candidate) => candidate.id === oldCard.id)!;
      expect(card).toMatchObject(oldCard); // every old field, unchanged
      expect(card).toMatchObject({ paused: false, editedAt: null, recognitionPaused: false });
      expect(card.production === null).toBe(card.type !== 'vocab' && card.type !== 'phrase');
    }

    const leech = cards.find((card) => card.id === oldCards[1].id)!;
    expect(leech).toMatchObject({ leech: true, flag: { by: 'leech' } });
    expect(cards.filter((card) => card.leech)).toHaveLength(1);

    const everything = await readEverything();
    everything.reviews.forEach((review, index) => {
      expect(review).toMatchObject(backupFromVersion1.reviews[index]);
      expect(review.direction).toBe('recognition');
    });
    expect(await getSettings()).toMatchObject({
      newCardsPerDay: 4,
      soundsOn: true,
      lastBackupAt: '2026-11-13T03:37:39.000Z',
    });

    // …right through to the newest tables: study days rebuilt from the reviews, and an empty capture log.
    expect(everything.studyDays.reduce((sum, day) => sum + day.reviews, 0)).toBe(backupFromVersion1.reviews.length);
    expect(everything.captures).toEqual([]);
  });
});

describe('a brand-new install', () => {
  it('starts empty, with the default settings', async () => {
    const { getAllCards, getSprints, getSettings } = await openWithCurrentApp();
    expect(await getAllCards()).toEqual([]);
    expect(await getSprints()).toEqual([]);
    expect(await getSettings()).toMatchObject({
      newCardsPerDay: 15,
      typeAnswers: true,
      autoPlayAudio: true,
      goalKind: 'all',
    });
    const { getStudyDays, getCaptures } = await import('../src/data/db');
    expect(await getStudyDays()).toEqual([]);
    expect(await getCaptures()).toEqual([]);
  });
});
