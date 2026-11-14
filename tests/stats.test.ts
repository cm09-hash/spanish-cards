import { describe, expect, it } from 'vitest';
import { MIN_REVIEWS_FOR_AREA } from '../src/config';
import { addDays, studyDate } from '../src/study/dates';
import {
  areaStats,
  averageSeconds,
  byId,
  cardCounts,
  forecast,
  learnedBetween,
  learnedOverTime,
  percent,
  retention,
  retentionByDirection,
  reviewsPerDay,
  reviewsSince,
  strongestAndWeakest,
  windowStart,
  type Area,
} from '../src/study/stats';
import type { CardState, Direction, Rating, ReviewRecord, StoredCard } from '../src/types';
import { makeCard, makeProduction } from './helpers';

// "Now" is noon on 20 November. The study day runs from 4 am to 4 am.
const now = new Date(2026, 10, 20, 12, 0);
const today = studyDate(now);
const daysAgo = (n: number, hour = 10) => new Date(2026, 10, 20 - n, hour, 0);

let nextId = 1;
/** One review. `before` is the card's state before it (2 = it had already been learned). */
function review(
  cardId: string,
  rating: Rating,
  before: CardState,
  when: Date,
  other: Partial<ReviewRecord> = {},
): ReviewRecord {
  const blank = makeCard(cardId).scheduling;
  return {
    id: nextId++,
    cardId,
    direction: 'recognition' as Direction,
    rating,
    timestamp: when.toISOString(),
    durationMs: 5000,
    typed: null,
    typedResult: null,
    before: { ...blank, state: before },
    after: { ...blank, state: rating === 1 ? 3 : 2 },
    ...other,
  };
}

describe('true retention', () => {
  it('is the share of already-learned cards that were remembered', () => {
    const reviews = [
      review('a', 3, 2, daysAgo(1)), // Good
      review('b', 2, 2, daysAgo(1)), // Hard still counts as remembered
      review('c', 4, 2, daysAgo(1)), // Easy
      review('d', 1, 2, daysAgo(1)), // Again: forgotten
    ];
    expect(retention(reviews)).toEqual({ reviews: 4, remembered: 3, rate: 0.75 });
  });

  it('ignores reviews of cards that were new or still being learned', () => {
    const reviews = [
      review('a', 1, 0, daysAgo(1)), // a new card you didn't know: not a memory failure
      review('a', 1, 1, daysAgo(1)), // still learning
      review('a', 1, 3, daysAgo(1)), // relearning
      review('b', 3, 2, daysAgo(1)),
    ];
    expect(retention(reviews)).toEqual({ reviews: 1, remembered: 1, rate: 1 });
  });

  it('has no rate when there is nothing to go on', () => {
    expect(retention([])).toEqual({ reviews: 0, remembered: 0, rate: null });
    expect(percent(null)).toBe('–');
    expect(percent(0.916)).toBe('92%');
  });

  it('can be limited to the last 7 or 30 days', () => {
    const reviews = [review('a', 1, 2, daysAgo(20)), review('b', 3, 2, daysAgo(6)), review('c', 3, 2, daysAgo(0))];
    expect(retention(reviewsSince(reviews, windowStart(now, 7)))).toMatchObject({ reviews: 2, rate: 1 });
    expect(retention(reviewsSince(reviews, windowStart(now, 30)))).toMatchObject({ reviews: 3, remembered: 2 });
  });

  it('puts a late-night review in the right window', () => {
    // 2 am on the 14th still belongs to the 13th, which is 7 days back: just outside "the last 7 days".
    const lateNight = review('a', 3, 2, new Date(2026, 10, 14, 2, 0));
    expect(reviewsSince([lateNight], windowStart(now, 7))).toHaveLength(0);
    expect(reviewsSince([lateNight], windowStart(now, 8))).toHaveLength(1);
  });
});

