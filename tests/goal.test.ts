import { describe, expect, it } from 'vitest';
import { goalProgress } from '../src/study/goal';

describe('daily goal: finish everything', () => {
  const settings = { goalKind: 'all', goalReviews: 20 } as const;

  it('follows how many of today’s cards are done', () => {
    expect(goalProgress(settings, { done: 9, total: 15 }, 12)).toMatchObject({
      done: 9,
      target: 15,
      fraction: 0.6,
      met: false,
      label: '9 of 15 cards done',
    });
  });

  it('is reached when nothing is left', () => {
    expect(goalProgress(settings, { done: 15, total: 15 }, 22)).toMatchObject({ fraction: 1, met: true });
  });

  it('counts as reached on a day with nothing due', () => {
    expect(goalProgress(settings, { done: 0, total: 0 }, 0)).toMatchObject({
      fraction: 1,
      met: true,
      label: 'Nothing is due today',
    });
  });
});

describe('daily goal: a number of reviews', () => {
  const settings = { goalKind: 'reviews', goalReviews: 20 } as const;

  it('follows how many answers were given today', () => {
    expect(goalProgress(settings, { done: 1, total: 40 }, 5)).toMatchObject({
      done: 5,
      target: 20,
      fraction: 0.25,
      met: false,
      label: '5 of 20 reviews',
    });
  });

  it('is reached at the number, and the ring never overfills', () => {
    expect(goalProgress(settings, { done: 0, total: 40 }, 20)).toMatchObject({ fraction: 1, met: true });
    expect(goalProgress(settings, { done: 0, total: 40 }, 33)).toMatchObject({ done: 20, fraction: 1, met: true });
  });
});
