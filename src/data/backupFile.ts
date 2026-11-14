/**
 * Building and checking backup files. Pure logic: nothing here touches the database.
 * A backup holds everything: all cards (with their schedules), the full review
 * history, the sprints and the settings. See README.md for the format.
 */
import { APP_ID, BACKUP_FORMAT_VERSION, DESIRED_RETENTION, FSRS_VERSION } from '../config';
import { schedulingId } from '../study/directions';
import { isDate } from '../study/sprints';
import type {
  AnswerResult,
  CardFlag,
  ProductionProgress,
  ReviewRecord,
  SchedulingState,
  Settings,
  Sprint,
  StoredCard,
} from '../types';
import { checkCard, FileProblem, isObject, parseJson } from './cardFile';
import { addMissingCardFields, addMissingReviewFields, firstReviewTimes } from './cardUpgrade';
import type { EverythingSaved } from './db';

/** Backups written by any of these versions of the file layout can be restored. */
const READABLE_FORMAT_VERSIONS = [1, 2, 3];

/** The settings worth carrying to another phone. (Things about this device, like the last backup date, stay behind.) */
type SettingsInBackup = Pick<Settings, 'newCardsPerDay' | 'soundsOn' | 'autoPlayAudio' | 'speechSpeed' | 'typeAnswers'>;

export interface BackupFile {
  app: typeof APP_ID;
  formatVersion: number;
  exportedAt: string;
  /** For your information when analysing the data; not needed to restore. */
  scheduler: { algorithm: string; desiredRetention: number };
  settings: SettingsInBackup;
  sprints: Sprint[];
  cards: StoredCard[];
  reviews: ReviewRecord[];
}

export function buildBackup(data: EverythingSaved, now: Date): BackupFile {
  const { newCardsPerDay, soundsOn, autoPlayAudio, speechSpeed, typeAnswers } = data.settings;
  return {
    app: APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    scheduler: { algorithm: FSRS_VERSION, desiredRetention: DESIRED_RETENTION },
    settings: { newCardsPerDay, soundsOn, autoPlayAudio, speechSpeed, typeAnswers },
    sprints: data.sprints,
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
 *
 * `current` is this device's settings: anything the file doesn't say is kept as it is.
 */
export function parseBackup(text: string, current: Settings, now = new Date()): ParsedBackup {
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

  // Fields added in later format versions may be absent from older backups. They are filled in
  // by the same functions the database upgrade uses (see cardUpgrade.ts).
  const reviews = data.reviews.map((raw, index) => {
    const where = `Review ${index + 1} in the backup`;
    if (!isObject(raw)) throw new FileProblem(`${where} is damaged.`);
    const rating = checkNumber(raw.rating, where);
    if (![1, 2, 3, 4].includes(rating) || typeof raw.cardId !== 'string') {
      throw new FileProblem(`${where} is damaged.`);
    }
    return addMissingReviewFields({
      cardId: raw.cardId,
      direction: checkOptional(raw.direction, ['recognition', 'production'] as const, where),
      rating: rating as ReviewRecord['rating'],
      timestamp: checkDate(raw.timestamp, where),
      durationMs: checkNumber(raw.durationMs, where),
      typed: raw.typed == null ? undefined : checkText(raw.typed, where),
      typedResult:
        raw.typedResult == null
          ? undefined
          : checkOptional<AnswerResult>(raw.typedResult, ['correct', 'almost', 'wrong'], where),
      before: checkScheduling(raw.before, where),
      after: checkScheduling(raw.after, where),
    });
  });
  // Oldest first, so the history is stored in the order it happened.
  reviews.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const firstReviewedAt = firstReviewTimes(reviews);

  const cards = data.cards.map((raw, index) => {
    const where = `Card ${index + 1} in the backup`;
    const content = checkCard(raw);
    if (typeof content === 'string') throw new FileProblem(`${where}: ${content}`);
    const saved = raw as Record<string, unknown>;
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
        introducedAt:
          saved.introducedAt == null ? (saved.introducedAt as null | undefined) : checkDate(saved.introducedAt, where),
        recognitionPaused: checkOptional(saved.recognitionPaused, 'boolean', where),
        production:
          saved.production == null ? (saved.production as null | undefined) : checkProduction(saved.production, where),
      },
      now,
      firstReviewedAt.get(content.id) ?? null,
    );
    const productionId = card.production?.scheduling.cardId ?? schedulingId(card.id, 'production');
    if (card.scheduling.cardId !== card.id || productionId !== schedulingId(card.id, 'production')) {
      throw new FileProblem(`${where} is damaged.`);
    }
    return card;
  });
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new FileProblem('The backup contains the same card more than once.');
  }

  const sprints = (Array.isArray(data.sprints) ? data.sprints : []).map((raw, index) =>
    checkSprint(raw, `Sprint ${index + 1} in the backup`),
  );
  if (new Set(sprints.map((sprint) => sprint.id)).size !== sprints.length) {
    throw new FileProblem('The backup contains the same sprint more than once.');
  }

  const saved = isObject(data.settings) ? data.settings : {};
  const perDay = saved.newCardsPerDay;
  const settings: Settings = {
    ...current,
    newCardsPerDay: typeof perDay === 'number' && perDay >= 0 ? Math.floor(perDay) : current.newCardsPerDay,
    soundsOn: typeof saved.soundsOn === 'boolean' ? saved.soundsOn : current.soundsOn,
    autoPlayAudio: typeof saved.autoPlayAudio === 'boolean' ? saved.autoPlayAudio : current.autoPlayAudio,
    speechSpeed:
      saved.speechSpeed === 'slow' || saved.speechSpeed === 'normal' ? saved.speechSpeed : current.speechSpeed,
    typeAnswers: typeof saved.typeAnswers === 'boolean' ? saved.typeAnswers : current.typeAnswers,
    lastBackupAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
  };

  return { cards, reviews, sprints, settings, exportedAt: settings.lastBackupAt };
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