describe('retention for each direction', () => {
  const cards = byId([
    makeCard('vocab', {}, 1, { type: 'vocab', production: makeProduction('vocab') }),
    makeCard('phrase', {}, 2, { type: 'phrase', production: makeProduction('phrase') }),
    makeCard('conj', {}, 3, { type: 'conjugation' }),
  ]);
  const production = { direction: 'production' as const };

  it('compares Spanish → English with English → Spanish on vocab and phrase cards only', () => {
    const reviews = [
      review('vocab', 3, 2, daysAgo(1)),
      review('phrase', 3, 2, daysAgo(1)),
      review('vocab', 3, 2, daysAgo(2), production),
      review('phrase', 1, 2, daysAgo(2), production),
      review('conj', 1, 2, daysAgo(1)), // has no second direction, so it is left out of the comparison
      review('deleted-card', 1, 2, daysAgo(1)),
    ];
    const { recognition, production: produced } = retentionByDirection(reviews, cards);
    expect(recognition).toEqual({ reviews: 2, remembered: 2, rate: 1 });
    expect(produced).toEqual({ reviews: 2, remembered: 1, rate: 0.5 });
  });
});

describe('activity', () => {
  it('lists the last 30 days, with zeros for days off', () => {
    const days = reviewsPerDay(
      [
        { date: addDays(today, -40), reviews: 9 },
        { date: addDays(today, -3), reviews: 12 },
        { date: today, reviews: 5 },
      ],
      now,
      30,
    );
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ date: addDays(today, -29), reviews: 0 });
    expect(days[26]).toEqual({ date: addDays(today, -3), reviews: 12 });
    expect(days[29]).toEqual({ date: today, reviews: 5 });
    expect(days.reduce((sum, day) => sum + day.reviews, 0)).toBe(17);
  });

  it('averages the time per card, counting a very long pause as one minute', () => {
    const reviews = [
      review('a', 3, 2, daysAgo(1), { durationMs: 4000 }),
      review('b', 3, 2, daysAgo(1), { durationMs: 8000 }),
      review('c', 3, 2, daysAgo(1), { durationMs: 20 * 60 * 1000 }), // the phone was put down
    ];
    expect(averageSeconds(reviews)).toBe((4 + 8 + 60) / 3);
    expect(averageSeconds([])).toBeNull();
  });
});

describe('cards learned over time', () => {
  it('counts each card from the first day it reached the review state', () => {
    const reviews = [
      review('a', 3, 1, daysAgo(5)), // a is learned
      review('b', 3, 1, daysAgo(5)), // b is learned the same day
      review('a', 1, 2, daysAgo(3)), // a is forgotten: it still counts as having been learned
      review('a', 3, 3, daysAgo(2)), // and learning it again doesn't count twice
      review('c', 3, 1, daysAgo(2)), // c is learned
      review('d', 1, 0, daysAgo(1)), // d never got there
    ];
    expect(learnedOverTime(reviews)).toEqual([
      { date: addDays(today, -5), total: 2 },
      { date: addDays(today, -2), total: 3 },
    ]);
  });

  it('counts a card once even if both of its directions are learned', () => {
    const reviews = [review('a', 3, 1, daysAgo(5)), review('a', 3, 1, daysAgo(2), { direction: 'production' })];
    expect(learnedOverTime(reviews)).toEqual([{ date: addDays(today, -5), total: 1 }]);
  });

  it('says how many were learned in a period', () => {
    const points = [
      { date: '2026-11-01', total: 4 },
      { date: '2026-11-15', total: 9 },
      { date: '2026-11-18', total: 10 },
    ];
    expect(learnedBetween(points, '2026-11-14', '2026-11-20')).toBe(6);
    expect(learnedBetween(points, '2026-11-16', '2026-11-17')).toBe(0);
    expect(learnedBetween([], '2026-11-14', '2026-11-20')).toBe(0);
  });
});

