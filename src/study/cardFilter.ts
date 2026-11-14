/**
 * Searching and filtering for the card browser.
 * Pure logic: it only looks at the cards it is given.
 */
import type { CardType, SchedulingState, StoredCard } from '../types';
import { itemsOf } from './directions';
import { simplify } from './text';
import { clozeSentence } from './voices';

/** Where a card (in one direction) is in its life. (FSRS's "relearning" is shown as learning.) */
export type Stage = 'new' | 'learning' | 'review';

export function stageOf(scheduling: SchedulingState): Stage {
  if (scheduling.state === 0) return 'new';
  return scheduling.state === 2 ? 'review' : 'learning';
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

/** A card with two directions matches if either direction does. */
function hasStatus(card: StoredCard, status: StatusFilter): boolean {
  switch (status) {
    case 'paused':
      return itemsOf(card).some((item) => item.paused);
    case 'flagged':
      return card.flag !== null;
    case 'leech':
      return card.leech;
    default:
      return itemsOf(card).some((item) => stageOf(item.scheduling) === status);
  }
}

/** Every tag in use, in alphabetical order. */
export function allTags(cards: StoredCard[]): string[] {
  return [...new Set(cards.flatMap((card) => card.tags))].sort((a, b) => a.localeCompare(b, 'es'));
}

/** A card's front as one line of plain text, with cloze blanks filled in: "Ayer fui al mercado." */
export function frontAsText(card: StoredCard): string {
  return card.type === 'cloze' ? clozeSentence(card.front) : card.front;
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
