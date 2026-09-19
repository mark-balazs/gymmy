# Testing

## Three layers, and which one a change belongs in

| Layer | Runs | Covers | Cost |
| --- | --- | --- | --- |
| `packages/domain/test` | Vitest, no IO | Every training rule | Instant |
| `apps/web/src/**/*.test.ts` | Vitest, **real Postgres** | Anything that is SQL, and rules the source and stylesheet must keep (motion tokens, CSS variables, a `<Presence>` round every conditional sheet) | ~1s |
| `e2e/tests` | Playwright, production build, Pixel 7 | What a person does | ~25s for all of it |

Put logic in the domain layer and test it there. The domain has no dependencies,
so those tests need no fixtures, no database and no browser — which is why there
are ~140 of them and they run in under 200ms.

A test that would need a mocked database belongs in `apps/web` against the real
one instead. The seeding tests are there because the thing being tested *is* the
SQL — idempotence is a property of the ids and the conflict clauses, and a mock
would prove nothing about either.

## The e2e suite has two layers of its own

**Most specs bypass authentication**, inserting a user and a session row directly
(`e2e/fixtures/auth.ts`). Fast, independent, and no test-only code path in the
production build.

**Flow 08 does not bypass anything**, and it exists because that trade had a cost.
Email sign-in was broken from the day it shipped — the code was posted in the
request body and Auth.js reads it from the query string — and the suite stayed
green the whole time, because asking for a code was covered and entering one was
not.

> **If a step only ever happens on the way in, a fixture cannot cover it.**

Account creation, server-side seeding, the first sync onto an empty device and
the sign-out wipe all belong to the journeys in `journey.spec.ts`.

Flows are written up in [`e2e/flows`](../e2e/flows) *before* the tests that cover
them, and the README there maps each flow to its spec.

## The discipline that actually catches things

Adding a test is not the bar. **Break the fix and watch the test fail.**

Every significant fix in this codebase was verified that way, and it has twice
revealed that a test proved nothing:

- the sync-paging fix — reverted, the test failed, so the cursor bug is caught;
- the historisation guard — made periods retroactive, and *only* the new test
  failed, so nothing else was covering it;
- the email sign-in fix — reverted to a POST, and the three original
  "requesting a code" tests stayed green, which is precisely how it shipped;
- the seed repair — disabled, and the account hung on a loading screen;
- the coverage repair pass — disabled, and at first **nothing failed**, because
  the seeded library never needs it; a hand-built split in `splits.test.ts` now
  forces the repair to matter, and fails without it.

Say in the commit message when you have done this. It is the difference between
a test and a decoration.

## Running it

```bash
docker compose up -d db
npm run db:migrate
npm run build        # e2e serves the last production build — always build first
npm test
```

Two ways the suite lies to you if you skip that:

- **`next start` serves the previous build.** A UI change tests the old one and
  passes for the wrong reason.
- **`reuseExistingServer` is on outside CI.** A `next dev` server left on the
  suite's port gets reused, and the service worker does not register in
  development — so the offline and PWA-update specs fail for a reason that has
  nothing to do with your change. Worse, a server from another project answers
  every page with a 404. The port is 3000 unless `E2E_PORT` says otherwise;
  point it at a free port rather than stopping somebody else's server.

## Fragilities worth knowing

- **The sign-in throttle is shared.** It buckets by `x-forwarded-for`, which no
  test sends, so the whole suite shares one bucket. Any test asserting on an
  un-throttled response must call `resetSignInThrottle()` first.
- **Tab-bar locators must be `exact: true`.** A card whose description mentions
  "week" will otherwise match `link named "Week"`.
- **Charts need two sessions** before they render anything, so a test that
  locates one has to seed history *and* log something today.
- **The chart lives in a sheet.** On Progress, only the strength score draws at
  rest; an exercise's chart is behind its row. Reaching it is part of the test —
  `getByRole('button', { name: \`Show ${lift}\` })`, then the dialog.
- **An overlay above an overlay owns Escape.** The sheet and the lightbox both
  listen on `document`, and the sheet registered first — so one press closed
  both. The lightbox listens in the *capture* phase and stops the event once it
  has handled it. A test for a nested overlay should press Escape and assert the
  thing underneath survived.
- **A `fixed` overlay inside a sheet is sized to the sheet.** The sheet's
  panel animates on `translate` and a drag moves it by `transform`, and either
  makes it the containing block. The lightbox portals to the body; a test that
  only checks it rendered would not notice. Measure it.
