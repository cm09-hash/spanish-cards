import { describe, expect, it } from 'vitest';
import { allTags, filterCards, frontAsText, NO_FILTER, parseTags, stageOf } from '../src/study/cardFilter';
import type { StoredCard } from '../src/types';
import { makeCard } from './helpers';

const cards: StoredCard[] = [
  makeCard('challenge', {}, 2, { front: 'el desafío', back: 'the challenge', tags: ['nouns'] }),
  makeCard('dog', { state: 2, scheduleStatus: 'review' }, 1, {
    front: 'el perro',
    back: 'the dog',
    tags: ['nouns', 'animals'],
  }),
  makeCard('went', { state: 1, scheduleStatus: 'learning' }, 3, {
    type: 'cloze',
    front: 'Ayer {{c1::fui::ir}} al mercado.',
    back: 'Yesterday I went to the market.',
    tags: ['pretérito'],
    note: 'Irregular verb',
  }),
  makeCard('miss', { state: 3, scheduleStatus: 'learning' }, 4, {
    type: 'phrase',
    front: 'echar de menos',
    back: 'to miss',
    paused: true,
    leech: true,
    flag: { reason: 'too vague', flaggedAt: '2026-01-01T00:00:00.000Z', by: 'you' },
  }),
];
const ids = (found: StoredCard[]) => found.map((card) => card.id);

describe('filterCards', () => {
  it('returns everything, in import order, when nothing is filtered', () => {
    expect(ids(filterCards(cards, NO_FILTER))).toEqual(['dog', 'challenge', 'went', 'miss']);
  });

  it('searches front, back, note, tags and id', () => {
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'perro' }))).toEqual(['dog']);
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'market' }))).toEqual(['went']);
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'irregular' }))).toEqual(['went']);
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'animals' }))).toEqual(['dog']);
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'challenge' }))).toEqual(['challenge']);
  });

  it('ignores capital letters and accents, so "DESAFIO" finds "desafío"', () => {
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'DESAFIO' }))).toEqual(['challenge']);
  });

  it('needs every word to match, in any order', () => {
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'dog el' }))).toEqual(['dog']);
    expect(ids(filterCards(cards, { ...NO_FILTER, query: 'dog cat' }))).toEqual([]);
  });

  it('filters by type and by tag', () => {
    expect(ids(filterCards(cards, { ...NO_FILTER, type: 'cloze' }))).toEqual(['went']);
    expect(ids(filterCards(cards, { ...NO_FILTER, tag: 'nouns' }))).toEqual(['dog', 'challenge']);
  });

  it.each([
    ['new', ['challenge']],
    ['learning', ['went', 'miss']],
    ['review', ['dog']],
    ['paused', ['miss']],
    ['flagged', ['miss']],
    ['leech', ['miss']],
  ] as const)('filters by status "%s"', (status, expected) => {
    expect(ids(filterCards(cards, { ...NO_FILTER, status }))).toEqual(expected);
  });

  it('combines search and filters', () => {
    expect(ids(filterCards(cards, { query: 'el', type: 'vocab', tag: 'nouns', status: 'review' }))).toEqual(['dog']);
  });
});

describe('card browser helpers', () => {
  it('treats relearning as learning', () => {
    expect(cards.map(stageOf)).toEqual(['new', 'review', 'learning', 'learning']);
  });

  it('lists every tag once, alphabetically', () => {
    expect(allTags(cards)).toEqual(['animals', 'nouns', 'pretérito']);
  });

  it('shows a cloze front as a plain sentence', () => {
    expect(frontAsText(cards[2])).toBe('Ayer fui al mercado.');
    expect(frontAsText(cards[1])).toBe('el perro');
  });

  it('reads tags typed with commas', () => {
    expect(parseTags(' verbs, past tense ,, verbs ')).toEqual(['verbs', 'past tense']);
    expect(parseTags('')).toEqual([]);
  });
});
