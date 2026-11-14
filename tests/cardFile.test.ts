import { describe, expect, it } from 'vitest';
import sampleFile from '../public/sample-cards.json';
import {
  applyRewrite,
  checkCard,
  checkSprint,
  contentOf,
  FileProblem,
  parseCardFile,
  planImport,
} from '../src/data/cardFile';
import { makeCard, makeProduction } from './helpers';
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

  it('accepts every card in the sample file, with its sprint and its one-direction card', () => {
    const { cards, problems, sprint, recognitionOnly } = parseCardFile(JSON.stringify(sampleFile));
    expect(problems).toEqual([]);
    expect(cards).toHaveLength(10);
    expect(sprint).toMatchObject({ name: 'Chess talk (sample)', tag: 'ajedrez', variety: 'latam' });
    expect([...recognitionOnly]).toEqual(['sample2-vocab-enrocar']);
    expect(new Set(cards.map((card) => card.type)).size).toBe(6); // every type of card appears
  });

  it('still reads files written for the first version of the app', () => {
    const oldFile = {
      cards: [good, { id: 'c1', type: 'conjugation', front: 'tener → pretérito, yo', back: 'tuve', tags: [] }],
    };
    const parsed = parseCardFile(JSON.stringify(oldFile));
    expect(parsed).toMatchObject({ problems: [], sprint: null });
    expect(parsed.cards).toEqual(oldFile.cards);
    expect(parsed.recognitionOnly.size).toBe(0);
  });
});

describe('optional fields', () => {
  const conjugation = {
    id: 'conj-poner',
    type: 'conjugation',
    front: 'poner → pretérito, ellos',
    back: 'pusieron',
    tags: [],
    verb: ' poner ',
    tense: 'pretérito',
    person: 'ellos',
    meaning: 'to put',
    table: {
      yo: 'puse',
      tu: 'pusiste',
      'él/ella/usted': 'puso',
      nosotros: 'pusimos',
      vosotros: 'pusisteis',
      ustedes: 'pusieron',
    },
  };

  it('keeps the conjugation fields and tidies the table', () => {
    expect(checkCard(conjugation)).toEqual({
      ...conjugation,
      verb: 'poner',
      table: { yo: 'puse', tú: 'pusiste', él: 'puso', nosotros: 'pusimos', vosotros: 'pusisteis', ellos: 'pusieron' },
    });
  });

  it('accepts a conjugation card with only some of them', () => {
    expect(checkCard({ ...conjugation, table: undefined, meaning: undefined })).toMatchObject({
      verb: 'poner',
      tense: 'pretérito',
    });
  });

  it('explains a table it cannot use', () => {
    expect(checkCard({ ...conjugation, table: { they: 'pusieron' } })).toContain('"table"');
    expect(checkCard({ ...conjugation, verb: 5 })).toContain('"verb"');
  });

  it('ignores conjugation fields on other types of card', () => {
    expect(checkCard({ ...good, verb: 'ser', table: { yo: 'soy' } })).toEqual(good);
  });

  it('keeps "audio", the text to read aloud', () => {
    expect(checkCard({ ...good, audio: ' El perro ladra. ' })).toEqual({ ...good, audio: 'El perro ladra.' });
    expect(checkCard({ ...good, audio: 7 })).toContain('"audio"');
  });
});

