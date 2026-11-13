import { beforeAll, describe, expect, it } from 'vitest';
import { backupFileName, buildBackup, parseBackup } from '../src/data/backupFile';
import { FileProblem } from '../src/data/cardFile';
import { initScheduler, previewRatings } from '../src/study/scheduler';
import type { ReviewRecord, Settings } from '../src/types';
import backupFromVersion1 from './fixtures/backup-v1.json';
import { makeCard } from './helpers';

beforeAll(() => initScheduler());

const defaults: Settings = { newCardsPerDay: 15, soundsOn: true, lastBackupAt: null };
const now = new Date('2026-03-01T09:00:00.000Z');

function exampleData() {
  const studied = makeCard('studied');
  const before = studied.scheduling;
  const after = previewRatings(before, now)[2].after;
  studied.scheduling = after;
  const review: ReviewRecord = {
    id: 1,
    cardId: 'studied',
    rating: 3,
    timestamp: now.toISOString(),
    durationMs: 4200,
    before,
    after,
  };
  const marked = makeCard('marked', {}, 3, {
    paused: true,
    leech: true,
    flag: { reason: 'translation seems wrong', flaggedAt: now.toISOString(), by: 'you' },
    editedAt: now.toISOString(),
  });
  return {
    cards: [studied, makeCard('unseen', {}, 2), marked],
    reviews: [review],
    settings: { newCardsPerDay: 20, soundsOn: false, lastBackupAt: null },
  };
}

describe('backup files', () => {
  it('restores exactly what was saved, including paused, leech, flag and edit marks', () => {
    const data = exampleData();
    const text = JSON.stringify(buildBackup(data, now));
    const restored = parseBackup(text, defaults);

    expect(restored.cards).toEqual(data.cards);
    expect(restored.reviews).toEqual(data.reviews.map(({ id: _id, ...rest }) => rest));
    expect(restored.settings).toMatchObject({ newCardsPerDay: 20, soundsOn: false });
    expect(restored.exportedAt).toBe(now.toISOString());
  });

  it('labels the file so it can be recognised', () => {
    expect(buildBackup(exampleData(), now)).toMatchObject({
      app: 'spanish-cards',
      formatVersion: 2,
      exportedAt: now.toISOString(),
    });
    expect(backupFileName(new Date(2026, 2, 1))).toBe('spanish-cards-backup-2026-03-01.json');
  });

  it('refuses files that are not backups', () => {
    expect(() => parseBackup('not json', defaults)).toThrow(FileProblem);
    expect(() => parseBackup(JSON.stringify({ cards: [] }), defaults)).toThrow(/isn't a Spanish Cards backup/);
  });

  it('refuses backups from a newer format version it does not know', () => {
    const backup = { ...buildBackup(exampleData(), now), formatVersion: 3 };
    expect(() => parseBackup(JSON.stringify(backup), defaults)).toThrow(/newer version/);
  });

  it('refuses damaged backups instead of restoring half of one', () => {
    const brokenDate = buildBackup(exampleData(), now);
    brokenDate.cards[0].scheduling.dueAt = 'not a date';
    expect(() => parseBackup(JSON.stringify(brokenDate), defaults)).toThrow(/Card 1 in the backup is damaged/);

    const brokenReview = buildBackup(exampleData(), now);
    (brokenReview.reviews[0] as { rating: number }).rating = 9;
    expect(() => parseBackup(JSON.stringify(brokenReview), defaults)).toThrow(/Review 1 in the backup is damaged/);

    const repeated = buildBackup(exampleData(), now);
    repeated.cards.push(repeated.cards[0]);
    expect(() => parseBackup(JSON.stringify(repeated), defaults)).toThrow(/more than once/);

    const brokenFlag = buildBackup(exampleData(), now);
    (brokenFlag.cards[2] as { flag: unknown }).flag = { reason: 5 };
    expect(() => parseBackup(JSON.stringify(brokenFlag), defaults)).toThrow(/Card 3 in the backup is damaged/);

    const brokenPause = buildBackup(exampleData(), now);
    (brokenPause.cards[2] as { paused: unknown }).paused = 'yes';
    expect(() => parseBackup(JSON.stringify(brokenPause), defaults)).toThrow(/Card 3 in the backup is damaged/);
  });
});

describe('backups made by version 1 of the app', () => {
  // A real backup file, saved by the first released version of the app.
  const original = backupFromVersion1;
  const text = JSON.stringify(original);

  it('can still be restored, with nothing lost', () => {
    expect(original.formatVersion).toBe(1);
    const restored = parseBackup(text, defaults);

    expect(restored.cards).toHaveLength(original.cards.length);
    expect(restored.reviews).toHaveLength(original.reviews.length);
    restored.cards.forEach((card, index) => {
      // Everything the old file said about the card is still there, unchanged…
      expect(card).toMatchObject(original.cards[index]);
      // …and the fields that didn't exist yet get their starting values.
      expect(card).toMatchObject({ paused: false, leech: false, flag: null, editedAt: null });
    });
    restored.reviews.forEach((review, index) => {
      const { id: _id, ...rest } = original.reviews[index];
      expect(review).toEqual(rest);
    });
    expect(restored.settings.newCardsPerDay).toBe(original.settings.newCardsPerDay);
    expect(restored.settings.soundsOn).toBe(true); // the old file has no sound setting: the default is kept
  });

  it('marks cards that were already forgotten many times as leeches', () => {
    const old = structuredClone(original);
    old.cards[0].scheduling.lapses = 6;
    const [card] = parseBackup(JSON.stringify(old), defaults, now).cards;
    expect(card.leech).toBe(true);
    expect(card.flag).toMatchObject({ by: 'leech', flaggedAt: now.toISOString() });
  });
});
