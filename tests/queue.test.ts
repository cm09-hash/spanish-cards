import { describe, expect, it } from 'vitest';
import { pickNextCard, summarize, todaysProgress } from '../src/study/queue';
import { PRODUCTION_DELAY_DAYS, SPRINT_NORMAL_SHARE } from '../src/config';
import type { StoredCard } from '../src/types';
import { makeCard, makeProduction } from './helpers';

// "Now" is noon, so the study day runs from 4:00 this morning to 4:00 tomorrow morning.
const now = new Date(2026, 5, 10, 12, 0);
const minutes = (n: number) => new Date(now.getTime() + n * 60_000).toISOString();
const days = (n: number) => minutes(n * 24 * 60);
const options = { now, newCardsDoneToday: 0, newCardsPerDay: 15 };

const shortStep = (id: string, dueAt: string) =>
  makeCard(id, { state: 1, scheduleStatus: 'learning', scheduledDays: 0.01, dueAt });
const review = (id: string, dueAt: string) =>
  makeCard(id, { state: 2, scheduleStatus: 'review', scheduledDays: 5, dueAt });

describe('pickNextCard', () => {
  it('shows short-step cards that are ready before anything else', () => {
    const cards = [
      makeCard('new'),
      review('review', days(-1)),
      shortStep('later', minutes(-1)),
      shortStep('first', minutes(-5)),
    ];
    expect(pickNextCard(cards, options)?.card.id).toBe('first');
  });

  it('then reviews due today, even if due later in the day', () => {
    const cards = [makeCard('new'), review('tonight', minutes(8 * 60)), shortStep('not-yet', minutes(5))];
    expect(pickNextCard(cards, options)?.card.id).toBe('tonight');
  });

  it('does not show reviews that are due tomorrow', () => {
    expect(pickNextCard([review('tomorrow', days(1))], options)).toBeNull();
  });

  it('then new cards, in import order', () => {
    const cards = [makeCard('second', {}, 2), makeCard('first', {}, 1), shortStep('not-yet', minutes(5))];
    expect(pickNextCard(cards, options)?.card.id).toBe('first');
  });

  it('stops giving new cards once the daily limit is reached', () => {
    expect(pickNextCard([makeCard('new')], { ...options, newCardsDoneToday: 15 })).toBeNull();
    expect(pickNextCard([makeCard('new')], { ...options, newCardsPerDay: 0 })).toBeNull();
  });

  it('when nothing else is left, shows short-step cards due within 20 minutes', () => {
    expect(pickNextCard([shortStep('soon', minutes(19))], options)?.card.id).toBe('soon');
    expect(pickNextCard([shortStep('hours-away', minutes(120))], options)).toBeNull();
  });

  it('avoids repeating the card just shown if there is another choice', () => {
    const cards = [shortStep('just-shown', minutes(1)), shortStep('other', minutes(8))];
    expect(pickNextCard(cards, { ...options, justShownCardId: 'just-shown' })?.card.id).toBe('other');
    expect(pickNextCard([cards[0]], { ...options, justShownCardId: 'just-shown' })?.card.id).toBe('just-shown');
  });

  it('picks reviews in a shuffled order', () => {
    const cards = [review('a', days(-2)), review('b', days(-1)), review('c', minutes(0))];
    expect(pickNextCard(cards, { ...options, random: () => 0 })?.card.id).toBe('a');
    expect(pickNextCard(cards, { ...options, random: () => 0.99 })?.card.id).toBe('c');
  });
});

