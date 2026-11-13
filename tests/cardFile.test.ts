import { describe, expect, it } from 'vitest';
import sampleFile from '../public/sample-cards.json';
import { checkCard, FileProblem, parseCardFile, planImport } from '../src/data/cardFile';
import type { CardContent } from '../src/types';

const good = { id: 'v1', type: 'vocab', front: 'el perro', back: 'the dog', tags: ['animals'], note: 'a note' };

describe('checkCard', () => {
  it('accepts a complete card', () => {
    expect(checkCard(good)).toEqual(good);
  });

  it('tidies up spacing, capital letters in the type, numeric ids and repeated tags', () => {
    expect(
      checkCard({ id: 7, type: ' Vocab ', front: ' hola ', back: ' hello ', tags: ['a', 'a', ' '], note: ' ' }),
    ).toEqual({
      id: '7',
      type: 'vocab',
      front: 'hola',
      back: 'hello',
      tags: ['a'],
    });
  });

  it('treats tags and note as optional', () => {
    expect(checkCard({ id: 'x', type: 'phrase', front: 'a', back: 'b' })).toEqual({
      id: 'x',
      type: 'phrase',
      front: 'a',
      back: 'b',
      tags: [],
    });
  });

  it.each([
    ['a missing id', { ...good, id: undefined }, '"id"'],
    ['an unknown type', { ...good, type: 'song' }, '"type"'],
    ['a missing front', { ...good, front: '  ' }, '"front"'],
    ['a missing back', { ...good, back: undefined }, '"back"'],
    ['tags that are not a list', { ...good, tags: 'animals' }, '"tags"'],
    ['a note that is not text', { ...good, note: 5 }, '"note"'],
    ['something that is not an object', 'hello', 'not a card'],
  ])('rejects %s', (_name, card, expectedMention) => {
    const result = checkCard(card);
    expect(typeof result).toBe('string');
    expect(result).toContain(expectedMention);
  });

  it('lets a cloze card leave out the back, but insists on a blank in the front', () => {
    expect(checkCard({ id: 'c', type: 'cloze', front: 'Yo {{c1::tengo}} hambre.' })).toMatchObject({ back: '' });
    expect(checkCard({ id: 'c', type: 'cloze', front: 'Yo tengo hambre.', back: 'x' })).toContain('cloze');
  });
});

describe('parseCardFile', () => {
  it('reads { "cards": [...] } and a bare list alike', () => {
    expect(parseCardFile(JSON.stringify({ cards: [good] })).cards).toEqual([good]);
    expect(parseCardFile(JSON.stringify([good])).cards).toEqual([good]);
  });

  it('keeps the good cards and explains the bad ones', () => {
    const { cards, problems } = parseCardFile(
      JSON.stringify({ cards: [good, { id: 'bad', type: 'vocab', front: 'x' }] }),
    );
    expect(cards).toHaveLength(1);
    expect(problems).toEqual(['Card 2 ("bad"): "back" is missing.']);
  });

  it('explains files it cannot use at all', () => {
    expect(() => parseCardFile('{oops')).toThrow(FileProblem);
    expect(() => parseCardFile('{"hello": 1}')).toThrow(/No cards found/);
    expect(() => parseCardFile('{"app":"spanish-cards","formatVersion":1,"cards":[],"reviews":[]}')).toThrow(
      /backup file/,
    );
  });

  it('accepts every card in the sample file', () => {
    const { cards, problems } = parseCardFile(JSON.stringify(sampleFile));
    expect(problems).toEqual([]);
    expect(cards).toHaveLength(10);
  });
});

describe('planImport', () => {
  const card = (id: string, front: string, type: CardContent['type'] = 'vocab'): CardContent => ({
    id,
    front,
    back: 'b',
    type,
    tags: [],
  });

  it('skips cards whose id is already in use', () => {
    const plan = planImport([card('a', 'uno'), card('b', 'dos')], [card('a', 'something else')]);
    expect(plan.toAdd.map((c) => c.id)).toEqual(['b']);
    expect(plan.duplicates).toBe(1);
  });

  it('skips cards with the same type and front, ignoring capitals and spacing', () => {
    const plan = planImport([card('new-id', '  El  Perro ')], [card('old-id', 'el perro')]);
    expect(plan).toEqual({ toAdd: [], duplicates: 1 });
  });

  it('allows the same front on a different type of card', () => {
    expect(planImport([card('p', 'el perro', 'phrase')], [card('v', 'el perro')]).toAdd).toHaveLength(1);
  });

  it('skips repeats inside the file being imported', () => {
    const plan = planImport([card('a', 'uno'), card('a', 'dos'), card('c', 'uno')], []);
    expect(plan.toAdd.map((c) => c.id)).toEqual(['a']);
    expect(plan.duplicates).toBe(2);
  });
});
