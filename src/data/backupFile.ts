/**
 * Building and checking backup files. Pure logic: nothing here touches the database.
 * A backup holds everything: all cards (with their schedules), the full review
 * history and the settings. See README.md for the format.
 */
import { APP_ID, BACKUP_FORMAT_VERSION, DESIRED_RETENTION, FSRS_VERSION } from '../config';
import type { CardFlag, ReviewRecord, SchedulingState, Settings, StoredCard } from '../types';
import { checkCard, FileProblem, isObject, parseJson } from './cardFile';
import { addMissingCardFields } from './cardUpgrade';
import type { EverythingSaved } from './db';

/** Backups written by any of these versions of the file layout can be restored. */
const READABLE_FORMAT_VERSIONS = [1, 2];

export interface BackupFile {
  app: typeof APP_ID;
  formatVersion: number;
  exportedAt: string;
  /** For your information when analysing the data; not needed to restore. */
  scheduler: { algorithm: string; desiredRetention: number };
  settings: { newCardsPerDay: number; soundsOn: boolean };
  cards: StoredCard[];
  reviews: ReviewRecord[];
}

export function buildBackup(data: EverythingSaved, now: Date): BackupFile {
  return {
    app: APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    scheduler: { algorithm: FSRS_VERSION, desiredRetention: DESIRED_RETENTION },
    settings: { newCardsPerDay: data.settings.newCardsPerDay, soundsOn: data.settings.soundsOn },
    cards: data.cards,
    // Written with the id first, simply because that is easier to read.
    reviews: data.reviews.map(({ id, ...rest }) => ({ id, ...rest })),
  };
}

/** e.g. "spanish-cards-backup-2026-11-13.json" (the date is your local date). */
export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${APP_ID}-backup-${date}.json`;
}

export interface ParsedBackup extends EverythingSaved {
  exportedAt: string | null;
}

/**
 * Checks a backup file from top to bottom before anything is restored,
 * so a damaged or wrong file can never wipe out good data.
 * Backups from older versions of the app are brought up to date on the way in.
 * Throws a FileProblem with a message fit to show the user.
 */
export function parseBackup(text: string, defaults: Settings, now = new Date()): ParsedBackup {
  const data = parseJson(text);

  if (!isObject(data) || data.app !== APP_ID || !Array.isArray(data.cards) || !Array.isArray(data.reviews)) {
    throw new FileProblem(
      "This isn't a Spanish Cards backup file. (To add new cards from a file, use the Import screen instead.)",
    );
  }
  if (!READABLE_FORMAT_VERSIONS.includes(data.formatVersion as number)) {
    throw new FileProblem(
      'This backup was made by a newer version of the app and can’t be read by this one. Update the app (Settings → Check for updates) and try again.',
    );
  }

  const cards = data.cards.map((raw, index) => {
    const where = `Card ${index + 1} in the backup`;
    const content = checkCard(raw);
    if (typeof content === 'string') throw new FileProblem(`${where}: ${content}`);
    const saved = raw as Record<string, unknown>;
    // Fields added in format version 2 may be absent (version 1 backups don't have them);
    // addMissingCardFields then fills them in exactly as the database upgrade does.
    const card = addMissingCardFields(
      {
        ...content,
        addedAt: checkDate(saved.addedAt, where),
        position: checkNumber(saved.position, where),
        scheduling: checkScheduling(saved.scheduling, where),
        paused: checkOptional(saved.paused, 'boolean', where),
        leech: checkOptional(saved.leech, 'boolean', where),
        flag: saved.flag == null ? (saved.flag as null | undefined) : checkFlag(saved.flag, where),
        editedAt: saved.editedAt == null ? (saved.editedAt as null | undefined) : checkDate(saved.editedAt, where),
      },
      now,
    );
    if (card.scheduling.cardId !== card.id) throw new FileProblem(`${where} is damaged.`);
    return card;
  });
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new FileProblem('The backup contains the same card more than once.');
  }

  const reviews = data.reviews.map((raw, index) => {
    const where = `Review ${index + 1} in the backup`;
    if (!isObject(raw)) throw new FileProblem(`${where} is damaged.`);
    const rating = checkNumber(raw.rating, where);
    if (![1, 2, 3, 4].includes(rating) || typeof raw.cardId !== 'string') {
      throw new FileProblem(`${where} is damaged.`);
    }
    const review: ReviewRecord = {
      cardId: raw.cardId,
      rating: rating as ReviewRecord['rating'],
      timestamp: checkDate(raw.timestamp, where),
      durationMs: checkNumber(raw.durationMs, where),
      before: checkScheduling(raw.before, where),
      after: checkScheduling(raw.after, where),
    };
    return review;
  });
  // Oldest first, so the history is stored in the order it happened.
  reviews.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const savedSettings = isObject(data.settings) ? data.settings : {};
  const perDay = savedSettings.newCardsPerDay;
  const settings: Settings = {
    newCardsPerDay: typeof perDay === 'number' && perDay >= 0 ? Math.floor(perDay) : defaults.newCardsPerDay,
    soundsOn: typeof savedSettings.soundsOn === 'boolean' ? savedSettings.soundsOn : defaults.soundsOn,
    lastBackupAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
  };

  return { cards, reviews, settings, exportedAt: settings.lastBackupAt };
}

function checkScheduling(raw: unknown, where: string): SchedulingState {
  if (!isObject(raw) || typeof raw.cardId !== 'string') throw new FileProblem(`${where} is damaged.`);
  const state = checkNumber(raw.state, where);
  const status = raw.scheduleStatus;
  if (![0, 1, 2, 3].includes(state) || (status !== 'new' && status !== 'learning' && status !== 'review')) {
    throw new FileProblem(`${where} is damaged.`);
  }
  return {
    cardId: raw.cardId,
    state: state as SchedulingState['state'],
    scheduleStatus: status,
    dueAt: checkDate(raw.dueAt, where),
    lastReviewAt: raw.lastReviewAt == null ? null : checkDate(raw.lastReviewAt, where),
    stability: checkNumber(raw.stability, where),
    stabilityFast: checkNumber(raw.stabilityFast, where),
    difficulty: checkNumber(raw.difficulty, where),
    scheduledDays: checkNumber(raw.scheduledDays, where),
    learningStep: checkNumber(raw.learningStep, where),
    reps: checkNumber(raw.reps, where),
    lapses: checkNumber(raw.lapses, where),
  };
}

function checkFlag(raw: unknown, where: string): CardFlag {
  if (!isObject(raw) || typeof raw.reason !== 'string' || (raw.by !== 'you' && raw.by !== 'leech')) {
    throw new FileProblem(`${where} is damaged.`);
  }
  return { reason: raw.reason, flaggedAt: checkDate(raw.flaggedAt, where), by: raw.by };
}

/** For fields that older backups don't have: missing is fine, but the wrong kind of value is not. */
function checkOptional(value: unknown, kind: 'boolean', where: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== kind) throw new FileProblem(`${where} is damaged.`);
  return value as boolean;
}

function checkNumber(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new FileProblem(`${where} is damaged.`);
  return value;
}

/** Dates must be readable; they are re-written in the one standard form the app uses. */
function checkDate(value: unknown, where: string): string {
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new FileProblem(`${where} is damaged.`);
  return date.toISOString();
}
