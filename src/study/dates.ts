/**
 * Working with days written as text, like "2026-11-21".
 * (Text dates sort correctly and mean the same in every time zone.)
 */
import { startOfStudyDay } from './time';

/** The study day a moment belongs to, as "2026-11-21". (A study day starts at 4 am.) */
export function studyDate(moment: Date): string {
  const day = startOfStudyDay(moment);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Is this text a real date written like "2026-11-21"? */
export function isDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** A date as a plain count of days, so that dates can be subtracted. */
function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** How many days from `from` to `to`. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The date `days` days after `date` (or before, if negative). */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Every date from `first` to `last`, both included. */
export function dateRange(first: string, last: string): string[] {
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** A date at midday local time, for showing it on screen. (Midday, so no time zone can push it onto another day.) */
export function asLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}
