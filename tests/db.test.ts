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
  deleteCapture,
  deleteSprint,
  getCaptures,
  getSprints,
  getStudyDays,
  markCaptures,
  saveCapture,
  saveSprint,
  setCardFlag,
  setCardPaused,
  setDirectionPaused,
  undoReview,
} from '../src/data/db';
import { importCardFile } from '../src/data/importCards';
import { studyDate } from '../src/study/dates';
import { itemOf } from '../src/study/directions';
import { rateCard } from '../src/study/rate';
import { initScheduler, previewRatings } from '../src/study/scheduler';
import type { Capture, Direction, Rating, Sprint, StoredCard } from '../src/types';
import { makeCard, makeProduction } from './helpers';

beforeAll(() => initScheduler());
beforeEach(async () => {
  await Promise.all(
    [db.cards, db.reviews, db.sprints, db.captures, db.studyDays, db.settings].map((table) => table.clear()),
  );
});

let clock = new Date('2026-02-01T09:00:00.000Z').getTime();

/** Rates a card the way the Review screen does, and returns what Undo needs. */
async function review(cardId: string, rating: Rating, direction: Direction = 'recognition') {
  const item = itemOf((await getCard(cardId))!, direction)!;
  const when = new Date((clock += 60_000));
  const outcome = previewRatings(item.scheduling, when).find((candidate) => candidate.rating === rating)!;
  const rated = rateCard(item, outcome, when, 1000);
  const reviewId = await saveReview(rated.review, rated.changes);
  return { reviewId, previous: rated.previous, rated };
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
    const rated = rateCard(itemOf(ghost, 'recognition')!, outcome, new Date(clock), 0);

    await expect(saveReview(rated.review, rated.changes)).rejects.toThrow(/no longer exists/);
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

    await resetCardProgress('a', new Date(clock));

    expect(await getCard('a')).toMatchObject({
      front: 'front of a',
      introducedAt: null,
      leech: false,
      flag: mine, // a flag you wrote yourself stays
      scheduling: { state: 0, reps: 0, lapses: 0 },
    });
    expect(await getReviewsForCard('a')).toHaveLength(1);
  });

  it('resetting progress removes the automatic leech flag', async () => {
    const auto = { reason: 'Leech', flaggedAt: new Date(clock).toISOString(), by: 'leech' } as const;
    await addCards([makeCard('a', { state: 2, scheduleStatus: 'review', lapses: 7 }, 1, { leech: true, flag: auto })]);
    await resetCardProgress('a', new Date(clock));
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

describe('cards in two directions', () => {
  const twoWay = (id: string) => makeCard(id, {}, 1, { production: makeProduction(id) });

  it('saves a review of one direction without touching the other', async () => {
    await addCards([twoWay('a')]);
    await review('a', 3);
    const afterRecognition = (await getCard('a'))!;
    expect(afterRecognition.introducedAt).not.toBeNull();
    expect(afterRecognition.production).toEqual(makeProduction('a'));

    const { rated } = await review('a', 1, 'production');
    const afterBoth = (await getCard('a'))!;
    expect(afterBoth.scheduling).toEqual(afterRecognition.scheduling);
    expect(afterBoth.production).toMatchObject({ scheduling: rated.review.after, paused: false });
    expect(afterBoth.production?.introducedAt).toBe(rated.review.timestamp);
    expect((await getReviewsForCard('a')).map((entry) => entry.direction)).toEqual(['recognition', 'production']);
  });

  it('undoes a review of one direction without touching the other', async () => {
    await addCards([twoWay('a')]);
    await review('a', 3);
    const before = await snapshot();
    const step = await review('a', 3, 'production');
    await review('a', 3); // the other direction moves on in the meantime…

    await undoReview(step.reviewId, step.previous); // …and this can still be undone
    const card = (await getCard('a'))!;
    expect(card.production).toEqual(JSON.parse(before).cards[0].production);
    expect(card.scheduling.reps).toBe(2);
    expect((await getReviewsForCard('a')).map((entry) => entry.direction)).toEqual(['recognition', 'recognition']);
  });

  it('pauses one direction and leaves the other alone', async () => {
    await addCards([twoWay('a')]);
    await setDirectionPaused('a', 'production', true);
    expect(await getCard('a')).toMatchObject({ paused: false, recognitionPaused: false, production: { paused: true } });
    await setDirectionPaused('a', 'recognition', true);
    await setDirectionPaused('a', 'production', false);
    expect(await getCard('a')).toMatchObject({ paused: false, recognitionPaused: true, production: { paused: false } });
  });

  it('refuses to pause a direction the card does not have', async () => {
    await addCards([makeCard('single')]);
    await expect(setDirectionPaused('single', 'production', true)).rejects.toThrow(/no production direction/);
  });

  it('resets both directions, keeping their pauses', async () => {
    await addCards([twoWay('a')]);
    await review('a', 3);
    await review('a', 3, 'production');
    await setDirectionPaused('a', 'production', true);

    await resetCardProgress('a', new Date(clock));
    expect(await getCard('a')).toMatchObject({
      introducedAt: null,
      scheduling: { state: 0, reps: 0 },
      production: { paused: true, introducedAt: null, scheduling: { cardId: 'a#production', state: 0, reps: 0 } },
    });
  });
});

describe('sprints', () => {
  const sprint: Sprint = {
    id: 's1',
    name: 'Chess conversation',
    endDate: '2026-11-21',
    tags: ['chess'],
    variety: 'latam',
    createdAt: '2026-11-10T10:00:00.000Z',
    finishedNoticeSeen: false,
  };

  it('can be saved, changed and deleted, without touching any cards', async () => {
    await addCards([makeCard('a', {}, 1, { tags: ['chess'] })]);
    await saveSprint(sprint);
    await saveSprint({ ...sprint, endDate: '2026-12-01' });
    expect(await getSprints()).toEqual([{ ...sprint, endDate: '2026-12-01' }]);

    await deleteSprint('s1');
    expect(await getSprints()).toEqual([]);
    expect((await getCard('a'))!.tags).toEqual(['chess']);
  });
});

describe('importing a file', () => {
  const file = (extra: object = {}) =>
    JSON.stringify({
      cards: [
        { id: 'v', type: 'vocab', front: 'el tablero', back: 'the board', tags: ['nouns'] },
        { id: 'r', type: 'vocab', front: 'enrocar', back: 'to castle', directions: ['recognition'] },
        {
          id: 'c',
          type: 'conjugation',
          front: 'mover → presente, yo',
          back: 'muevo',
          verb: 'mover',
          tense: 'presente',
          person: 'yo',
        },
      ],
      ...extra,
    });
  const sprintBlock = { sprint: { name: 'Chess talk', endDate: '2026-12-31', tag: 'ajedrez', variety: 'spain' } };

  it('gives vocab cards two directions unless the file says otherwise', async () => {
    expect(await importCardFile(file())).toMatchObject({ added: 3, duplicates: 0, problems: [], sprint: null });
    expect((await getCard('v'))!.production).toMatchObject({
      paused: false,
      scheduling: { cardId: 'v#production', state: 0 },
    });
    expect((await getCard('r'))!.production).toBeNull();
    expect((await getCard('c'))!.production).toBeNull();
    expect(await getCard('c')).toMatchObject({ verb: 'mover', tense: 'presente', person: 'yo' });
  });

  it('creates the sprint named in the file and tags its cards', async () => {
    const result = await importCardFile(file(sprintBlock));
    expect(result.sprint).toEqual({ name: 'Chess talk', endDate: '2026-12-31', isNew: true });
    expect(await getSprints()).toMatchObject([
      { name: 'Chess talk', endDate: '2026-12-31', tags: ['ajedrez'], variety: 'spain' },
    ]);
    expect((await getCard('v'))!.tags).toEqual(['nouns', 'ajedrez']);
    expect((await getCard('c'))!.tags).toEqual(['ajedrez']);
  });

  it('adds to a sprint that already exists instead of creating a twin', async () => {
    await importCardFile(file(sprintBlock));
    const more = JSON.stringify({
      sprint: { name: ' chess TALK ', endDate: '2027-01-15', tag: 'openings', variety: 'spain' },
      cards: [{ id: 'new', type: 'phrase', front: 'jaque mate', back: 'checkmate' }],
    });

    expect((await importCardFile(more)).sprint).toMatchObject({ name: 'Chess talk', isNew: false });
    const sprints = await getSprints();
    expect(sprints).toHaveLength(1);
    expect(sprints[0]).toMatchObject({ endDate: '2027-01-15', tags: ['ajedrez', 'openings'] });
  });

  it('saves nothing at all when the sprint block is broken', async () => {
    const broken = file({ sprint: { name: 'Chess talk', endDate: 'next month', tag: 'ajedrez' } });
    await expect(importCardFile(broken)).rejects.toThrow(/endDate/);
    expect(await getAllCards()).toEqual([]);
    expect(await getSprints()).toEqual([]);
  });

  it('does not tag or change cards that were already there', async () => {
    await importCardFile(file());
    const before = await getCard('v');
    expect(await importCardFile(file(sprintBlock))).toMatchObject({ added: 0, duplicates: 3 });
    expect(await getCard('v')).toEqual(before);
  });
});

describe('study days (what the streak is worked out from)', () => {
  it('are noted when a card is reviewed, and counted', async () => {
    await addCards([makeCard('a'), makeCard('b', {}, 2)]);
    const first = await review('a', 3);
    await review('b', 3);
    expect(await getStudyDays()).toEqual([{ date: studyDate(new Date(first.rated.review.timestamp)), reviews: 2 }]);
  });

  it('go back down when a review is undone, and disappear with the last one', async () => {
    await addCards([makeCard('a'), makeCard('b', {}, 2)]);
    const first = await review('a', 3);
    const second = await review('b', 3);

    await undoReview(second.reviewId, second.previous);
    expect((await getStudyDays()).map((day) => day.reviews)).toEqual([1]);
    await undoReview(first.reviewId, first.previous);
    expect(await getStudyDays()).toEqual([]); // nothing was studied that day after all
  });

  it('are kept when a card is deleted, so deleting a card can never break a streak', async () => {
    await addCards([makeCard('a')]);
    await review('a', 3);
    const before = await getStudyDays();

    await deleteCard('a');
    expect(await db.reviews.count()).toBe(0);
    expect(await getStudyDays()).toEqual(before);
  });

  it('are left alone if saving a review fails', async () => {
    const ghost = makeCard('ghost');
    const outcome = previewRatings(ghost.scheduling, new Date(clock))[2];
    const rated = rateCard(itemOf(ghost, 'recognition')!, outcome, new Date(clock), 0);
    await expect(saveReview(rated.review, rated.changes)).rejects.toThrow();
    expect(await getStudyDays()).toEqual([]);
  });
});

describe('the capture log', () => {
  const entry = (id: string, createdAt: string, other: Partial<Capture> = {}): Capture => ({
    id,
    text: `note ${id}`,
    type: 'other',
    context: '',
    createdAt,
    status: 'waiting',
    sentAt: null,
    ...other,
  });

  it('lists entries newest first', async () => {
    await saveCapture(entry('old', '2026-11-01T10:00:00.000Z'));
    await saveCapture(entry('new', '2026-11-05T10:00:00.000Z'));
    await saveCapture(entry('middle', '2026-11-03T10:00:00.000Z'));
    expect((await getCaptures()).map((capture) => capture.id)).toEqual(['new', 'middle', 'old']);
  });

  it('edits an entry in place and deletes one', async () => {
    await saveCapture(entry('a', '2026-11-01T10:00:00.000Z'));
    await saveCapture(
      entry('a', '2026-11-01T10:00:00.000Z', { text: 'how do I say “to-go box”?', type: 'vocab', context: 'at lunch' }),
    );
    expect(await getCaptures()).toMatchObject([
      { id: 'a', text: 'how do I say “to-go box”?', type: 'vocab', context: 'at lunch' },
    ]);

    await deleteCapture('a');
    expect(await getCaptures()).toEqual([]);
  });

  it('marks entries as sent to Claude, and back to waiting', async () => {
    await saveCapture(entry('a', '2026-11-01T10:00:00.000Z'));
    await saveCapture(entry('b', '2026-11-02T10:00:00.000Z'));
    await saveCapture(entry('c', '2026-11-03T10:00:00.000Z'));

    await markCaptures(['a', 'b', 'no-such-entry'], '2026-11-07T09:00:00.000Z');
    const byId = async () => Object.fromEntries((await getCaptures()).map((capture) => [capture.id, capture]));
    expect(await byId()).toMatchObject({
      a: { status: 'sent', sentAt: '2026-11-07T09:00:00.000Z' },
      b: { status: 'sent', sentAt: '2026-11-07T09:00:00.000Z' },
      c: { status: 'waiting', sentAt: null },
    });

    await markCaptures(['a'], null);
    expect((await byId()).a).toMatchObject({ status: 'waiting', sentAt: null });
  });
});

describe('importing rewritten cards', () => {
  const flag = { reason: 'translation seems wrong', flaggedAt: '2026-11-01T10:00:00.000Z', by: 'you' } as const;
  const file = (cards: object[], extra: object = {}) => JSON.stringify({ cards, ...extra });

  it('updates a flagged card in place: new text, same progress and history, flag cleared', async () => {
    await addCards([
      makeCard('reto', {}, 1, { front: 'el reto', back: 'the challange', production: makeProduction('reto') }),
    ]);
    await review('reto', 3);
    await review('reto', 3, 'production');
    await setCardFlag('reto', flag);
    const before = (await getCard('reto'))!;

    const result = await importCardFile(
      file([
        {
          id: 'reto',
          type: 'vocab',
          front: 'el reto',
          back: 'the challenge',
          note: 'Es un reto. — It is a challenge.',
          tags: ['nouns'],
        },
        { id: 'mesa', type: 'vocab', front: 'la mesa', back: 'the table' },
      ]),
    );
    expect(result).toMatchObject({ added: 1, updated: 1, duplicates: 0, problems: [] });

    const after = (await getCard('reto'))!;
    expect(after).toMatchObject({
      back: 'the challenge',
      note: 'Es un reto. — It is a challenge.',
      tags: ['nouns'],
      flag: null,
    });
    expect(after.editedAt).not.toBeNull();
    // Progress in both directions, and everything else, is exactly as it was.
    expect(after.scheduling).toEqual(before.scheduling);
    expect(after.production).toEqual(before.production);
    expect(after).toMatchObject({
      introducedAt: before.introducedAt,
      position: before.position,
      addedAt: before.addedAt,
    });
    expect(await getReviewsForCard('reto')).toHaveLength(2);
  });

  it('updates a leech and stops counting it as one', async () => {
    const worn = { state: 2, scheduleStatus: 'review', scheduledDays: 3, lapses: LEECH_THRESHOLD, reps: 20 } as const;
    await addCards([makeCard('por', worn, 1, { leech: true, flag: { ...flag, by: 'leech' } })]);

    await importCardFile(file([{ id: 'por', type: 'vocab', front: 'por (duration)', back: 'for (how long)' }]));
    expect(await getCard('por')).toMatchObject({
      front: 'por (duration)',
      leech: false,
      flag: null,
      scheduling: { lapses: LEECH_THRESHOLD, reps: 20 }, // its history of being forgotten is not erased
    });
  });

  it('never touches a card that was not flagged', async () => {
    await addCards([makeCard('casa', {}, 1, { front: 'la casa', back: 'the house' })]);
    const before = await getCard('casa');

    const result = await importCardFile(
      file([{ id: 'casa', type: 'vocab', front: 'la casa', back: 'SOMETHING ELSE' }]),
    );
    expect(result).toMatchObject({ added: 0, updated: 0, duplicates: 1 });
    expect(await getCard('casa')).toEqual(before);
  });

  it('reports a rewrite that changes the type, and leaves that card as it was', async () => {
    await addCards([makeCard('reto', {}, 1, { flag })]);
    const before = await getCard('reto');

    const result = await importCardFile(file([{ id: 'reto', type: 'cloze', front: 'Es un {{c1::reto}}.' }]));
    expect(result).toMatchObject({ added: 0, updated: 0 });
    expect(result.problems[0]).toContain('has to keep its type');
    expect(await getCard('reto')).toEqual(before);
  });

  it('gives a rewritten card the sprint tag when the file has a sprint', async () => {
    await addCards([makeCard('reto', {}, 1, { tags: ['nouns'], flag })]);
    await importCardFile(
      file([{ id: 'reto', type: 'vocab', front: 'el reto', back: 'the challenge' }], {
        sprint: { name: 'Trip', endDate: '2026-12-10', tag: 'madrid' },
      }),
    );
    expect((await getCard('reto'))!.tags).toEqual(['nouns', 'madrid']);
  });
});

describe('backup and restore through the database', () => {
  it('brings back everything, including paused, flagged, leech and edited cards', async () => {
    const cards: StoredCard[] = [
      makeCard('a', {}, 1, { production: makeProduction('a') }),
      makeCard('b', {}, 2),
      makeCard('c', {}, 3),
    ];
    await addCards(cards);
    await review('a', 3);
    await review('a', 2, 'production');
    await setDirectionPaused('a', 'recognition', true);
    await saveSprint({
      id: 's1',
      name: 'Trip to Madrid',
      endDate: '2026-12-10',
      tags: ['t'],
      variety: 'spain',
      createdAt: new Date(clock).toISOString(),
      finishedNoticeSeen: false,
    });
    await review('b', 1);
    await saveCapture({
      id: 'c1',
      text: 'how do I say “to-go box”?',
      type: 'vocab',
      context: 'at lunch',
      createdAt: new Date(clock).toISOString(),
      status: 'waiting',
      sentAt: null,
    });
    await setCardPaused('b', true);
    await setCardFlag('c', { reason: 'typo', flaggedAt: new Date(clock).toISOString(), by: 'you' });
    await editCard('c', { front: 'edited', back: 'card', tags: ['t'], note: 'n' }, new Date(clock));
    const saved = await readEverything();
    const file = JSON.stringify(buildBackup(saved, new Date(clock)));

    // Wreck the database, then restore.
    await deleteCard('a');
    await setCardPaused('b', false);
    await deleteSprint('s1');
    await deleteCapture('c1');
    await db.studyDays.clear();
    await replaceEverything(parseBackup(file, await getSettings()));

    const restored = await readEverything();
    expect(restored.cards).toEqual(saved.cards);
    expect(restored.sprints).toEqual(saved.sprints);
    expect(restored.captures).toEqual(saved.captures);
    expect(restored.studyDays).toEqual(saved.studyDays);
    expect(saved.studyDays).toHaveLength(1);
    expect(restored.reviews.map(({ id: _id, ...rest }) => rest)).toEqual(
      saved.reviews.map(({ id: _id, ...rest }) => rest),
    );
  });
});
