/** Log: the capture log, and the weekly report file for Claude. */
import { deleteCapture, getCaptures, markCaptures, readEverything, updateSettings } from '../../data/db';
import { buildWeeklyReport, reportFileName } from '../../study/report';
import { formatDate, formatDateTime } from '../../study/time';
import type { Capture } from '../../types';
import type { Cleanup } from '../app';
import { CAPTURE_TYPE_NAMES, CAPTURES_CHANGED, openCapture } from '../capture';
import { count, h, setChildren } from '../dom';
import { saveFile } from '../saveFile';

export async function renderLog(root: HTMLElement): Promise<Cleanup> {
  const backLink = h('a', { class: 'button small quiet back-link', href: '#/home' }, '‹ Home');

  async function draw(notice?: string): Promise<void> {
    const now = new Date();
    const [captures, saved] = await Promise.all([getCaptures(), readEverything()]);
    const waiting = captures.filter((capture) => capture.status === 'waiting');

    // ----- The weekly report -----

    // The file is prepared up front so that tapping the button can open the
    // share sheet immediately (iPhones only allow that directly from a tap).
    const report = buildWeeklyReport(saved, now);
    const file = new File([JSON.stringify(report, null, 2)], reportFileName(now), { type: 'application/json' });
    const reportResult = h('div', { class: 'result', 'aria-live': 'polite' });

    function createReport(): void {
      saveFile(file, async (how) => {
        await updateSettings({ lastReportAt: now.toISOString() });
        const done = how === 'shared' ? 'Report shared.' : `Report downloaded as ${file.name}.`;
        if (waiting.length === 0) {
          setChildren(
            reportResult,
            h('p', { class: 'message is-success' }, `${done} Hand it to Claude for your next batch of cards.`),
          );
          return;
        }
        // The entries in the report can now be ticked off, if it really did reach Claude.
        setChildren(
          reportResult,
          h(
            'div',
            { class: 'message is-success' },
            h('p', null, `${done} It includes ${count(waiting.length, 'log entry', 'log entries')}.`),
            h('p', null, h('strong', null, 'Mark these log entries as sent?')),
            h(
              'div',
              { class: 'button-row' },
              h(
                'button',
                {
                  class: 'button primary',
                  onclick: async () => {
                    await markCaptures(
                      waiting.map((capture) => capture.id),
                      now.toISOString(),
                    );
                    await draw(`${count(waiting.length, 'log entry', 'log entries')} marked as sent to Claude.`);
                  },
                },
                'Yes, mark as sent',
              ),
              h('button', { class: 'button', onclick: () => draw() }, 'Not yet'),
            ),
          ),
        );
      });
    }

    const flaggedCount = report.leeches.length + report.flagged_cards.length;
    const reportPanel = h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Weekly report for Claude'),
      h(
        'p',
        null,
        'One small file to hand to Claude: your stats for the last 7 days, your strengths and weaknesses, the cards that need rewriting, and the log entries below that are still waiting. It tells Claude what to do with it.',
      ),
      h(
        'p',
        { class: 'footnote is-left' },
        `Right now: ${count(waiting.length, 'log entry', 'log entries')} waiting · ${count(flaggedCount, 'card')} to rewrite · ${count(report.summary.reviews, 'review')} this week`,
      ),
      h('button', { class: 'button primary big', onclick: createReport }, 'Create report file'),
      reportResult,
      h(
        'p',
        { class: 'footnote is-left' },
        saved.settings.lastReportAt
          ? `Last report: ${formatDate(new Date(saved.settings.lastReportAt))}`
          : 'No report created yet.',
      ),
    );

    // ----- The entries -----

    function entry(capture: Capture): HTMLElement {
      const question = h('div', { class: 'result' });
      const askDelete = () =>
        setChildren(
          question,
          h(
            'div',
            { class: 'message is-warning' },
            h('p', null, 'Delete this log entry?'),
            h(
              'div',
              { class: 'button-row' },
              h(
                'button',
                {
                  class: 'button danger',
                  onclick: async () => {
                    await deleteCapture(capture.id);
                    await draw('Log entry deleted.');
                  },
                },
                'Delete entry',
              ),
              h('button', { class: 'button', onclick: () => setChildren(question) }, 'Cancel'),
            ),
          ),
        );
      const sent = capture.status === 'sent';

      return h(
        'article',
        { class: `panel log-entry ${sent ? 'is-sent' : ''}` },
        h('p', { class: 'log-text' }, capture.text),
        capture.context && h('p', { class: 'log-context' }, capture.context),
        h(
          'div',
          { class: 'badges' },
          h('span', { class: 'badge' }, CAPTURE_TYPE_NAMES[capture.type]),
          h('span', { class: `badge ${sent ? 'is-review' : 'is-learning'}` }, sent ? 'Sent to Claude' : 'Waiting'),
          h('span', { class: 'log-when' }, formatDateTime(new Date(capture.createdAt))),
        ),
        h(
          'div',
          { class: 'button-row' },
          h('button', { class: 'button small', onclick: () => openCapture(capture) }, 'Edit'),
          sent &&
            h(
              'button',
              {
                class: 'button small',
                onclick: async () => {
                  await markCaptures([capture.id], null);
                  await draw('Entry set back to waiting. It will be in your next report.');
                },
              },
              'Set back to waiting',
            ),
          h('button', { class: 'button small danger-text', onclick: askDelete }, 'Delete'),
        ),
        question,
      );
    }

    setChildren(
      root,
      backLink,
      h('header', { class: 'page-header' }, h('h1', null, 'Capture log')),
      h(
        'p',
        null,
        'Spanish moments you jotted down: a word you were missing, something you overheard, a question. Tap the + button, from any screen, to add one.',
      ),
      notice && h('p', { class: 'message is-success' }, notice),
      reportPanel,
      captures.length === 0
        ? h(
            'section',
            { class: 'panel is-centered' },
            h('h2', null, 'Nothing in your log yet'),
            h('p', null, 'Next time Spanish comes up in your day, tap + and note it down. It takes a few seconds.'),
            h('button', { class: 'button primary', onclick: () => openCapture() }, 'Add your first entry'),
          )
        : h('h2', { class: 'section-title' }, `${count(captures.length, 'entry', 'entries')}, newest first`),
      captures.map(entry),
    );
  }

  // Redraw when an entry is added or edited through the + sheet.
  const onChange = () => void draw();
  window.addEventListener(CAPTURES_CHANGED, onChange);

  await draw();
  return () => window.removeEventListener(CAPTURES_CHANGED, onChange);
}
