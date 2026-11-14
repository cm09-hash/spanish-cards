/** Import: add cards from a JSON file, skipping any you already have. */
import { FileProblem } from '../../data/cardFile';
import { importCardFile, type ImportResult } from '../../data/importCards';
import { studyDate } from '../../study/sprints';
import { formatDate } from '../../study/time';
import { count, filePickerButton, h, setChildren } from '../dom';

/** The sample sprint lasts this many days from the moment the sample cards are added. */
const SAMPLE_SPRINT_DAYS = 7;

const EXAMPLE = `{
  "cards": [
    {
      "id": "vocab-aprovechar",
      "type": "vocab",
      "front": "aprovechar",
      "back": "to make the most of",
      "tags": ["verbs"],
      "note": "Optional extra info."
    },
    {
      "id": "conj-poner-preterito-ellos",
      "type": "conjugation",
      "front": "poner → pretérito, ellos",
      "back": "pusieron",
      "verb": "poner",
      "meaning": "to put",
      "tense": "pretérito",
      "person": "ellos",
      "table": {
        "yo": "puse", "tú": "pusiste", "él": "puso",
        "nosotros": "pusimos", "vosotros": "pusisteis",
        "ellos": "pusieron"
      }
    }
  ]
}`;

export async function renderImport(root: HTMLElement): Promise<void> {
  const result = h('div', { class: 'result', 'aria-live': 'polite' });

  async function runImport(getText: () => Promise<string> | string): Promise<void> {
    try {
      showResult(await importCardFile(await getText()));
    } catch (error) {
      const text =
        error instanceof FileProblem ? error.message : 'Something went wrong while importing. Nothing was changed.';
      if (!(error instanceof FileProblem)) console.error(error);
      setChildren(result, h('p', { class: 'message is-error' }, text));
    }
  }

  function showResult({ added, duplicates, problems, sprint }: ImportResult): void {
    const lines: HTMLElement[] = [];
    if (added > 0) lines.push(h('p', { class: 'message is-success' }, `Added ${count(added, 'new card')}.`));
    if (sprint) {
      const ends = formatDate(new Date(`${sprint.endDate}T12:00:00`));
      const over = sprint.endDate < studyDate(new Date());
      lines.push(
        h(
          'p',
          { class: `message ${over ? 'is-warning' : 'is-success'}` },
          over
            ? `Sprint “${sprint.name}”: its end date (${ends}) has already passed, so it is not running. You can change the date under Home → Sprints.`
            : `Sprint “${sprint.name}” ${sprint.isNew ? 'started' : 'updated'}. It runs until ${ends}.`,
        ),
      );
    }
    if (duplicates > 0)
      lines.push(h('p', { class: 'message' }, `Skipped ${count(duplicates, 'card')} you already have.`));
    if (problems.length > 0) {
      lines.push(
        h(
          'div',
          { class: 'message is-error' },
          h('p', null, `${count(problems.length, 'card')} couldn’t be used:`),
          h(
            'ul',
            null,
            problems.map((problem) => h('li', null, problem)),
          ),
        ),
      );
    }
    if (lines.length === 0) lines.push(h('p', { class: 'message' }, 'That file has no cards in it.'));
    setChildren(result, ...lines);
  }

  async function fetchSampleCards(): Promise<string> {
    const response = await fetch(`${import.meta.env.BASE_URL}sample-cards.json`);
    if (!response.ok) throw new Error(`Could not load the sample cards (${response.status}).`);
    // The sample file names a sprint. Give it an end date a week from today, so there is a
    // running sprint to look at whenever the samples are added.
    const sample = (await response.json()) as { sprint?: { endDate: string } };
    if (sample.sprint) {
      const end = new Date(`${studyDate(new Date())}T12:00:00`);
      end.setDate(end.getDate() + SAMPLE_SPRINT_DAYS);
      sample.sprint.endDate = studyDate(end);
    }
    return JSON.stringify(sample);
  }

  setChildren(
    root,
    h('header', { class: 'page-header' }, h('h1', null, 'Import cards')),
    h(
      'p',
      null,
      'Choose a JSON file of cards from your phone. Cards you already have are skipped, so importing the same file twice is safe.',
    ),
    filePickerButton('Choose a file', 'primary big', (text) => void runImport(() => text)),
    result,
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Just trying it out?'),
      h(
        'p',
        null,
        `Add 10 sample cards about chess and see how studying feels. They come with a ${SAMPLE_SPRINT_DAYS}-day sample sprint, which you can end or delete under Home → Sprints.`,
      ),
      h('button', { class: 'button', onclick: () => void runImport(fetchSampleCards) }, 'Add 10 sample cards'),
    ),
    h(
      'details',
      { class: 'panel' },
      h('summary', null, 'What should the file look like?'),
      h('pre', null, EXAMPLE),
      h(
        'p',
        { class: 'footnote' },
        'Type is one of: vocab, conjugation, grammar, phrase, listening, cloze. For cloze cards, mark the hidden word in the front like {{c1::fui}}. The extra conjugation fields are optional. A file can also start a sprint. The full format, and a ready-made request for Claude, are in the README.',
      ),
    ),
  );
}
