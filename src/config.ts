/**
 * App-wide constants. If you want to tweak how the app behaves,
 * this is the first place to look.
 */

/** FSRS aims for you to remember this share of cards when they come up for review. */
export const DESIRED_RETENTION = 0.9;

/** Which FSRS model ts-fsrs uses. Changing this later needs a migration of saved cards. */
export const FSRS_VERSION = 'FSRS-7';

/** How many brand-new cards are introduced per day (changeable on the Settings screen). */
export const DEFAULT_NEW_CARDS_PER_DAY = 15;

/**
 * A new "study day" starts at this hour (4 = 4:00 am), not at midnight,
 * so a late-night session still counts towards the same day.
 */
export const DAY_START_HOUR = 4;

/**
 * When nothing else is left to study, cards that are due within this many
 * minutes are shown straight away instead of making you wait.
 */
export const LEARN_AHEAD_MINUTES = 20;

/**
 * A card that has been forgotten this many times (rated "Again" after it had
 * been learned) is marked as a "leech" and flagged for Claude to rewrite.
 */
export const LEECH_THRESHOLD = 6;

/** Length of a "Quick 5" session, in minutes. */
export const QUICK_SESSION_MINUTES = 5;

/** Home shows a reminder when the last backup is older than this many days. */
export const BACKUP_REMINDER_DAYS = 7;

/**
 * Vocab and phrase cards are studied in two directions. The second one
 * (English → Spanish) is only introduced this many days after the first.
 */
export const PRODUCTION_DELAY_DAYS = 3;

/**
 * During a topic sprint, sprint cards are introduced first, but at least this share
 * of each day's new cards (0.4 = 40%) still comes from the normal, non-sprint cards.
 */
export const SPRINT_NORMAL_SHARE = 0.4;

/** Speech speed for the "slow" setting (1 = the voice's normal speed). */
export const SLOW_SPEECH_RATE = 0.7;

/** Written into backup files so the app can recognise its own backups. */
export const APP_ID = 'spanish-cards';

/**
 * The version of the backup file layout that this app writes.
 * Older versions can still be restored (see src/data/backupFile.ts).
 *   1 = the first version
 *   2 = cards gained "paused", "leech", "flag" and "editedAt"; settings gained "soundsOn"
 *   3 = cards gained a second direction ("production"), "introducedAt" and "recognitionPaused";
 *       reviews gained "direction" and the typed answer; sprints were added; more settings
 */
export const BACKUP_FORMAT_VERSION = 3;
