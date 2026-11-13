import { describe, expect, it } from 'vitest';
import { pickNextCard, summarize } from '../src/study/queue';
import { makeCard } from './helpers';

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
    expect(pickNextCard(cards, options)?.id).toBe('first');
  });

  it('then reviews due today, even if due later in the day', () => {
    const cards = [makeCard('new'), review('tonight', minutes(8 * 60)), shortStep('not-yet', minutes(5))];
    expect(pickNextCard(cards, options)?.id).toBe('tonight');
  });

  it('does not show reviews that are due tomorrow', () => {
    expect(pickNextCard([review('tomorrow', days(1))], options)).toBeNull();
  });

  it('then new cards, in import order', () => {
    const cards = [makeCard('second', {}, 2), makeCard('first', {}, 1), shortStep('not-yet', minutes(5))];
    expect(pickNextCard(cards, options)?.id).toBe('first');
  });

  it('stops giving new cards once the daily limit is reached', () => {
    expect(pickNextCard([makeCard('new')], { ...options, newCardsDoneToday: 15 })).toBeNull();
    expect(pickNextCard([makeCard('new')], { ...options, newCardsPerDay: 0 })).toBeNull();
  });

  it('when nothing else is left, shows short-step cards due within 20 minutes', () => {
    expect(pickNextCard([shortStep('soon', minutes(19))], options)?.id).toBe('soon');
    expect(pickNextCard([shortStep('hours-away', minutes(120))], options)).toBeNull();
  });

  it('avoids repeating the card just shown if there is another choice', () => {
    const cards = [shortStep('just-shown', minutes(1)), shortStep('other', minutes(8))];
    expect(pickNextCard(cards, { ...options, justShownId: 'just-shown' })?.id).toBe('other');
    expect(pickNextCard([cards[0]], { ...options, justShownId: 'just-shown' })?.id).toBe('just-shown');
  });

  it('picks reviews in a shuffled order', () => {
    const cards = [review('a', days(-2)), review('b', days(-1)), review('c', minutes(0))];
    expect(pickNextCard(cards, { ...options, random: () => 0 })?.id).toBe('a');
    expect(pickNextCard(cards, { ...options, random: () => 0.99 })?.id).toBe('c');
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
