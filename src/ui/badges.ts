/** The small coloured labels that describe a card: New, Paused, Leech and so on. */
import { stageOf } from '../study/cardFilter';
import type { StoredCard } from '../types';
import { h } from './dom';

const STAGE_NAMES = { new: 'New', learning: 'Learning', review: 'Review' } as const;

export function cardBadges(card: StoredCard): HTMLElement {
  const stage = stageOf(card);
  return h(
    'div',
    { class: 'badges' },
    h('span', { class: 'badge' }, card.type),
    h('span', { class: `badge is-${stage}` }, STAGE_NAMES[stage]),
    card.paused && h('span', { class: 'badge is-paused' }, 'Paused'),
    card.leech && h('span', { class: 'badge is-leech' }, 'Leech'),
    card.flag && h('span', { class: 'badge is-flagged' }, 'Flagged'),
  );
}
