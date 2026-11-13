/**
 * The only file that talks to ts-fsrs. Everything else asks this file
 * "what happens to this card for each rating?" and saves the answer.
 */
import { DefaultScheduler, type DefaultSchedulerCard } from 'ts-fsrs';
import { DESIRED_RETENTION, FSRS_VERSION } from '../config';
import type { Rating, SchedulingState } from '../types';

type FsrsCard = DefaultSchedulerCard<typeof FSRS_VERSION>;
type Scheduler = Awaited<ReturnType<typeof createScheduler>>;

const RATINGS: readonly Rating[] = [1, 2, 3, 4];

function createScheduler() {
  return DefaultScheduler({
    version: FSRS_VERSION,
    desiredRetention: DESIRED_RETENTION,
    // Nudges longer intervals by a small amount so cards learned together
    // don't all come back on the same day.
    enableFuzz: true,
  });
}

let schedulerPromise: Promise<Scheduler> | undefined;
let scheduler: Scheduler | undefined;

/** Loads the scheduler. Must have finished before the other functions are used. */
export async function initScheduler(): Promise<void> {
  schedulerPromise ??= createScheduler();
  scheduler = await schedulerPromise;
}

function getScheduler(): Scheduler {
  if (!scheduler) throw new Error('The scheduler is not ready yet (initScheduler has not finished).');
  return scheduler;
}

/** The state of a card that has never been studied. */
export function newSchedulingState(cardId: string, now: Date): SchedulingState {
  return toSaved(getScheduler().newCard({ now, cardId }));
}

export interface RatingOutcome {
  rating: Rating;
  /** What the card's state becomes if this rating is chosen. */
  after: SchedulingState;
}

/**
 * Works out, for each of the four ratings, what the card's new state would be
 * if it were reviewed at `now`. Returned in button order: Again, Hard, Good, Easy.
 */
export function previewRatings(before: SchedulingState, now: Date): RatingOutcome[] {
  const fsrs = getScheduler();
  const card = toFsrs(before);
  return RATINGS.map((rating) => ({
    rating,
    after: toSaved(fsrs.review({ card, grade: rating, now }).card),
  }));
}

/** Saved form (dates as text) → the form ts-fsrs works with (real Date objects). */
function toFsrs(saved: SchedulingState): FsrsCard {
  return {
    ...saved,
    dueAt: new Date(saved.dueAt),
    lastReviewAt: saved.lastReviewAt ? new Date(saved.lastReviewAt) : null,
  };
}

/** The ts-fsrs form → the saved form. Fields are listed one by one so nothing unexpected is saved. */
function toSaved(card: FsrsCard): SchedulingState {
  return {
    cardId: String(card.cardId),
    state: card.state,
    scheduleStatus: card.scheduleStatus,
    dueAt: card.dueAt.toISOString(),
    lastReviewAt: card.lastReviewAt ? card.lastReviewAt.toISOString() : null,
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
  };
}
