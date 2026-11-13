/** Tests for saving, undoing and editing, run against a pretend in-memory database. */
import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEECH_THRESHOLD } from '../src/config';
import { buildBackup, parseBackup } from '../src/data/backupFile';
import {
  addCards,
  db,
  deleteCard,
  editCard,
  getAllCards,
  getCard,
  getReviewsForCard,
  getSettings,
  readEverything,
  replaceEverything,
  resetCardProgress,
  saveReview,
  setCardFlag,
  setCardPaused,
  undoReview,
} from '../src/data/db';
import { rateCard, type ReviewableState } from '../src/study/rate';
import { initScheduler, newSchedulingState, previewRatings } from '../src/study/scheduler';
import type { Rating, StoredCard } from '../src/types';
import { makeCard } from './helpers';

beforeAll(() => initScheduler());
beforeEach(async () => {
  await Promise.all([db.cards.clear(), db.reviews.clear(), db.settings.clear()]);
});

let clock = new Date('2026-02-01T09:00:00.000Z').getTime();

/** Rates a card the way the Review screen does, and returns what Undo needs. */
async function review(cardId: string, rating: Rating) {
  const card = (await getCard(cardId))!;
  const when = new Date((clock += 60_000));
  const outcome = previewRatings(card.scheduling, when).find((candidate) => candidate.rating === rating)!;
  const rated = rateCard(card, outcome, when, 1000);
  const reviewId = await saveReview(rated.review, rated.marks);
  const previous: ReviewableState = { scheduling: card.scheduling, leech: card.leech, flag: card.flag };
  return { reviewId, previous, rated };
}

const snapshot = async () => JSON.stringify(await readEverything());

describe('saving a review', () => {
  it('updates the card and adds a history entry together', async () => {
    await addCards([makeCard('a')]);
    const { rated } = await review('a', 3);

    expect((await getCard('a'))!.scheduling).toEqual(rated.review.after);
    expect(await getReviewsForCard('a')).toMatchObject([{ cardId: 'a', rating: 3 }]);
  });

  it('saves nothing at all if the card has gone', async () => {
    const ghost = makeCard('ghost');
    const outcome = previewRatings(ghost.scheduling, new Date(clock))[2];
    const rated = rateCard(ghost, outcome, new Date(clock), 0);

    await expect(saveReview(rated.review, rated.marks)).rejects.toThrow(/no longer exists/);
    expect(await db.reviews.count()).toBe(0);
  });
});

describe('undo', () => {
  it('puts the card back exactly as it was and removes the review from the history', async () => {
    await addCards([makeCard('a'), makeCard('b', {}, 2)]);
    await review('b', 3);
    const before = await snapshot();

    const step = await review('a', 1);
    expect(await snapshot()).not.toBe(before);

    await undoReview(step.reviewId, step.previous);
    expect(await snapshot()).toBe(before);
  });

  it('can go back several steps, most recent first', async () => {
    await addCards([makeCard('a'), makeCard('b', {}, 2)]);
    const start = await snapshot();

    const first = await review('a', 1);
    const afterFirst = await snapshot();
    const second = await review('b', 4);
    const afterSecond = await snapshot();
    const third = await review('a', 3); // the same card again

    await undoReview(third.reviewId, third.previous);
    expect(await snapshot()).toBe(afterSecond);
    await undoReview(second.reviewId, second.previous);
    expect(await snapshot()).toBe(afterFirst);
    await undoReview(first.reviewId, first.previous);
    expect(await snapshot()).toBe(start);
  });

  it('un-leeches a card when the review that made it a leech is undone', async () => {
    const nearly = { state: 2, scheduleStatus: 'review', scheduledDays: 5, lapses: LEECH_THRESHOLD - 1 } as const;
    const memory = { stability: 5, stabilityFast: 5, difficulty: 5, lastReviewAt: '2026-01-27T09:00:00.000Z' };
    await addCards([makeCard('a', { ...nearly, ...memory, dueAt: new Date(clock).toISOString() })]);

    const step = await review('a', 1);
    expect(step.rated.becameLeech).toBe(true);
    expect(await getCard('a')).toMatchObject({ leech: true, flag: { by: 'leech' }, paused: false });

    await undoReview(step.reviewId, step.previous);
    expect(await getCard('a')).toMatchObject({ leech: false, flag: null });
  });

  it('refuses, and changes nothing, if the card has moved on since that review', async () => {
    await addCards([makeCard('a')]);
    const older = await review('a', 1);
    await review('a', 3);
    const before = await snapshot();

    await expect(undoReview(older.reviewId, older.previous)).rejects.toThrow(/changed since/);
    expect(await snapshot()).toBe(before);
  });

  it('refuses, and changes nothing, if the review is already gone', async () => {
    await addCards([makeCard('a')]);
    const step = await review('a', 3);
    await undoReview(step.reviewId, step.previous);
    const before = await snapshot();

    await expect(undoReview(step.reviewId, step.previous)).rejects.toThrow(/already been removed/);
    expect(await snapshot()).toBe(before);
  });

  it('keeps edits made to the card text', async () => {
    await addCards([makeCard('a')]);
    const step = await review('a', 3);
    await editCard('a', { front: 'new front', back: 'new back', tags: ['x'] }, new Date(clock));

    await undoReview(step.reviewId, step.previous);
    expect(await getCard('a')).toMatchObject({ front: 'new front', scheduling: { state: 0, reps: 0 } });
  });
});

