/** Flow 07 — see ../flows/07-choosing-a-split.md */

import type { Page } from '@playwright/test';
import {
  completeOnboarding,
  confirmSheet,
  exerciseNameAt,
  expect,
  logSet,
  signInAs,
  test,
} from '../fixtures/test';

const SEVEN = ['Squat', 'Hinge', 'Lunge', 'Push', 'Pull', 'Rotate', 'Carry'];
/** What push/pull/legs and upper/lower each set out to train. */
const FIVE = ['Squat', 'Hinge', 'Lunge', 'Push', 'Pull'];

/**
 * Asserts the coverage tiles are exactly `names`.
 *
 * Scoped to the coverage list rather than the page, because a push/pull/legs
 * week also labels its days "Push" and "Pull" — a bare text match would pass
 * for the wrong reason. And it checks the absent ones too: the whole point is
 * that a split is not marked down for work it never claimed.
 */
async function expectTiles(page: Page, names: string[]): Promise<void> {
  const tiles = page.getByRole('list', { name: 'Movement coverage' });
  await expect(tiles.getByRole('listitem')).toHaveCount(names.length);
  for (const name of names) {
    await expect(tiles.getByText(name, { exact: true })).toBeVisible();
  }
  for (const name of SEVEN.filter((n) => !names.includes(n))) {
    await expect(tiles.getByText(name, { exact: true })).toHaveCount(0);
  }
}

const openWeek = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Week', exact: true }).click();
  await page.waitForURL('**/week');
};

