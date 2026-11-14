/** Conjugation cards: the labelled layout and the table of forms. Pure logic. */
import { PERSONS, type CardContent, type ConjugationTable, type Person, type Variety } from '../types';
import { simplify } from './text';

/** How each row of the table is labelled on screen. */
export const PERSON_LABELS: Record<Person, string> = {
  yo: 'yo',
  tú: 'tú',
  él: 'él / ella / usted',
  nosotros: 'nosotros',
  vosotros: 'vosotros',
  ellos: 'ellos / ellas / ustedes',
};

/** The many ways a person can be written, each pointing at its row of the table. */
const PERSON_NAMES: Record<string, Person> = {
  yo: 'yo',
  tu: 'tú',
  el: 'él',
  ella: 'él',
  usted: 'él',
  ud: 'él',
  nosotros: 'nosotros',
  nosotras: 'nosotros',
  vosotros: 'vosotros',
  vosotras: 'vosotros',
  ellos: 'ellos',
  ellas: 'ellos',
  ustedes: 'ellos',
  uds: 'ellos',
};

/**
 * Works out which row of the table a person belongs to.
 * "ellos", "Ellas", "ellos/ellas/ustedes" and "ustedes" all give "ellos".
 * Returns null if the text isn't a person at all.
 */
export function personRow(text: string): Person | null {
  const firstWord = simplify(text).split(/[\s/,.]+/)[0] ?? '';
  return PERSON_NAMES[firstWord] ?? null;
}

/**
 * Checks a table from an import file and tidies its row names.
 * Returns the table, or a sentence saying what is wrong with it.
 */
export function checkTable(raw: unknown): ConjugationTable | string {
  const example = '"table" must look like { "yo": "puse", "tú": "pusiste", … }.';
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return example;

  const table: ConjugationTable = {};
  for (const [name, form] of Object.entries(raw)) {
    const row = personRow(name);
    if (!row)
      return `"table" has a row called "${name}", which isn't a person. Use yo, tú, él, nosotros, vosotros, ellos.`;
    if (typeof form !== 'string' || !form.trim()) return example;
    table[row] = form.trim();
  }
  return Object.keys(table).length > 0 ? table : example;
}

/** Does the card have what the labelled layout needs? If not, it is shown the old way. */
export function hasConjugationLayout(
  card: CardContent,
): card is CardContent & { verb: string; tense: string; person: string } {
  return card.type === 'conjugation' && Boolean(card.verb && card.tense && card.person);
}

export interface TableRow {
  person: Person;
  label: string;
  form: string;
  /** True for the row the card asks about. */
  asked: boolean;
}

/**
 * The rows to show on the answer side, in the usual order.
 * "vosotros" is only shown for Spain Spanish.
 */
export function tableRows(card: CardContent, variety: Variety): TableRow[] {
  if (!card.table) return [];
  const asked = card.person ? personRow(card.person) : null;
  return PERSONS.filter((person) => card.table![person] && (person !== 'vosotros' || variety === 'spain')).map(
    (person) => ({ person, label: PERSON_LABELS[person], form: card.table![person]!, asked: person === asked }),
  );
}
