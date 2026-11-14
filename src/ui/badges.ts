/** The small coloured labels that describe a card: New, Paused, Leech and so on. */
import { stageOf } from '../study/cardFilter';
import { itemsOf } from '../study/directions';
import type { Direction, StoredCard } from '../types';
import { h } from './dom';

const STAGE_NAMES = { new: 'New', learning: 'Learning', review: 'Review' } as const;

/** Short names for the two directions, used where space is tight. */
export const DIRECTION_SHORT: Record<Direction, string> = { recognition: 'ES → EN', production: 'EN → ES' };
/** Full names for the two directions. */
export const DIRECTION_NAMES: Record<Direction, string> = {
  recognition: 'Spanish → English',
  production: 'English → Spanish',
};

export function cardBadges(card: StoredCard): HTMLElement {
  const items = itemsOf(card);
  const twoWay = items.length > 1;
  return h(
    'div',
    { class: 'badges' },
    h('span', { class: 'badge' }, card.type),
    // One stage label per direction: "Review", or "ES → EN Review" and "EN → ES New".
    items.map((item) => {
      const stage = stageOf(item.scheduling);
      const pausedAlone = item.paused && !card.paused;
      return h(
        'span',
        { class: `badge is-${stage} ${pausedAlone ? 'is-paused' : ''}` },
        [twoWay && DIRECTION_SHORT[item.direction], STAGE_NAMES[stage], pausedAlone && '(paused)']
          .filter(Boolean)
          .join(' '),
      );
    }),
    card.paused && h('span', { class: 'badge is-paused' }, 'Paused'),
    card.leech && h('span', { class: 'badge is-leech' }, 'Leech'),
    card.flag && h('span', { class: 'badge is-flagged' }, 'Flagged'),
  );
}
