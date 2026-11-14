import { describe, expect, it } from 'vitest';
import { LEECH_THRESHOLD } from '../src/config';
import {
  addMissingCardFields,
  addMissingReviewFields,
  addRound1Fields,
  addRound2Fields,
  firstReviewTimes,
  newStoredCard,
} from '../src/data/cardUpgrade';
import type { CardType, StoredCard } from '../src/types';
import { makeCard } from './helpers';

const now = new Date('2026-05-01T12:00:00.000Z');
const studied = {
  state: 2,
  scheduleStatus: 'review',
  scheduledDays: 4,
  reps: 3,
  lastReviewAt: '2026-04-20T09:00:00.000Z',
} as const;

/** A card as the first version of the app saved it: without any of the newer fields. */
function version1Card(other: Partial<StoredCard> = {}, scheduling = {}) {
  const full = makeCard('old', scheduling, 1, other);
  const {
    paused: _p,
    leech: _l,
    flag: _f,
    editedAt: _e,
    introducedAt: _i,
    recognitionPaused: _r,
    production: _pr,
    ...old
  } = full;
  return old;
}

/** A card as Round 1 saved it: with the Round 1 fields, without the Round 2 ones. */
function round1Card(type: CardType, scheduling = {}, other: Partial<StoredCard> = {}) {
  const {
    introducedAt: _i,
    recognitionPaused: _r,
    production: _pr,
    ...old
  } = makeCard('old', scheduling, 1, { type, ...other });
  return old;
}

describe('Round 1 fields (paused, leech, flag, editedAt)', () => {
  it('are filled in on an old card without touching anything else', () => {
    const old = version1Card();
    expect(addRound1Fields(old, now)).toEqual({ ...old, paused: false, leech: false, flag: null, editedAt: null });
  });

  it('mark old cards that are already leeches, and flag them', () => {
    const upgraded = addRound1Fields(version1Card({}, { lapses: LEECH_THRESHOLD }), now);
    expect(upgraded.leech).toBe(true);
    expect(upgraded.flag).toMatchObject({ by: 'leech', flaggedAt: now.toISOString() });
    expect(upgraded.paused).toBe(false);
  });
});

describe('Round 2 fields (two directions)', () => {
  it('keep a vocab card’s progress as its Spanish → English side, and add a new English → Spanish side', () => {
    const old = round1Card('vocab', studied, { paused: true, leech: true });
    const upgraded = addRound2Fields(old, now, '2026-04-02T08:00:00.000Z');

    expect(upgraded).toMatchObject(old); // every old field, unchanged
    expect(upgraded.introducedAt).toBe('2026-04-02T08:00:00.000Z');
    expect(upgraded.recognitionPaused).toBe(false);
    expect(upgraded.production).toEqual({
      scheduling: expect.objectContaining({
        cardId: 'old#production',
        state: 0,
        scheduleStatus: 'new',
        reps: 0,
        lapses: 0,
      }),
      paused: false,
      introducedAt: null,
    });
  });

  it('give phrase cards a second side too, and no other type', () => {
    expect(addRound2Fields(round1Card('phrase'), now, null).production).not.toBeNull();
    for (const type of ['conjugation', 'grammar', 'listening', 'cloze'] as const) {
      expect(addRound2Fields(round1Card(type), now, null).production).toBeNull();
    }
  });

  it('leave a never-studied card as never studied', () => {
    expect(addRound2Fields(round1Card('vocab'), now, null).introducedAt).toBeNull();
  });

  it('fall back on the last review time when the history does not say when a card was first studied', () => {
    expect(addRound2Fields(round1Card('vocab', studied), now, null).introducedAt).toBe(studied.lastReviewAt);
  });
});

describe('addMissingCardFields', () => {
  it('brings a card from the very first version fully up to date', () => {
    const old = version1Card({ type: 'phrase' }, studied);
    const upgraded = addMissingCardFields(old, now, '2026-04-02T08:00:00.000Z');
    expect(upgraded).toMatchObject({
      ...old,
      paused: false,
      leech: false,
      flag: null,
      editedAt: null,
      introducedAt: '2026-04-02T08:00:00.000Z',
      recognitionPaused: false,
    });
    expect(upgraded.production?.scheduling.state).toBe(0);
  });

  it('changes nothing on a card that is already up to date', () => {
    const current = makeCard('current', { lapses: LEECH_THRESHOLD + 1 }, 1, {
      paused: true,
      leech: false,
      recognitionPaused: true,
      introducedAt: '2026-03-03T03:03:03.000Z',
      production: null, // a vocab card whose import file asked for one direction only
    });
    expect(addMissingCardFields(current, now, '2020-01-01T00:00:00.000Z')).toEqual(current);
  });
});

describe('reviews', () => {
  const old = {
    cardId: 'a',
    rating: 3 as const,
    timestamp: '2026-04-02T08:00:00.000Z',
    durationMs: 900,
    before: makeCard('a').scheduling,
    after: makeCard('a').scheduling,
  };

  it('from before two directions existed are labelled "recognition"', () => {
    expect(addMissingReviewFields(old)).toEqual({ ...old, direction: 'recognition', typed: null, typedResult: null });
  });

  it('that are already labelled are left alone', () => {
    const current = { ...old, direction: 'production' as const, typed: 'hola', typedResult: 'correct' as const };
    expect(addMissingReviewFields(current)).toEqual(current);
  });

  it('tell when each card was first studied (Spanish → English)', () => {
    const times = firstReviewTimes([
      { ...old, timestamp: '2026-04-05T08:00:00.000Z' },
      { ...old, timestamp: '2026-04-02T08:00:00.000Z' },
      { ...old, cardId: 'b', timestamp: '2026-04-09T08:00:00.000Z' },
      { ...old, cardId: 'b', direction: 'production', timestamp: '2026-04-01T08:00:00.000Z' },
    ]);
    expect(Object.fromEntries(times)).toEqual({ a: '2026-04-02T08:00:00.000Z', b: '2026-04-09T08:00:00.000Z' });
  });
});

describe('newStoredCard', () => {
  const content = { id: 'n', type: 'vocab' as const, front: 'la jugada', back: 'the move', tags: ['chess'] };

  it('starts a card with nothing studied, in both directions', () => {
    const card = newStoredCard(content, { now, position: 7, production: true });
    expect(card).toMatchObject({
      ...content,
      position: 7,
      addedAt: now.toISOString(),
      introducedAt: null,
      paused: false,
    });
    expect(card.scheduling).toMatchObject({ cardId: 'n', state: 0 });
    expect(card.production?.scheduling).toMatchObject({ cardId: 'n#production', state: 0 });
  });

  it('can leave out the English → Spanish side', () => {
    expect(newStoredCard(content, { now, position: 1, production: false }).production).toBeNull();
  });
});