describe('summarize', () => {
  it('counts due cards and the new cards still allowed today', () => {
    const cards = [
      makeCard('n1'),
      makeCard('n2'),
      makeCard('n3'),
      review('due', days(-3)),
      review('tomorrow', days(1)),
      shortStep('learning', minutes(3)),
    ];
    const summary = summarize(cards, { now, newCardsDoneToday: 13, newCardsPerDay: 15 });
    expect(summary).toMatchObject({ totalCards: 6, dueToday: 2, newLeft: 2, canStudyNow: true, nextReadyAt: null });
  });

  it('never promises more new cards than exist', () => {
    expect(summarize([makeCard('only')], options).newLeft).toBe(1);
  });

  it('says when the next card will be ready if everything left today is still waiting', () => {
    const cards = [shortStep('a', minutes(180)), shortStep('b', minutes(90))];
    const summary = summarize(cards, options);
    expect(summary.canStudyNow).toBe(false);
    expect(summary.dueToday).toBe(2);
    expect(summary.nextReadyAt?.toISOString()).toBe(minutes(90));
  });

  it('reports nothing to do when all is done', () => {
    expect(summarize([review('tomorrow', days(1))], options)).toMatchObject({
      dueToday: 0,
      canStudyNow: false,
      nextReadyAt: null,
    });
  });
});

describe('paused cards', () => {
  const paused = { paused: true };
  const cards = [
    makeCard('new-paused', {}, 1, paused),
    makeCard('review-paused', { state: 2, scheduleStatus: 'review', scheduledDays: 5, dueAt: days(-1) }, 2, paused),
    makeCard(
      'step-paused',
      { state: 1, scheduleStatus: 'learning', scheduledDays: 0.01, dueAt: minutes(-5) },
      3,
      paused,
    ),
  ];

  it('are never picked for study', () => {
    expect(pickNextCard(cards, options)).toBeNull();
    expect(pickNextCard([...cards, makeCard('active', {}, 9)], options)?.card.id).toBe('active');
  });

  it('are left out of the due and new counts, but still counted as cards', () => {
    expect(summarize(cards, options)).toMatchObject({
      totalCards: 3,
      dueToday: 0,
      newLeft: 0,
      canStudyNow: false,
      nextReadyAt: null,
    });
  });
});

describe('Quick 5 (reviews only)', () => {
  const quick = { ...options, reviewsOnly: true };

  it('never gives new cards', () => {
    expect(pickNextCard([makeCard('new')], quick)).toBeNull();
    expect(summarize([makeCard('new')], quick)).toMatchObject({ newLeft: 0, canStudyNow: false });
  });

  it('still gives due reviews and short-step cards', () => {
    expect(pickNextCard([makeCard('new'), review('due', days(-1))], quick)?.card.id).toBe('due');
    expect(pickNextCard([makeCard('new'), shortStep('ready', minutes(-1))], quick)?.card.id).toBe('ready');
  });
});

describe('todaysProgress', () => {
  it('is empty at the start of the day', () => {
    const cards = [makeCard('n1'), makeCard('n2'), review('due', days(-1))];
    expect(todaysProgress(cards, options, [])).toEqual({ done: 0, total: 3 });
  });

  it('counts a card as done once it is reviewed and not due again today', () => {
    const cards = [makeCard('n1'), review('done', days(4)), review('due', days(-1))];
    const progress = todaysProgress(cards, { ...options, newCardsDoneToday: 1 }, ['done']);
    expect(progress).toEqual({ done: 1, total: 3 });
  });

  it('does not count a card that was reviewed but is coming back today', () => {
    const cards = [shortStep('again-in-a-minute', minutes(1)), review('done', days(2))];
    expect(todaysProgress(cards, options, ['again-in-a-minute', 'done'])).toEqual({ done: 1, total: 2 });
  });

  it('reaches the end when nothing is left', () => {
    const cards = [review('a', days(2)), review('b', days(9))];
    expect(todaysProgress(cards, options, ['a', 'b'])).toEqual({ done: 2, total: 2 });
  });

  it('leaves new cards out of the total in a reviews-only session', () => {
    const cards = [makeCard('n1'), makeCard('n2'), review('due', days(-1)), review('done', days(3))];
    expect(todaysProgress(cards, { ...options, reviewsOnly: true }, ['done'])).toEqual({ done: 1, total: 2 });
  });
});

