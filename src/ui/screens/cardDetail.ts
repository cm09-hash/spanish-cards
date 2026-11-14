/** One card: both sides, its progress and history, and everything you can do to it. */
import { checkCard } from '../../data/cardFile';
import {
  deleteCard,
  editCard,
  getCard,
  getReviewsForCard,
  getSprints,
  resetCardProgress,
  setCardFlag,
  setCardPaused,
  setDirectionPaused,
} from '../../data/db';
import { parseTags, stageOf } from '../../study/cardFilter';
import { itemsOf, productionStartDay, type StudyItem } from '../../study/directions';
import { varietyOf } from '../../study/sprints';
import { formatClockTime, formatDate, formatDateTime, formatInterval } from '../../study/time';
import type { Rating, ReviewRecord, StoredCard } from '../../types';
import { navigate } from '../app';
import { cardBadges, DIRECTION_NAMES, DIRECTION_SHORT } from '../badges';
import { cardView } from '../cardView';
import { count, h, setChildren } from '../dom';
import { stopSpeaking } from '../speech';

const RATING_NAMES: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export async function renderCardDetail(root: HTMLElement, cardId: string): Promise<() => void> {
  const backLink = h('a', { class: 'button small quiet back-link', href: '#/cards' }, '‹ Cards');

  /** Draws the normal view of the card. `notice` is a short confirmation of what just happened. */
  async function draw(notice?: string): Promise<void> {
    const [card, reviews, sprints] = await Promise.all([getCard(cardId), getReviewsForCard(cardId), getSprints()]);
    if (!card) {
      setChildren(root, backLink, h('h1', null, 'Card not found'), h('p', null, 'It may have been deleted.'));
      return;
    }
    const items = itemsOf(card);
    const twoWay = items.length > 1;

    // One area below the buttons is shared by the small forms and "are you sure?" questions.
    const question = h('div', { class: 'result', 'aria-live': 'polite' });
    const ask = (...content: HTMLElement[]) => {
      setChildren(question, h('div', { class: 'message is-warning' }, content));
      question.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    const cancelButton = () => h('button', { class: 'button', onclick: () => setChildren(question) }, 'Cancel');

    /** Runs a change, then redraws the card with a confirmation. */
    const change = (work: () => Promise<void>, done: string) => async () => {
      try {
        await work();
        await draw(done);
      } catch (error) {
        console.error(error);
        setChildren(question, h('p', { class: 'message is-error' }, 'That didn’t work. Nothing was changed.'));
      }
    };

    // ----- Flag for Claude -----

    function askFlagReason(): void {
      const reason = h('input', {
        class: 'field',
        type: 'text',
        maxlength: 200,
        placeholder: 'e.g. translation seems wrong',
        'aria-label': 'Reason (optional)',
      });
      const save = change(
        () => setCardFlag(cardId, { reason: reason.value.trim(), flaggedAt: new Date().toISOString(), by: 'you' }),
        'Flagged for Claude.',
      );
      reason.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') void save();
      });
      ask(
        h('p', null, 'What should Claude look at? You can leave this empty.'),
        reason,
        h(
          'div',
          { class: 'button-row' },
          h('button', { class: 'button primary', onclick: save }, 'Flag card'),
          cancelButton(),
        ),
      );
      reason.focus();
    }

    // ----- Reset progress and Delete: both ask first -----

    function askReset(): void {
      ask(
        h(
          'p',
          null,
          `Reset this card’s progress${twoWay ? ' in both directions' : ''}? It becomes a new card again and will be re-learned from scratch. Its review history is kept.`,
        ),
        h(
          'div',
          { class: 'button-row' },
          h(
            'button',
            {
              class: 'button danger',
              onclick: change(() => resetCardProgress(cardId, new Date()), 'Progress reset. This card is new again.'),
            },
            'Reset progress',
          ),
          cancelButton(),
        ),
      );
    }

    function askDelete(): void {
      const history = reviews.length > 0 ? ` and its ${count(reviews.length, 'review')}` : '';
      ask(
        h('p', null, `Delete this card${history} for good? This can’t be undone.`),
        h(
          'div',
          { class: 'button-row' },
          h(
            'button',
            {
              class: 'button danger',
              onclick: change(async () => {
                await deleteCard(cardId);
                navigate('cards');
              }, ''),
            },
            'Delete card',
          ),
          cancelButton(),
        ),
      );
    }

    /** One direction's progress, with its own pause button when the card has two directions. */
    function progressPanel(item: StudyItem): HTMLElement {
      const pausedAlone =
        item.direction === 'recognition' ? card!.recognitionPaused : (card!.production?.paused ?? false);
      const name = DIRECTION_NAMES[item.direction];
      return h(
        'section',
        { class: 'panel' },
        h('h2', null, twoWay ? name : 'Progress'),
        factsTable(card!, item),
        twoWay &&
          h(
            'button',
            {
              class: 'button small',
              onclick: change(
                () => setDirectionPaused(cardId, item.direction, !pausedAlone),
                pausedAlone
                  ? `${name} is back in your study sessions.`
                  : `${name} is paused. The other direction carries on.`,
              ),
            },
            pausedAlone ? 'Unpause this direction' : 'Pause this direction',
          ),
      );
    }

    const anyStudied = items.some((item) => item.scheduling.state !== 0);

    setChildren(
      root,
      backLink,
      notice && h('p', { class: 'message is-success' }, notice),
      cardView(card, { direction: 'recognition', revealed: true, variety: varietyOf(card, sprints) }),
      cardBadges(card),
      card.flag &&
        h(
          'p',
          { class: 'message is-flag' },
          card.flag.reason ? `Flagged for Claude: ${card.flag.reason}` : 'Flagged for Claude.',
        ),
      h(
        'section',
        { class: 'panel' },
        h(
          'div',
          { class: 'button-grid' },
          h('button', { class: 'button', onclick: () => drawEditForm(card) }, 'Edit'),
          card.paused
            ? h(
                'button',
                {
                  class: 'button',
                  onclick: change(
                    () => setCardPaused(cardId, false),
                    'Unpaused. This card is back in your study sessions.',
                  ),
                },
                'Unpause',
              )
            : h(
                'button',
                {
                  class: 'button',
                  onclick: change(
                    () => setCardPaused(cardId, true),
                    'Paused. This card won’t appear in study sessions.',
                  ),
                },
                twoWay ? 'Pause card' : 'Pause',
              ),
          card.flag
            ? h(
                'button',
                { class: 'button', onclick: change(() => setCardFlag(cardId, null), 'Flag removed.') },
                'Unflag',
              )
            : h('button', { class: 'button', onclick: askFlagReason }, 'Flag for Claude'),
          h('button', { class: 'button', onclick: askReset, disabled: !anyStudied }, 'Reset progress'),
          h('button', { class: 'button danger-text', onclick: askDelete }, 'Delete'),
        ),
        question,
      ),
      items.map(progressPanel),
      h('section', { class: 'panel' }, h('h2', null, 'Review history'), historyList(reviews, twoWay)),
    );
  }

  /** Swaps the view for a form to edit the card's text. */
  function drawEditForm(card: StoredCard): void {
    stopSpeaking();
    const front = textArea('Front', card.front, 3);
    const back = textArea('Back', card.back, 3);
    const note = textArea('Note (optional)', card.note ?? '', 3);
    const tags = h('input', { class: 'field', type: 'text', value: card.tags.join(', '), autocapitalize: 'off' });
    const problem = h('div', { class: 'result', 'aria-live': 'polite' });

    async function save(): Promise<void> {
      // The same checks an imported card goes through, so an edit can't produce a broken card.
      const checked = checkCard({
        id: card.id,
        type: card.type,
        front: front.area.value,
        back: back.area.value,
        note: note.area.value,
        tags: parseTags(tags.value),
      });
      if (typeof checked === 'string') {
        setChildren(problem, h('p', { class: 'message is-error' }, `This can’t be saved yet: ${checked}`));
        return;
      }
      try {
        await editCard(card.id, checked, new Date());
      } catch (error) {
        console.error(error);
        setChildren(
          problem,
          h('p', { class: 'message is-error' }, 'The changes could not be saved. Nothing was changed.'),
        );
        return;
      }
      await draw('Changes saved. The card’s progress is unchanged.');
      window.scrollTo(0, 0);
    }

    setChildren(
      root,
      h('header', { class: 'page-header' }, h('h1', null, 'Edit card')),
      h('p', { class: 'footnote is-left' }, 'Editing keeps this card’s progress and history.'),
      front.field,
      card.type === 'cloze' &&
        h('p', { class: 'footnote is-left' }, 'Keep the hidden word marked like {{c1::fui}} or {{c1::fui::ir}}.'),
      back.field,
      note.field,
      h('label', { class: 'form-field' }, h('span', null, 'Tags (separated by commas)'), tags),
      problem,
      h(
        'div',
        { class: 'button-row' },
        h('button', { class: 'button primary', onclick: () => void save() }, 'Save changes'),
        h('button', { class: 'button', onclick: () => void draw() }, 'Cancel'),
      ),
    );
    window.scrollTo(0, 0);
  }

  await draw();
  return stopSpeaking;
}