describe('card counts', () => {
  const learned = (days: number) => ({ state: 2, scheduleStatus: 'review', scheduledDays: days }) as const;
  const cards: StoredCard[] = [
    makeCard('new'),
    makeCard('learning', { state: 1, scheduleStatus: 'learning' }),
    makeCard('relearning', { state: 3, scheduleStatus: 'learning' }),
    makeCard('young', learned(20.9)),
    makeCard('mature', learned(21)),
    makeCard('old-and-paused', learned(200), 1, { paused: true }),
    makeCard('leech', learned(3), 1, { leech: true }),
    makeCard('two-way', learned(40), 1, { production: makeProduction('two-way', learned(5)) }),
  ];

  it('sorts every card into new, learning, young or mature (mature = 21 days or more)', () => {
    const counts = cardCounts(cards);
    expect(counts.total).toBe(8);
    expect(counts.cards).toEqual({ new: 1, learning: 2, young: 2, mature: 3 });
  });

  it('counts paused cards and leeches separately, on top of their stage', () => {
    expect(cardCounts(cards)).toMatchObject({ paused: 1, leeches: 1 });
  });

  it('counts the English → Spanish sides on their own', () => {
    expect(cardCounts(cards)).toMatchObject({
      productionTotal: 1,
      production: { new: 0, learning: 0, young: 1, mature: 0 },
    });
  });
});

