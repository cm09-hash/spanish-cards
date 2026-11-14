# Spanish Cards

A personal Spanish flashcard app for the iPhone. It decides _when_ to show you each card using
spaced repetition, so you review things just before you would forget them.

- **Works like an app.** Open it in Safari, add it to your Home Screen, and it opens full-screen with its own icon.
- **Works offline.** After the first load it needs no internet at all.
- **Private.** Your cards and your progress live only on your phone. There is no account and no server.
- **Free to run.** It is hosted on GitHub Pages and re-publishes itself whenever the code on `main` changes.

## Contents

- [Using the app](#using-the-app)
- [Card file format](#card-file-format) (what to ask Claude for)
- [Backups](#backups)
- [Putting it on your iPhone](#putting-it-on-your-iphone)
- [Working on the code](#working-on-the-code)

## Using the app

| Screen       | What it's for                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Home**     | Shows how many cards are due today and how many new cards are left today. Tap **Study** to start, or **Quick 5** on a busy day. Also shows any running sprint, and leads to **Sprints**. |
| **Review**   | Shows a card. Think of the answer (or type it), reveal it, then say how it went (see below).          |
| **Cards**    | Every card you have, with search and filters. Tap a card to see, edit, pause, flag or delete it.      |
| **Import**   | Adds cards from a file. Cards you already have are skipped.                                           |
| **Backup**   | Saves everything to one file, or restores everything from one.                                        |
| **Settings** | New cards per day (15 to begin with), sounds, Spanish audio (auto-play and speed), and typing answers. |

### The four answer buttons

Each button shows when the card will come back if you press it (`10m` = 10 minutes, `14h` = 14 hours,
`4d` = 4 days, `1.9mo` = about 2 months).

| Button    | Press it when…                                   |
| --------- | ------------------------------------------------ |
| **Again** | you didn't know it, or got it wrong              |
| **Hard**  | you got it, but it was a real struggle           |
| **Good**  | you got it. This is the normal button            |
| **Easy**  | you knew it instantly                            |

For a card you have never seen and don't know yet, press **Again**. It comes back a minute later, and from
there it settles into a rhythm. Be honest rather than generous: the scheduling works best that way.

### During a session

- **Progress bar.** The bar at the top shows how far through today's cards you are. A card only moves the
  bar once it is finished for the day, so a card you keep getting wrong doesn't count until it sticks.
- **Undo.** After you rate a card, an **Undo** button appears at the top. It takes back your last answer:
  the card goes back exactly as it was, and that answer is removed from the history. Tap it again to go
  back further. Undo covers the answers given since you opened the session; it is forgotten when you leave it.
- **Finishing.** When nothing at all is left for today you get a short burst of confetti and a chime.
- **Leeches.** A card you have forgotten 6 times is called a _leech_. It usually needs rewriting, not more
  repetition, so the app tells you the moment it happens and flags the card for Claude. It is not paused:
  it stays in your reviews. (The number 6 is `LEECH_THRESHOLD` in `src/config.ts`.)

### Quick 5

For days when you have no time. **Quick 5** on the Home screen starts a five-minute session of **due reviews
only**, with no new cards and a small countdown at the top. When the time runs out you finish the card you
are on, and the session ends. Reviews are what keep what you've already learned from slipping, so five
minutes of them is far better than skipping the day.

### Motion and sound

- Cards flip when you reveal the answer and slide when you move on, and buttons react when pressed.
- Sounds are short tones made by the app itself (there are no audio files, so they work offline). You can
  switch them off under **Settings → Sounds**.
- On an iPhone, sounds follow the **ring/silent switch**: with the phone on silent you won't hear them. They
  mix with music or a podcast that is already playing, instead of stopping it.
- If your iPhone has **Reduce Motion** turned on (Settings → Accessibility → Motion), the app shows no flips,
  slides or confetti. Everything simply appears.

### Listening to Spanish

Cards are read aloud by your iPhone's own Spanish voice, so it is free and works offline.

- Every card has a **speaker button** (top right) that reads its Spanish. Tap it again to hear it again.
- The button only appears once the Spanish is on show, so it can never give the answer away: on cards
  that go English → Spanish, on conjugation cards and on fill-in-the-blank cards it appears with the answer.
- With **Settings → Read cards aloud automatically** on (the default), the Spanish is read by itself the
  moment it appears. **Settings → Speed** switches between normal and slow.
- **Listening cards** start with just a big play button and no text. Listen, work out what it means, then
  reveal the answer. If you get stuck, **Show text** shows the Spanish.
- **Accent:** Latin American Spanish. The app picks a Mexican voice if the phone has one, then a US Spanish
  one, then any Spanish that isn't from Spain. Cards that belong to a **Spain sprint** use a Spain voice.
  Settings shows which voices were found and has buttons to test them.
- **Grammar cards** are usually a mix of English and Spanish, so they have no speaker unless the card says
  what to read (the `audio` field, below).
- **No Spanish voice?** The speaker buttons are hidden and the app tells you once how to get one: iPhone
  Settings → Accessibility → Spoken Content (on some iPhones: Read & Speak) → Voices → Spanish. The downloadable
  "Enhanced" voices sound much better than the basic ones, and the app prefers them automatically.
- If you hear nothing, check the iPhone's volume and its ring/silent switch first.

### Typing answers

On cards where you have to _produce_ Spanish (English → Spanish cards, conjugations and fill-in-the-blank),
you get a text box to type your answer before revealing it. Typing is far better practice than
"thinking it" and then deciding you knew it.

- A row of buttons above the box types **á é í ó ú ñ ü ¿ ¡** for you.
- The check is forgiving about what doesn't matter: capital letters, extra spaces and punctuation are ignored.
- A missing or wrong accent counts as **almost**, and the app shows the word with the accent you missed
  highlighted. (ñ and ü count as accents here.)
- A wrong answer is shown next to the right one, with the letters that differ highlighted.
- The app **suggests** a rating (correct → Good, almost → Hard, wrong → Again) by outlining that button,
  but you always choose the button yourself.
- If the answer has several acceptable forms separated by `/` (with spaces around it) or `;`, any one of
  them is accepted. Anything in brackets may be left out: for `acordarse (de)`, both `acordarse` and
  `acordarse de` are right.
- Leave the box empty and tap **Show answer** to skip typing for one card. To switch typing off
  altogether, use **Settings → Type answers**.

### Cards in both directions

Vocab and phrase cards are studied two ways, and the app treats them as two separate things to learn:

| Direction       | You see  | You answer            | Called        |
| --------------- | -------- | --------------------- | ------------- |
| Spanish → English | Spanish  | the meaning (think it) | recognition   |
| English → Spanish | English  | the Spanish (type it)  | production    |

- Each direction has its **own schedule and its own history**. Knowing what _el tablero_ means and being
  able to come up with it yourself are different skills, and they are forgotten at different rates.
- The English → Spanish direction is introduced as a new card **3 days after** you first study the Spanish →
  English one, never on the same day. It counts towards the daily new-card limit like any other new card.
  (The 3 is `PRODUCTION_DELAY_DAYS` in `src/config.ts`.)
- Cards you already had when this was added keep all their progress as the Spanish → English direction.
  Their English → Spanish direction starts as a new card.
- On a card's page (**Cards** → tap a card) you see the progress of each direction and can **pause one
  direction** while the other carries on.
- A card can opt out in the import file with `"directions": ["recognition"]` (see the format below).

### Conjugation cards

If a conjugation card comes with its verb, tense and person as separate fields, it is shown in a clearer
layout: **Verb** (with a short English meaning), **Tense** and **Person**, each on its own labelled line.
The answer side then shows the **whole table** for that tense with the form you were asked for highlighted.
_vosotros_ is left out of the table, except for cards in a Spain sprint. Cards without those fields are
shown the old way.

### Topic sprints

A sprint is a short, time-boxed focus on one topic: "Chess conversation, ends Nov 21", "Trip to Madrid,
ends Dec 10".

- **Create one** under **Home → Sprints → New sprint**: give it a name, its last day, the tag or tags whose
  cards belong to it, and which Spanish it is in (Latin American or Spain). An import file can also bring
  its own sprint (see the format below).
- **While it runs**, its new cards are introduced before your other new cards. So that everything else
  doesn't stall, at least **40% of each day's new cards** still come from your normal cards, mixed in
  along the way, for as long as there are any. With 15 new cards a day that is 9 from the sprint and 6
  normal ones. The daily limit itself does not go up. (The 40% is `SPRINT_NORMAL_SHARE` in `src/config.ts`.)
- A sprint only changes the order of **new** cards. Reviews are never reordered or skipped.
- **Spain sprints:** their cards are read by a Spain voice and show the _vosotros_ forms.
- **Home** shows each running sprint with the days it has left.
- **When it ends**, a sprint switches itself off after its last day. Home shows a one-time "Sprint finished"
  message. Its cards stay in your deck as normal cards and carry on being reviewed. You can also end a
  sprint early (**End now**) or delete it; neither touches the cards.
- To add cards you already have to a sprint, give them one of the sprint's tags (**Cards** → tap the card →
  **Edit**).

### The Cards screen

- **Search** looks in the front, back, note and tags. It ignores capital letters and accents, so typing
  `desafio` finds _el desafío_.
- **Filters** narrow the list by type, by tag and by status: New, Learning, Review, Paused, Flagged or Leech.
- Tap a card to open it. You see both sides, its note and tags, and its full review history. For each
  direction it is studied in, you see its stage, how many times you have reviewed and forgotten it, and
  when it is next due.

What you can do with a card:

| Action              | What happens                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| **Edit**            | Change the front, back, note or tags. The card keeps all of its progress and history.                     |
| **Pause / Unpause** | A paused card never appears in study sessions and isn't counted on the Home screen, until you unpause it. Cards with two directions also have a **Pause this direction** button for each. |
| **Flag for Claude** | Marks the card as needing attention, with an optional short reason such as "translation seems wrong".     |
| **Reset progress**  | Makes the card new again (in both directions), to be re-learned from scratch. Its text and review history are kept. |
| **Delete**          | Removes the card and its review history for good. You are asked to confirm first.                         |

### How the scheduling works

- Scheduling is done by [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), the official FSRS
  library, using its current default model (FSRS-7) and a **desired retention of 0.90**. In plain English: it
  times each review so that you should still remember about 9 cards out of 10 when they come up.
- **Due today** counts cards you have studied before that are scheduled for today. These are never limited.
- **New left today** counts brand-new cards still to be introduced today. The daily limit is on the Settings screen.
  A vocab or phrase card counts twice over its life: once for each direction.
- A new "day" starts at **4:00 am**, not midnight, so a late-night session counts towards the same day.
- Cards that come back in less than a day (for example "10 minutes") wait for their time. If they are the only
  thing left and are due within 20 minutes, you get them straight away instead of having to wait.

## Card file format

Cards are imported from a **JSON file**, which is a plain text file with a strict layout. You don't need to
write it by hand: ask Claude to produce it (there is a ready-made request [below](#asking-claude-for-cards)).

A file looks like this. Only `id`, `type`, `front` and `back` are required; everything else is optional.

```json
{
  "sprint": {
    "name": "Chess conversation",
    "endDate": "2026-11-21",
    "tag": "chess",
    "variety": "latam"
  },
  "cards": [
    {
      "id": "vocab-tablero",
      "type": "vocab",
      "front": "el tablero",
      "back": "the board (for chess and other games)",
      "tags": ["nouns"],
      "note": "Las piezas ya están en el tablero. — The pieces are already on the board."
    },
    {
      "id": "conj-mover-presente-yo",
      "type": "conjugation",
      "front": "mover → presente, yo",
      "back": "muevo",
      "verb": "mover",
      "meaning": "to move",
      "tense": "presente",
      "person": "yo",
      "table": {
        "yo": "muevo",
        "tú": "mueves",
        "él": "mueve",
        "nosotros": "movemos",
        "vosotros": "movéis",
        "ellos": "mueven"
      },
      "tags": ["presente", "irregular"]
    },
    {
      "id": "cloze-si-muevo",
      "type": "cloze",
      "front": "Si {{c1::muevo::mover}} el caballo, {{c2::pierdo::perder}} la dama.",
      "back": "If I move the knight, I lose the queen."
    }
  ]
}
```

Files written for earlier versions of the app (with none of the newer fields) import exactly as before.

### The fields of a card

| Field        | Required?                  | What it is                                                                                                |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`         | yes                        | A unique name for the card, e.g. `"vocab-tablero"`. Any text works as long as no two cards share it.      |
| `type`       | yes                        | One of `vocab`, `conjugation`, `grammar`, `phrase`, `listening`, `cloze`.                                  |
| `front`      | yes                        | The question side. For vocab, phrase and listening cards this is the **Spanish**.                         |
| `back`       | yes (optional for `cloze`) | The answer side.                                                                                          |
| `tags`       | no                         | A list of labels, e.g. `["verbs", "past"]`. Shown under the answer. Sprints find their cards by tag.       |
| `note`       | no                         | Extra information shown under the answer: an example sentence, a memory trick, a grammar reminder.         |
| `directions` | no                         | Vocab and phrase cards only. `["recognition"]` means "Spanish → English only, no typing side". Leaving it out (or `["recognition", "production"]`) means both directions. |
| `audio`      | no                         | The exact Spanish the speaker button should read, when the usual choice isn't right. Mainly for grammar cards, which are otherwise silent. |

Only on `conjugation` cards, all optional:

| Field     | What it is                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `verb`    | The infinitive, e.g. `"poner"`.                                                                                             |
| `tense`   | The tense, e.g. `"pretérito"`.                                                                                              |
| `person`  | Who, e.g. `"ellos"`. `"ellas"`, `"ustedes"` or `"ellos/ellas/ustedes"` work too.                                             |
| `meaning` | A short English meaning of the verb, e.g. `"to put"`.                                                                       |
| `table`   | All the forms of that tense: `{ "yo": "puse", "tú": "pusiste", "él": "puso", "nosotros": "pusimos", "vosotros": "pusisteis", "ellos": "pusieron" }`. |

- The labelled layout is used when `verb`, `tense` and `person` are all present. `meaning` and `table` each
  add to it when they are there.
- In `table`, the row names are `yo`, `tú`, `él`, `nosotros`, `vosotros`, `ellos`. (`él` stands for
  él/ella/usted and `ellos` for ellos/ellas/ustedes; writing `usted` or `ustedes` is understood.) Rows may be
  missing, which is what the imperative needs. `vosotros` is worth including even though it is only
  displayed for Spain sprints.
- `front` and `back` are still required. They are what you see if the layout can't be used, and `back` is
  the answer your typing is checked against.

Good to know:

- `front`, `back` and `note` are plain text. To start a new line inside them, use `\n`.
- Never change a card's `id` after importing it. The `id` is how the app knows it's the same card.
- Anything else in the file is ignored, so extra fields do no harm.
- The file may also be just the list on its own (`[ {…}, {…} ]`) without the `"cards"` wrapper.
- **Several right answers:** separate them with `/` (with a space on each side) or `;`, as in
  `"front": "Te toca. / Te toca a ti."`. When the Spanish is being typed, any one of them is accepted.
  Something in brackets, as in `"acordarse (de)"`, may be typed or left out.

### Card types

| Type          | Typical front                                | Typical back                        | How it is studied                                              |
| ------------- | -------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `vocab`       | `el desafío`                                 | `the challenge`                     | Both directions. Typed when going English → Spanish.           |
| `phrase`      | `echar de menos`                             | `to miss (someone or something)`    | Both directions. Typed when going English → Spanish.           |
| `conjugation` | `poner → pretérito, ellos`                   | `pusieron`                          | You type the form. Labelled layout and table if provided.      |
| `cloze`       | A sentence with a hidden word (see below)    | The translation of the sentence     | You type the hidden word.                                      |
| `listening`   | A Spanish sentence                           | Its meaning                         | Played aloud with the text hidden.                             |
| `grammar`     | A question about a rule                      | The rule, briefly                   | Think, then reveal. Silent unless it has `audio`.              |

### Cloze cards (fill in the blank)

Mark the hidden word in `front` with double curly brackets:

| You write                       | The question shows  | The answer shows  |
| ------------------------------- | ------------------- | ----------------- |
| `Ayer {{c1::fui}} al mercado.`      | Ayer **[…]** al mercado.  | Ayer **fui** al mercado. |
| `Ayer {{c1::fui::ir}} al mercado.`  | Ayer **[ir]** al mercado. | Ayer **fui** al mercado. |

- The optional third part (`::ir`) is a **hint** shown in place of the blank. A hint makes the card fairer,
  because otherwise several words could fit.
- A sentence can have several blanks (`{{c1::…}}`, `{{c2::…}}`). They are all hidden together and all
  revealed together, as one card, and you get one text box per blank.
- `back` is shown under the answer and is the natural place for the English translation.
- The full sentence is read aloud on the answer side only.

### A sprint in the file

Put a `"sprint"` block at the top of the file and importing it starts that sprint:

| Field     | Required? | What it is                                                                                 |
| --------- | --------- | ------------------------------------------------------------------------------------------ |
| `name`    | yes       | What the sprint is called, e.g. `"Trip to Madrid"`.                                         |
| `endDate` | yes       | Its last day, written year-month-day: `"2026-12-10"`.                                       |
| `tag`     | yes       | The tag that marks the sprint's cards. **Every card in the file is given this tag.**        |
| `variety` | no        | `"latam"` (the default) or `"spain"`. Spain means a Spain voice and _vosotros_ in tables.   |

- Importing a second file with the same sprint `name` adds to that sprint rather than creating a twin; its
  end date and variety are updated from the newer file.
- If the sprint block has a mistake, nothing from the file is imported and the app says what is wrong.
- Cards from the file that you already had are skipped as usual, and are not changed or tagged.

### What counts as a duplicate

When importing, a card is skipped if either

1. its `id` is already in the app, or
2. a card of the same `type` already has the same `front` (ignoring capital letters and extra spaces).

So importing the same file twice is harmless, and you don't get the same word twice just because it
arrived under a new `id`.

If a card in the file has a mistake (for example a missing `back`), the good cards are still imported and
the app lists exactly which cards were left out and why. You can paste that list back to Claude to have it fixed.

### Sample file

[`public/sample-cards.json`](public/sample-cards.json) holds 10 chess-themed cards that show off every
feature: both directions, a one-direction card, alternative answers, conjugation tables, a grammar card
with audio, a listening card, a two-blank cloze card, and a sprint. You don't need to download it: the
Import screen has an **Add 10 sample cards** button. That button gives the sample sprint an end date one
week from the day you tap it (the date written in the file is only there to show the format).

### Asking Claude for cards

Copy this into a Claude chat and change the first two lines to say what you want. Delete the SPRINT line
and the `"sprint"` block if the cards aren't for a sprint.

```text
Make me 20 Spanish flashcards about: [TOPIC, e.g. "talking about a chess game", level B1].
SPRINT: these are for a sprint called "[NAME]" that ends on [DATE], in [Latin American / Spain] Spanish.

Give them to me as a downloadable JSON file in exactly this shape:

{
  "sprint": { "name": "Chess conversation", "endDate": "2026-11-21", "tag": "chess", "variety": "latam" },
  "cards": [
    {
      "id": "vocab-tablero",
      "type": "vocab",
      "front": "el tablero",
      "back": "the board (for chess and other games)",
      "tags": ["nouns"],
      "note": "Las piezas ya están en el tablero. — The pieces are already on the board."
    },
    {
      "id": "conj-mover-presente-yo",
      "type": "conjugation",
      "front": "mover → presente, yo",
      "back": "muevo",
      "verb": "mover",
      "meaning": "to move",
      "tense": "presente",
      "person": "yo",
      "table": { "yo": "muevo", "tú": "mueves", "él": "mueve", "nosotros": "movemos", "vosotros": "movéis", "ellos": "mueven" },
      "tags": ["presente"]
    },
    {
      "id": "cloze-si-muevo",
      "type": "cloze",
      "front": "Si {{c1::muevo::mover}} el caballo, pierdo la dama.",
      "back": "If I move the knight, I lose the queen.",
      "tags": ["presente"]
    }
  ]
}

Rules for every card:
- "id": unique, lowercase, words joined by hyphens, starting with the type (e.g. "conj-poner-preterito-ellos").
- "type": one of vocab, conjugation, grammar, phrase, listening, cloze. Give me a mix.
- "front" and "back": plain text, no formatting. Keep them short.
- "tags": a short list of lowercase labels.
- "note" (optional): one example sentence with its translation, or a brief tip.
- Valid JSON only: double quotes, no trailing commas, no comments.

Rules by type:
- vocab and phrase: "front" is the Spanish, "back" is the English. I will be asked to TYPE the Spanish
  from the English, so "back" must point to one clear answer: add a clarifying word in brackets if the
  English is ambiguous, e.g. "the board (for chess)". Nouns go with their article ("el tablero").
  If two Spanish answers are equally good, put both in "front" separated by " / ".
  For rare words I only need to recognise, add "directions": ["recognition"].
- conjugation: "front" is "verb → tense, person" and "back" is the conjugated form alone. Always include
  "verb", "meaning" (short English), "tense", "person", and "table" with all six forms of that tense
  under the keys yo, tú, él, nosotros, vosotros, ellos.
- cloze: "front" is a full Spanish sentence with the hidden word written as {{c1::answer::hint}}
  (for a verb, the hint is the infinitive); "back" is the English translation.
- listening: "front" is a natural spoken Spanish sentence; "back" is the English.
- grammar: "front" asks about one rule; "back" answers briefly. Add "audio" with one or two Spanish
  example sentences to be read aloud.

Rules for the sprint (only if I asked for one):
- "endDate" is written YYYY-MM-DD. "tag" is one lowercase word. "variety" is "latam" or "spain".
- For "spain", use Spain vocabulary and include vosotros where natural.
```

On your iPhone, save the file Claude gives you to the **Files** app, then open Spanish Cards and go to
**Import → Choose a file**.

## Backups

Everything is stored on your phone only, so **save a backup now and then**. If the phone is lost or the
app's data is cleared, a backup file is the only way back.

- The Home screen reminds you if you have never saved a backup, or if your last one is more than 7 days old.
- **Backup → Save backup file** creates one file, named like `spanish-cards-backup-2026-11-13.json`, holding
  all your cards (in both directions), the complete review history, your sprints and your settings. On an iPhone, pick **Save to Files** in the
  menu that appears (iCloud Drive is a good place).
- **Backup → Choose a backup file** restores from such a file. It **replaces** everything on the device, and
  asks you to confirm first. The file is checked from top to bottom before anything is touched, so a damaged
  or wrong file cannot wipe out your data.
- Backups made by older versions of the app can still be restored. Anything the old file doesn't know about
  is filled in exactly as an app update would do it: for example, a card's progress becomes its Spanish →
  English direction, and vocab and phrase cards gain an English → Spanish direction that starts as new.

### What's inside a backup (for analysing your progress)

The backup is ordinary JSON, so you can hand it to Claude or open it in any data tool.

```json
{
  "app": "spanish-cards",
  "formatVersion": 3,
  "exportedAt": "2026-11-13T09:30:00.000Z",
  "scheduler": { "algorithm": "FSRS-7", "desiredRetention": 0.9 },
  "settings": {
    "newCardsPerDay": 15, "soundsOn": true,
    "autoPlayAudio": true, "speechSpeed": "normal", "typeAnswers": true
  },
  "sprints": [ … ],
  "cards": [ … ],
  "reviews": [ … ]
}
```

Each entry in **`cards`** is the card as it is now (including any edits you made in the app), plus:

| Field        | Meaning                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `addedAt`    | When it was imported.                                                                                |
| `position`   | Import order. New cards are introduced lowest number first.                                          |
| `scheduling` | The current FSRS state (described below) of the card as written. For vocab and phrase cards that is the **Spanish → English** direction. |
| `introducedAt` | When that direction was studied for the first time (`null` if never).                              |
| `recognitionPaused` | `true` if just that direction is paused.                                                      |
| `production` | The **English → Spanish** direction: `{ "scheduling": {…}, "paused": false, "introducedAt": … }`. `null` for cards that are studied one way only. |
| `paused`     | `true` if the whole card is paused.                                                                  |
| `leech`      | `true` if the card has been forgotten 6 or more times (in either direction).                         |
| `flag`       | `null`, or `{ "reason": "…", "flaggedAt": "…", "by": "you" }`. `by` is `"leech"` when the app flagged it. |
| `editedAt`   | When the card's text was last edited in the app (`null` if never).                                   |

Each entry in **`sprints`** is one topic sprint, running or finished:

| Field                | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `id`, `name`         | An internal id, and what you called it.                                       |
| `endDate`            | Its last day, e.g. `"2026-11-21"`.                                            |
| `tags`               | Cards with any of these tags belong to the sprint.                            |
| `variety`            | `"latam"` or `"spain"`.                                                       |
| `createdAt`          | When it was created.                                                          |
| `finishedNoticeSeen` | `true` once you have dismissed its "Sprint finished" message.                 |

`formatVersion` says which layout the file uses. The app restores all three:

| Version | From            | What it lacks compared with today                                                              |
| ------- | --------------- | ---------------------------------------------------------------------------------------------- |
| 1       | the first release | Everything below, plus `paused`, `leech`, `flag`, `editedAt` on cards and the `soundsOn` setting. |
| 2       | Round 1         | `introducedAt`, `recognitionPaused` and `production` on cards; `direction`, `typed` and `typedResult` on reviews; `sprints`; the audio and typing settings. |
| 3       | Round 2 (now)   | Nothing.                                                                                       |

Each entry in **`reviews`** is one answer you gave. Every one is kept, except answers you take back with
Undo and the history of cards you delete.

| Field        | Meaning                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `id`         | A running number.                                                          |
| `cardId`     | Which card.                                                                |
| `direction`  | `"recognition"` (the card as written; Spanish → English for vocab and phrase cards) or `"production"` (English → Spanish). |
| `rating`     | `1` Again, `2` Hard, `3` Good, `4` Easy.                                   |
| `timestamp`  | When you answered.                                                         |
| `durationMs` | How long you took, in milliseconds, from seeing the card to rating it.     |
| `typed`      | What you typed, if it was a typed answer (`null` otherwise). Several blanks are joined with ` \| `. |
| `typedResult` | `"correct"`, `"almost"` (accents only) or `"wrong"`; `null` if nothing was typed. This is the app's check, which can differ from the `rating` you chose. |
| `before`     | The FSRS state of that direction just before this review.                  |
| `after`      | The FSRS state of that direction just after it.                            |

An **FSRS state** (`scheduling`, `before`, `after`) has these fields:

| Field                                     | Meaning                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `state`                                   | `0` New, `1` Learning, `2` Review, `3` Relearning.                               |
| `dueAt`                                   | When the card should next be shown.                                              |
| `lastReviewAt`                            | When it was last reviewed (`null` if never).                                     |
| `stability`, `stabilityFast`, `difficulty` | FSRS's estimate of how well the card is remembered and how hard it is.           |
| `scheduledDays`                           | Length of the current interval in days (can be a fraction: `0.5` is 12 hours).   |
| `reps`                                    | How many times it has been reviewed.                                             |
| `lapses`                                  | How many times it was forgotten after having been learned.                       |
| `cardId`, `scheduleStatus`, `learningStep` | Bookkeeping used by ts-fsrs. For the English → Spanish direction, `cardId` is the card's id followed by `#production`. |

All dates are written in the standard ISO 8601 form in UTC, e.g. `2026-11-13T09:30:00.000Z`.

## Putting it on your iPhone

### One-time setup on GitHub

1. Open the repository on github.com and click **Settings** (the tab with the gear icon).
2. In the left-hand menu click **Pages**.
3. Under **Build and deployment**, open the **Source** drop-down and choose **GitHub Actions**.
   It saves by itself.

From then on, every time something is merged into the `main` branch, the workflow in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) tests the app, builds it and publishes it.
You can watch it happen on the repository's **Actions** tab; a green tick means the new version is live.
It takes a minute or two.

The app's address is:

**https://cm09-hash.github.io/spanish-cards/**

(The same address is shown on **Settings → Pages** once the first deployment has finished.)

### Adding it to your Home Screen

1. On your iPhone, open the address above in **Safari** (it has to be Safari).
2. Tap the **Share** button, the square with an arrow pointing up. If you can't see it, tap **•••** first.
3. Scroll down and tap **Add to Home Screen**. If there is an **Open as Web App** switch, leave it on.
4. Tap **Add**.
5. Open **Spanish** from your Home Screen while you still have internet, and wait for the Home screen to
   appear. That first opening is when it saves itself for offline use.

> **Import your cards inside the Home Screen app, not in Safari.** iPhones keep the Home Screen app's
> storage separate from Safari's, so cards added in a Safari tab will not show up in the app.

### Getting updates

When a new version has been published, the app notices the next time you open it or switch back to it
(with internet), downloads it quietly, and shows **A new version of the app is ready** with an
**Update now** button on the Home screen. You can also go to **Settings → Check for updates**. Updating never touches your cards
or your progress. The Settings screen shows when the version you are running was built.

## Working on the code

You need [Node.js](https://nodejs.org) version 24 or newer.

| Command           | What it does                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| `npm install`     | Downloads the libraries the project uses. Do this once.                            |
| `npm run dev`     | Runs the app on your computer and reloads as you edit. (Offline mode is off here.) |
| `npm test`        | Runs the automatic checks in `tests/`.                                             |
| `npm run build`   | Builds the finished app into the `dist/` folder, including the offline worker.     |
| `npm run preview` | Serves the built `dist/` folder, to try the real thing including offline mode.     |

### What's used

- [Vite](https://vite.dev) + TypeScript, with no UI framework
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) for scheduling
- [Dexie](https://dexie.org) for IndexedDB, the on-device database
- [Vitest](https://vitest.dev) for tests, with [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB)
  standing in for the phone's database while they run

### Where things live

```text
index.html                 The single page everything is drawn into
src/
  main.ts                  Where the app starts
  config.ts                Settings baked into the app (desired retention, leech threshold, sprint share…)
  types.ts                 The shapes of cards, reviews, sprints and settings
  styles.css               All the styling, including dark mode
  pwa.ts                   Switches on offline support and notices new versions
  study/                   The "brain". No screens, no database
    scheduler.ts             The only file that talks to ts-fsrs
    queue.ts                 Which cards are due, which card comes next, and today's progress
    directions.ts            Cards in two directions: Spanish → English and English → Spanish
    answerCheck.ts           Checks a typed answer (accents, alternatives, what differs)
    sprints.ts               Sprint dates, and the rule that mixes sprint and normal new cards
    conjugation.ts           The labelled conjugation layout and the table of forms
    voices.ts                Which voice to use, and what to read aloud for each card
    rate.ts                  Works out what to save when a card is rated
    leech.ts                 When a card counts as a leech
    cardFilter.ts            Search and filters for the Cards screen
    today.ts                 Loads what Home and Review need to know about today
    cloze.ts                 Reads {{c1::…}} blanks
    time.ts                  Day boundaries and labels like "10m" or "4d"
    text.ts                  Small text helpers (removing accents and so on)
  data/                    Saving and loading
    db.ts                    The on-device database (all reads and writes go through here)
    cardUpgrade.ts           Brings cards and reviews saved by an older version up to date
    cardFile.ts              Checks an import file
    importCards.ts           Adds imported cards to the database
    backupFile.ts            Builds and checks backup files
    backupReminder.ts        Decides when Home should nudge you to back up
  ui/                      Everything you see
    app.ts                   Switches between screens and draws the tab bar
    screens/                 One file per screen: home, review, cards, cardDetail, sprints, import, backup, settings
    cardView.ts              Draws a card (question side and answer side), with its speaker button
    speech.ts                Reads Spanish aloud with the phone's own voices
    keyboard.ts              The row of accent buttons, and keeping the screen above the phone's keyboard
    sound.ts                 The sound effects (Web Audio, no audio files)
    motion.ts                Animation helper that respects Reduce Motion
    confetti.ts              The end-of-day celebration
    badges.ts                The small labels: New, Paused, Leech…
    dom.ts, icons.ts, updateBanner.ts   Small shared helpers
public/                    Files copied into the app as they are
  sample-cards.json          The 10 sample cards
  manifest.webmanifest       Name, colours and icons for the Home Screen
  icons/
scripts/                   Builds the offline service worker at the end of "npm run build"
tests/                     Automatic checks for the logic in study/ and data/
  fixtures/                  Real backups from the first release and from Round 1, used to prove old data still loads
.github/workflows/deploy.yml   Tests, builds and publishes to GitHub Pages
```

### Adding features later

A few pointers for the most likely next steps:

- **A new screen:** add a file in `src/ui/screens/`, then list it in `SCREENS` (and `TABS`, if it should
  have a tab) in `src/ui/app.ts`.
- **A new card type:** add it to `CARD_TYPES` in `src/types.ts`. To give it its own look, add a case in
  `src/ui/cardView.ts`.
- **A new setting:** add it to `Settings` in `src/types.ts` and to `DEFAULT_SETTINGS` in `src/data/db.ts`,
  then add a control in `src/ui/screens/settings.ts`.
- **A new sound:** add it to `SOUNDS` in `src/ui/sound.ts` and play it with `playSound('its-name')`.
- **A new optional field on cards:** add it to `CardContent` in `src/types.ts`, check it in `checkCard` in
  `src/data/cardFile.ts` (which import files and backups both go through), and document it above.
- **Changing what is stored:** this is the one place where a mistake could lose data, so follow the
  pattern already there:
  1. Never edit a `db.version(…)` block that has been released. Add the next one (`db.version(4)`) in
     `src/data/db.ts`, with an `upgrade` step that fills in the new fields on existing cards. Only ever
     add fields; don't rename or remove ones that are already saved.
  2. Put the "fill in what's missing" logic in `src/data/cardUpgrade.ts`, so that restoring an old backup
     does exactly the same thing as upgrading an old database.
  3. Bump `BACKUP_FORMAT_VERSION` in `src/config.ts`, add the new number to `READABLE_FORMAT_VERSIONS` in
     `src/data/backupFile.ts`, and keep accepting the old ones.
  4. `tests/dbUpgrade.test.ts` and `tests/backupFile.test.ts` check that data from every earlier release
     still loads. Before you start, save a backup from the live app and add it to `tests/fixtures/` as the
     check for the version you are leaving behind.
