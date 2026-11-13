/** Cards: every card in the app, with search and filters. Tap one to open it. */
import { getAllCards } from '../../data/db';
import {
  allTags,
  filterCards,
  frontAsText,
  NO_FILTER,
  STATUS_FILTERS,
  type CardFilter,
  type StatusFilter,
} from '../../study/cardFilter';
import { CARD_TYPES, type CardType, type StoredCard } from '../../types';
import type { Cleanup } from '../app';
import { cardBadges } from '../badges';
import { count, h, setChildren } from '../dom';

/** How many cards are drawn at first, and how many more each time "Show more" is tapped. */
const PAGE_SIZE = 60;

const STATUS_NAMES: Record<StatusFilter, string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  paused: 'Paused',
  flagged: 'Flagged',
  leech: 'Leech',
};

// Remembered while the app is open, so coming back from a card puts you where you were.
const remembered = { filter: { ...NO_FILTER } as CardFilter, shown: PAGE_SIZE, scrollY: 0 };

export async function renderCards(root: HTMLElement): Promise<Cleanup | void> {
  const cards = await getAllCards();
  const header = h('header', { class: 'page-header' }, h('h1', null, 'Cards'));

  if (cards.length === 0) {
    setChildren(
      root,
      header,
      h(
        'section',
        { class: 'panel is-centered' },
        h('h2', null, 'No cards yet'),
        h('p', null, 'Once you have imported some cards, you can browse and edit them here.'),
        h('a', { class: 'button primary', href: '#/import' }, 'Import cards'),
      ),
    );
    return;
  }

  const filter = remembered.filter;
  const tags = allTags(cards);
  if (filter.tag && !tags.includes(filter.tag)) filter.tag = null; // the tag has gone since last time

  // ----- Search box and filters -----

  const search = h('input', {
    class: 'field',
    type: 'search',
    placeholder: 'Search cards',
    'aria-label': 'Search cards',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    value: filter.query,
  });
  search.addEventListener('input', () => {
    filter.query = search.value;
    filtersChanged();
  });

  /** A drop-down whose first choice (its own name, e.g. "Type") means "don't filter by this". */
  function dropDown<T extends string>(
    label: string,
    anyLabel: string,
    choices: readonly T[],
    names: (choice: T) => string,
    selected: T | null,
    onChange: (choice: T | null) => void,
  ): HTMLSelectElement {
    const select = h(
      'select',
      { class: 'field', 'aria-label': label },
      h('option', { value: '' }, anyLabel),
      choices.map((choice) => h('option', { value: choice, selected: choice === selected }, names(choice))),
    );
    select.addEventListener('change', () => {
      onChange(select.value === '' ? null : (select.value as T));
      filtersChanged();
    });
    return select;
  }

  const filters = h(
    'div',
    { class: 'filters' },
    dropDown<CardType>(
      'Type',
      'Type',
      CARD_TYPES,
      (type) => type,
      filter.type,
      (type) => (filter.type = type),
    ),
    dropDown<string>(
      'Tag',
      'Tag',
      tags,
      (tag) => tag,
      filter.tag,
      (tag) => (filter.tag = tag),
    ),
    dropDown<StatusFilter>(
      'Status',
      'Status',
      STATUS_FILTERS,
      (status) => STATUS_NAMES[status],
      filter.status,
      (status) => (filter.status = status),
    ),
  );

  // ----- The list -----

  const summary = h('p', { class: 'footnote list-summary', 'aria-live': 'polite' });
  const list = h('div', { class: 'card-list' });

  function filtersChanged(): void {
    remembered.shown = PAGE_SIZE;
    drawList();
  }

  function drawList(): void {
    const matches = filterCards(cards, filter);
    summary.textContent =
      matches.length === cards.length
        ? count(cards.length, 'card')
        : `${matches.length} of ${count(cards.length, 'card')}`;

    if (matches.length === 0) {
      setChildren(
        list,
        h(
          'div',
          { class: 'panel is-centered' },
          h('p', null, 'No cards match.'),
          h('button', { class: 'button', onclick: clearFilters }, 'Clear search and filters'),
        ),
      );
      return;
    }

    const remaining = matches.length - remembered.shown;
    setChildren(
      list,
      matches.slice(0, remembered.shown).map(cardRow),
      remaining > 0 &&
        h(
          'button',
          {
            class: 'button',
            onclick: () => {
              remembered.shown += PAGE_SIZE;
              drawList();
            },
          },
          `Show ${Math.min(PAGE_SIZE, remaining)} more`,
        ),
    );
  }

  function clearFilters(): void {
    Object.assign(filter, NO_FILTER);
    search.value = '';
    for (const select of filters.querySelectorAll('select')) select.value = '';
    filtersChanged();
  }

  setChildren(root, header, search, filters, summary, list);
  drawList();

  // Put the list back where it was scrolled to (after the app frame has placed it on the page).
  const scrollTo = remembered.scrollY;
  requestAnimationFrame(() => window.scrollTo(0, scrollTo));

  return () => {
    remembered.scrollY = window.scrollY;
  };
}

function cardRow(card: StoredCard): HTMLElement {
  return h(
    'a',
    { class: 'card-row', href: `#/cards/${encodeURIComponent(card.id)}` },
    h('div', { class: 'card-row-front', lang: 'es' }, frontAsText(card)),
    card.back && h('div', { class: 'card-row-back' }, card.back),
    cardBadges(card),
  );
}
