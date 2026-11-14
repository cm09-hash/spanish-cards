/** Home: what's waiting today, and the buttons that start a study session. */
import { QUICK_SESSION_MINUTES } from '../../config';
import { backupReminder } from '../../data/backupReminder';
import { countReviews, saveSprint, updateSettings } from '../../data/db';
import { onUpdateReady } from '../../pwa';
import { asLocalDate } from '../../study/dates';
import { goalProgress } from '../../study/goal';
import { summarize, todaysProgress } from '../../study/queue';
import { daysLeftText, hasAnyTag, isActive } from '../../study/sprints';
import { daysText, type Streak } from '../../study/streak';
import { formatClockTime } from '../../study/time';
import { loadToday } from '../../study/today';
import type { Sprint, StoredCard } from '../../types';
import { navigate, type Cleanup } from '../app';
import { CAPTURES_CHANGED, countWaitingCaptures } from '../capture';
import { ring } from '../charts';
import { count, h, setChildren } from '../dom';
import { icon } from '../icons';
import { onVoicesChanged, VOICE_TIP, voiceStatus } from '../speech';
import { updateBanner } from '../updateBanner';

export async function renderHome(root: HTMLElement): Promise<Cleanup> {
  let refreshTimer: number | undefined;

  async function draw(): Promise<void> {
    const now = new Date();
    const [today, reviewsEver, waitingInLog] = await Promise.all([
      loadToday(now),
      countReviews(),
      countWaitingCaptures(),
    ]);
    const summary = summarize(today.cards, today.queueOptions);
    const reviewsOnly = summarize(today.cards, { ...today.queueOptions, reviewsOnly: true });

    const header = h(
      'header',
      { class: 'page-header' },
      h('h1', null, 'Spanish Cards'),
      h('p', { class: 'subtitle' }, '¡Hola!'),
    );

    const reminder = backupReminder(today.settings.lastBackupAt, reviewsEver, now);
    const backupBanner =
      reminder &&
      h(
        'div',
        { class: 'banner is-gentle' },
        h('span', null, reminder),
        h('button', { class: 'button small', onclick: () => navigate('backup') }, 'Back up'),
      );

    // A sprint that has just ended says so once, until you tap OK.
    const finishedNotices = today.sprints
      .filter((sprint) => !isActive(sprint, now) && !sprint.finishedNoticeSeen)
      .map((sprint) =>
        h(
          'div',
          { class: 'banner' },
          h('span', null, `Sprint finished: ${sprint.name}. Its cards stay in your deck as normal cards.`),
          h(
            'button',
            {
              class: 'button small',
              onclick: async () => {
                await saveSprint({ ...sprint, finishedNoticeSeen: true });
                await draw();
              },
            },
            'OK',
          ),
        ),
      );

    // No Spanish voice on this device: explain once how to get one.
    const voiceTip =
      voiceStatus() === 'none' &&
      !today.settings.voiceTipSeen &&
      h(
        'div',
        { class: 'message' },
        h('p', null, h('strong', null, 'No Spanish voice found, so cards can’t be read aloud yet.')),
        h('p', null, VOICE_TIP),
        h(
          'button',
          {
            class: 'button small',
            onclick: async () => {
              await updateSettings({ voiceTipSeen: true });
              await draw();
            },
          },
          'Got it',
        ),
      );

    const running = today.sprints
      .filter((sprint) => isActive(sprint, now))
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
    const sprintLinks = h(
      'section',
      { class: 'sprint-links' },
      running.map((sprint) => sprintLink(sprint, today.cards, now)),
      h(
        'a',
        { class: 'button small quiet', href: '#/sprints' },
        running.length > 0 ? 'All sprints ›' : 'Topic sprints ›',
      ),
      h(
        'a',
        { class: 'button small quiet', href: '#/log' },
        waitingInLog > 0 ? `Capture log (${waitingInLog} waiting) ›` : 'Capture log ›',
      ),
    );

    if (summary.totalCards === 0) {
      setChildren(
        root,
        header,
        updateBanner(),
        backupBanner,
        finishedNotices,
        voiceTip,
        h(
          'section',
          { class: 'panel is-centered' },
          h('h2', null, 'No cards yet'),
          h('p', null, 'Import a file of cards to get started. There are 10 sample cards you can try, too.'),
          h('a', { class: 'button primary', href: '#/import' }, 'Import cards'),
        ),
        sprintLinks,
      );
      return;
    }

    let status = '';
    if (!summary.canStudyNow) {
      status = summary.nextReadyAt
        ? `Nothing ready right now. Your next card is ready at ${formatClockTime(summary.nextReadyAt, now)}.`
        : 'All done for today. ¡Buen trabajo!';
    }

    setChildren(
      root,
      header,
      updateBanner(),
      backupBanner,
      finishedNotices,
      voiceTip,
      todayPanel(
        today.streak,
        goalProgress(
          today.settings,
          todaysProgress(today.cards, today.queueOptions, today.reviewedTodayKeys),
          today.reviewsToday,
        ),
      ),
      h(
        'section',
        { class: 'stats' },
        statTile(summary.dueToday, 'Due today'),
        statTile(summary.newLeft, 'New left today'),
      ),
      h(
        'button',
        { class: 'button primary big', disabled: !summary.canStudyNow, onclick: () => navigate('review') },
        'Study',
      ),
      h(
        'button',
        { class: 'button big two-line', disabled: !reviewsOnly.canStudyNow, onclick: () => navigate('quick') },
        h('span', null, `Quick ${QUICK_SESSION_MINUTES}`),
        h('span', { class: 'button-detail' }, `${QUICK_SESSION_MINUTES} minutes · due reviews only`),
      ),
      status && h('p', { class: 'status' }, status),
      sprintLinks,
      h(
        'p',
        { class: 'footnote' },
        `${count(today.reviewsToday, 'review')} today · ${count(summary.totalCards, 'card')} in total`,
      ),
    );

    // If we're waiting for a card, redraw at the moment it becomes ready.
    window.clearTimeout(refreshTimer);
    if (summary.nextReadyAt) {
      const wait = summary.nextReadyAt.getTime() - now.getTime();
      refreshTimer = window.setTimeout(() => void draw(), Math.min(Math.max(wait, 1000), 60 * 60 * 1000));
    }
  }

  // The app can sit in the background overnight, so recount whenever it comes back into view.
  const onVisible = () => {
    if (document.visibilityState === 'visible') void draw();
  };
  document.addEventListener('visibilitychange', onVisible);
  const stopListening = onUpdateReady(() => void draw());
  const stopWatchingVoices = onVoicesChanged(() => void draw());
  const onLogChange = () => void draw();
  window.addEventListener(CAPTURES_CHANGED, onLogChange);

  await draw();

  return () => {
    window.clearTimeout(refreshTimer);
    document.removeEventListener('visibilitychange', onVisible);
    stopListening();
    stopWatchingVoices();
    window.removeEventListener(CAPTURES_CHANGED, onLogChange);
  };
}

