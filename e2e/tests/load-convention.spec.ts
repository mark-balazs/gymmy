/** Flow 09 — see ../flows/09-load-convention.md */

import {
  cardNumber,
  expect,
  logSet,
  logSuggested,
  numberButton,
  openCard,
  openExercise,
  signInAs,
  test,
  typeNumber,
} from '../fixtures/test';
import type { Page } from '@playwright/test';
import type { DatedSet } from '../fixtures/auth';

/**
 * What the number in the weight box means.
 *
 * The app asked for a "weight" for months and never said what it counted. On a
 * barbell that is nearly harmless. On two dumbbells it is a **factor of two**,
 * and once a row is stored there is nothing in it to say which side of that the
 * person was on — a dumbbell bench press logged as 30 is either 30 or 60.
 *
 * The convention is now: **enter one dumbbell, both get recorded.** The entry
 * side is what people already do and what they can read off the implement; the
 * stored side is what the strength literature means by a dumbbell load (Farias
 * et al. 2017, "the sum of the 2 dumbbells combined"). See `load.ts`.
 *
 * These tests exist because the conversion happens at exactly one boundary — the
 * weight box on the Train card — and a unit test of `toStored` cannot show that
 * the box is on the right side of it. What has to be true end to end is that the
 * number you type and the number the app keeps are *both* visible, and that
 * nothing silently doubles twice or not at all.
 */

/**
 * The sets logged on the open card, as they are written out.
 *
 * Deliberately not a page-wide text match: the card also states the previous
 * session as "Last time 40 kg × 10", so every number here appears twice and
 * once more with each set.
 */
const loggedSets = (page: Page) => page.locator('main .num').filter({ hasText: /kg ×/ });

/** The open card's weight, as a screen reader hears it: the number, then what it counts. */
const weightButton = (page: Page) => numberButton(page, 'weight');

/**
 * Opens the ⓘ beside the open card's weight — where what the number counts
 * lives when it is not a line on the card — and returns its text.
 */
async function weightTip(page: Page) {
  await page.getByRole('button', { name: 'What weight to enter', exact: true }).tap();
  const note = page.getByRole('note', { name: 'What weight to enter', exact: true });
  await expect(note).toBeVisible();
  return note;
}

/** Day B opens on Reverse Lunge, which is loaded with a dumbbell in each hand. */
async function openPairDay(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Day B', exact: true }).click();
  const name = await openExercise(page);
  // Stated rather than assumed: if the generator ever stops putting a
  // dumbbell-pair movement first on Day B, this fails with the reason instead
  // of with a confusing assertion about a number further down.
  expect(name).toBe('Reverse Lunge');
  return name;
}