describe('"directions"', () => {
  const parse = (card: object) => parseCardFile(JSON.stringify({ cards: [card] }));

  it('lets a vocab or phrase card be studied Spanish → English only', () => {
    expect([...parse({ ...good, directions: ['recognition'] }).recognitionOnly]).toEqual(['v1']);
  });

  it('means both directions when left out or when both are listed', () => {
    expect(parse(good).recognitionOnly.size).toBe(0);
    expect(parse({ ...good, directions: ['recognition', 'production'] }).recognitionOnly.size).toBe(0);
  });

  it('is not stored on the card itself', () => {
    expect(parse({ ...good, directions: ['recognition'] }).cards).toEqual([good]);
  });

  it('makes no difference on card types that only have one direction', () => {
    const cloze = { id: 'z', type: 'cloze', front: 'Yo {{c1::tengo}} hambre.', directions: ['recognition'] };
    expect(parse(cloze)).toMatchObject({ problems: [] });
    expect(parse(cloze).recognitionOnly.size).toBe(0);
  });

  it.each([[['production']], [['both']], ['recognition'], [[]]])('rejects %j', (directions) => {
    const { cards, problems } = parse({ ...good, directions });
    expect(cards).toEqual([]);
    expect(problems[0]).toContain('"directions"');
  });
});