function textArea(label: string, value: string, rows: number): { field: HTMLElement; area: HTMLTextAreaElement } {
  const area = h('textarea', { class: 'field', rows, lang: 'es' });
  area.value = value;
  return { area, field: h('label', { class: 'form-field' }, h('span', null, label), area) };
}

const STAGE_NAMES = { new: 'New', learning: 'Learning', review: 'Review' } as const;

function factsTable(card: StoredCard, item: StudyItem): HTMLElement {
  const { scheduling } = item;
  const now = new Date();
  const due = new Date(scheduling.dueAt);

  let nextDue: string;
  if (scheduling.state === 0) {
    nextDue = 'Not started yet';
    if (item.direction === 'production') {
      // This direction waits a few days after the other one has been started.
      const startsOn = productionStartDay(card);
      if (startsOn === null) nextDue = 'Starts a few days after Spanish → English';
      else if (startsOn > now) nextDue = `Starts ${formatDate(startsOn)}`;
    }
  } else if (due <= now) {
    nextDue = 'Now';
  } else {
    nextDue = due.getTime() - now.getTime() < 2 * 24 * 60 * 60 * 1000 ? formatClockTime(due, now) : formatDate(due);
  }
  if (item.paused) nextDue += ' (paused)';

  const facts: [string, string][] = [
    ['Stage', STAGE_NAMES[stageOf(scheduling)]],
    ['Times reviewed', String(scheduling.reps)],
    ['Times forgotten', String(scheduling.lapses)],
    ['Next due', nextDue],
  ];
  if (item.direction === 'recognition') {
    facts.push(['Added', formatDate(new Date(card.addedAt))]);
    if (card.editedAt) facts.push(['Last edited', formatDate(new Date(card.editedAt))]);
  }

  return h('dl', { class: 'facts' }, facts.map(([name, value]) => [h('dt', null, name), h('dd', null, value)]).flat());
}

function historyList(reviews: ReviewRecord[], twoWay: boolean): HTMLElement {
  if (reviews.length === 0) return h('p', null, 'No reviews yet.');
  return h(
    'ol',
    { class: 'history' },
    // Newest first.
    [...reviews].reverse().map((review) => {
      const name = RATING_NAMES[review.rating];
      const when = new Date(review.timestamp);
      return h(
        'li',
        null,
        h(
          'span',
          { class: 'history-when' },
          formatDateTime(when),
          twoWay && h('span', { class: 'history-direction' }, DIRECTION_SHORT[review.direction]),
        ),
        h('span', { class: `history-rating rating-${name.toLowerCase()}` }, name),
        h('span', { class: 'history-next' }, `next in ${formatInterval(when, new Date(review.after.dueAt))}`),
      );
    }),
  );
}
