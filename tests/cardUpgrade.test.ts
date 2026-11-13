import { describe, expect, it } from 'vitest';
import { LEECH_THRESHOLD } from '../src/config';
import { addMissingCardFields } from '../src/data/cardUpgrade';
import { makeCard } from './helpers';

const now = new Date('2026-05-01T12:00:00.000Z');

/** A card as version 1 of the app saved it: without the newer fields. */
function version1Card(lapses = 0) {
  const { paused: _p, leech: _l, flag: _f, editedAt: _e, ...old } = makeCard('old', { lapses, reps: lapses * 3 });
  return old;
}

describe('addMissingCardFields', () => {
  it('fills in the new fields on an old card without touching anything else', () => {
    const old = version1Card();
    const upgraded = addMissingCardFields(old, now);
    expect(upgraded).toEqual({ ...old, paused: false, leech: false, flag: null, editedAt: null });
  });

  it('spots old cards that are already leeches and flags them', () => {
    const upgraded = addMissingCardFields(version1Card(LEECH_THRESHOLD), now);
    expect(upgraded.leech).toBe(true);
    expect(upgraded.flag).toMatchObject({ by: 'leech', flaggedAt: now.toISOString() });
    expect(upgraded.paused).toBe(false);
  });

  it('changes nothing on a card that is already up to date', () => {
    const current = makeCard('current', { lapses: LEECH_THRESHOLD + 1 }, 1, { paused: true, leech: false });
    expect(addMissingCardFields(current, now)).toEqual(current);
  });
});
