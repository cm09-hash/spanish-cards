/** The daily goal and how far along it is today. Pure logic. */
import type { Settings } from '../types';
import type { Progress } from './queue';

export interface GoalProgress {
  /** How much is done, and how much the goal asks for. */
  done: number;
  target: number;
  /** From 0 (nothing yet) to 1 (goal reached). */
  fraction: number;
  met: boolean;
  /** One line for the Home screen, e.g. "9 of 15 cards done". */
  label: string;
}

/**
 * `progress` is how far through today's cards you are (see todaysProgress in queue.ts);
 * `reviewsToday` is how many answers you have given today.
 */
export function goalProgress(
  settings: Pick<Settings, 'goalKind' | 'goalReviews'>,
  progress: Progress,
  reviewsToday: number,
): GoalProgress {
  if (settings.goalKind === 'reviews') {
    const target = Math.max(1, settings.goalReviews);
    const done = Math.min(reviewsToday, target);
    const met = reviewsToday >= target;
    return {
      done,
      target,
      fraction: done / target,
      met,
      label: met ? `Goal reached: ${reviewsToday} reviews today` : `${reviewsToday} of ${target} reviews`,
    };
  }

  // "Finish everything": all due cards plus today's new cards.
  const { done, total } = progress;
  if (total === 0) {
    return { done: 0, target: 0, fraction: 1, met: true, label: 'Nothing is due today' };
  }
  const met = done >= total;
  return {
    done,
    target: total,
    fraction: done / total,
    met,
    label: met ? 'Goal reached: everything for today is done' : `${done} of ${total} cards done`,
  };
}