function checkProduction(raw: unknown, where: string): ProductionProgress {
  if (!isObject(raw) || typeof raw.paused !== 'boolean') throw new FileProblem(`${where} is damaged.`);
  return {
    scheduling: checkScheduling(raw.scheduling, where),
    paused: raw.paused,
    introducedAt: raw.introducedAt == null ? null : checkDate(raw.introducedAt, where),
  };
}

function checkFlag(raw: unknown, where: string): CardFlag {
  if (!isObject(raw) || typeof raw.reason !== 'string' || (raw.by !== 'you' && raw.by !== 'leech')) {
    throw new FileProblem(`${where} is damaged.`);
  }
  return { reason: raw.reason, flaggedAt: checkDate(raw.flaggedAt, where), by: raw.by };
}

function checkSprint(raw: unknown, where: string): Sprint {
  const damaged = new FileProblem(`${where} is damaged.`);
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') throw damaged;
  if (typeof raw.endDate !== 'string' || !isDate(raw.endDate)) throw damaged;
  if (!Array.isArray(raw.tags) || raw.tags.some((tag) => typeof tag !== 'string')) throw damaged;
  if (raw.variety !== 'latam' && raw.variety !== 'spain') throw damaged;
  return {
    id: raw.id,
    name: raw.name,
    endDate: raw.endDate,
    tags: raw.tags as string[],
    variety: raw.variety,
    createdAt: checkDate(raw.createdAt, where),
    finishedNoticeSeen: raw.finishedNoticeSeen === true,
  };
}

/** For fields that older backups don't have: missing is fine, but the wrong kind of value is not. */
function checkOptional(value: unknown, kind: 'boolean', where: string): boolean | undefined;
function checkOptional<Choice extends string>(
  value: unknown,
  kind: readonly Choice[],
  where: string,
): Choice | undefined;
function checkOptional(value: unknown, kind: 'boolean' | readonly string[], where: string): unknown {
  if (value === undefined) return undefined;
  const ok = kind === 'boolean' ? typeof value === 'boolean' : kind.includes(value as string);
  if (!ok) throw new FileProblem(`${where} is damaged.`);
  return value;
}

function checkText(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new FileProblem(`${where} is damaged.`);
  return value;
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
