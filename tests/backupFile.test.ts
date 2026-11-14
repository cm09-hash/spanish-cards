import { beforeAll, describe, expect, it } from 'vitest';
import { backupFileName, buildBackup, parseBackup } from '../src/data/backupFile';
import { FileProblem } from '../src/data/cardFile';
import type { EverythingSaved } from '../src/data/db';
import { initScheduler, previewRatings } from '../src/study/scheduler';
import type { ReviewRecord, Settings, Sprint } from '../src/types';
import backupFromVersion1 from './fixtures/backup-v1.json';
import backupFromRound1 from './fixtures/backup-v2.json';
import { makeCard, makeProduction } from './helpers';

beforeAll(() => initScheduler());

/** This device's settings at the moment of restoring. */
const current: Settings = {
  newCardsPerDay: 15,
  soundsOn: true,
  autoPlayAudio: true,
  speechSpeed: 'normal',
  typeAnswers: true,
  voiceTipSeen: true,
  lastBackupAt: null,
};
const now = new Date('2026-03-01T09:00:00.000Z');

function exampleData(): EverythingSaved {
  const studied = makeCard('studied', {}, 1, { production: makeProduction('studied') });
  const before = studied.scheduling;
  const after = previewRatings(before, now)[2].after;
  studied.scheduling = after;
  studied.introducedAt = now.toISOString();
  const review: ReviewRecord = {
    id: 1,
    cardId: 'studied',
    direction: 'recognition',
    rating: 3,
    timestamp: now.toISOString(),
    durationMs: 4200,
    typed: null,
    typedResult: null,
    before,
    after,
  };

  // A card studied in the English → Spanish direction, with a typed answer.
  const typedCard = makeCard('typed', {}, 4, {
    introducedAt: '2026-02-20T09:00:00.000Z',
    production: makeProduction('typed'),
  });
  const typedBefore = typedCard.production!.scheduling;
  const typedAfter = previewRatings(typedBefore, now)[1].after;
  typedCard.production = { scheduling: typedAfter, paused: true, introducedAt: now.toISOString() };
  const typedReview: ReviewRecord = {
    id: 2,
    cardId: 'typed',
    direction: 'production',
    rating: 2,
    timestamp: new Date(now.getTime() + 60_000).toISOString(),
    durationMs: 9000,
    typed: 'esta',
    typedResult: 'almost',
    before: typedBefore,
    after: typedAfter,
  };

  const marked = makeCard('marked', {}, 3, {
    paused: true,
    recognitionPaused: true,
    leech: true,
    flag: { reason: 'translation seems wrong', flaggedAt: now.toISOString(), by: 'you' },
    editedAt: now.toISOString(),
  });
  const conjugation = makeCard('conj', {}, 5, {
    type: 'conjugation',
    front: 'poner → pretérito, ellos',
    back: 'pusieron',
    verb: 'poner',
    tense: 'pretérito',
    person: 'ellos',
    meaning: 'to put',
    table: { yo: 'puse', ellos: 'pusieron' },
    audio: 'Ellos pusieron la mesa.',
    tags: ['madrid'],
  });
  const sprint: Sprint = {
    id: 'sprint-1',
    name: 'Trip to Madrid',
    endDate: '2026-12-10',
    tags: ['madrid', 'food'],
    variety: 'spain',
    createdAt: now.toISOString(),
    finishedNoticeSeen: false,
  };
  return {
    cards: [studied, makeCard('unseen', {}, 2), marked, typedCard, conjugation],
    reviews: [review, typedReview],
    sprints: [sprint],
    settings: {
      ...current,
      newCardsPerDay: 20,
      soundsOn: false,
      autoPlayAudio: false,
      speechSpeed: 'slow',
      typeAnswers: false,
    },
  };
}