describe('cards in two directions', () => {
  const daysAgo = (n: number) => days(-n);
  const studied = { state: 2, scheduleStatus: 'review', scheduledDays: 9, dueAt: days(5) } as const;

  /** A vocab card whose Spanish → English side was first studied `introducedDaysAgo` days ago. */
  const twoWay = (id: string, introducedDaysAgo: number | null, other: Partial<StoredCard> = {}) =>
    makeCard(id, introducedDaysAgo === null ? {} : studied, 1, {
      introducedAt: introducedDaysAgo === null ? null : daysAgo(introducedDaysAgo),
      production: makeProduction(id),
      ...other,
    });

  it('does not introduce the English → Spanish side on the same day as the Spanish → English side', () => {
    const card = twoWay('a', 0);
    expect(pickNextCard([card], options)).toBeNull();
    expect(summarize([card], options).newLeft).toBe(0);
  });

  it(`introduces it ${PRODUCTION_DELAY_DAYS} days later, as a new card`, () => {
    expect(pickNextCard([twoWay('a', PRODUCTION_DELAY_DAYS - 1)], options)).toBeNull();

    const ready = twoWay('a', PRODUCTION_DELAY_DAYS);
    expect(pickNextCard([ready], options)).toMatchObject({ direction: 'production', key: 'a#production' });
    expect(summarize([ready], options)).toMatchObject({ totalCards: 1, newLeft: 1 });
  });

  it('never introduces it before the Spanish → English side has been studied at all', () => {
    const untouched = twoWay('a', null);
    expect(pickNextCard([untouched], options)).toMatchObject({ direction: 'recognition' });
    expect(summarize([untouched], options).newLeft).toBe(1); // only the one side is waiting
  });

  it('counts it against the daily limit like any other new card', () => {
    expect(pickNextCard([twoWay('a', 10)], { ...options, newCardsDoneToday: 15 })).toBeNull();
  });

  it('schedules the two sides separately', () => {
    // Spanish → English is due today; English → Spanish is not due for a week.
    const card = makeCard('a', { ...studied, dueAt: days(-1) }, 1, {
      introducedAt: daysAgo(30),
      production: makeProduction('a', { ...studied, dueAt: days(7) }),
    });
    expect(summarize([card], options).dueToday).toBe(1);
    expect(pickNextCard([card], options)).toMatchObject({ direction: 'recognition' });

    const other = {
      ...card,
      scheduling: { ...card.scheduling, dueAt: days(7) },
      production: makeProduction('a', { ...studied, dueAt: days(-1) }),
    };
    expect(pickNextCard([other], options)).toMatchObject({ direction: 'production' });
  });

  it('lets one side be paused while the other carries on', () => {
    const due = { ...studied, dueAt: days(-1) };
    const card = makeCard('a', due, 1, { introducedAt: daysAgo(30), production: makeProduction('a', due, true) });
    expect(summarize([card], options).dueToday).toBe(1);
    expect(pickNextCard([card], options)).toMatchObject({ direction: 'recognition' });

    const reversed = { ...card, recognitionPaused: true, production: makeProduction('a', due, false) };
    expect(pickNextCard([reversed], options)).toMatchObject({ direction: 'production' });

    expect(pickNextCard([{ ...card, paused: true }], options)).toBeNull(); // pausing the card pauses both
  });

  it('starts the English → Spanish side straight away if the other side is switched off and unstudied', () => {
    const card = twoWay('a', null, { recognitionPaused: true });
    expect(pickNextCard([card], options)).toMatchObject({ direction: 'production' });
  });

  it('avoids showing the other side of the card you just saw, if anything else is due', () => {
    const due = { ...studied, dueAt: days(-1) };
    const both = makeCard('a', { ...studied, dueAt: days(5) }, 1, {
      introducedAt: daysAgo(30),
      production: makeProduction('a', due),
    });
    const another = makeCard('b', due, 2);
    for (const random of [() => 0, () => 0.99]) {
      expect(pickNextCard([both, another], { ...options, justShownCardId: 'a', random })?.card.id).toBe('b');
    }
    expect(pickNextCard([both], { ...options, justShownCardId: 'a' })?.key).toBe('a#production');
  });

  it('tracks progress per side', () => {
    const due = { ...studied, dueAt: days(-1) };
    const card = makeCard('a', { ...studied, dueAt: days(5) }, 1, {
      introducedAt: daysAgo(30),
      production: makeProduction('a', due),
    });
    expect(todaysProgress([card], options, ['a'])).toEqual({ done: 1, total: 2 });
    const finished = { ...card, production: makeProduction('a', { ...studied, dueAt: days(4) }) };
    expect(todaysProgress([finished], options, ['a', 'a#production'])).toEqual({ done: 2, total: 2 });
  });
});

