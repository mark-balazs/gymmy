import { expect, logSet, signInAs, test } from '../fixtures/test';

/**
 * The Progress tab shows what you have logged — not what falls inside the
 * current training block.
 *
 * It used to window every chart by `blockStart` plus `blockWeeks`. A block is
 * eight weeks and it rolls over, so anyone who had trained for longer than
 * that, or whose block began after their training did, opened Progress and saw
 * no charts at all and a strength score that never moved. The data was all
 * there; the window was looking at the wrong stretch of time.
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

    // One card per exercise trained, each with a chart — which is the whole
    // ask: look at an exercise, see its progress.
    await expect(page.getByRole('heading', { name: 'Goblet Squat' })).toBeVisible();
    await expect(page.locator('svg[data-no-swipe]').first()).toBeVisible();
  });

  test('the table behind each chart carries the same numbers', async ({
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
    await page.getByText('Show the numbers').first().click();
    await expect(page.getByRole('table').first()).toBeVisible();
  });
});