describe('backup files', () => {
  it('restores exactly what was saved: both directions, typed answers, marks, conjugation fields and sprints', () => {
    const data = exampleData();
    const text = JSON.stringify(buildBackup(data, now));
    const restored = parseBackup(text, current);

    expect(restored.cards).toEqual(data.cards);
    expect(restored.reviews).toEqual(data.reviews.map(({ id: _id, ...rest }) => rest));
    expect(restored.sprints).toEqual(data.sprints);
    expect(restored.settings).toMatchObject({
      newCardsPerDay: 20,
      soundsOn: false,
      autoPlayAudio: false,
      speechSpeed: 'slow',
      typeAnswers: false,
    });
    expect(restored.exportedAt).toBe(now.toISOString());
  });

  it('keeps this device’s own details instead of taking them from the file', () => {
    const restored = parseBackup(JSON.stringify(buildBackup(exampleData(), now)), { ...current, voiceTipSeen: true });
    expect(restored.settings.voiceTipSeen).toBe(true);
    expect(buildBackup(exampleData(), now).settings).not.toHaveProperty('voiceTipSeen');
  });

  it('labels the file so it can be recognised', () => {
    expect(buildBackup(exampleData(), now)).toMatchObject({
      app: 'spanish-cards',
      formatVersion: 3,
      exportedAt: now.toISOString(),
    });
    expect(backupFileName(new Date(2026, 2, 1))).toBe('spanish-cards-backup-2026-03-01.json');
  });

  it('refuses files that are not backups', () => {
    expect(() => parseBackup('not json', current)).toThrow(FileProblem);
    expect(() => parseBackup(JSON.stringify({ cards: [] }), current)).toThrow(/isn't a Spanish Cards backup/);
  });

  it('refuses backups from a newer format version it does not know', () => {
    const backup = { ...buildBackup(exampleData(), now), formatVersion: 4 };
    expect(() => parseBackup(JSON.stringify(backup), current)).toThrow(/newer version/);
  });

  it('refuses damaged backups instead of restoring half of one', () => {
    /** Builds a backup, lets `damage` break one thing, and expects the restore to be refused with `message`. */
    const refuses = (damage: (backup: any) => void, message: RegExp) => {
      // (Copied by way of JSON, so that changing one part can't quietly change another.)
      const backup = JSON.parse(JSON.stringify(buildBackup(exampleData(), now)));
      damage(backup);
      expect(() => parseBackup(JSON.stringify(backup), current)).toThrow(message);
    };

    refuses((backup) => (backup.cards[0].scheduling.dueAt = 'not a date'), /Card 1 in the backup is damaged/);
    refuses((backup) => (backup.reviews[0].rating = 9), /Review 1 in the backup is damaged/);
    refuses((backup) => backup.cards.push(backup.cards[0]), /more than once/);
    refuses((backup) => (backup.cards[2].flag = { reason: 5 }), /Card 3 in the backup is damaged/);
    refuses((backup) => (backup.cards[2].paused = 'yes'), /Card 3 in the backup is damaged/);
    // New in format 3:
    refuses((backup) => (backup.cards[3].production.scheduling.stability = 'high'), /Card 4 in the backup is damaged/);
    refuses(
      (backup) => (backup.cards[3].production.scheduling.cardId = 'someone-else'),
      /Card 4 in the backup is damaged/,
    );
    refuses((backup) => (backup.cards[3].production.paused = null), /Card 4 in the backup is damaged/);
    refuses((backup) => (backup.cards[0].introducedAt = 'last Tuesday'), /Card 1 in the backup is damaged/);
    refuses((backup) => (backup.cards[4].table = { they: 'pusieron' }), /Card 5 in the backup: "table"/);
    refuses((backup) => (backup.reviews[1].direction = 'sideways'), /Review 2 in the backup is damaged/);
    refuses((backup) => (backup.reviews[1].typedResult = 'perfect'), /Review 2 in the backup is damaged/);
    refuses((backup) => (backup.sprints[0].endDate = 'soon'), /Sprint 1 in the backup is damaged/);
    refuses((backup) => (backup.sprints[0].variety = 'mexico'), /Sprint 1 in the backup is damaged/);
    refuses((backup) => backup.sprints.push(backup.sprints[0]), /same sprint more than once/);
  });
});

// Real backup files saved by the two earlier releases of the app.
describe.each([
  ['version 1 (the first release)', backupFromVersion1, 1],
  ['version 2 (Round 1)', backupFromRound1, 2],
])('backups made by format %s', (_name, original, formatVersion) => {
  const text = JSON.stringify(original);
  const restored = parseBackup(text, current, now);

  it('can still be restored, with nothing lost', () => {
    expect(original.formatVersion).toBe(formatVersion);
    expect(restored.cards).toHaveLength(original.cards.length);
    expect(restored.reviews).toHaveLength(original.reviews.length);
    restored.cards.forEach((card, index) => {
      // Everything the old file said about the card is still there, unchanged.
      expect(card).toMatchObject(original.cards[index]);
    });
    restored.reviews.forEach((review, index) => {
      const { id: _id, ...rest } = original.reviews[index];
      expect(review).toMatchObject(rest);
    });
    expect(restored.settings.newCardsPerDay).toBe(original.settings.newCardsPerDay);
  });

  it('keeps each card’s progress as its Spanish → English side and adds a new English → Spanish side', () => {
    for (const card of restored.cards) {
      const twoWay = card.type === 'vocab' || card.type === 'phrase';
      expect(card.production === null).toBe(!twoWay);
      if (card.production) {
        expect(card.production).toMatchObject({ paused: false, introducedAt: null });
        expect(card.production.scheduling).toMatchObject({ cardId: `${card.id}#production`, state: 0, reps: 0 });
      }
      expect(card.recognitionPaused).toBe(false);
    }
  });

  it('works out when each card was first studied from the review history', () => {
    for (const card of restored.cards) {
      const reviews = original.reviews.filter((review) => review.cardId === card.id).map((review) => review.timestamp);
      if (card.scheduling.state === 0) expect(card.introducedAt).toBeNull();
      else expect(card.introducedAt).toBe(reviews.sort()[0]);
    }
  });

  it('labels every old review as Spanish → English, with no typed answer', () => {
    expect(restored.reviews.every((review) => review.direction === 'recognition' && review.typed === null)).toBe(true);
  });

  it('starts with no sprints and this device’s settings for everything the file does not mention', () => {
    expect(restored.sprints).toEqual([]);
    expect(restored.settings).toMatchObject({ autoPlayAudio: true, speechSpeed: 'normal', typeAnswers: true });
  });
});

describe('older backups: details', () => {
  it('a version 1 backup gets the Round 1 fields too', () => {
    for (const card of parseBackup(JSON.stringify(backupFromVersion1), current).cards) {
      expect(card).toMatchObject({ paused: false, leech: false, flag: null, editedAt: null });
    }
  });

  it('a Round 1 backup keeps its paused, flagged and edited cards and its sound setting', () => {
    const restored = parseBackup(JSON.stringify(backupFromRound1), current);
    expect(restored.cards.filter((card) => card.paused).map((card) => card.id)).toEqual(['sample-phrase-me-da-igual']);
    expect(restored.cards.find((card) => card.flag)?.flag).toMatchObject({
      reason: 'translation seems wrong',
      by: 'you',
    });
    expect(restored.cards.filter((card) => card.editedAt)).toHaveLength(1);
    expect(restored.settings.soundsOn).toBe(false);
  });

  it('marks cards that were already forgotten many times as leeches', () => {
    const old = structuredClone(backupFromVersion1);
    old.cards[0].scheduling.lapses = 6;
    const [card] = parseBackup(JSON.stringify(old), current, now).cards;
    expect(card.leech).toBe(true);
    expect(card.flag).toMatchObject({ by: 'leech', flaggedAt: now.toISOString() });
  });
});
