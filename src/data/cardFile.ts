/**
 * Reading and checking a card import file (the JSON that Claude generates).
 * Pure logic: nothing here touches the database. See README.md for the format.
 */
import { CARD_TYPES, CONTENT_FIELDS, type CardContent, type CardType, type StoredCard, type Variety } from '../types';
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

/** Just what a card says, without its progress, with its fields always in the same order. */
export function contentOf(card: CardContent): CardContent {
  const content: Partial<Record<keyof CardContent, unknown>> = {};
  for (const field of CONTENT_FIELDS) {
    if (card[field] !== undefined) content[field] = card[field];
  }
  return content as CardContent;
}

/** Do two cards say exactly the same thing? (The order of their tags doesn't matter.) */
function sameContent(a: CardContent, b: CardContent): boolean {
  const comparable = (card: CardContent) => JSON.stringify({ ...contentOf(card), tags: [...card.tags].sort() });
  return comparable(a) === comparable(b);
}

/** What the import needs to know about a card that is already in the app. */
type ExistingCard = CardContent & Partial<Pick<StoredCard, 'flag' | 'leech'>>;

export interface ImportPlan {
  /** Cards that are new to the app. */
  toAdd: CardContent[];
  /** Rewritten versions of cards that were flagged for Claude or were leeches. */
  toUpdate: CardContent[];
  /** Cards that were skipped because the app already has them. */
  duplicates: number;
  /** One plain-English line for each card that couldn't be used. */
  problems: string[];
}

/**
 * Decides what to do with each incoming card.
 *
 * NEW cards are added. A card is not new, and is skipped as a duplicate, when
 *  - its id is already in use, or
 *  - a card of the same type already has the same front text
 *    (ignoring capital letters and extra spaces).
 *
 * The one exception is a REWRITE: if the id belongs to a card that is flagged for Claude
 * or is a leech, and the incoming card says something different, the existing card is
 * updated instead. Cards that aren't flagged are never changed by an import, so importing
 * an old file again can't undo edits you made in the app.
 */
export function planImport(incoming: CardContent[], existing: ExistingCard[]): ImportPlan {
  const existingById = new Map(existing.map((card) => [card.id, card]));
  const seenIds = new Set(existingById.keys());
  const seenFronts = new Set(existing.map(frontKey));

  const plan: ImportPlan = { toAdd: [], toUpdate: [], duplicates: 0, problems: [] };
  for (const card of incoming) {
    const current = existingById.get(card.id);
    const awaitingRewrite = current !== undefined && (current.flag != null || current.leech === true);

    if (awaitingRewrite && !sameContent(card, current)) {
      if (card.type !== current.type) {
        plan.problems.push(
          `Card "${card.id}" is a rewrite of a ${current.type} card, but it has been turned into a ${card.type} card. A rewrite has to keep its type. (To change the type, give the new card a new id.)`,
        );
      } else {
        plan.toUpdate.push(card);
      }
      existingById.delete(card.id); // a second copy of it in the same file is just a duplicate
    } else if (seenIds.has(card.id) || seenFronts.has(frontKey(card))) {
      plan.duplicates++;
    } else {
      seenIds.add(card.id);
      seenFronts.add(frontKey(card));
      plan.toAdd.push(card);
    }
  }
  return plan;
}

/**
 * An existing card with its text replaced by a rewritten version.
 *  - Its progress, history, position and pauses are kept exactly as they are.
 *  - Its flag is cleared and it stops being a leech: it has been dealt with.
 *    (If it is forgotten again, it becomes a leech again.)
 *  - Its tags are combined with the new ones, so a rewrite can't drop it out of a sprint by accident.
 */
export function applyRewrite(current: StoredCard, rewritten: CardContent, now: Date): StoredCard {
  const progress: Record<string, unknown> = { ...current };
  for (const field of CONTENT_FIELDS) delete progress[field];
  return {
    ...(progress as Omit<StoredCard, keyof CardContent>),
    ...contentOf(rewritten),
    tags: [...new Set([...current.tags, ...rewritten.tags])],
    flag: null,
    leech: false,
    editedAt: now.toISOString(),
  };
}

function frontKey(card: CardContent): string {
  return `${card.type}|${card.front.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}