test.describe('Choosing a split', () => {
  test('the split is asked before the day count', async ({ app }) => {
    await app.goto('/onboarding');
    await expect(
      app.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible();

    for (const name of ['Seven movement patterns', 'Push / Pull / Legs', 'Upper / Lower']) {
      await expect(app.getByRole('button').filter({ hasText: name })).toBeVisible();
    }
    // Custom is something you arrive at by editing, never something you pick here.
    await expect(app.getByRole('button').filter({ hasText: 'Custom' })).toHaveCount(0);
  });

  test('day options are clamped to what the split can cover', async ({ app }) => {
    await app.goto('/onboarding');
    await app.getByRole('button').filter({ hasText: 'Push / Pull / Legs' }).first().click();

    // Two days would miss an entire day type, so it is withheld rather than
    // offered and then quietly under-delivered.
    await expect(app.getByRole('button', { name: /^2 days/ })).toHaveCount(0);
    for (const n of [3, 4, 5, 6]) {
      await expect(app.getByRole('button', { name: new RegExp(`^${n} days`) })).toBeVisible();
    }

    // Back to the split question and pick one that can cover a two-day week.
    await app.getByRole('button', { name: /Back/ }).click();
    await app.getByRole('button').filter({ hasText: 'Upper / Lower' }).first().click();
    await expect(app.getByRole('button', { name: /^2 days/ })).toBeVisible();
  });

  test('the seven-pattern split is scored on all seven', async ({ app }) => {
    await completeOnboarding(app, { days: '3 days' });
    await openWeek(app);
    await expectTiles(app, SEVEN);
  });

  test('a push/pull/legs week is scored on push, pull and legs', async ({ app }) => {
    // Not on rotation or carry. Scoring this split against seven patterns would
    // mark it down for work it never claimed to do.
    await completeOnboarding(app, { split: 'Push / Pull / Legs', days: '3 days' });
    await openWeek(app);
    await expectTiles(app, FIVE);
  });

  test('an upper/lower week is scored on the same five', async ({ app }) => {
    await completeOnboarding(app, { split: 'Upper / Lower', days: '4 days' });
    await openWeek(app);
    await expectTiles(app, FIVE);
    // Four days, five slots each.
    await expect(app.getByRole('button', { name: 'Swap' })).toHaveCount(20);
  });

  test('days are labelled with what they are', async ({ app }) => {
    await completeOnboarding(app, { split: 'Push / Pull / Legs', days: '3 days' });
    await openWeek(app);

    await expect(app.getByRole('heading', { name: 'Day A Push' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Day B Pull' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Day C Legs' })).toBeVisible();
  });

  test('a pinned slot only offers its own pattern when swapping', async ({ app }) => {
    await completeOnboarding(app, { split: 'Push / Pull / Legs', days: '3 days' });
    await openWeek(app);

    // The first exercise of Day A sits in a slot pinned to Push.
    await app.getByRole('button', { name: 'Swap' }).first().click();

    const sheet = app.getByRole('dialog');
    // A real list of pushes is offered — so the assertion below cannot pass
    // merely because the sheet came up empty.
    await expect(
      sheet.getByRole('button', { name: /Bench Press|Overhead Press/ }).first(),
    ).toBeVisible();

    // And nothing from another pattern is in it: a push day's main lift must
    // not be able to quietly become a row.
    const names = await sheet.getByRole('button').allInnerTexts();
    expect(names.filter((n) => /\bRow\b|Pull-?up|Chin-?up|Squat|Deadlift|Carry/i.test(n))).toEqual(
      [],
    );
  });

  test('switching split rebuilds the week and rescores it', async ({ app }) => {
    await completeOnboarding(app, { days: '3 days' });
    await openWeek(app);
    await expectTiles(app, SEVEN);

    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.waitForURL('**/settings');
    await app.getByRole('button').filter({ hasText: 'Upper / Lower' }).first().click();
    await app.getByRole('button', { name: 'Rebuild my week' }).click();
    await confirmSheet(app);

    await openWeek(app);
    await expect(app.getByRole('heading', { name: 'Day A Upper' })).toBeVisible();
    await expectTiles(app, FIVE);

    // The switch has to reach the server, not just IndexedDB — a period that
    // never syncs would leave every other device scoring the old goal.
    await expect(app.getByText('All saved')).toBeVisible({ timeout: 30_000 });
  });

  test('logged history survives a rebuild', async ({ app }) => {
    // Sets reference exercises, not slots, so rearranging the week cannot
    // destroy what was already lifted.
    await completeOnboarding(app, { days: '3 days' });
    const lift = await exerciseNameAt(app);
    await logSet(app, 0, 60, 8);

    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.waitForURL('**/settings');
    await app.getByRole('button').filter({ hasText: 'Upper / Lower' }).first().click();
    await app.getByRole('button', { name: 'Rebuild my week' }).click();
    await confirmSheet(app);

    await app.getByRole('link', { name: 'Progress', exact: true }).click();
    await app.waitForURL('**/progress');
    // Listed under the movement it trains, even though the week it was logged
    // in no longer exists — which is the claim being made.
    await expect(app.getByRole('button', { name: `Show ${lift}` })).toBeVisible();
  });
});

test.describe('Coverage is historised', () => {
  /**
   * An account that trained the seven-pattern method three weeks ago and moved
   * to push/pull/legs since. This is the requirement in one test: the old weeks
   * must still read as seven-pattern weeks.
   */
  const seeded = {
    onboarded: true,
    split: 'pushPullLegs',
    days: 3,
    history: {
      split: 'sevenPattern',
      weeksBack: 3,
      exercises: ['Goblet Squat', 'Push-Up', 'Inverted Row'],
    },
  } as const;

  test('this week is scored under the split in force now', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, seeded);
    await openWeek(page);
    await expectTiles(page, FIVE);
  });

  test('an earlier week keeps the split it was trained under', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, seeded);
    await openWeek(page);

    // Page back to the block's first week, which was trained seven-pattern.
    for (let i = 0; i < 3; i++)
      await page.getByRole('button', { name: 'Back', exact: true }).click();

    await expectTiles(page, SEVEN);
    // And the page says why the goal is different, rather than leaving the
    // changed tile count looking like a glitch.
    await expect(page.getByText('Scored as Seven movement patterns')).toBeVisible();
  });

  test('the old week still shows the sets logged in it', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, seeded);
    await openWeek(page);
    for (let i = 0; i < 3; i++)
      await page.getByRole('button', { name: 'Back', exact: true }).click();

    // Three of seven trained that week — the data is untouched by the switch.
    await expect(page.getByText(/3 gaps|4 gaps/)).toBeVisible();
  });
});
