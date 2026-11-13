/** Draws one flashcard: the question side, and (once revealed) the answer side. */
import type { StoredCard } from '../types';
import { parseCloze } from '../study/cloze';
import { h } from './dom';

export function cardView(card: StoredCard, revealed: boolean): HTMLElement {
  const isCloze = card.type === 'cloze';
  const front = h('div', { class: `card-front ${sizeClass(card.front)}`, lang: 'es' });

  if (isCloze) {
    for (const part of parseCloze(card.front)) {
      if (part.kind === 'text') front.append(part.text);
      else if (revealed) front.append(h('mark', { class: 'cloze-answer' }, part.answer));
      else front.append(h('span', { class: 'cloze-blank' }, part.hint ? `[${part.hint}]` : '[…]'));
    }
  } else {
    front.append(card.front);
  }

  const view = h('article', { class: 'card' }, h('div', { class: 'card-type' }, card.type), front);

  if (revealed) {
    view.append(h('hr', { class: 'card-divider' }));
    if (card.back)
      view.append(h('div', { class: `card-back ${isCloze ? 'is-translation' : sizeClass(card.back)}` }, card.back));
    if (card.note) view.append(h('div', { class: 'card-note' }, card.note));
    if (card.tags.length > 0) {
      view.append(
        h(
          'div',
          { class: 'card-tags' },
          card.tags.map((tag) => h('span', { class: 'tag' }, tag)),
        ),
      );
    }
  }
  return view;
}

/** Short text is shown big; long sentences a little smaller so they fit comfortably. */
function sizeClass(text: string): string {
  if (text.length <= 28) return 'is-short';
  if (text.length <= 90) return 'is-medium';
  return 'is-long';
}