describe('forecast', () => {
  const dueIn = (days: number, hour = 12) => new Date(2026, 10, 20 + days, hour, 0).toISOString();
  const studied = (dueAt: string) => ({ state: 2, scheduleStatus: 'review', scheduledDays: 5, dueAt }) as const;

  it('counts the reviews due on each of the next 14 days', () => {
    const cards = [
      makeCard('overdue', studied(dueIn(-6))), // today: everything overdue lands on today
      makeCard('tonight', studied(dueIn(0, 23))), // today
      makeCard('tomorrow', studied(dueIn(1))),
      makeCard('tomorrow-too', studied(dueIn(1, 5))),
      makeCard('last-day', studied(dueIn(13))),
      makeCard('too-far', studied(dueIn(14))),
    ];
    const days = forecast(cards, now, 14);
    expect(days).toHaveLength(14);
    expect(days.map((day) => day.due)).toEqual([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(days[0].date).toBe(today);
    expect(days[13].date).toBe(addDays(today, 13));
  });

  it('counts a card due at 2 am as part of the evening before', () => {
    expect(forecast([makeCard('late', studied(dueIn(1, 2)))], now, 14)[0].due).toBe(1);
  });

  it('leaves out new cards and anything paused, and counts each direction', () => {
    const cards = [
      makeCard('new'),
      makeCard('paused', studied(dueIn(1)), 1, { paused: true }),
      makeCard('two-way', studied(dueIn(2)), 1, { production: makeProduction('two-way', studied(dueIn(2))) }),
      makeCard('one-side-paused', studied(dueIn(3)), 1, { production: makeProduction('x', studied(dueIn(3)), true) }),
    ];
    expect(forecast(cards, now, 5).map((day) => day.due)).toEqual([0, 0, 2, 1, 0]);
  });
});

describe('strengths and weaknesses', () => {
  const cards = byId([
    makeCard('v1', {}, 1, { type: 'vocab', tags: ['food', 'nouns'] }),
    makeCard('v2', {}, 2, { type: 'vocab', tags: ['food'] }),
    makeCard('c1', {}, 3, { type: 'conjugation', tags: ['pretérito'] }),
  ]);

  it('breaks retention and lapses down by tag and by type of card', () => {
    const reviews = [
      review('v1', 3, 2, daysAgo(1)),
      review('v1', 1, 2, daysAgo(2)),
      review('v2', 3, 2, daysAgo(1)),
      review('c1', 1, 2, daysAgo(1)),
      review('c1', 3, 0, daysAgo(3)), // not yet learned: not counted
      review('gone', 1, 2, daysAgo(1)), // the card was deleted: not counted
    ];
    const areas = areaStats(reviews, cards);
    const find = (kind: Area['kind'], name: string) => areas.find((area) => area.kind === kind && area.name === name);

    expect(find('type', 'vocab')).toEqual({
      kind: 'type',
      name: 'vocab',
      reviews: 3,
      remembered: 2,
      lapses: 1,
      rate: 2 / 3,
    });
    expect(find('tag', 'food')).toMatchObject({ reviews: 3, remembered: 2, lapses: 1 });
    expect(find('tag', 'nouns')).toMatchObject({ reviews: 2, remembered: 1, lapses: 1, rate: 0.5 });
    expect(find('type', 'conjugation')).toMatchObject({ reviews: 1, remembered: 0, lapses: 1, rate: 0 });
    expect(find('tag', 'pretérito')).toMatchObject({ reviews: 1, lapses: 1 });
    expect(areas).toHaveLength(5);
  });

  /** An area with `reviews` reviews of which `lapses` were forgotten. */
  const area = (name: string, reviews: number, lapses: number, kind: Area['kind'] = 'tag'): Area => ({
    kind,
    name,
    reviews,
    lapses,
    remembered: reviews - lapses,
    rate: (reviews - lapses) / reviews,
  });
  const names = (areas: Area[]) => areas.map((entry) => entry.name);

  it('picks the 3 strongest and the 3 weakest', () => {
    const areas = [
      area('a', 20, 0),
      area('b', 20, 1),
      area('c', 20, 2),
      area('d', 20, 3),
      area('e', 20, 6),
      area('f', 20, 8),
      area('g', 20, 10),
    ];
    const { strongest, weakest } = strongestAndWeakest(areas);
    expect(names(strongest)).toEqual(['a', 'b', 'c']);
    expect(names(weakest)).toEqual(['g', 'f', 'e']); // the weakest first
  });

  it(`ignores any area with fewer than ${MIN_REVIEWS_FOR_AREA} reviews`, () => {
    const areas = [
      area('tiny-and-perfect', MIN_REVIEWS_FOR_AREA - 1, 0),
      area('tiny-and-terrible', MIN_REVIEWS_FOR_AREA - 1, 9),
      area('solid', MIN_REVIEWS_FOR_AREA, 1),
      area('shaky', 30, 12),
    ];
    const { strongest, weakest } = strongestAndWeakest(areas);
    expect(names(strongest)).toEqual(['solid']);
    expect(names(weakest)).toEqual(['shaky']);
  });

  it('never lists the same area as both a strength and a weakness', () => {
    const three = strongestAndWeakest([area('a', 20, 1), area('b', 20, 4), area('c', 20, 9)]);
    expect(names(three.strongest)).toEqual(['a', 'b']);
    expect(names(three.weakest)).toEqual(['c']);

    const one = strongestAndWeakest([area('only', 20, 5)]);
    expect(names(one.strongest)).toEqual(['only']);
    expect(one.weakest).toEqual([]);
  });

  it('does not call an area a weakness if nothing in it was ever forgotten', () => {
    const { strongest, weakest } = strongestAndWeakest([
      area('a', 20, 0),
      area('b', 15, 0),
      area('c', 12, 0),
      area('d', 10, 0),
    ]);
    expect(names(strongest)).toEqual(['a', 'b']);
    expect(weakest).toEqual([]);
  });

  it('ranks tags and types together', () => {
    const { strongest } = strongestAndWeakest([
      area('cloze', 20, 0, 'type'),
      area('food', 20, 5),
      area('verbs', 20, 9),
    ]);
    expect(strongest[0]).toMatchObject({ kind: 'type', name: 'cloze' });
  });

  it('has nothing to say when there are no reviews', () => {
    expect(strongestAndWeakest([])).toEqual({ strongest: [], weakest: [] });
  });
});
