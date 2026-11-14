/**
 * Review: shows one card at a time, reveals the answer, and records your rating.
 * Also used for "Quick 5", a five-minute session of due reviews only.
 */
import { LEECH_THRESHOLD, QUICK_SESSION_MINUTES } from '../../config';
import { saveReview, undoReview } from '../../data/db';
import {
  answerSlots,
  checkAnswer,
  overallResult,
  suggestedRating,
  type AnswerCheck,
  type AnswerSlot,
  type TextPart,
} from '../../study/answerCheck';
import { itemOf, type StudyItem } from '../../study/directions';
import { pickNextCard, summarize, todaysProgress, type QueueOptions, type StudySummary } from '../../study/queue';
import { rateCard } from '../../study/rate';
import { previewRatings, type RatingOutcome } from '../../study/scheduler';
import { varietyOf } from '../../study/sprints';
import { formatClockTime, formatInterval } from '../../study/time';
import { loadToday } from '../../study/today';
import { speechPlan } from '../../study/voices';
import type { Direction, Rating, Settings, StoredCard, Variety } from '../../types';
import { navigate, type Cleanup } from '../app';
import { cardView } from '../cardView';
import { launchConfetti } from '../confetti';
import { count, h, setChildren } from '../dom';
import { accentRow, answerInput, fitToVisibleArea } from '../keyboard';
import { animate } from '../motion';
import { playSound, type SoundName } from '../sound';
import { speakSoon, stopSpeaking } from '../speech';

export type ReviewMode = 'normal' | 'quick';

const RATING_NAMES: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const RATING_SOUNDS: Record<Rating, SoundName> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

/** What is needed to take back one answer. */
interface UndoStep {
  reviewId: number;
  cardId: string;
  direction: Direction;
  /** The card's fields as they were before the answer. */
  previous: Partial<StoredCard>;
}

/** How a new card (or message) arrives on screen. */
type Entrance = 'forward' | 'back' | 'flip';

const EXITS: Record<Entrance, Keyframe[]> = {
  forward: [
    { transform: 'translateX(0)', opacity: 1 },
    { transform: 'translateX(-36px)', opacity: 0 },
  ],
  back: [
    { transform: 'translateX(0)', opacity: 1 },
    { transform: 'translateX(36px)', opacity: 0 },
  ],
  flip: [{ transform: 'perspective(900px) rotateY(0deg)' }, { transform: 'perspective(900px) rotateY(90deg)' }],
};
const ENTRANCES: Record<Entrance, Keyframe[]> = {
  forward: [
    { transform: 'translateX(44px)', opacity: 0 },
    { transform: 'translateX(0)', opacity: 1 },
  ],
  back: [
    { transform: 'translateX(-44px)', opacity: 0 },
    { transform: 'translateX(0)', opacity: 1 },
  ],
  flip: [{ transform: 'perspective(900px) rotateY(-90deg)' }, { transform: 'perspective(900px) rotateY(0deg)' }],
};

