import { describe, expect, it } from 'vitest';
import { backupReminder } from '../src/data/backupReminder';

const now = new Date('2026-06-20T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe('backupReminder', () => {
  it('says nothing before you have done any reviews', () => {
    expect(backupReminder(null, 0, now)).toBeNull();
  });

  it('reminds you once you have progress but have never saved a backup', () => {
    expect(backupReminder(null, 1, now)).toMatch(/haven’t saved a backup/);
  });

  it('says nothing while the last backup is recent', () => {
    expect(backupReminder(daysAgo(0), 50, now)).toBeNull();
    expect(backupReminder(daysAgo(6.9), 50, now)).toBeNull();
  });

  it('reminds you when the last backup is more than 7 days old', () => {
    expect(backupReminder(daysAgo(7.1), 50, now)).toBe('Your last backup was 7 days ago.');
    expect(backupReminder(daysAgo(12), 50, now)).toBe('Your last backup was 12 days ago.');
  });
});