describe('sprints: which new card comes next', () => {
  const sprintTags = new Set(['chess']);
  const cards = [
    ...Array.from({ length: 20 }, (_, index) => makeCard(`normal-${index}`, {}, index + 1)),
    ...Array.from({ length: 20 }, (_, index) => makeCard(`sprint-${index}`, {}, index + 100, { tags: ['chess'] })),
  ];

  /** Studies a whole day of new cards and reports where each one came from: "S" or "N". */
  function dayOfNewCards(deck: StoredCard[], limit: number, tags = sprintTags): string {
    let remaining = [...deck];
    let pattern = '';
    for (;;) {
      const sprintDone = [...pattern].filter((letter) => letter === 'S').length;
      const next = pickNextCard(remaining, {
        now,
        newCardsPerDay: limit,
        newCardsDoneToday: pattern.length,
        sprintNewDoneToday: sprintDone,
        sprintTags: tags,
      });
      if (!next) return pattern;
      pattern += next.card.tags.includes('chess') ? 'S' : 'N';
      remaining = remaining.filter((card) => card.id !== next.card.id);
    }
  }

  it('puts sprint cards first, with normal cards mixed in, and never goes over the daily limit', () => {
    expect(dayOfNewCards(cards, 15)).toBe('SSNSNSSNSNSSNSN');
  });

  it(`gives at least ${SPRINT_NORMAL_SHARE * 100}% of the day's new cards to normal cards, whatever the limit`, () => {
    for (let limit = 2; limit <= 30; limit++) {
      const pattern = dayOfNewCards(cards, limit);
      const normal = [...pattern].filter((letter) => letter === 'N').length;
      expect(pattern).toHaveLength(limit);
      expect(normal / limit).toBeGreaterThanOrEqual(SPRINT_NORMAL_SHARE);
      expect(pattern[0]).toBe('S'); // the sprint still comes first
    }
  });

  it('gives the sprint the single card of the day when the limit is 1', () => {
    expect(dayOfNewCards(cards, 1)).toBe('S');
  });

  it('gives the sprint everything when there are no normal new cards', () => {
    const onlySprint = cards.filter((card) => card.tags.includes('chess'));
    expect(dayOfNewCards(onlySprint, 10)).toBe('SSSSSSSSSS');
  });

  it('lets normal cards fill the day when the sprint runs out', () => {
    const fewSprint = [
      ...cards.filter((card) => !card.tags.includes('chess')),
      ...cards.filter((card) => card.tags.includes('chess')).slice(0, 2),
    ];
    const pattern = dayOfNewCards(fewSprint, 10);
    expect(pattern).toHaveLength(10);
    expect([...pattern].filter((letter) => letter === 'S')).toHaveLength(2);
  });

  it('gives the sprint the rest when the normal cards run out', () => {
    const fewNormal = [...cards.filter((card) => card.tags.includes('chess')), makeCard('lonely', {}, 1)];
    expect(dayOfNewCards(fewNormal, 10)).toBe('SSNSSSSSSS');
  });

  it('treats every card as normal when no sprint is running', () => {
    expect(dayOfNewCards(cards, 6, new Set())).toBe('NNNNNN');
    // …and goes back to plain import order.
    expect(pickNextCard(cards, { ...options, sprintTags: new Set() })?.card.id).toBe('normal-0');
  });

  it('takes sprint cards in import order', () => {
    expect(pickNextCard(cards, { ...options, sprintTags })?.card.id).toBe('sprint-0');
  });
});