export async function renderReview(root: HTMLElement, mode: ReviewMode = 'normal'): Promise<Cleanup> {
  /** The card (in one direction) on screen. null when there's nothing to study. */
  let current: StudyItem | null = null;
  let variety: Variety = 'latam';
  let settings: Settings | null = null;
  /** Set once the answer is showing. */
  let revealedAt: Date | null = null;
  let outcomes: RatingOutcome[] = [];
  let shownAtMs = 0;
  let busy = false;
  let answeredThisSession = 0;
  let justShownCardId: string | null = null;

  // Typed answers: what has to be typed for the current card (null = not a typing card),
  // the text boxes, and how the typed answers compared (null = nothing was typed).
  let slots: AnswerSlot[] | null = null;
  let inputs: HTMLInputElement[] = [];
  let lastFocused: HTMLInputElement | null = null;
  let checks: AnswerCheck[] | null = null;

  /** Answers that can still be taken back, most recent last. Forgotten when you leave the screen. */
  const undoSteps: UndoStep[] = [];
  /** After an undo: the item to show again, whatever the queue says. */
  let showAgain: Pick<UndoStep, 'cardId' | 'direction'> | null = null;

  // Quick 5 only.
  let deadlineMs: number | null = null;
  let timeUp = false;
  let tick: number | undefined;

  let celebrated = false;
  let stopConfetti: (() => void) | null = null;
  let toastTimer: number | undefined;

  // ----- The parts of the screen -----

  const undoButton = h('button', { class: 'button small quiet', hidden: true, onclick: () => void undo() }, '↩ Undo');
  const timer = h('span', { class: 'review-timer', hidden: mode !== 'quick' });
  const counts = h('div', { class: 'review-counts' });
  const progressFill = h('div', { class: 'progress-fill' });
  const progressBar = h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-label': 'Progress through today’s cards', 'aria-valuemin': 0 },
    progressFill,
  );
  const body = h('div', { class: 'review-body', onclick: () => tappedCard() });
  const toast = h('button', { class: 'toast', hidden: true, onclick: () => hideToast() });
  const actions = h('div', { class: 'review-actions' });

  setChildren(
    root,
    h(
      'header',
      { class: 'review-header' },
      h(
        'div',
        { class: 'review-header-side' },
        h('button', { class: 'button small quiet', onclick: () => navigate('home') }, 'Done'),
        undoButton,
      ),
      h('div', { class: 'review-header-side' }, timer, counts),
    ),
    progressBar,
    body,
    toast,
    actions,
  );

  // When the phone's keyboard opens (for typed answers), shrink the screen to sit above it.
  const stopFitting = fitToVisibleArea(document.getElementById('app')!);

  // ----- Putting things on screen, with movement -----

  let latestSwap = 0;

  /** Swaps what's in the middle of the screen: the old content leaves, the new content arrives. */
  async function swapBody(content: HTMLElement, entrance: Entrance): Promise<void> {
    const thisSwap = ++latestSwap;
    const old = body.firstElementChild;
    if (old) {
      await animate(old, EXITS[entrance], { duration: 130, easing: 'ease-in', fill: 'forwards' });
      if (thisSwap !== latestSwap) return; // something newer is already on its way in
    }
    setChildren(body, content);
    body.scrollTop = 0;
    void animate(content, ENTRANCES[entrance], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }

  function showProgress(done: number, total: number): void {
    const percent = total === 0 ? 100 : Math.round((done / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuemax', String(total));
    progressBar.setAttribute('aria-valuenow', String(done));
  }

  function showToast(text: string): void {
    toast.textContent = text;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 9000);
  }

  function hideToast(): void {
    window.clearTimeout(toastTimer);
    toast.hidden = true;
  }

  // ----- The Quick 5 countdown -----

  function startCountdown(): void {
    if (mode !== 'quick' || deadlineMs !== null) return;
    deadlineMs = Date.now() + QUICK_SESSION_MINUTES * 60_000;
    const update = () => {
      const secondsLeft = Math.max(0, Math.ceil((deadlineMs! - Date.now()) / 1000));
      if (secondsLeft === 0) {
        // Time is up: the card on screen can still be finished, but no new one is dealt.
        timeUp = true;
        window.clearInterval(tick);
        timer.textContent = current ? 'Last card' : 'Time’s up';
        timer.classList.add('is-up');
        return;
      }
      timer.textContent = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
    };
    update();
    tick = window.setInterval(update, 250);
  }

  // ----- Reading aloud -----

  /** Reads the card's Spanish by itself, if that setting is on and this is the side the Spanish first appears on. */
  function autoPlay(side: 'question' | 'answer', delayMs: number): void {
    if (!current || !settings?.autoPlayAudio) return;
    const plan = speechPlan(current.card, current.direction);
    if (plan && plan.from === side) speakSoon(plan.text, variety, delayMs);
  }

  // ----- The session -----

  async function showNext(entrance: Entrance = 'forward'): Promise<void> {
    // Re-read from the database each time, so the counts are right even if
    // the app was left open overnight in the middle of a session.
    const today = await loadToday(new Date());
    const everything = summarize(today.cards, today.queueOptions);
    const options: QueueOptions = mode === 'quick' ? { ...today.queueOptions, reviewsOnly: true } : today.queueOptions;
    const summary = mode === 'quick' ? summarize(today.cards, options) : everything;

    let next: StudyItem | null = null;
    if (showAgain) {
      const card = today.cards.find((candidate) => candidate.id === showAgain!.cardId);
      next = card ? itemOf(card, showAgain.direction) : null;
    }
    showAgain = null;
    if (!next && !timeUp) next = pickNextCard(today.cards, { ...options, justShownCardId });

    stopSpeaking();
    current = next;
    settings = today.settings;
    revealedAt = null;
    checks = null;
    inputs = [];
    lastFocused = null;
    counts.textContent =
      mode === 'quick' ? `Due ${summary.dueToday}` : `Due ${summary.dueToday} · New ${summary.newLeft}`;
    const progress = todaysProgress(today.cards, options, today.reviewedTodayKeys);
    showProgress(progress.done, progress.total);
    undoButton.hidden = undoSteps.length === 0;

    if (!current) {
      showFinished(summary, everything, today.queueOptions.now);
      return;
    }

    variety = varietyOf(current.card, today.sprints);
    slots = settings.typeAnswers ? answerSlots(current.card, current.direction) : null;

    startCountdown();
    if (timeUp) timer.textContent = 'Last card';
    shownAtMs = Date.now();
    setChildren(actions, slots ? typingForm(slots) : showAnswerButton());
    await swapBody(cardView(current.card, { direction: current.direction, revealed: false, variety }), entrance);
    autoPlay('question', 350);
  }

  function showAnswerButton(): HTMLElement {
    return h('button', { class: 'button primary big', onclick: () => reveal() }, 'Show answer');
  }

  /** The text box (or boxes, one per blank), the row of Spanish letters, and the Check button. */
  function typingForm(wanted: AnswerSlot[]): HTMLElement {
    const check = h('button', { class: 'button primary big', onclick: () => reveal() }, 'Show answer');
    const relabel = () => {
      check.textContent = inputs.some((input) => input.value.trim()) ? 'Check' : 'Show answer';
    };

    inputs = wanted.map((slot, index) => {
      const placeholder = slot.hint
        ? `Type the Spanish (${slot.hint})`
        : wanted.length > 1
          ? `Blank ${index + 1}`
          : 'Type the Spanish';
      const input = answerInput(placeholder);
      input.addEventListener('focus', () => (lastFocused = input));
      input.addEventListener('input', relabel);
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const following = inputs[index + 1];
        if (following) following.focus();
        else reveal();
      });
      return input;
    });

    return h(
      'div',
      { class: 'typing' },
      accentRow(() => lastFocused ?? inputs[0] ?? null),
      inputs,
      check,
    );
  }

  function showFinished(summary: StudySummary, everything: StudySummary, now: Date): void {
    // "Everything" covers new cards too, even in a Quick 5 session that leaves them out.
    const nothingLeftToday = everything.dueToday === 0 && everything.newLeft === 0;

    let title: string;
    let text: string;
    let offerNewCards = false;
    if (nothingLeftToday) {
      title = 'All done for today';
      text = '¡Buen trabajo!';
    } else if (timeUp) {
      title = 'Time’s up. Nice work!';
      text = `${QUICK_SESSION_MINUTES} focused minutes done. Showing up on a busy day is what keeps it all in your head.`;
    } else if (summary.nextReadyAt) {
      title = 'Nothing ready right now';
      text = `Your next card is ready at ${formatClockTime(summary.nextReadyAt, now)}.`;
    } else {
      // Only reachable in Quick 5: the reviews are finished but there are still new cards for today.
      title = 'Reviews done!';
      text = `Every due review is finished. ${count(everything.newLeft, 'new card')} can wait for another time.`;
      offerNewCards = true;
    }

    if (timeUp) timer.textContent = 'Time’s up';
    setChildren(
      actions,
      offerNewCards && h('button', { class: 'button big', onclick: () => navigate('review') }, 'Study new cards too'),
      h('button', { class: 'button primary big', onclick: () => navigate('home') }, 'Back to Home'),
    );
    void swapBody(
      h(
        'div',
        { class: 'finished' },
        h('h1', null, title),
        h('p', null, text),
        answeredThisSession > 0 &&
          h('p', { class: 'footnote' }, `You answered ${count(answeredThisSession, 'card')} this session.`),
      ),
      'forward',
    );

    // The celebration: only for really finishing the day, and only once per session.
    if (nothingLeftToday && answeredThisSession > 0 && !celebrated) {
      celebrated = true;
      playSound('celebrate');
      stopConfetti?.();
      stopConfetti = launchConfetti();
    }
  }

  /** Tapping the card shows the answer, except on typing cards (where a stray tap shouldn't skip the typing). */
  function tappedCard(): void {
    if (!slots) reveal();
  }

  function reveal(): void {
    if (!current || revealedAt || busy) return;
    revealedAt = new Date();

    // Compare what was typed (if anything) with the right answer.
    if (slots && inputs.some((input) => input.value.trim())) {
      checks = slots.map((slot, index) => checkAnswer(inputs[index].value, slot.expected));
    }
    (document.activeElement as HTMLElement | null)?.blur?.(); // puts the phone's keyboard away

    // Work out all four possible futures now, so each button can say when the card
    // would come back, and so pressing a button does exactly what it promised.
    outcomes = previewRatings(current.scheduling, revealedAt);
    const suggestion = checks ? suggestedRating(overallResult(checks)) : null;
    setChildren(
      actions,
      suggestion && h('p', { class: 'suggestion' }, `Suggested: ${RATING_NAMES[suggestion]}. You choose.`),
      h(
        'div',
        { class: 'ratings' },
        outcomes.map((outcome) => ratingButton(outcome, outcome.rating === suggestion)),
      ),
    );

    const answer = cardView(current.card, { direction: current.direction, revealed: true, variety });
    void swapBody(checks ? h('div', { class: 'answer-stack' }, checkResult(checks), answer) : answer, 'flip');
    autoPlay('answer', 0); // at once: this runs inside the tap that revealed the answer
  }

  function ratingButton(outcome: RatingOutcome, suggested: boolean): HTMLElement {
    const name = RATING_NAMES[outcome.rating];
    return h(
      'button',
      {
        class: `button rating rating-${name.toLowerCase()} ${suggested ? 'is-suggested' : ''}`,
        onclick: () => void rate(outcome.rating),
      },
      h('span', { class: 'rating-name' }, name),
      h('span', { class: 'rating-when' }, formatInterval(revealedAt!, new Date(outcome.after.dueAt))),
    );
  }

  async function rate(rating: Rating): Promise<void> {
    const outcome = outcomes.find((candidate) => candidate.rating === rating);
    if (!current || !revealedAt || !outcome || busy) return;
    busy = true;
    playSound(RATING_SOUNDS[rating]); // straight away, while the tap is still fresh
    try {
      const item = current;
      const typed = checks && { typed: checks.map((check) => check.typed).join(' | '), result: overallResult(checks) };
      const rated = rateCard(item, outcome, revealedAt, Date.now() - shownAtMs, typed);
      const reviewId = await saveReview(rated.review, rated.changes);

      undoSteps.push({ reviewId, cardId: item.card.id, direction: item.direction, previous: rated.previous });
      answeredThisSession++;
      justShownCardId = item.card.id;
      if (rated.becameLeech) {
        showToast(
          `This one keeps slipping away: it has been forgotten ${LEECH_THRESHOLD} times. It’s now flagged for Claude to rewrite, and stays in your reviews meanwhile.`,
        );
      } else {
        hideToast();
      }
      await showNext('forward');
    } catch (error) {
      console.error(error);
      actions.prepend(h('p', { class: 'message is-error' }, 'That answer could not be saved. Please try again.'));
    } finally {
      busy = false;
    }
  }

  /** Takes back the most recent answer and shows that card again. Can be repeated to go further back. */
  async function undo(): Promise<void> {
    const step = undoSteps[undoSteps.length - 1];
    if (!step || busy) return;
    busy = true;
    try {
      await undoReview(step.reviewId, step.previous);
      undoSteps.pop();
      answeredThisSession = Math.max(0, answeredThisSession - 1);
      showAgain = step;
      justShownCardId = null;
      celebrated = false;
      stopConfetti?.();
      hideToast();
      await showNext('back');
    } catch (error) {
      console.error(error);
      // Nothing was changed. This answer can't be taken back, so stop offering it.
      undoSteps.length = 0;
      undoButton.hidden = true;
      showToast('That answer could not be undone. Nothing was changed.');
    } finally {
      busy = false;
    }
  }

  // Keyboard shortcuts, handy when testing on a computer: Space/Enter = show answer, 1–4 = rate, U = undo.
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return; // typing an answer, not giving a command
    if (event.key === ' ' || event.key === 'Enter') {
      if (current && !revealedAt) {
        event.preventDefault();
        reveal();
      }
    } else if (revealedAt && ['1', '2', '3', '4'].includes(event.key)) {
      void rate(Number(event.key) as Rating);
    } else if (event.key === 'u') {
      void undo();
    }
  };
  document.addEventListener('keydown', onKey);

  // If the app comes back into view while the "all done" message is showing
  // (say, the next morning), look again for cards to study.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !current && !busy && !timeUp) void showNext();
  };
  document.addEventListener('visibilitychange', onVisible);

  await showNext();

  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(tick);
    window.clearTimeout(toastTimer);
    stopConfetti?.();
    stopSpeaking();
    stopFitting();
  };
}

