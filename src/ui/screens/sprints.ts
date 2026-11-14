/** Sprints: short, time-boxed focuses on a topic. Create, change, end and delete them here. */
import { getAllCards, getSprints, saveSprint, deleteSprint } from '../../data/db';
import { newId } from '../../data/importCards';
import { allTags, parseTags } from '../../study/cardFilter';
import { itemsOf } from '../../study/directions';
import { daysLeftText, hasAnyTag, isActive, isDate, studyDate } from '../../study/sprints';
import { formatDate } from '../../study/time';
import type { Sprint, StoredCard, Variety } from '../../types';
import { count, h, setChildren } from '../dom';

const VARIETY_NAMES: Record<Variety, string> = { latam: 'Latin American Spanish', spain: 'Spain Spanish' };

/** "2026-11-21" → a date at midday local time (midday, so no time zone can push it onto another day). */
function asLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

/** The date `days` days after today, written like "2026-11-21". */
function dateFromToday(days: number, now: Date): string {
  const date = asLocalDate(studyDate(now));
  date.setDate(date.getDate() + days);
  return studyDate(date);
}

export async function renderSprints(root: HTMLElement): Promise<void> {
  const backLink = h('a', { class: 'button small quiet back-link', href: '#/home' }, '‹ Home');

  async function draw(notice?: string): Promise<void> {
    const [sprints, cards] = await Promise.all([getSprints(), getAllCards()]);
    const now = new Date();
    const running = sprints
      .filter((sprint) => isActive(sprint, now))
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
    const finished = sprints
      .filter((sprint) => !isActive(sprint, now))
      .sort((a, b) => b.endDate.localeCompare(a.endDate));

    /** Runs a change, then redraws the list with a confirmation. */
    const change = (work: () => Promise<void>, done: string) => async () => {
      await work();
      await draw(done);
    };

    function sprintPanel(sprint: Sprint): HTMLElement {
      const running = isActive(sprint, now);
      const inSprint = cards.filter((card) => hasAnyTag(card, sprint.tags));
      const stillNew = inSprint.filter((card) => card.scheduling.state === 0).length;
      const question = h('div', { class: 'result' });

      const askDelete = () =>
        setChildren(
          question,
          h(
            'div',
            { class: 'message is-warning' },
            h('p', null, 'Delete this sprint? Its cards stay in your deck as normal cards.'),
            h(
              'div',
              { class: 'button-row' },
              h(
                'button',
                {
                  class: 'button danger',
                  onclick: change(() => deleteSprint(sprint.id), 'Sprint deleted. Its cards are still in your deck.'),
                },
                'Delete sprint',
              ),
              h('button', { class: 'button', onclick: () => setChildren(question) }, 'Cancel'),
            ),
          ),
        );

      return h(
        'section',
        { class: `panel sprint ${running ? 'is-running' : ''}` },
        h('h2', null, sprint.name),
        h(
          'p',
          null,
          running
            ? `Ends ${formatDate(asLocalDate(sprint.endDate))} · ${daysLeftText(sprint, now)}`
            : `Finished ${formatDate(asLocalDate(sprint.endDate))}`,
        ),
        h(
          'div',
          { class: 'card-tags' },
          sprint.tags.map((tag) => h('span', { class: 'tag' }, tag)),
        ),
        h('p', null, `${count(inSprint.length, 'card')}, ${stillNew} still new · ${VARIETY_NAMES[sprint.variety]}`),
        h(
          'div',
          { class: 'button-row' },
          h('button', { class: 'button small', onclick: () => drawForm(sprint, cards) }, 'Edit'),
          running &&
            h(
              'button',
              {
                class: 'button small',
                onclick: change(
                  () => saveSprint({ ...sprint, endDate: dateFromToday(-1, now), finishedNoticeSeen: true }),
                  `“${sprint.name}” has ended. Its cards stay in your deck as normal cards.`,
                ),
              },
              'End now',
            ),
          h('button', { class: 'button small danger-text', onclick: askDelete }, 'Delete'),
        ),
        question,
      );
    }

    setChildren(
      root,
      backLink,
      h('header', { class: 'page-header' }, h('h1', null, 'Sprints')),
      h(
        'p',
        null,
        'A sprint is a short focus on one topic, such as a trip or a hobby. While it runs, its new cards come first, with some of your normal new cards still mixed in.',
      ),
      notice && h('p', { class: 'message is-success' }, notice),
      running.length > 0
        ? running.map(sprintPanel)
        : h('section', { class: 'panel is-centered' }, h('p', null, 'No sprint is running right now.')),
      h('button', { class: 'button primary big', onclick: () => drawForm(null, cards) }, 'New sprint'),
      finished.length > 0 && h('h2', { class: 'section-title' }, 'Finished'),
      finished.map(sprintPanel),
    );
  }

  /** The form for a new sprint (pass null) or for changing an existing one. */
  function drawForm(sprint: Sprint | null, cards: StoredCard[]): void {
    const now = new Date();
    const name = h('input', {
      class: 'field',
      type: 'text',
      maxlength: 60,
      placeholder: 'e.g. Chess conversation',
      value: sprint?.name ?? '',
    });
    const endDate = h('input', { class: 'field', type: 'date', value: sprint?.endDate ?? dateFromToday(7, now) });

    // Tags: tap to choose from the ones your cards already use…
    const chosen = new Set(sprint?.tags ?? []);
    const tagButtons = [...new Set([...allTags(cards), ...chosen])].map((tag) => {
      const button = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(chosen.has(tag)) }, tag);
      button.addEventListener('click', () => {
        if (chosen.has(tag)) chosen.delete(tag);
        else chosen.add(tag);
        button.setAttribute('aria-pressed', String(chosen.has(tag)));
        showCount();
      });
      return button;
    });
    // …or type one that no card has yet (for cards you'll import later).
    const otherTags = h('input', {
      class: 'field',
      type: 'text',
      placeholder: 'e.g. madrid',
      autocapitalize: 'off',
      autocorrect: 'off',
    });
    otherTags.addEventListener('input', () => showCount());
    const allChosen = () => [...new Set([...chosen, ...parseTags(otherTags.value)])];

    const cardCount = h('p', { class: 'footnote is-left', 'aria-live': 'polite' });
    function showCount(): void {
      const tags = allChosen();
      const matching = cards.filter((card) => hasAnyTag(card, tags));
      const stillNew = matching.filter((card) => itemsOf(card).some((item) => item.scheduling.state === 0)).length;
      cardCount.textContent =
        tags.length === 0
          ? 'Choose at least one tag.'
          : `${count(matching.length, 'card')} with these tags, ${stillNew} with something still new.`;
    }
    showCount();

    const variety = h(
      'select',
      { class: 'field' },
      (Object.keys(VARIETY_NAMES) as Variety[]).map((value) =>
        h('option', { value, selected: value === (sprint?.variety ?? 'latam') }, VARIETY_NAMES[value]),
      ),
    );
    const problem = h('div', { class: 'result', 'aria-live': 'polite' });
    // A complaint about the form disappears as soon as something in the form is changed.
    for (const field of [name, endDate, otherTags, variety, ...tagButtons]) {
      for (const event of ['input', 'click']) field.addEventListener(event, () => setChildren(problem));
    }

    async function save(): Promise<void> {
      const fail = (text: string) => setChildren(problem, h('p', { class: 'message is-error' }, text));
      const tags = allChosen();
      if (!name.value.trim()) return fail('Give the sprint a name.');
      if (!isDate(endDate.value)) return fail('Choose the day the sprint ends.');
      if (!sprint && endDate.value < studyDate(now)) return fail('The end date is in the past. Choose today or later.');
      if (tags.length === 0) return fail('Choose at least one tag, so the app knows which cards belong to the sprint.');

      const saved: Sprint = {
        id: sprint?.id ?? newId(),
        name: name.value.trim(),
        endDate: endDate.value,
        tags,
        variety: variety.value as Variety,
        createdAt: sprint?.createdAt ?? now.toISOString(),
        finishedNoticeSeen: false,
      };
      // A sprint that is over after this change doesn't need announcing again.
      saved.finishedNoticeSeen = !isActive(saved, now) && (sprint?.finishedNoticeSeen ?? true);
      await saveSprint(saved);
      await draw(sprint ? 'Sprint saved.' : `“${saved.name}” has started.`);
      window.scrollTo(0, 0);
    }

    setChildren(
      root,
      h('header', { class: 'page-header' }, h('h1', null, sprint ? 'Edit sprint' : 'New sprint')),
      h('label', { class: 'form-field' }, h('span', null, 'Name'), name),
      h('label', { class: 'form-field' }, h('span', null, 'Last day'), endDate),
      h(
        'div',
        { class: 'form-field' },
        h('span', null, 'Which cards belong to it? Tap the tags.'),
        tagButtons.length > 0 && h('div', { class: 'chips' }, tagButtons),
      ),
      h('label', { class: 'form-field' }, h('span', null, 'Other tags (separated by commas)'), otherTags),
      cardCount,
      h('label', { class: 'form-field' }, h('span', null, 'Which Spanish?'), variety),
      h(
        'p',
        { class: 'footnote is-left' },
        'Spain Spanish uses a Spain voice and shows the “vosotros” forms in conjugation tables.',
      ),
      problem,
      h(
        'div',
        { class: 'button-row' },
        h('button', { class: 'button primary', onclick: () => void save() }, sprint ? 'Save changes' : 'Start sprint'),
        h('button', { class: 'button', onclick: () => void draw() }, 'Cancel'),
      ),
    );
    window.scrollTo(0, 0);
  }

  await draw();
}
