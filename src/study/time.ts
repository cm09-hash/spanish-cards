/** Small helpers for days, times and "comes back in…" labels. */
import { DAY_START_HOUR } from '../config';

/** The moment the current study day began (the most recent 4:00 am). */
export function startOfStudyDay(now: Date): Date {
  const start = new Date(now);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return start;
}

/** The moment the current study day ends (the next 4:00 am). */
export function endOfStudyDay(now: Date): Date {
  const end = startOfStudyDay(now);
  end.setDate(end.getDate() + 1);
  return end;
}

/** Short label for the gap between two moments: "<1m", "10m", "14h", "2.5d", "1.9mo", "1.4y". */
export function formatInterval(from: Date, to: Date): string {
  const minutes = (to.getTime() - from.getTime()) / 60_000;
  if (minutes < 1) return '<1m';
  if (Math.round(minutes) < 60) return `${Math.round(minutes)}m`;

  const hours = minutes / 60;
  if (Math.round(hours) < 24) return `${Math.round(hours)}h`;

  const days = hours / 24;
  if (days < 10) return `${oneDecimal(days)}d`;
  if (Math.round(days) < 30) return `${Math.round(days)}d`;

  const months = days / 30.44;
  if (oneDecimal(months) < 12) return `${oneDecimal(months)}mo`;

  return `${oneDecimal(days / 365.25)}y`;
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "10:14 pm", or "tomorrow at 9:05 am" / "Mon 3 at 9:05 am" when it isn't today. */
export function formatClockTime(when: Date, now: Date): string {
  const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (when.toDateString() === now.toDateString()) return time;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (when.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;

  const day = when.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

/** "13 Nov 2026" */
export function formatDate(when: Date): string {
  return when.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "13 Nov 2026, 9:30 am" */
export function formatDateTime(when: Date): string {
  return when.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
