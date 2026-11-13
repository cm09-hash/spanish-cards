/** Decides whether Home should nudge you to save a backup. Pure logic. */
import { BACKUP_REMINDER_DAYS } from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the reminder to show, or null if no reminder is needed:
 *  - you have never saved a backup and have done at least one review, or
 *  - your last backup is more than BACKUP_REMINDER_DAYS days old.
 */
export function backupReminder(lastBackupAt: string | null, reviewCount: number, now: Date): string | null {
  if (lastBackupAt === null) {
    return reviewCount > 0 ? 'You haven’t saved a backup of your progress yet.' : null;
  }
  const daysAgo = (now.getTime() - new Date(lastBackupAt).getTime()) / DAY_MS;
  return daysAgo > BACKUP_REMINDER_DAYS ? `Your last backup was ${Math.floor(daysAgo)} days ago.` : null;
}
