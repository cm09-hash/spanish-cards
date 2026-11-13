/** Review: shows one card at a time, reveals the answer, and records your rating. */
import { saveReview } from '../../data/db';
import { pickNextCard, summarize } from '../../study/queue';
import { previewRatings, type RatingOutcome } from '../../study/scheduler';
import { formatClockTime, formatInterval } from '../../study/time';
import { loadToday } from '../../study/today';
import type { Rating, StoredCard } from '../../types';
import { navigate, type Cleanup } from '../app';
import { cardView } from '../cardView';
import { count, h, setChildren } from '../dom';

const RATING_NAMES: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export async function renderReview(root: HTMLElement): Promise<Cleanup> {
  /** The card on screen (null when there's nothing to study). */
  let current: StoredCard | null = null;
  /** Set once the answer is showing. */
  let revealedAt: Date | null = null;
  let outcomes: RatingOutcome[] = [];
  let shownAtMs = 0;
  let busy = false;
  let reviewedThisSession = 0;
  let justShownId: string | null = null;

  const counts = h('div', { class: 'review-counts' });
  const body = h('div', { class: 'review-body', onclick: () => reveal() });
  const actions = h('div', { class: 'review-actions' });
  setChildren(
    root,
    h(
      'header',
      { class: 'review-header' },
      h('button', { class: 'button small quiet', onclick: () => navigate('home') }, 'Done'),
      counts,
    ),
    body,
    actions,
  );

  async function showNext(): Promise<void> {
    // Re-read from the database each time, so the counts are right even if
    // the app was left open overnight in the middle of a session.
    const today = await loadToday(new Date());
    const summary = summarize(today.cards, today.queueOptions);

    current = pickNextCard(today.cards, { ...today.queueOptions, justShownId });
    revealedAt = null;
    counts.textContent = `Due ${summary.dueToday} · New ${summary.newLeft}`;

    if (!current) {
      const waiting = summary.nextReadyAt;
      setChildren(
        body,
        h(
          'div',
          { class: 'finished' },
          h('h1', null, waiting ? 'Nothing ready right now' : 'All done for today'),
          h(
            'p',
            null,
            waiting
              ? `Your next card is ready at ${formatClockTime(waiting, today.queueOptions.now)}.`
              : '¡Buen trabajo!',
          ),
          reviewedThisSession > 0 &&
            h('p', { class: 'footnote' }, `You answered ${count(reviewedThisSession, 'card')} this session.`),
        ),
      );
      setChildren(
        actions,
        h('button', { class: 'button primary big', onclick: () => navigate('home') }, 'Back to Home'),
      );
      return;
    }

    shownAtMs = Date.now();
    setChildren(body, cardView(current, false));
    body.scrollTop = 0;
    setChildren(actions, h('button', { class: 'button primary big', onclick: () => reveal() }, 'Show answer'));
  }

  function reveal(): void {
    if (!current || revealedAt || busy) return;
    revealedAt = new Date();
    // Work out all four possible futures now, so each button can say when the card
    // would come back, and so pressing a button does exactly what it promised.
    outcomes = previewRatings(current.scheduling, revealedAt);
    setChildren(body, cardView(current, true));
    setChildren(actions, h('div', { class: 'ratings' }, outcomes.map(ratingButton)));
  }

  function ratingButton(outcome: RatingOutcome): HTMLElement {
    const name = RATING_NAMES[outcome.rating];
    return h(
      'button',
      { class: `button rating rating-${name.toLowerCase()}`, onclick: () => void rate(outcome.rating) },
      h('span', { class: 'rating-name' }, name),
      h('span', { class: 'rating-when' }, formatInterval(revealedAt!, new Date(outcome.after.dueAt))),
    );
  }

  async function rate(rating: Rating): Promise<void> {
    const outcome = outcomes.find((candidate) => candidate.rating === rating);
    if (!current || !revealedAt || !outcome || busy) return;
    busy = true;
    try {
      await saveReview({
        cardId: current.id,
        rating,
        timestamp: revealedAt.toISOString(),
        durationMs: Date.now() - shownAtMs,
        before: current.scheduling,
        after: outcome.after,
      });
      reviewedThisSession++;
      justShownId = current.id;
      await showNext();
    } catch (error) {
      console.error(error);
      actions.prepend(h('p', { class: 'message is-error' }, 'That answer could not be saved. Please try again.'));
    } finally {
      busy = false;
    }
  }

  // Keyboard shortcuts, handy when testing on a computer: Space/Enter = show answer, 1–4 = rate.
  const onKey = (event: KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') {
      if (current && !revealedAt) {
        event.preventDefault();
        reveal();
      }
    } else if (revealedAt && ['1', '2', '3', '4'].includes(event.key)) {
      void rate(Number(event.key) as Rating);
    }
  };
  document.addEventListener('keydown', onKey);

  // If the app comes back into view while the "all done" message is showing
  // (say, the next morning), look again for cards to study.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !current && !busy) void showNext();
  };
  document.addEventListener('visibilitychange', onVisible);

  await showNext();

  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
