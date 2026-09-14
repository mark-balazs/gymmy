import { expect, logSet, signInAs, test } from '../fixtures/test';

/**
 * The Progress tab shows what you have logged — not what falls inside the
 * current training block — and it leads with a verdict rather than with fifteen
 * identical charts.
 *
 * Two failures are being guarded here, both of which shipped.
 *
 * It used to window every chart by `blockStart` plus `blockWeeks`. A block is
 * eight weeks and it rolls over, so anyone who had trained for longer than
 * that, or whose block began after their training did, opened Progress and saw
 * no charts at all and a strength score that never moved. The data was all
 * there; the window was looking at the wrong stretch of time.
 *
 * And the chart itself is only reachable through a list row now, so "the chart
 * renders" is no longer something a page-level assertion can see. The walk from
 * the list to the sheet to the numbers behind it is the actual workflow, and it
 * is what this follows.
 */
test.describe('Progress covers the training, not the block', () => {
  const seeded = {
    onboarded: true,
    // Training three weeks old, with the block starting *this* week — exactly
    // the state an account lands in when its block rolls over.
    blockStartsNow: true,
    history: {
      split: 'sevenPattern',
      weeksBack: 3,
      exercises: ['Goblet Squat', 'Push-Up', 'Inverted Row'],
    },
  } as const;

  test('charts a lift whose history predates the current block', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, seeded);

    // A second week of data, so there are two points to draw a line between.
    await logSet(page, 0, 60, 8);
    await expect(page.getByText('60 kg × 8').first()).toBeVisible();

    await page.getByRole('link', { name: 'Progress', exact: true }).click();
    await page.waitForURL('**/progress');

    /* The page leads with the charts and no verdict at all. It used to open on
       "Needs a look", and with three clean weeks behind it, "nothing needs a
       look — everything you train is moving": the app grading training against
       a standard nobody agreed to. Verdicts now require a goal on the lift, so
       an account that has not set one sees no such card. `goals.spec.ts` walks
       the other half of that. */
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Every lift' })).toBeVisible();

    // The lift is a row in the list, and tapping it is what opens the chart.
    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Goblet Squat' })).toBeVisible();
    await expect(sheet.locator('svg[data-no-swipe]')).toBeVisible();
  });

  test('the table behind the chart carries the same numbers', async ({
    page,
    context,
    baseURL,
  }) => {
    // Tooltips enhance, they never gate: every plotted value is readable
    // without hovering anything.
    await signInAs(page, context, baseURL!, seeded);
    await logSet(page, 0, 60, 8);
    await expect(page.getByText('60 kg × 8').first()).toBeVisible();

    await page.goto('/progress');
    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();

    const sheet = page.getByRole('dialog');
    await sheet.getByText('Show the numbers').click();

    const table = sheet.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'Session' })).toBeVisible();
    // One row per session, and a real number in each — the values are estimated
    // 1RMs rather than the weight that was on the bar, which is what the column
    // says and what the chart is drawn from.
    await expect(table.getByRole('row')).toHaveCount(3);
    await expect(table.getByRole('cell', { name: /\d+(\.\d+)? kg/ })).toHaveCount(2);
  });

  test('shows which movements the weeks actually contained', async ({ page, context, baseURL }) => {
    // The grid is the app's own thesis on a time axis, and it is the one place
    // that says "you have not squatted since July" without being asked.
    await signInAs(page, context, baseURL!, seeded);
    await page.goto('/progress');

    const grid = page.getByRole('table', { name: 'What you have trained' });
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('rowheader', { name: 'Squat' })).toBeVisible();
    await expect(grid.getByRole('rowheader', { name: 'Carry' })).toBeVisible();
  });
});