describe('a sprint at the top of the file', () => {
  const sprint = { name: ' Trip to Madrid ', endDate: '2026-12-10', tag: 'madrid', variety: 'spain' };

  it('is read and tidied', () => {
    expect(parseCardFile(JSON.stringify({ sprint, cards: [good] })).sprint).toEqual({
      ...sprint,
      name: 'Trip to Madrid',
    });
  });

  it('is Latin American unless it says otherwise', () => {
    expect(checkSprint({ ...sprint, variety: undefined })).toMatchObject({ variety: 'latam' });
  });

  it.each([
    ['a missing name', { ...sprint, name: '' }, '"name"'],
    ['a date in the wrong form', { ...sprint, endDate: '10/12/2026' }, '"endDate"'],
    ['a date that does not exist', { ...sprint, endDate: '2026-02-31' }, '"endDate"'],
    ['a missing tag', { ...sprint, tag: undefined }, '"tag"'],
    ['an unknown variety', { ...sprint, variety: 'mexico' }, '"variety"'],
  ])('stops the import if it has %s, rather than guessing', (_what, broken, mention) => {
    expect(() => parseCardFile(JSON.stringify({ sprint: broken, cards: [good] }))).toThrow(FileProblem);
    expect(() => parseCardFile(JSON.stringify({ sprint: broken, cards: [good] }))).toThrow(mention);
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
    expect(plan).toEqual({ toAdd: [], toUpdate: [], duplicates: 1, problems: [] });
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

describe('rewrites: an import file updating cards that are already in the app', () => {
  const flag = { reason: 'translation seems wrong', flaggedAt: '2026-11-01T10:00:00.000Z', by: 'you' as const };
  const existing = [
    makeCard('flagged', {}, 1, { front: 'el reto', back: 'the challange', flag }),
    makeCard('leech', {}, 2, { front: 'por / para', back: 'for', leech: true }),
    makeCard('fine', {}, 3, { front: 'la casa', back: 'the house' }),
  ];
  const rewrite = (id: string, front: string, back: string) => ({ id, type: 'vocab' as const, front, back, tags: [] });

  it('updates a card that is flagged for Claude', () => {
    const plan = planImport([rewrite('flagged', 'el reto', 'the challenge')], existing);
    expect(plan.toUpdate.map((card) => card.id)).toEqual(['flagged']);
    expect(plan).toMatchObject({ toAdd: [], duplicates: 0, problems: [] });
  });

  it('updates a leech', () => {
    const plan = planImport([rewrite('leech', 'para', 'for (a purpose or a deadline)')], existing);
    expect(plan.toUpdate.map((card) => card.id)).toEqual(['leech']);
  });

  it('never changes a card that was not flagged, so importing an old file again is safe', () => {
    const plan = planImport([rewrite('fine', 'la casa', 'something completely different')], existing);
    expect(plan).toEqual({ toAdd: [], toUpdate: [], duplicates: 1, problems: [] });
  });

  it('skips a flagged card whose text has not actually changed (it stays flagged)', () => {
    const same = contentOf(existing[0]);
    expect(planImport([same], existing)).toMatchObject({ toUpdate: [], duplicates: 1 });
    expect(planImport([{ ...same, tags: [...same.tags].reverse() }], existing)).toMatchObject({
      toUpdate: [],
      duplicates: 1,
    });
  });

  it('adds new cards and updates rewritten ones from the same file', () => {
    const plan = planImport(
      [
        rewrite('flagged', 'el desafío', 'the challenge'),
        rewrite('brand-new', 'la mesa', 'the table'),
        rewrite('fine', 'la casa', 'the house'),
      ],
      existing,
    );
    expect(plan.toAdd.map((card) => card.id)).toEqual(['brand-new']);
    expect(plan.toUpdate.map((card) => card.id)).toEqual(['flagged']);
    expect(plan.duplicates).toBe(1);
  });

  it('lets a rewrite change the front, even to one another card type already uses', () => {
    const plan = planImport([rewrite('flagged', 'la casa grande', 'the big house')], existing);
    expect(plan.toUpdate).toHaveLength(1);
  });

  it('refuses a rewrite that changes the type of card, and says why', () => {
    const plan = planImport(
      [{ ...rewrite('flagged', 'El {{c1::reto}} es grande.', ''), type: 'cloze' as const }],
      existing,
    );
    expect(plan.toUpdate).toEqual([]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]).toContain('has to keep its type');
  });

  it('treats a second copy of the same rewrite in one file as a duplicate', () => {
    const plan = planImport(
      [rewrite('flagged', 'el desafío', 'the challenge'), rewrite('flagged', 'otra cosa', 'x')],
      existing,
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].front).toBe('el desafío');
    expect(plan.duplicates).toBe(1);
  });
});

describe('applyRewrite', () => {
  const now = new Date('2026-11-20T09:00:00.000Z');
  const studied = { state: 2, scheduleStatus: 'review', scheduledDays: 9, reps: 14, lapses: 6 } as const;
  const current = makeCard('conj-poner', studied, 7, {
    type: 'conjugation',
    front: 'poner, ellos',
    back: 'pusieron',
    note: 'an old note',
    verb: 'poner',
    tense: 'pretérito',
    person: 'ellos',
    tags: ['madrid', 'verbs'],
    leech: true,
    flag: { reason: 'Leech: forgotten 6 times. Needs rewriting.', flaggedAt: '2026-11-10T10:00:00.000Z', by: 'leech' },
    paused: true,
    introducedAt: '2026-10-01T08:00:00.000Z',
    production: makeProduction('conj-poner', studied),
  });
  const rewritten = {
    id: 'conj-poner',
    type: 'conjugation' as const,
    front: 'poner → pretérito, ellos',
    back: 'pusieron',
    meaning: 'to put',
    verb: 'poner',
    tense: 'pretérito',
    person: 'ellos',
    tags: ['irregular'],
  };
  const updated = applyRewrite(current, rewritten, now);

  it('replaces what the card says', () => {
    expect(updated).toMatchObject({ front: 'poner → pretérito, ellos', back: 'pusieron', meaning: 'to put' });
    expect(updated).not.toHaveProperty('note'); // the rewrite has no note, so the old one goes
  });

  it('keeps all of the card’s progress, in both directions', () => {
    expect(updated.scheduling).toEqual(current.scheduling);
    expect(updated.production).toEqual(current.production);
    expect(updated).toMatchObject({
      introducedAt: current.introducedAt,
      position: 7,
      addedAt: current.addedAt,
      paused: true,
      recognitionPaused: false,
    });
  });

  it('clears the flag and the leech mark, and notes when it was edited', () => {
    expect(updated).toMatchObject({ flag: null, leech: false, editedAt: now.toISOString() });
  });

  it('keeps the tags the card already had, so it cannot fall out of a sprint', () => {
    expect(updated.tags).toEqual(['madrid', 'verbs', 'irregular']);
  });

  it('leaves the original untouched', () => {
    expect(current).toMatchObject({ front: 'poner, ellos', leech: true, note: 'an old note' });
  });
});
