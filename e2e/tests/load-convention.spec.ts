/** Flow 09 — see ../flows/09-load-convention.md */

import { expect, logSet, openExercise, test } from '../fixtures/test';
import type { Page } from '@playwright/test';

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

    // Before anything is typed there is no figure to name, so it asks plainly.
    await expect(app.getByText('Enter one dumbbell. Both get recorded.')).toBeVisible();

    await app.getByLabel('weight', { exact: true }).fill('20');

    // And the moment there is one, the doubling happens in view. This is the
    // whole mitigation for storing something other than what was typed: nobody
    // has to be told twice, or find out from a chart three weeks later.
    await expect(app.getByText('One dumbbell — recorded as 40 kg, both together.')).toBeVisible();
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
    // The box is still per dumbbell, so logging a second identical set is one
    // tap and not a doubling of the first.
    await expect(app.getByLabel('weight', { exact: true })).toHaveValue('20');

    await logSet(app, 20, 10);
    await expect(loggedSets(app)).toHaveText([/^40 kg × 10/, /^40 kg × 10/]);
  });

  test('leaves a barbell alone', async ({ onboardedApp: app }) => {
    /* The other half of the rule, and the reason the class is per exercise
       rather than per equipment type. Day A opens on Goblet Squat — one weight
       held at the chest — and the bench press below it is a barbell. Neither is
       doubled, and neither claims to be. */
    await expect(app.getByText('The one weight you are holding.')).toBeVisible();
    await logSet(app, 40, 8);
    await expect(loggedSets(app)).toHaveText([/^40 kg × 8/]);
  });

  test('says how to measure every exercise it plans', async ({ onboardedApp: app }) => {
    /* The original complaint was not about dumbbells specifically — it was that
       the app never said how to measure anything, including whether the bar
       counts. So every open card carries a note, whatever it is loaded with.

       Checked across all three days rather than on one card, because the note
       comes from a per-exercise table and a missing entry would fall back
       silently. */
    const notes = [
      'Count the bar and the plates together.',
      'One dumbbell — recorded as',
      'Enter one dumbbell. Both get recorded.',
      'The one weight you are holding.',
      'The setting on the stack',
      'Leave this empty unless you added weight.',
      'What you loaded — not what reaches your hands.',
    ];

    for (const day of ['Day A', 'Day B', 'Day C']) {
      await app.getByRole('button', { name: day, exact: true }).click();
      const name = await openExercise(app);
      const found = await Promise.all(notes.map((n) => app.getByText(n, { exact: false }).count()));
      expect(
        found.some((c) => c > 0),
        `no measuring note on ${day}'s ${name}`,
      ).toBe(true);
    }
  });
});
