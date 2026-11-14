/** Stats: how the studying is going, in a handful of simple charts. */
import { AREA_WINDOW_DAYS, MATURE_INTERVAL_DAYS, MIN_REVIEWS_FOR_AREA } from '../../config';
import { getAllCards, getAllReviews, getStudyDays } from '../../data/db';
import { asLocalDate, daysBetween, studyDate } from '../../study/dates';
import {
  areaStats,
  areaWindowStart,
  averageSeconds,
  byId,
  cardCounts,
  forecast,
  learnedOverTime,
  percent,
  retention,
  retentionByDirection,
  reviewsPerDay,
  reviewsSince,
  strongestAndWeakest,
  TYPE_NAMES,
  windowStart,
  type Area,
  type Retention,
  type StageCounts,
} from '../../study/stats';
import { computeStreak, daysText } from '../../study/streak';
import type { CardType } from '../../types';
import { navigate } from '../app';
import { barChart, lineChart, meter, stackedBar } from '../charts';
import { count, h, setChildren } from '../dom';
import { icon } from '../icons';
import { showCardsWith } from './cards';

const shortDate = (date: string) => asLocalDate(date).toLocaleDateString([], { month: 'short', day: 'numeric' });

export async function renderStats(root: HTMLElement): Promise<void> {
  const now = new Date();
  const [cards, reviews, studyDays] = await Promise.all([getAllCards(), getAllReviews(), getStudyDays()]);
  const header = h('header', { class: 'page-header' }, h('h1', null, 'Stats'));

  if (reviews.length === 0) {
    setChildren(
      root,
      header,
      h(
        'section',
        { class: 'panel is-centered' },
        h('h2', null, 'Nothing to show yet'),
        h('p', null, 'Your charts appear here as soon as you have studied a few cards.'),
        h('a', { class: 'button primary', href: '#/home' }, 'Go to Home'),
      ),
    );
    return;
  }

  const today = studyDate(now);
  const cardsById = byId(cards);
  const last7 = reviewsSince(reviews, windowStart(now, 7));
  const last30 = reviewsSince(reviews, windowStart(now, 30));
  const streak = computeStreak(
    studyDays.map((day) => day.date),
    today,
  );

  // ----- Headline numbers -----

  const seconds = averageSeconds(last30);
  const headline = h(
    'section',
    { class: 'stat-grid' },
    tile(
      h('span', { class: 'with-flame' }, icon('flame'), String(streak.current)),
      'day streak',
      `Longest: ${daysText(streak.longest)}`,
    ),
    retentionTile(retention(last7), 'Remembered, last 7 days'),
    retentionTile(retention(last30), 'Remembered, last 30 days'),
    tile(seconds === null ? '–' : `${seconds.toFixed(1)}s`, 'Average per card', 'Last 30 days'),
  );

  // ----- Reviews per day -----

  const perDay = reviewsPerDay(studyDays, now, 30);
  const total30 = perDay.reduce((sum, day) => sum + day.reviews, 0);
  const daysStudied = perDay.filter((day) => day.reviews > 0).length;
  const reviewsPanel = panel(
    'Reviews per day',
    `${count(total30, 'review')} on ${count(daysStudied, 'day')} out of the last 30.`,
    barChart(
      perDay.map((day) => ({
        value: day.reviews,
        title: `${shortDate(day.date)}: ${count(day.reviews, 'review')}`,
        highlight: day.date === today,
      })),
      {
        description: `Reviews on each of the last 30 days. Busiest day: ${Math.max(...perDay.map((day) => day.reviews))}.`,
        axis: [shortDate(perDay[0].date), `Busiest day: ${Math.max(...perDay.map((day) => day.reviews))}`, 'Today'],
      },
    ),
  );

  // ----- Cards learned over time -----

  const learned = learnedOverTime(reviews);
  const learnedTotal = learned.at(-1)?.total ?? 0;
  // The chart starts on the first day anything happened.
  const firstDay = [studyDays[0]?.date, learned[0]?.date, today].filter((date) => date !== undefined).sort()[0];
  const span = Math.max(1, daysBetween(firstDay, today));
  const learnedPanel = panel(
    'Cards learned',
    learnedTotal === 0
      ? 'A card counts as learned once it has left the learning steps. Yours are on their way.'
      : `${count(learnedTotal, 'card')} learned so far. A card counts once it has left the learning steps.`,
    lineChart(
      learned.map((point) => ({
        position: Math.min(1, Math.max(0, daysBetween(firstDay, point.date) / span)),
        value: point.total,
      })),
      {
        description: `Cards learned over time, from 0 on ${shortDate(firstDay)} to ${learnedTotal} today.`,
        axis: [shortDate(firstDay), 'Today'],
      },
    ),
  );

  // ----- Card counts -----

  const counts = cardCounts(cards);
  const stages = (stage: StageCounts) => [
    { label: 'New', value: stage.new, tone: 'new' },
    { label: 'Learning', value: stage.learning, tone: 'learning' },
    { label: `Young (under ${MATURE_INTERVAL_DAYS} days)`, value: stage.young, tone: 'young' },
    { label: `Mature (${MATURE_INTERVAL_DAYS}+ days)`, value: stage.mature, tone: 'mature' },
  ];
  const countsPanel = panel(
    'Your cards',
    `${count(counts.total, 'card')} in total. “Young” and “mature” say how long a learned card now stays away between reviews.`,
    stackedBar(stages(counts.cards), 'All cards by stage'),
    counts.productionTotal > 0 && h('h3', null, 'English → Spanish sides'),
    counts.productionTotal > 0 && stackedBar(stages(counts.production), 'English to Spanish sides by stage'),
    h(
      'p',
      { class: 'footnote is-left' },
      `Paused: ${counts.paused} · Leeches: ${counts.leeches}`,
      counts.leeches > 0 && ' (cards that keep slipping; they are flagged for Claude)',
    ),
  );

  // ----- Forecast -----

  const coming = forecast(cards, now, 14);
  const comingTotal = coming.reduce((sum, day) => sum + day.due, 0);
  const forecastPanel = panel(
    'Coming up',
    `${count(comingTotal, 'review')} due over the next 14 days, not counting new cards.`,
    barChart(
      coming.map((day, index) => ({
        value: day.due,
        title: `${index === 0 ? 'Today' : shortDate(day.date)}: ${count(day.due, 'review')} due`,
        highlight: index === 0,
      })),
      {
        description: 'Reviews due on each of the next 14 days.',
        axis: ['Today', shortDate(coming[7].date), shortDate(coming[13].date)],
        showValues: true,
      },
    ),
  );

  // ----- Recognition and production -----

  const directions = retentionByDirection(last30, cardsById);
  const directionRow = (name: string, detail: string, stat: Retention, tone: string) =>
    h(
      'div',
      { class: 'meter-row' },
      h('div', { class: 'meter-label' }, h('span', null, name), h('strong', null, percent(stat.rate))),
      meter(stat.rate, tone),
      h(
        'p',
        { class: 'footnote is-left' },
        stat.reviews === 0
          ? `${detail} No reviews of learned cards yet.`
          : `${detail} ${stat.remembered} of ${stat.reviews} remembered.`,
      ),
    );
  const directionPanel = panel(
    'Understanding and speaking',
    'How well vocab and phrase cards stick in each direction, over the last 30 days. English → Spanish is the harder one, and the one that builds speaking confidence.',
    directionRow('Spanish → English', 'Understanding.', directions.recognition, 'young'),
    directionRow('English → Spanish', 'Producing it yourself.', directions.production, 'mature'),
  );

  // ----- Strengths and weaknesses -----

  const areas = areaStats(reviewsSince(reviews, areaWindowStart(now)), cardsById);
  const { strongest, weakest } = strongestAndWeakest(areas);
  const areaName = (area: Area) => (area.kind === 'type' ? TYPE_NAMES[area.name as CardType] : area.name);
  const openArea = (area: Area) => () =>
    showCardsWith(area.kind === 'type' ? { type: area.name as CardType } : { tag: area.name });
  const areaButton = (area: Area) =>
    h(
      'button',
      { class: 'area', onclick: openArea(area) },
      h('span', { class: 'area-kind' }, area.kind === 'type' ? 'Type' : 'Tag'),
      h('span', { class: 'area-name' }, areaName(area)),
      h('strong', { class: 'area-rate' }, percent(area.rate)),
      h('span', { class: 'area-detail' }, `${count(area.reviews, 'review')} · ${timesForgotten(area.lapses)}`),
    );
  const areaTable = (kind: Area['kind'], title: string) => {
    const rows = areas.filter((area) => area.kind === kind);
    if (rows.length === 0) return null;
    return h(
      'table',
      { class: 'area-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, title),
          h('th', { scope: 'col' }, 'Reviews'),
          h('th', { scope: 'col' }, 'Remembered'),
          h('th', { scope: 'col' }, 'Forgotten'),
        ),
      ),
      h(
        'tbody',
        null,
        rows.map((area) =>
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, h('button', { class: 'link', onclick: openArea(area) }, areaName(area))),
            h('td', null, area.reviews),
            h('td', null, percent(area.rate)),
            h('td', null, area.lapses),
          ),
        ),
      ),
    );
  };
  const nothingRanked = strongest.length === 0 && weakest.length === 0;
  const areasPanel = panel(
    'Strengths and weaknesses',
    `By tag and by type of card, from reviews of learned cards in the last ${AREA_WINDOW_DAYS} days. Tap one to see its cards.`,
    nothingRanked &&
      h(
        'p',
        { class: 'message' },
        `Not enough to go on yet. A tag or type is ranked once it has ${MIN_REVIEWS_FOR_AREA} reviews of cards you had already learned.`,
      ),
    strongest.length > 0 && h('h3', null, 'Strongest'),
    strongest.length > 0 && h('div', { class: 'areas is-strong' }, strongest.map(areaButton)),
    weakest.length > 0 && h('h3', null, 'Needs the most work'),
    weakest.length > 0 && h('div', { class: 'areas is-weak' }, weakest.map(areaButton)),
    areas.length > 0 &&
      h(
        'details',
        { class: 'all-areas' },
        h('summary', null, 'Every type and tag'),
        areaTable('type', 'Type'),
        areaTable('tag', 'Tag'),
      ),
  );

  setChildren(
    root,
    header,
    headline,
    reviewsPanel,
    learnedPanel,
    directionPanel,
    areasPanel,
    forecastPanel,
    countsPanel,
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Weekly report for Claude'),
      h(
        'p',
        null,
        'One small file with these numbers, your flagged cards and your capture log, ready to hand to Claude for your next batch of cards.',
      ),
      h('button', { class: 'button', onclick: () => navigate('log') }, 'Go to the report'),
    ),
  );
}

function timesForgotten(lapses: number): string {
  if (lapses === 0) return 'never forgotten';
  return lapses === 1 ? 'forgotten once' : `forgotten ${lapses} times`;
}

function panel(title: string, text: string, ...content: (HTMLElement | null | false)[]): HTMLElement {
  return h('section', { class: 'panel stats-panel' }, h('h2', null, title), h('p', null, text), content);
}

function tile(value: HTMLElement | string, label: string, detail: string): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('div', { class: 'stat-value is-smaller' }, value),
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-detail' }, detail),
  );
}

function retentionTile(stat: Retention, label: string): HTMLElement {
  return tile(
    percent(stat.rate),
    label,
    stat.reviews === 0 ? 'No learned cards reviewed yet' : `${stat.remembered} of ${count(stat.reviews, 'review')}`,
  );
}