/** The panel above the answer that says how a typed answer compared. */
function checkResult(checks: AnswerCheck[]): HTMLElement {
  const result = overallResult(checks);
  const highlighted = (parts: TextPart[], className: string) =>
    parts.map((part) => (part.differs ? h('mark', { class: className }, part.text) : part.text));

  if (result === 'correct') {
    return h('div', { class: 'check-result is-correct' }, h('p', { class: 'check-title' }, 'Correct!'));
  }

  if (result === 'almost') {
    return h(
      'div',
      { class: 'check-result is-almost' },
      h('p', { class: 'check-title' }, 'Almost! Watch the accent:'),
      checks
        .filter((check) => check.result === 'almost')
        .map((check) => h('p', { class: 'check-answer', lang: 'es' }, highlighted(check.expectedParts, 'is-missed'))),
    );
  }

  return h(
    'div',
    { class: 'check-result is-wrong' },
    h('p', { class: 'check-title' }, 'Not quite.'),
    checks
      .filter((check) => check.result !== 'correct')
      .map((check) =>
        h(
          'dl',
          { class: 'check-compare', lang: 'es' },
          h('dt', { lang: 'en' }, 'You typed'),
          h('dd', null, check.typed ? highlighted(check.typedParts, 'is-extra') : h('em', { lang: 'en' }, 'nothing')),
          h('dt', { lang: 'en' }, 'Answer'),
          h('dd', null, highlighted(check.expectedParts, 'is-missed')),
        ),
      ),
  );
}