- **Sheets, the keypad and the lightbox all portal to the body**, so none of
  them is inside `main` or the card that opened it, and a faded card cannot
  fade them (`exercise-detail.spec.ts` multiplies the opacities to prove it).
  Scope a sheet with `getByRole('dialog')`, never through the card.
- **A closed sheet is still in the page for 220 ms.** It plays its exit
  `inert` and `aria-hidden`, so `getByRole('dialog')` stops finding it at once
  and a tap on the page behind lands — but `locator('[data-sheet]')` and
  `getByText` still see it until the exit ends. Wait for
  `[data-sheet]` / `[data-keypad]` to reach a count of 0 before anything that
  needs it truly gone. An exit is too short to catch from the test side:
  `sheets.spec.ts` presses and looks inside one `page.evaluate`.
- **Drag a sheet through CDP touches**, as `sheets.spec.ts` does, not with
  events built in the page. Speed is set by pausing: after more than 100 ms
  still, the finger has no speed and only distance decides.
- **Anything named "Next" needs `exact: true` and a scope.** Next.js's own
  dev-tools button is called "Next", so an unscoped `getByRole('button', { name:
  'Next' })` passes against a production build and fails the moment a dev server
  is what answered on :3000 — which looks like a flake and is not one.
- **A closed ⓘ still holds its text.** The popover is in the DOM, hidden, so
  `getByText` finds it and a strict `toBeVisible` can match both it and a
  visible copy. Open it first — tap the ⓘ by name ("More on …"), then
  `getByRole('note', { name })`. A count of text that moved behind an ⓘ keeps
  counting it, so a test that only checks `count() > 0` stops proving anything.
  And copy in a tip on Train or Home must avoid the phrases
  `progression.spec.ts` checks never appear ("add weight", "reps to spare",
  "nothing left", "too easy", "earned more weight").
- **The day's count on Train is on the page twice**: drawn (`aria-hidden`, a
  digit to a box so it can roll) and whole in an `sr-only` span for a screen
  reader. `getByText('1 of 15 sets')` finds both and a strict assertion fails;
  use `dayCounter` (drawn) or `heardCounter` (heard) from the fixtures.
- **"Before the rest of the history arrives" is a moment you make.** A new
  phone's first sync page opens the app and the rest follows at once, so a test
  about that gap holds every later page at the network (`holdLaterPages` in
  `opening-a-tab.spec.ts`: `since` above 0) and releases it when ready.
- **A tip owns Escape.** It listens on `window` in the capture phase and stops
  the event, so a tip inside a sheet closes alone. A test for a tip in a sheet
  should press Escape and assert the sheet survived.
- **Motion is asserted by recording it.** `logging-moments.spec.ts` samples
  `document.getAnimations()` every frame. Two traps, both found the hard way:
  give each recording its own number, or the loop of the one before keeps
  running and every animation is counted twice; and let the page go still
  between two steps (`still()`), as a person rests between sets — a second set
  logged while the first one's pop is still running hides a pop that replays.
- **An ⓘ label never starts with "About ".** That prefix is the exercise names'
  button, and `exerciseNameAt` and `first-run.spec.ts` count them by it.
- **An ⓘ label never contains its neighbour's name either.** Name matching is a
  case-insensitive substring unless `exact`, so "More on Use this plan" makes
  `getByRole('button', { name: 'Use this plan' })` match two buttons, and
  `getByLabel` reads `aria-label` too — "More on Year of birth" would answer to
  the field's own label. Give such an ⓘ a name of its own.
- **The strength index has no past without a past bodyweight.** A weigh-in
  through the page is dated today, so every earlier week has no index, and
  whether the chart gets a second point (and the arrow beside the number
  exists) depends on the weekday the suite runs. A test about the index over
  time seeds a reading with the `bodyWeights` fixture option. `goals` seeds a
  goal on fixed dates (an ended one cannot be reached through the form), and
  `role: 'trainer'` gives an account the coach area.
- **Never hard-code which exercise the generator picked.** It depends on the
  split in force, so use `exerciseNameAt(page)` — a hard-coded name turns a
  split change into a mystery failure three specs away from the cause.
- **A swipe's speed comes from the event times, so give them.** The app reads
  how fast the finger let go from the touch events' timestamps. Sent through
  CDP without one, each event is stamped when it arrives, and on a busy machine
  a 30 ms flick arrived over 150 ms and read as a slow drag. `finger()` in
  `navigation.spec.ts` stamps each event a frame after the last, and `hold()`
  keeps the finger still without waiting in real time.
- **Wait out the last slide before looking for the next.**
  `:active-view-transition-type()` still matches the move before — a check
  armed straight after a click read the previous move's direction. `slideOf()`
  waits for no transition first.