describe('the card browser’s changes', () => {
  it('editing changes the text but keeps progress, history and marks', async () => {
    await addCards([makeCard('a', {}, 1, { note: 'old note', tags: ['old'] })]);
    await review('a', 3);
    await setCardPaused('a', true);
    const before = (await getCard('a'))!;
    const editedAt = new Date('2026-02-02T10:00:00.000Z');

    await editCard('a', { front: 'la casa', back: 'the house', tags: ['nouns', 'home'], note: 'new note' }, editedAt);

    expect(await getCard('a')).toEqual({
      ...before,
      front: 'la casa',
      back: 'the house',
      tags: ['nouns', 'home'],
      note: 'new note',
      editedAt: editedAt.toISOString(),
    });
    expect(await getReviewsForCard('a')).toHaveLength(1);
  });

  it('editing can remove the note', async () => {
    await addCards([makeCard('a', {}, 1, { note: 'old note' })]);
    await editCard('a', { front: 'f', back: 'b', tags: [] }, new Date(clock));
    expect(await getCard('a')).not.toHaveProperty('note');
  });

  it('pauses and unpauses, even when asked twice', async () => {
    await addCards([makeCard('a')]);
    await setCardPaused('a', true);
    await setCardPaused('a', true);
    expect((await getCard('a'))!.paused).toBe(true);
    await setCardPaused('a', false);
    expect((await getCard('a'))!.paused).toBe(false);
  });

  it('flags with a reason, and unflags', async () => {
    await addCards([makeCard('a')]);
    const flag = { reason: 'translation seems wrong', flaggedAt: new Date(clock).toISOString(), by: 'you' } as const;
    await setCardFlag('a', flag);
    expect((await getCard('a'))!.flag).toEqual(flag);
    await setCardFlag('a', null);
    await setCardFlag('a', null);
    expect((await getCard('a'))!.flag).toBeNull();
  });

  it('complains instead of creating a card that does not exist', async () => {
    await expect(setCardPaused('nope', true)).rejects.toThrow(/no longer exists/);
    await expect(editCard('nope', { front: 'f', back: 'b', tags: [] }, new Date())).rejects.toThrow(/no longer exists/);
    expect(await getAllCards()).toEqual([]);
  });

  it('resetting progress makes the card new again but keeps its text and its history', async () => {
    const mine = { reason: 'check this', flaggedAt: new Date(clock).toISOString(), by: 'you' } as const;
    await addCards([makeCard('a', {}, 1, { leech: true, flag: mine })]);
    await review('a', 3);

    await resetCardProgress('a', newSchedulingState('a', new Date(clock)));

    expect(await getCard('a')).toMatchObject({
      front: 'front of a',
      leech: false,
      flag: mine, // a flag you wrote yourself stays
      scheduling: { state: 0, reps: 0, lapses: 0 },
    });
    expect(await getReviewsForCard('a')).toHaveLength(1);
  });

  it('resetting progress removes the automatic leech flag', async () => {
    const auto = { reason: 'Leech', flaggedAt: new Date(clock).toISOString(), by: 'leech' } as const;
    await addCards([makeCard('a', { state: 2, scheduleStatus: 'review', lapses: 7 }, 1, { leech: true, flag: auto })]);
    await resetCardProgress('a', newSchedulingState('a', new Date(clock)));
    expect(await getCard('a')).toMatchObject({ leech: false, flag: null });
  });

  it('deleting removes the card and its history, and nothing else', async () => {
    await addCards([makeCard('a'), makeCard('b', {}, 2)]);
    await review('a', 3);
    await review('b', 3);
    await review('a', 3);

    await deleteCard('a');

    expect((await getAllCards()).map((card) => card.id)).toEqual(['b']);
    expect((await db.reviews.toArray()).map((entry) => entry.cardId)).toEqual(['b']);
  });
});

describe('backup and restore through the database', () => {
  it('brings back everything, including paused, flagged, leech and edited cards', async () => {
    const cards: StoredCard[] = [makeCard('a'), makeCard('b', {}, 2), makeCard('c', {}, 3)];
    await addCards(cards);
    await review('a', 3);
    await review('b', 1);
    await setCardPaused('b', true);
    await setCardFlag('c', { reason: 'typo', flaggedAt: new Date(clock).toISOString(), by: 'you' });
    await editCard('c', { front: 'edited', back: 'card', tags: ['t'], note: 'n' }, new Date(clock));
    const saved = await readEverything();
    const file = JSON.stringify(buildBackup(saved, new Date(clock)));

    // Wreck the database, then restore.
    await deleteCard('a');
    await setCardPaused('b', false);
    await replaceEverything(parseBackup(file, await getSettings()));

    const restored = await readEverything();
    expect(restored.cards).toEqual(saved.cards);
    expect(restored.reviews.map(({ id: _id, ...rest }) => rest)).toEqual(
      saved.reviews.map(({ id: _id, ...rest }) => rest),
    );
  });
});
