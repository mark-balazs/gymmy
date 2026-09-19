/** Flow 04 — see ../flows/04-progression.md */

import { cardNumber, expect, logSet, test } from '../fixtures/test';
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
async function prefilled(page: Page): Promise<string> {
  return `${await cardNumber(page, 'weight')} × ${await cardNumber(page, 'reps')}`;
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
/**
 * The card's history line for a set logged today, exactly as it should read.
 *
 * Exact, because this line is where the advice used to be: "…nothing left —
 * repeat it before adding" was rendered in this same paragraph. A match that
 * stopped at the date let a wrong date through, and anything appended after it.
 */
function lastTimeToday(what: string): string {
  const d = new Date();
  const on = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return `Last time ${what} · ${on}`;
}

async function setDate(page: Page, daysAhead: number): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  await page.locator('input[type="date"]').fill(d.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Day A', exact: true }).click();
}

test.describe('The card shows what you did last time', () => {
  test('prefills last session, so repeating it costs one tap', async ({ onboardedApp: app }) => {
    await logSet(app, 60, 8, '2 more');
    await logSet(app, 60, 8, '2 more');

    await setDate(app, 3);

    // The same numbers, ready to log — not a number worked out from them.
    await expect.poll(() => prefilled(app)).toBe('60 × 8');
  });

  test('states it as history, with the date it happened', async ({ onboardedApp: app }) => {
    await logSet(app, 60, 8, '2 more');
    await setDate(app, 3);

    // The date it happened — today, three days before the card's own date.
    await expect(app.getByText(/^Last time /).first()).toHaveText(lastTimeToday('60 kg × 8'));
  });

  test('takes the working set, not the easiest one', async ({ onboardedApp: app }) => {
    /* 60×8 then 60×10: what you would repeat is the eight, even though it came
       first. In the other order "the fewest reps at the top weight" and "the
       last set at the top weight" are the same set, and a card reading the
       wrong one of the two passed. */
    await logSet(app, 60, 8, 'Maxed');
    await logSet(app, 60, 10, '2 more');

    await setDate(app, 3);

    await expect.poll(() => prefilled(app)).toBe('60 × 8');
  });

  test('says so plainly when there is no history', async ({ onboardedApp: app }) => {
    // Two words where "Last time" would be, so the starting numbers do not
    // read as a suggestion.
    await expect(app.getByText('First time', { exact: true }).first()).toBeVisible();
  });
});

test.describe('The app no longer says what to lift', () => {
  /* Each of these asserted the opposite until this change, and each is here to
     fail if the advice returns. They are deliberately phrased against the copy
     rather than the mechanism: a new engine with new wording would slip past a
     test that only checked the old function was gone. */

  test('never tells you to add weight or chase a rep', async ({ onboardedApp: app }) => {
    await logSet(app, 60, 12, '2 more');
    await logSet(app, 60, 12, '2 more');
    await logSet(app, 60, 12, '2 more');

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
    await logSet(app, 60, 12, 'Maxed');

    await setDate(app, 3);

    // Still just the record. The app has no view on what a maxed set means.
    await expect.poll(() => prefilled(app)).toBe('60 × 12');
    await expect(app.getByText(/nothing left/i)).toHaveCount(0);
    /* The copy check above is only as good as its wording: "repeat it before
       adding" was the advice for exactly this set, and it came in the history
       line itself. So the line is held to the record and nothing else, which
       any rewording of advice in that place would break. */
    await expect(app.getByText(/^Last time /).first()).toHaveText(lastTimeToday('60 kg × 12'));
  });

  test('does not decide your sets are too easy', async ({ onboardedApp: app }) => {
    /* Six sets finishing with four reps in reserve used to trip a banner
       reading "your sets may be too easy" — a judgement about how hard somebody
       should be training, which is not the app's to make.

       The sets land across exercises rather than all on one, because finishing
       three collapses that card and opens the next. Written as a loop on one
       exercise it would still have passed, but only because the app had quietly
       moved on — a test passing for a reason it does not state. */
    for (let i = 0; i < 6; i++) await logSet(app, 40, 10, 'Easy');

    /* Waited for: the banner needed all six rated sets, and the last log click
       returns before its write lands — so an absence checked straight away
       passed before a restored banner could ever have rendered. The day's
       counter comes from the same snapshot the banner would. */
    await expect(app.getByText('6 of 15 sets')).toBeVisible();
    await expect(app.getByText(/too easy/i)).toHaveCount(0);
  });

  test('Home offers no lifts that have "earned more weight"', async ({ onboardedApp: app }) => {
    /* Three sets at the top of the range with reps to spare: the exact state
       that used to put a lift on Home's "Ready for more weight" card. The
       first version of this seeded eight-rep sets, which the old rule never
       flagged either — so it would have passed against the app it was meant
       to fail on. */
    for (let i = 0; i < 3; i++) await logSet(app, 60, 12, '2 more');
    await app.getByRole('link', { name: 'Home', exact: true }).click();
    // Home has read the sets: it offers to carry on with the day they started.
    await expect(app.getByRole('heading', { name: 'Carry on where you left off' })).toBeVisible();

    await expect(app.getByRole('heading', { name: 'Ready for more weight' })).toHaveCount(0);
    await expect(app.getByText(/earned more weight|more weight|add weight/i)).toHaveCount(0);
  });
});
