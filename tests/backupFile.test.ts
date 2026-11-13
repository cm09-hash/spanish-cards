import { beforeAll, describe, expect, it } from 'vitest';
import { backupFileName, buildBackup, parseBackup } from '../src/data/backupFile';
import { FileProblem } from '../src/data/cardFile';
import { initScheduler, previewRatings } from '../src/study/scheduler';
import type { ReviewRecord, Settings } from '../src/types';
import { makeCard } from './helpers';

beforeAll(() => initScheduler());

const defaults: Settings = { newCardsPerDay: 15, lastBackupAt: null };
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
  return {
    cards: [studied, makeCard('unseen', {}, 2)],
    reviews: [review],
    settings: { newCardsPerDay: 20, lastBackupAt: null },
  };
}

describe('backup files', () => {
  it('restores exactly what was saved', () => {
    const data = exampleData();
    const text = JSON.stringify(buildBackup(data, now));
    const restored = parseBackup(text, defaults);

    expect(restored.cards).toEqual(data.cards);
    expect(restored.reviews).toEqual(data.reviews.map(({ id: _id, ...rest }) => rest));
    expect(restored.settings.newCardsPerDay).toBe(20);
    expect(restored.exportedAt).toBe(now.toISOString());
  });

  it('labels the file so it can be recognised', () => {
    expect(buildBackup(exampleData(), now)).toMatchObject({
      app: 'spanish-cards',
      formatVersion: 1,
      exportedAt: now.toISOString(),
    });
    expect(backupFileName(new Date(2026, 2, 1))).toBe('spanish-cards-backup-2026-03-01.json');
  });

  it('refuses files that are not backups', () => {
    expect(() => parseBackup('not json', defaults)).toThrow(FileProblem);
    expect(() => parseBackup(JSON.stringify({ cards: [] }), defaults)).toThrow(/isn't a Spanish Cards backup/);
  });

  it('refuses backups from another format version', () => {
    const backup = { ...buildBackup(exampleData(), now), formatVersion: 2 };
    expect(() => parseBackup(JSON.stringify(backup), defaults)).toThrow(/different version/);
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
  });
});
