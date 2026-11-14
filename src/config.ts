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

/** Streak lengths (in days) that are celebrated with confetti. */
export const STREAK_MILESTONES = [7, 30, 100, 365];

/**
 * One missed day is forgiven by a "streak freeze", but only if no freeze
 * was used in the days before: one freeze per this many days.
 */
export const STREAK_FREEZE_EVERY_DAYS = 7;

/** The daily goal when it is set to "a number of reviews". */
export const DEFAULT_GOAL_REVIEWS = 20;

/** On the Stats screen, a review card counts as "mature" once its interval reaches this many days. */
export const MATURE_INTERVAL_DAYS = 21;

/** Strengths and weaknesses ignore any tag or card type with fewer reviews than this. */
export const MIN_REVIEWS_FOR_AREA = 10;

/** How many days the strengths and weaknesses look back over. */
export const AREA_WINDOW_DAYS = 30;

/** How many days the weekly report for Claude covers. */
export const REPORT_DAYS = 7;

/** Time spent on a single card is counted up to this many seconds (so a phone left lying around doesn't skew the average). */
export const MAX_SECONDS_PER_CARD = 60;

/** Written into backup files so the app can recognise its own backups. */
export const APP_ID = 'spanish-cards';

/**
 * The version of the backup file layout that this app writes.
 * Older versions can still be restored (see src/data/backupFile.ts).
 *   1 = the first version
 *   2 = cards gained "paused", "leech", "flag" and "editedAt"; settings gained "soundsOn"
 *   3 = cards gained a second direction ("production"), "introducedAt" and "recognitionPaused";
 *       reviews gained "direction" and the typed answer; sprints were added; more settings
 *   4 = the capture log and the list of study days (for the streak) were added; goal settings
 */
export const BACKUP_FORMAT_VERSION = 4;

/** The version of the layout of the weekly report file made for Claude. */
export const REPORT_FORMAT_VERSION = 1;