test.describe('The app says what it is counting', () => {
  test('tells you to enter one dumbbell, and shows the figure it will keep', async ({
    onboardedApp: app,
  }) => {
    await openPairDay(app);

    /* There is no empty box any more — a card with no history starts on a light
       pair — so the line names the recorded figure from the first moment,
       rather than asking plainly and naming it once something is typed. */
    const start = Number(await cardNumber(app, 'weight'));
    expect(start).toBeGreaterThan(0);
    /* On the card, not behind an ⓘ: this is the one note that stops a wrong
       entry — type both dumbbells and 120 is stored for 60. */
    await expect(app.getByText(`One dumbbell — saved as ${start * 2} kg for both.`)).toBeVisible();
    await expect(app.getByRole('button', { name: 'What weight to enter' })).toHaveCount(0);

    await typeNumber(app, 'weight', 20);

    // And it follows the number as it changes, so the doubling happens in view.
    // This is the whole mitigation for storing something other than what was
    // typed: nobody has to be told twice, or find out from a chart three weeks
    // later.
    await expect(app.getByText('One dumbbell — saved as 40 kg for both.')).toBeVisible();

    // The buttons move the one dumbbell too — a pair goes up 2 kg at a time,
    // which is 4 kg recorded.
    await app.getByRole('button', { name: 'weight +', exact: true }).click();
    await expect(app.getByText('One dumbbell — saved as 44 kg for both.')).toBeVisible();
  });

  test('records both dumbbells while the box keeps showing one', async ({ onboardedApp: app }) => {
    await openPairDay(app);
    await logSet(app, 20, 10);

    /* The logged set is the load — both dumbbells — because that is what every
       other screen in the app shows and what the score is computed from.

       Scoped to the logged rows rather than the page. "Last time 40 kg × 10"
       appears the moment the first set lands, so a page-wide text match is
       ambiguous by construction and a count of it would be off by one. */
    await expect(loggedSets(app)).toHaveText([/^40 kg × 10/]);
    // The card still holds one dumbbell, so logging a second identical set is
    // one tap and not a doubling of the first.
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '20');

    /* Back from history: a card that mounts on a pair with a set behind it has
       to turn the stored 40 back into one dumbbell. Logging the second set in
       the same mount never asked it to — the box was still holding the 20 that
       was typed — so a card that prefilled the stored figure would put 40 in
       the box, and the next one-tap set would record 80.

       Day B is opened by hand after the reload rather than trusted to come
       back on its own: which day Train opens on is not what this is about. */
    await app.reload();
    await openPairDay(app);
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '20');
    await expect(app.getByText('One dumbbell — saved as 40 kg for both.')).toBeVisible();
    await logSuggested(app);
    await expect(loggedSets(app)).toHaveText([/^40 kg × 10/, /^40 kg × 10/]);
  });

  test('leaves a single dumbbell alone', async ({ onboardedApp: app }) => {
    /* The other half of the rule, and the reason the class is per exercise
       rather than per equipment type. Day A opens on Goblet Squat — one weight
       held at the chest — which is entered and stored exactly as typed, and
       says so: behind the ⓘ, since it is what anybody types anyway, and as
       the weight's description for a screen reader. The barbell's own note is
       held by the test below. */
    const says = 'The weight of the one dumbbell or kettlebell you are holding.';
    await expect(weightButton(app)).toHaveAccessibleDescription(new RegExp(says));
    await expect(await weightTip(app)).toHaveText(says);
    await logSet(app, 40, 8);
    await expect(loggedSets(app)).toHaveText([/^40 kg × 8/]);
  });

  test('the ⓘ beside the weight never takes a tap meant for the buttons', async ({
    onboardedApp: app,
  }) => {
    /* The ⓘ's tap area runs 10 px past its mark, and it sits right above
       "−", the most pressed button on the card. A tap on the top edge of "−"
       mid-set must still take a step off, not open a tip. */
    const info = app.getByRole('button', { name: 'What weight to enter', exact: true });
    const minus = app.getByRole('button', { name: 'weight −', exact: true });
    const i = (await info.boundingBox())!;
    const m = (await minus.boundingBox())!;
    expect(i.y + i.height + 10).toBeLessThanOrEqual(m.y + 0.5);

    const before = Number(await cardNumber(app, 'weight'));
    await app.touchscreen.tap(m.x + m.width / 2, m.y + 2);
    await expect(weightButton(app)).toHaveAttribute('data-value', String(before - 2));
    await expect(app.getByRole('note', { name: 'What weight to enter' })).toBeHidden();
  });

  test('says how to measure each kind of load it plans', async ({ onboardedApp: app }) => {
    /* The original complaint was not about dumbbells specifically — it was that
       the app never said how to measure anything, including whether the bar
       counts. So each kind of load carries its own note on the card.

       Named cards and their own notes, not "some note on the first card of
       each day": those first cards are all dumbbells, and a lift missing from
       the table falls back to the single-dumbbell note, which was on the list
       that test accepted — so it could not catch the thing it was written for,
       and swapping two classes' notes passed the whole suite. Whether every
       lift is in the table at all is the domain suite's job (`load.test.ts`);
       this is that each class's note reaches the card. With the pair and the
       single dumbbell above, that is five of the six.

       Only what stops a wrong entry is written on the card; the rest waits
       behind the ⓘ and is the weight's description for a screen reader. So
       each is opened, not just found — a closed tip's text is in the page. */

    // A bodyweight lift says it in three words, or somebody types their own
    // bodyweight; a screen reader hears the whole sentence.
    await app.getByRole('button', { name: 'Day B', exact: true }).click();
    await openCard(app, 'Chin-Up');
    await expect(app.getByText('Added weight only', { exact: true })).toBeVisible();
    await expect(weightButton(app)).toHaveAccessibleDescription(
      /Leave it at None unless you added weight\./,
    );

    await app.getByRole('button', { name: 'Day C', exact: true }).click();
    await openCard(app, 'Leg Curl');
    await expect(await weightTip(app)).toContainText('Enter the number on the machine.');
    await expect(weightButton(app)).toHaveAccessibleDescription(/number on the machine/);

    /* The bar, loaded plate by plate, needs nothing: gymmy adds the bar and
       the plates up itself, and the line under the total shows how. With
       Load the bar off it is a number like any other, and the ⓘ says the bar
       counts. */
    await app.getByRole('button', { name: 'Day A', exact: true }).click();
    await openCard(app, 'Barbell Bench Press');
    await expect(app.getByRole('button', { name: 'What weight to enter' })).toHaveCount(0);
    await expect(app.getByText(/whole bar/)).toHaveCount(0);

    await app.goto('/settings');
    const plates = app.getByRole('switch', { name: 'Load the bar on barbell lifts' });
    await plates.click();
    await expect(plates).not.toBeChecked();
    await app.goto('/train');
    await app.getByRole('button', { name: 'Day A', exact: true }).click();
    await openCard(app, 'Barbell Bench Press');
    await expect(await weightTip(app)).toHaveText(
      'The whole bar: the bar itself plus every plate on it.',
    );
  });
});

