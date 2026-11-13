/** Home: what's waiting today, and the buttons that start a study session. */
import { QUICK_SESSION_MINUTES } from '../../config';
import { backupReminder } from '../../data/backupReminder';
import { countReviews } from '../../data/db';
import { onUpdateReady } from '../../pwa';
import { summarize } from '../../study/queue';
import { formatClockTime } from '../../study/time';
import { loadToday } from '../../study/today';
import { navigate, type Cleanup } from '../app';
import { count, h, setChildren } from '../dom';
import { updateBanner } from '../updateBanner';

export async function renderHome(root: HTMLElement): Promise<Cleanup> {
  let refreshTimer: number | undefined;

  async function draw(): Promise<void> {
    const now = new Date();
    const [today, reviewsEver] = await Promise.all([loadToday(now), countReviews()]);
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

    if (summary.totalCards === 0) {
      setChildren(
        root,
        header,
        updateBanner(),
        backupBanner,
        h(
          'section',
          { class: 'panel is-centered' },
          h('h2', null, 'No cards yet'),
          h('p', null, 'Import a file of cards to get started. There are 10 sample cards you can try, too.'),
          h('a', { class: 'button primary', href: '#/import' }, 'Import cards'),
        ),
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

  await draw();

  return () => {
    window.clearTimeout(refreshTimer);
    document.removeEventListener('visibilitychange', onVisible);
    stopListening();
  };
}

function statTile(value: number, label: string): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('div', { class: 'stat-value' }, value.toLocaleString()),
    h('div', { class: 'stat-label' }, label),
  );
}