/** The streak, and a ring showing how far along today's goal is. Tapping it opens Stats. */
function todayPanel(streak: Streak, goal: ReturnType<typeof goalProgress>): HTMLElement {
  const day = (date: string) =>
    asLocalDate(date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  let streakText = 'No streak yet. Study today to start one.';
  if (streak.current > 0) {
    streakText = `${daysText(streak.current)} in a row`;
    if (!streak.studiedToday) streakText += ' · study today to keep it';
  }

  // The freeze: one missed day is forgiven, once every 7 days.
  let freezeText = '';
  const lastFreeze = streak.freezesUsed.at(-1);
  if (streak.current > 0) {
    if (streak.nextFreezeOn && lastFreeze) {
      freezeText = `Streak freeze used ${day(lastFreeze)} · next one from ${day(streak.nextFreezeOn)}`;
    } else {
      freezeText = 'Streak freeze ready: one missed day is forgiven';
    }
  }

  return h(
    'a',
    { class: 'today-panel', href: '#/stats' },
    ring(goal.fraction, goal.met ? '✓' : `${Math.round(goal.fraction * 100)}%`, `Today’s goal: ${goal.label}`),
    h(
      'div',
      { class: 'today-text' },
      h(
        'div',
        { class: `streak-line with-flame ${streak.current > 0 && streak.studiedToday ? 'is-lit' : ''}` },
        icon('flame'),
        h('span', null, streakText),
      ),
      h('div', { class: 'goal-line' }, goal.label),
      freezeText && h('div', { class: 'freeze-line' }, freezeText),
    ),
  );
}

function statTile(value: number, label: string): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('div', { class: 'stat-value' }, value.toLocaleString()),
    h('div', { class: 'stat-label' }, label),
  );
}

/** One running sprint: its name, how long it has left and how many of its cards are still new. */
function sprintLink(sprint: Sprint, cards: StoredCard[], now: Date): HTMLElement {
  const stillNew = cards.filter(
    (card) => hasAnyTag(card, sprint.tags) && card.scheduling.state === 0 && !card.paused,
  ).length;
  return h(
    'a',
    { class: 'sprint-link', href: '#/sprints' },
    h('span', { class: 'sprint-link-label' }, 'Sprint'),
    h('span', { class: 'sprint-link-name' }, sprint.name),
    h('span', { class: 'sprint-link-detail' }, `${daysLeftText(sprint, now)} · ${count(stillNew, 'new card')} to go`),
  );
}
