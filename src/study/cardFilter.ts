/**
 * Searching and filtering for the card browser.
 * Pure logic: it only looks at the cards it is given.
 */
import type { CardType, StoredCard } from '../types';
import { parseCloze } from './cloze';

/** Where a card is in its life. (FSRS's "relearning" is shown as learning.) */
export type Stage = 'new' | 'learning' | 'review';

export function stageOf(card: StoredCard): Stage {
  if (card.scheduling.state === 0) return 'new';
  return card.scheduling.state === 2 ? 'review' : 'learning';
}

export const STATUS_FILTERS = ['new', 'learning', 'review', 'paused', 'flagged', 'leech'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export interface CardFilter {
  /** Words to look for. Empty = no search. */
  query: string;
  /** null = any. */
  type: CardType | null;
  tag: string | null;
  status: StatusFilter | null;
}

export const NO_FILTER: CardFilter = { query: '', type: null, tag: null, status: null };

/** The cards that match every part of the filter, in import order. */
export function filterCards(cards: StoredCard[], filter: CardFilter): StoredCard[] {
  const words = simplify(filter.query).split(' ').filter(Boolean);
  return cards
    .filter((card) => {
      if (filter.type && card.type !== filter.type) return false;
      if (filter.tag && !card.tags.includes(filter.tag)) return false;
      if (filter.status && !hasStatus(card, filter.status)) return false;
      if (words.length === 0) return true;
      const text = simplify([card.front, card.back, card.note ?? '', card.tags.join(' '), card.id].join(' '));
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => a.position - b.position);
}

function hasStatus(card: StoredCard, status: StatusFilter): boolean {
  switch (status) {
    case 'paused':
      return card.paused;
    case 'flagged':
      return card.flag !== null;
    case 'leech':
      return card.leech;
    default:
      return stageOf(card) === status;
  }
}

/**
 * Makes text easy to match: lower case, accents removed, extra spaces removed.
 * So typing "desafio" finds "el desafío".
 */
export function simplify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every tag in use, in alphabetical order. */
export function allTags(cards: StoredCard[]): string[] {
  return [...new Set(cards.flatMap((card) => card.tags))].sort((a, b) => a.localeCompare(b, 'es'));
}

/** A card's front as one line of plain text, with cloze blanks filled in: "Ayer fui al mercado." */
export function frontAsText(card: StoredCard): string {
  if (card.type !== 'cloze') return card.front;
  return parseCloze(card.front)
    .map((part) => (part.kind === 'text' ? part.text : part.answer))
    .join('');
}

/** Turns "verbs, past tense , verbs" from the edit form into ["verbs", "past tense"]. */
export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}
