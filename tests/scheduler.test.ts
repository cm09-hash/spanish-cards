import { beforeAll, describe, expect, it } from 'vitest';
import { initScheduler, newSchedulingState, previewRatings } from '../src/study/scheduler';

beforeAll(() => initScheduler());

const now = new Date('2026-01-01T10:00:00.000Z');

describe('scheduler (ts-fsrs)', () => {
  it('creates a brand-new card state', () => {
    expect(newSchedulingState('abc', now)).toMatchObject({
      cardId: 'abc',
      state: 0,
      scheduleStatus: 'new',
      reps: 0,
      lastReviewAt: null,
    });
  });

  it('previews all four ratings, each coming back later than the one before', () => {
    const outcomes = previewRatings(newSchedulingState('abc', now), now);
    expect(outcomes.map((outcome) => outcome.rating)).toEqual([1, 2, 3, 4]);

    const dueTimes = outcomes.map((outcome) => new Date(outcome.after.dueAt).getTime());
    expect(dueTimes[0]).toBeGreaterThan(now.getTime());
    expect([...dueTimes].sort((a, b) => a - b)).toEqual(dueTimes);

    for (const { after } of outcomes) {
      expect(after).toMatchObject({ cardId: 'abc', reps: 1, lastReviewAt: now.toISOString() });
    }
  });

  it('gives the same answer every time for the same card and moment', () => {
    const state = newSchedulingState('abc', now);
    expect(previewRatings(state, now)).toEqual(previewRatings(state, now));
  });

  it('produces states that survive being saved as JSON and loaded again', () => {
    const good = previewRatings(newSchedulingState('abc', now), now)[2].after;
    const reloaded = JSON.parse(JSON.stringify(good));
    const later = new Date('2026-01-08T10:00:00.000Z');
    expect(previewRatings(reloaded, later)).toEqual(previewRatings(good, later));
  });

  it('grows the interval when a card keeps being remembered', () => {
    let state = newSchedulingState('abc', now);
    let when = now;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = previewRatings(state, when)[2].after; // "Good"
      intervals.push(state.scheduledDays);
      when = new Date(state.dueAt);
    }
    expect([...intervals].sort((a, b) => a - b)).toEqual(intervals);
    expect(intervals[3]).toBeGreaterThan(30);
  });
});
