/**
 * Reading and checking a card import file (the JSON that Claude generates).
 * Pure logic: nothing here touches the database. See README.md for the format.
 */
import { CARD_TYPES, type CardContent, type CardType } from '../types';
import { hasCloze } from '../study/cloze';

/** A problem with the whole file, written so it can be shown to the user as-is. */
export class FileProblem extends Error {}

export interface ParsedCardFile {
  /** Cards that passed every check. */
  cards: CardContent[];
  /** One plain-English line for each card that was rejected. */
  problems: string[];
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new FileProblem("This file isn't valid JSON, so it can't be read.");
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accepts either { "cards": [ … ] } or just a bare list [ … ]. */
export function parseCardFile(text: string): ParsedCardFile {
  const data = parseJson(text);

  if (isObject(data) && 'reviews' in data && 'formatVersion' in data) {
    throw new FileProblem('This looks like a backup file. To load it, use Restore on the Backup screen.');
  }

  const list = Array.isArray(data) ? data : isObject(data) ? data.cards : undefined;
  if (!Array.isArray(list)) {
    throw new FileProblem('No cards found. The file should look like { "cards": [ … ] }.');
  }

  const cards: CardContent[] = [];
  const problems: string[] = [];
  list.forEach((raw, index) => {
    const result = checkCard(raw);
    if (typeof result === 'string') problems.push(`Card ${index + 1}${describeId(raw)}: ${result}`);
    else cards.push(result);
  });
  return { cards, problems };
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

  if (raw.note != null && typeof raw.note !== 'string') return '"note" must be text.';
  const note = raw.note?.trim();

  return { id, front, back, type, tags, ...(note ? { note } : {}) };
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
