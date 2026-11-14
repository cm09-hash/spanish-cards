import { describe, expect, it } from 'vitest';
import { checkTable, hasConjugationLayout, personRow, tableRows } from '../src/study/conjugation';
import { makeCard } from './helpers';

const poner = makeCard('poner', {}, 1, {
  type: 'conjugation',
  front: 'poner → pretérito, ellos',
  back: 'pusieron',
  verb: 'poner',
  tense: 'pretérito',
  person: 'ellos',
  meaning: 'to put',
  table: { yo: 'puse', tú: 'pusiste', él: 'puso', nosotros: 'pusimos', vosotros: 'pusisteis', ellos: 'pusieron' },
});

describe('personRow', () => {
  it.each([
    ['yo', 'yo'],
    ['Tú', 'tú'],
    ['tu', 'tú'],
    ['él', 'él'],
    ['ella', 'él'],
    ['usted', 'él'],
    ['él/ella/usted', 'él'],
    ['nosotras', 'nosotros'],
    ['vosotros', 'vosotros'],
    ['ellas', 'ellos'],
    ['ustedes', 'ellos'],
    ['ellos / ellas / ustedes', 'ellos'],
  ])('"%s" belongs to the "%s" row', (text, row) => {
    expect(personRow(text)).toBe(row);
  });

  it('returns null for something that is not a person', () => {
    expect(personRow('gerundio')).toBeNull();
  });
});

describe('checkTable', () => {
  it('accepts a table and tidies its row names', () => {
    expect(checkTable({ yo: ' puse ', tu: 'pusiste', 'él/ella/usted': 'puso', ustedes: 'pusieron' })).toEqual({
      yo: 'puse',
      tú: 'pusiste',
      él: 'puso',
      ellos: 'pusieron',
    });
  });

  it('accepts a table with rows missing (the imperative has no "yo")', () => {
    expect(checkTable({ tú: 'pon', usted: 'ponga' })).toEqual({ tú: 'pon', él: 'ponga' });
  });

  it.each([
    ['a list', ['puse']],
    ['text', 'puse, pusiste'],
    ['an unknown row', { yo: 'puse', they: 'pusieron' }],
    ['a form that is not text', { yo: 5 }],
    ['an empty table', {}],
  ])('rejects %s', (_what, table) => {
    expect(typeof checkTable(table)).toBe('string');
  });
});

describe('the conjugation layout', () => {
  it('is used when verb, tense and person are all there', () => {
    expect(hasConjugationLayout(poner)).toBe(true);
  });

  it('is not used when one is missing: the card is shown the old way', () => {
    const { tense: _tense, ...withoutTense } = poner;
    expect(hasConjugationLayout(withoutTense)).toBe(false);
    expect(hasConjugationLayout({ ...poner, type: 'vocab' })).toBe(false);
  });
});

describe('tableRows', () => {
  it('leaves out vosotros for Latin American Spanish', () => {
    expect(tableRows(poner, 'latam').map((row) => row.person)).toEqual(['yo', 'tú', 'él', 'nosotros', 'ellos']);
  });

  it('includes vosotros for Spain Spanish', () => {
    expect(tableRows(poner, 'spain').map((row) => row.person)).toEqual([
      'yo',
      'tú',
      'él',
      'nosotros',
      'vosotros',
      'ellos',
    ]);
  });

  it('highlights the form the card asks for', () => {
    expect(tableRows(poner, 'latam').filter((row) => row.asked)).toEqual([
      { person: 'ellos', label: 'ellos / ellas / ustedes', form: 'pusieron', asked: true },
    ]);
    expect(tableRows({ ...poner, person: 'ustedes' }, 'latam').find((row) => row.asked)?.person).toBe('ellos');
  });

  it('gives no rows when the card has no table', () => {
    const { table: _table, ...withoutTable } = poner;
    expect(tableRows(withoutTable, 'spain')).toEqual([]);
  });
});
