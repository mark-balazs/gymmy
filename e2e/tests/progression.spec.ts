/** Flow 04 — see ../flows/04-progression.md */

import { expect, logSet, signInAs, test } from '../fixtures/test';
import type { Page } from '@playwright/test';

/**
 * What the app is putting in front of you for the next set.
 *
 * This file used to be called Progressive overload and asserted the opposite of
 * what it asserts now. The app applied double progression and handed out a
 * target — "add weight, back to 5" — and these tests checked that it did.
 *
 * It does not any more. Telling somebody training alone to put more on the bar
 * is advice about load from software that cannot see their form, their sleep or
 * their shoulder, and a defensible rule is not the same thing as standing to
 * give the instruction. So the card is prefilled with **what you did last
 * time** and captions it as history. See Decision log D-014.
 *
 * The tests below are therefore in two halves: the record is present and
 * usable, and the advice is gone. The second half is the one that matters —
 * it is what fails if a suggestion engine ever comes back.
 */
async function prefilled(page: Page, index = 0): Promise<string> {
  const weight = await page.getByLabel('weight', { exact: true }).nth(index).inputValue();
  const reps = await page.getByLabel('reps', { exact: true }).nth(index).inputValue();
  return `${weight} × ${reps}`;
}

/**
 * Moves the date forward so "last time" means a previous session, and stays on
 * the same day of the split.
 *
 * That second half is not tidiness. Train opens on **the first session not yet
 * trained this week**, so moving three days forward from a Monday lands on Day
 * B — a different exercise with no history, and a card that is correctly blank.
 * The test then fails against an app that is working perfectly.
 *
 * It only showed up when the clock rolled into a Monday: three days from a
 * Friday, Saturday or Sunday crosses into the next week, where nothing has been
 * trained yet and Day A is offered again. So it passed four days in seven and
 * failed the other three, which is the worst kind of test to own.
 */
async function setDate(page: Page, daysAhead: number): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  await page.locator('input[type="date"]').fill(d.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Day A', exact: true }).click();
}

test.describe('The card shows what you did last time', () => {
  test('prefills last session, so repeating it costs one tap', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 8, '2 more');
    await logSet(app, 0, 60, 8, '2 more');

    await setDate(app, 3);

    // The same numbers, ready to log — not a number worked out from them.
    await expect.poll(() => prefilled(app)).toBe('60 × 8');
  });

  test('states it as history, with the date it happened', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 8, '2 more');
    await setDate(app, 3);

    await expect(app.getByText(/Last time 60 kg × 8 · /).first()).toBeVisible();
  });

  test('takes the working set, not the easiest one', async ({ onboardedApp: app }) => {
    // 60×10 then 60×8: what you would repeat is the eight.
    await logSet(app, 0, 60, 10, '2 more');
    await logSet(app, 0, 60, 8, 'Maxed');

    await setDate(app, 3);

    await expect.poll(() => prefilled(app)).toBe('60 × 8');
  });

  test('says so plainly when there is no history', async ({ onboardedApp: app }) => {
    await expect(app.getByText('Nothing logged for this yet').first()).toBeVisible();
  });
});

test.describe('The app no longer says what to lift', () => {
  /* Each of these asserted the opposite until this change, and each is here to
     fail if the advice returns. They are deliberately phrased against the copy
     rather than the mechanism: a new engine with new wording would slip past a
     test that only checked the old function was gone. */

  test('never tells you to add weight or chase a rep', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 12, '2 more');
    await logSet(app, 0, 60, 12, '2 more');
    await logSet(app, 0, 60, 12, '2 more');

    await setDate(app, 3);

    // Three sets at the top of the range with reps to spare: the exact state
    // that used to produce "add weight, back to 6". The card now offers 60 × 12.
    await expect.poll(() => prefilled(app)).toBe('60 × 12');
    await expect(app.getByText(/add weight/i)).toHaveCount(0);
    await expect(app.getByText(/go for one more/i)).toHaveCount(0);
    await expect(app.getByText(/reps to spare/i)).toHaveCount(0);
    await expect(app.getByText(/repeat it before adding/i)).toHaveCount(0);
  });

  test('does not comment on a set taken to failure', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 12, 'Maxed');

    await setDate(app, 3);

    // Still just the record. The app has no view on what a maxed set means.
    await expect.poll(() => prefilled(app)).toBe('60 × 12');
    await expect(app.getByText(/nothing left/i)).toHaveCount(0);
  });

  test('does not decide your sets are too easy', async ({ onboardedApp: app }) => {
    /* Six sets finishing with four reps in reserve used to trip a banner
       reading "your sets may be too easy" — a judgement about how hard
       somebody should be training, which is not the app's to make. */
    for (let i = 0; i < 6; i++) await logSet(app, 0, 40, 10, 'Easy');

    await expect(app.getByText(/too easy/i)).toHaveCount(0);
  });

  test('Home offers no lifts that have "earned more weight"', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: {
        split: 'sevenPattern',
        weeksBack: 3,
        exercises: ['Goblet Squat', 'Push-Up', 'Inverted Row'],
        sessions: 3,
      },
    });
    await page.goto('/home');

    await expect(page.getByRole('heading', { name: 'Ready for more weight' })).toHaveCount(0);
    await expect(page.getByText(/earned more weight/i)).toHaveCount(0);
  });
});