test.describe('The chart says when the convention moved it', () => {
  /**
   * A pair logged per hand before the cutover and both together after it —
   * 30 kg to 60 kg overnight, with nothing changed in the training. On fixed
   * dates either side of `LOAD_CONVENTION_FROM`, because the note is about that
   * day and not about "three weeks ago".
   */
  const perHandThenBoth: DatedSet[] = [
    { exercise: 'DB Bench Press', date: '2026-08-27', weight: 30, reps: 8, rir: 2 },
    { exercise: 'DB Bench Press', date: '2026-09-03', weight: 30, reps: 8, rir: 2 },
    { exercise: 'DB Bench Press', date: '2026-09-10', weight: 30, reps: 8, rir: 2 },
    { exercise: 'DB Bench Press', date: '2026-09-17', weight: 60, reps: 8, rir: 2 },
    { exercise: 'DB Bench Press', date: '2026-09-18', weight: 62, reps: 8, rir: 2 },
  ];
  const note = /record both dumbbells, not one/;

  /**
   * Progress, looking at all of it. The page opens on twelve weeks, and once
   * the cutover leaves that window the note correctly goes — so a test on the
   * default view would start failing in December for no fault of the app.
   */
  async function allTime(page: Page): Promise<void> {
    await page.goto('/progress');
    const window = page.getByRole('button', { name: 'Last 12 weeks' });
    await window.click();
    await expect(page.getByRole('button', { name: 'All time' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  test('says so on the index and on the lift, where the jump shows', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The note is unit-tested in the domain; what nothing else saw is the page
       choosing to show it — on the strength card, only for a lift that feeds
       the index, and under the lift's own chart. Without it a doubling that is
       pure bookkeeping reads as the best month of somebody's training. */
    await signInAs(page, context, baseURL!, { onboarded: true, sets: perHandThenBoth });
    await allTime(page);

    // Once, on the strength card: the lift's sheet is not open yet.
    await expect(page.getByText(note)).toHaveCount(1);

    await page.getByRole('button', { name: 'Show DB Bench Press' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'DB Bench Press' })).toBeVisible();
    await expect(sheet.getByText(note)).toBeVisible();
  });

  test('says nothing where there was no jump', async ({ page, context, baseURL }) => {
    // Somebody who was already entering both dumbbells crossed the date and
    // saw no step, so there is nothing to explain to them.
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sets: perHandThenBoth.map((s) => ({ ...s, weight: 60 })),
    });
    await allTime(page);
    await expect(page.getByRole('heading', { name: 'Strength index' })).toBeVisible();
    await expect(page.getByText(note)).toHaveCount(0);

    await page.getByRole('button', { name: 'Show DB Bench Press' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'DB Bench Press' })).toBeVisible();
    await expect(sheet.getByText('Show the numbers')).toBeVisible();
    await expect(sheet.getByText(note)).toHaveCount(0);
  });
});
