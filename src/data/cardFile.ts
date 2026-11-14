/**
 * Reading and checking a card import file (the JSON that Claude generates).
 * Pure logic: nothing here touches the database. See README.md for the format.
 */
import { CARD_TYPES, type CardContent, type CardType, type Variety } from '../types';
import { hasCloze } from '../study/cloze';
import { checkTable } from '../study/conjugation';
import { hasTwoDirections } from '../study/directions';
import { isDate } from '../study/sprints';

/** A problem with the whole file, written so it can be shown to the user as-is. */
export class FileProblem extends Error {}

/** The optional "sprint" block at the top of an import file. */
export interface SprintInFile {
  name: string;
  endDate: string;
  tag: string;
  variety: Variety;
}

export interface ParsedCardFile {
  /** Cards that passed every check. */
  cards: CardContent[];
  /** The ids of vocab and phrase cards that asked for "directions": ["recognition"] (no English → Spanish side). */
  recognitionOnly: Set<string>;
  /** The sprint the file's cards belong to, if it names one. */
  sprint: SprintInFile | null;
  /** One plain-English line for each card that was rejected. */
  problems: string[];
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new FileProblem("This file isn't valid JSON, so it can't be read.");
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accepts either { "cards": [ … ] } or just a bare list [ … ].
 * Files written for older versions of the app (without the newer optional fields) are read just the same.
 */
export function parseCardFile(text: string): ParsedCardFile {
  const data = parseJson(text);

  if (isObject(data) && 'reviews' in data && 'formatVersion' in data) {
    throw new FileProblem('This looks like a backup file. To load it, use Restore on the Backup screen.');
  }

  const list = Array.isArray(data) ? data : isObject(data) ? data.cards : undefined;
  if (!Array.isArray(list)) {
    throw new FileProblem('No cards found. The file should look like { "cards": [ … ] }.');
  }

  let sprint: SprintInFile | null = null;
  if (isObject(data) && data.sprint != null) {
    const checked = checkSprint(data.sprint);
    // A sprint that can't be understood stops the whole import: better than guessing what was meant.
    if (typeof checked === 'string')
      throw new FileProblem(`The "sprint" at the top of the file has a problem: ${checked}`);
    sprint = checked;
  }

  const cards: CardContent[] = [];
  const recognitionOnly = new Set<string>();
  const problems: string[] = [];
  list.forEach((raw, index) => {
    const card = checkCard(raw);
    // (Only looked at once the card itself is fine.)
    const wantsProduction = typeof card === 'string' ? card : checkDirections(raw as Record<string, unknown>);
    if (typeof card === 'string' || typeof wantsProduction === 'string') {
      problems.push(`Card ${index + 1}${describeId(raw)}: ${typeof card === 'string' ? card : wantsProduction}`);
      return;
    }
    cards.push(card);
    if (!wantsProduction && hasTwoDirections(card.type)) recognitionOnly.add(card.id);
  });
  return { cards, recognitionOnly, sprint, problems };
}

function describeId(raw: unknown): string {
  const id = isObject(raw) ? raw.id : undefined;
  return typeof id === 'string' || typeof id === 'number' ? ` ("${id}")` : '';
}

/** Returns the cleaned-up card, or a sentence saying what is wrong with it. */
export function checkCard(raw: unknown): CardContent | string {
  if (!isObject(raw)) return 'is not a card object.';

  const id = typeof raw.id === 'number' ? String(raw.id) : typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return '"id" is missing.';

  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!isCardType(type)) return `"type" must be one of: ${CARD_TYPES.join(', ')}.`;

  const front = typeof raw.front === 'string' ? raw.front.trim() : '';
  if (!front) return '"front" is missing.';

  if (raw.back != null && typeof raw.back !== 'string') return '"back" must be text.';
  const back = (raw.back ?? '').trim();
  if (type === 'cloze') {
    if (!hasCloze(front)) return 'a cloze card needs a blank in "front", written like {{c1::fui}}.';
  } else if (!back) {
    return '"back" is missing.';
  }

  const rawTags = raw.tags ?? [];
  if (!Array.isArray(rawTags) || rawTags.some((tag) => typeof tag !== 'string')) {
    return '"tags" must be a list of words, like ["verbs", "past"].';
  }
  const tags = [...new Set(rawTags.map((tag: string) => tag.trim()).filter(Boolean))];

  const card: CardContent = { id, front, back, type, tags };

  // Optional pieces of text. Empty ones are simply left out.
  const optionalText =
    type === 'conjugation'
      ? (['note', 'audio', 'verb', 'tense', 'person', 'meaning'] as const)
      : (['note', 'audio'] as const);
  for (const field of optionalText) {
    const value = raw[field];
    if (value == null) continue;
    if (typeof value !== 'string') return `"${field}" must be text.`;
    if (value.trim()) card[field] = value.trim();
  }

  if (type === 'conjugation' && raw.table != null) {
    const table = checkTable(raw.table);
    if (typeof table === 'string') return table;
    card.table = table;
  }

  return card;
}

/**
 * Reads a card's optional "directions" list and says whether the card should have a production
 * (English → Spanish) side: true or false. Leaving the list out means the usual, which is yes.
 * Returns a sentence instead if the list can't be understood.
 */
function checkDirections(raw: Record<string, unknown>): boolean | string {
  if (raw.directions == null) return true;
  const example = '"directions" must be ["recognition"] or ["recognition", "production"].';
  const list = raw.directions;
  if (!Array.isArray(list) || list.some((entry) => entry !== 'recognition' && entry !== 'production')) return example;
  if (!list.includes('recognition')) return example;
  return list.includes('production');
}

/** Returns the cleaned-up sprint, or a sentence saying what is wrong with it. */
export function checkSprint(raw: unknown): SprintInFile | string {
  if (!isObject(raw))
    return 'it should look like { "name": "…", "endDate": "2026-12-10", "tag": "…", "variety": "latam" }.';

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return '"name" is missing.';

  const endDate = typeof raw.endDate === 'string' ? raw.endDate.trim() : '';
  if (!isDate(endDate)) return '"endDate" must be a date written like "2026-12-10".';

  const tag = typeof raw.tag === 'string' ? raw.tag.trim() : '';
  if (!tag) return '"tag" is missing.';

  const variety =
    raw.variety == null ? 'latam' : typeof raw.variety === 'string' ? raw.variety.trim().toLowerCase() : '';
  if (variety !== 'latam' && variety !== 'spain') return '"variety" must be "latam" or "spain".';

  return { name, endDate, tag, variety };
}

function isCardType(value: string): value is CardType {
  return (CARD_TYPES as readonly string[]).includes(value);
}

export interface ImportPlan {
  toAdd: CardContent[];
  duplicates: number;
}

/**
 * Decides which incoming cards are really new. A card is a duplicate when
 *  - its id is already in use, or
 *  - a card of the same type already has the same front text
 *    (ignoring capital letters and extra spaces).
 */
export function planImport(incoming: CardContent[], existing: CardContent[]): ImportPlan {
  const seenIds = new Set(existing.map((card) => card.id));
  const seenFronts = new Set(existing.map(frontKey));

  const toAdd: CardContent[] = [];
  let duplicates = 0;
  for (const card of incoming) {
    if (seenIds.has(card.id) || seenFronts.has(frontKey(card))) {
      duplicates++;
      continue;
    }
    seenIds.add(card.id);
    seenFronts.add(frontKey(card));
    toAdd.push(card);
  }
  return { toAdd, duplicates };
}

function frontKey(card: CardContent): string {
  return `${card.type}|${card.front.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}
