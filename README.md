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
| **Home**     | Shows how many cards are due today and how many new cards are left today. Tap **Study** to start.     |
| **Review**   | Shows a card. Think of the answer, tap **Show answer**, then say how it went (see below).             |
| **Import**   | Adds cards from a file. Cards you already have are skipped.                                           |
| **Backup**   | Saves everything to one file, or restores everything from one.                                        |
| **Settings** | How many new cards you get per day (15 to begin with).                                                |

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

### How the scheduling works

- Scheduling is done by [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), the official FSRS
  library, using its current default model (FSRS-7) and a **desired retention of 0.90**. In plain English: it
  times each review so that you should still remember about 9 cards out of 10 when they come up.
- **Due today** counts cards you have studied before that are scheduled for today. These are never limited.
- **New left today** counts brand-new cards still to be introduced today. The daily limit is on the Settings screen.
- A new "day" starts at **4:00 am**, not midnight, so a late-night session counts towards the same day.
- Cards that come back in less than a day (for example "10 minutes") wait for their time. If they are the only
  thing left and are due within 20 minutes, you get them straight away instead of having to wait.

## Card file format

Cards are imported from a **JSON file**, which is a plain text file with a strict layout. You don't need to
write it by hand: ask Claude to produce it (there is a ready-made request [below](#asking-claude-for-cards)).

A file looks like this:

```json
{
  "cards": [
    {
      "id": "vocab-aprovechar",
      "type": "vocab",
      "front": "aprovechar",
      "back": "to make the most of; to take advantage of",
      "tags": ["verbs"],
      "note": "Hay que aprovechar el buen tiempo. — We should make the most of the good weather."
    },
    {
      "id": "cloze-ir-preterito-ayer",
      "type": "cloze",
      "front": "Ayer {{c1::fui::ir}} al mercado y compré fruta.",
      "back": "Yesterday I went to the market and bought fruit.",
      "tags": ["pretérito"]
    }
  ]
}
```

### The fields of a card

| Field   | Required?                     | What it is                                                                                                   |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`    | yes                           | A unique name for the card, e.g. `"vocab-aprovechar"`. Any text works as long as no two cards share it.      |
| `type`  | yes                           | One of `vocab`, `conjugation`, `grammar`, `phrase`, `listening`, `cloze`.                                     |
| `front` | yes                           | The question side.                                                                                           |
| `back`  | yes (optional for `cloze`)    | The answer side.                                                                                             |
| `tags`  | no                            | A list of labels, e.g. `["verbs", "past"]`. Shown under the answer.                                           |
| `note`  | no                            | Extra information shown under the answer: an example sentence, a memory trick, a grammar reminder.            |

Good to know:

- `front`, `back` and `note` are plain text. To start a new line inside them, use `\n`.
- Never change a card's `id` after importing it. The `id` is how the app knows it's the same card.
- Anything else in the file is ignored, so extra fields do no harm.
- The file may also be just the list on its own (`[ {…}, {…} ]`) without the `"cards"` wrapper.

### Card types

| Type          | Typical front                                | Typical back                        |
| ------------- | -------------------------------------------- | ----------------------------------- |
| `vocab`       | `el desafío`                                 | `the challenge`                     |
| `conjugation` | `poner → pretérito, ellos`                   | `pusieron`                          |
| `grammar`     | A question about a rule                      | The rule, briefly                   |
| `phrase`      | `echar de menos`                             | `to miss (someone or something)`    |
| `listening`   | A Spanish sentence                           | Its meaning                         |
| `cloze`       | A sentence with a hidden word (see below)    | The translation of the sentence     |

In this first version the type is a label shown above the card. Only `cloze` cards are displayed
differently. `listening` cards are shown as text for now; audio is a natural thing to add later.

### Cloze cards (fill in the blank)

Mark the hidden word in `front` with double curly brackets:

| You write                       | The question shows  | The answer shows  |
| ------------------------------- | ------------------- | ----------------- |
| `Ayer {{c1::fui}} al mercado.`      | Ayer **[…]** al mercado.  | Ayer **fui** al mercado. |
| `Ayer {{c1::fui::ir}} al mercado.`  | Ayer **[ir]** al mercado. | Ayer **fui** al mercado. |

- The optional third part (`::ir`) is a **hint** shown in place of the blank. A hint makes the card fairer,
  because otherwise several words could fit.
- A sentence can have several blanks (`{{c1::…}}`, `{{c2::…}}`). They are all hidden together and all
  revealed together, as one card.
- `back` is shown under the answer and is the natural place for the English translation.

### What counts as a duplicate

When importing, a card is skipped if either

1. its `id` is already in the app, or
2. a card of the same `type` already has the same `front` (ignoring capital letters and extra spaces).

So importing the same file twice is harmless, and you don't get the same word twice just because it
arrived under a new `id`.

If a card in the file has a mistake (for example a missing `back`), the good cards are still imported and
the app lists exactly which cards were left out and why. You can paste that list back to Claude to have it fixed.

### Sample file

[`public/sample-cards.json`](public/sample-cards.json) holds 10 intermediate-level cards covering every
card type. You don't need to download it: the Import screen has an **Add 10 sample cards** button.

### Asking Claude for cards

Copy this into a Claude chat and change the first line to say what you want:

```text
Make me 20 Spanish flashcards about: [TOPIC, e.g. "irregular preterite verbs", level B1].

Give them to me as a downloadable JSON file in exactly this shape:

{
  "cards": [
    {
      "id": "vocab-aprovechar",
      "type": "vocab",
      "front": "aprovechar",
      "back": "to make the most of",
      "tags": ["verbs"],
      "note": "Hay que aprovechar el buen tiempo. — We should make the most of the good weather."
    }
  ]
}

Rules:
- "id": unique, lowercase, words joined by hyphens, starting with the type (e.g. "conj-poner-preterito-ellos").
- "type": one of vocab, conjugation, grammar, phrase, listening, cloze.
- "front" and "back": plain text, no formatting. Keep them short.
- "tags": a short list of lowercase labels.
- "note" (optional): one example sentence with its translation, or a brief tip.
- For cloze cards, "front" is a full Spanish sentence with the hidden word written as {{c1::answer::hint}}
  (for a verb, the hint is the infinitive), and "back" is the English translation.
- Valid JSON only: double quotes, no trailing commas, no comments.
```

On your iPhone, save the file Claude gives you to the **Files** app, then open Spanish Cards and go to
**Import → Choose a file**.

## Backups

Everything is stored on your phone only, so **save a backup now and then**. If the phone is lost or the
app's data is cleared, a backup file is the only way back.

- **Backup → Save backup file** creates one file, named like `spanish-cards-backup-2026-11-13.json`, holding
  all your cards, the complete review history and your settings. On an iPhone, pick **Save to Files** in the
  menu that appears (iCloud Drive is a good place).
- **Backup → Choose a backup file** restores from such a file. It **replaces** everything on the device, and
  asks you to confirm first. The file is checked from top to bottom before anything is touched, so a damaged
  or wrong file cannot wipe out your data.

### What's inside a backup (for analysing your progress)

The backup is ordinary JSON, so you can hand it to Claude or open it in any data tool.

```json
{
  "app": "spanish-cards",
  "formatVersion": 1,
  "exportedAt": "2026-11-13T09:30:00.000Z",
  "scheduler": { "algorithm": "FSRS-7", "desiredRetention": 0.9 },
  "settings": { "newCardsPerDay": 15 },
  "cards": [ … ],
  "reviews": [ … ]
}
```

Each entry in **`cards`** is the card as you imported it, plus:

| Field        | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| `addedAt`    | When it was imported.                                                |
| `position`   | Import order. New cards are introduced lowest number first.          |
| `scheduling` | The card's current FSRS state (described below).                     |

Each entry in **`reviews`** is one answer you gave. Every single one is kept.

| Field        | Meaning                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `id`         | A running number.                                                          |
| `cardId`     | Which card.                                                                |
| `rating`     | `1` Again, `2` Hard, `3` Good, `4` Easy.                                   |
| `timestamp`  | When you answered.                                                         |
| `durationMs` | How long you took, in milliseconds, from seeing the card to rating it.     |
| `before`     | The card's FSRS state just before this review.                             |
| `after`      | The card's FSRS state just after it.                                       |

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
| `cardId`, `scheduleStatus`, `learningStep` | Bookkeeping used by ts-fsrs.                                                     |

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
- [Vitest](https://vitest.dev) for tests

### Where things live

```text
index.html                 The single page everything is drawn into
src/
  main.ts                  Where the app starts
  config.ts                Settings baked into the app (desired retention, day start, defaults)
  types.ts                 The shapes of cards, reviews and settings
  styles.css               All the styling, including dark mode
  pwa.ts                   Switches on offline support and notices new versions
  study/                   The "brain". No screens, no database
    scheduler.ts             The only file that talks to ts-fsrs
    queue.ts                 Which cards are due, and which card comes next
    today.ts                 Loads what Home and Review need to know about today
    cloze.ts                 Reads {{c1::…}} blanks
    time.ts                  Day boundaries and labels like "10m" or "4d"
  data/                    Saving and loading
    db.ts                    The on-device database (all reads and writes go through here)
    cardFile.ts              Checks an import file
    importCards.ts           Adds imported cards to the database
    backupFile.ts            Builds and checks backup files
  ui/                      Everything you see
    app.ts                   Switches between screens and draws the tab bar
    screens/                 One file per screen: home, review, import, backup, settings
    cardView.ts              Draws a card (question side and answer side)
    dom.ts, icons.ts, updateBanner.ts   Small shared helpers
public/                    Files copied into the app as they are
  sample-cards.json          The 10 sample cards
  manifest.webmanifest       Name, colours and icons for the Home Screen
  icons/
scripts/                   Builds the offline service worker at the end of "npm run build"
tests/                     Automatic checks for the logic in study/ and data/
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
- **Changing what is stored:** add a `db.version(2)` block in `src/data/db.ts` rather than editing version 1,
  and bump `BACKUP_FORMAT_VERSION` in `src/config.ts` if the backup file changes shape.
