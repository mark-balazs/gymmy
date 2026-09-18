import type { Page } from '@playwright/test';
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
    await logSet(page, 60, 8);
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
    await logSet(page, 60, 8);
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

/**
 * The two numbers on Progress, and which of them travels.
 *
 * There used to be one, headed "Strength score", and it was a category error:
 * a five-pattern sum fed into a curve fitted to the three-lift powerlifting
 * total, which ran about 44% above the lifter's actual DOTS. Anybody who
 * checked us against a public calculator would have found us wrong.
 *
 * So there are two now, and the reason these tests exist at the browser level
 * rather than only in the domain is that the failure mode is a *reading*
 * failure. Two numbers on one card get read as the same number twice unless the
 * screen works to stop that: different sizes, a decimal on one and not the
 * other, and separate explanations of what each one is not.
 */
test.describe('The two strength numbers', () => {
  /** Squats only — so the index has something to say and DOTS does not. */
  const oneLift = {
    onboarded: true,
    history: {
      split: 'sevenPattern',
      weeksBack: 3,
      exercises: ['Goblet Squat'],
      sessions: 3,
    },
  } as const;

  /**
   * Puts a bodyweight on record, through the form on the page.
   *
   * DOTS is a ratio and the sign-in fixture seeds no bodyweight at all, so
   * without this both numbers are null however much has been lifted. Done
   * through the UI rather than added to the fixture, because it is one field on
   * the same screen and a test that reached around it would stop covering the
   * one path a real account takes to a score.
   */
  const weighIn = async (page: Page, kg: number) => {
    await page.getByLabel('Today (kg)').fill(String(kg));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  };

  /** The three competition lifts, which is the only thing DOTS accepts. */
  const theMeet = {
    onboarded: true,
    // DOTS has a curve per sex and gives no number without an answer, so this
    // account has one. The unanswered case — every real account's starting
    // point — has its own test below.
    sex: 'male',
    history: {
      split: 'sevenPattern',
      weeksBack: 3,
      exercises: ['Barbell Back Squat', 'Barbell Bench Press', 'Conventional Deadlift'],
      sessions: 3,
    },
  } as const;

  test('names the lifts DOTS is still missing rather than going blank', async ({
    page,
    context,
    baseURL,
  }) => {
    /* A blank space teaches nobody what would fill it, and DOTS is null for
       almost everybody — it needs all three competition lifts. So the empty
       state is a sentence that says which ones. */
    await signInAs(page, context, baseURL!, oneLift);
    await page.goto('/progress');
    await weighIn(page, 83);

    await expect(page.getByText(/Still missing:/)).toBeVisible();
    await expect(page.getByText(/Barbell Back Squat/)).toBeVisible();
    await expect(page.getByText(/Conventional Deadlift/)).toBeVisible();

    // The index, meanwhile, is perfectly happy with one lift — an untrained
    // pattern counts as zero rather than blanking the number.
    await expect(page.getByRole('heading', { name: 'Strength index' })).toBeVisible();
    await expect(
      page
        .locator('span')
        .filter({ hasText: /^\d+\.\d$/ })
        .first(),
    ).toBeVisible();
  });

  test('shows a DOTS score once all three lifts are there', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, theMeet);
    await page.goto('/progress');

    // All three lifts are there, so nothing is missing — but the number still
    // cannot exist yet, and it says which of the two reasons applies.
    await expect(page.getByText(/Still missing:/)).toHaveCount(0);
    // Twice, and that is right: both numbers divide by bodyweight, so both are
    // waiting on the same one thing and both say so rather than one of them
    // going quietly blank.
    await expect(page.getByText('Add your bodyweight and this starts tracking.')).toHaveCount(2);

    await weighIn(page, 83);

    // "…across the three lifts" — the total it was computed from, stated, so
    // the number is not just asserted at the reader.
    await expect(page.getByText(/across the three lifts/)).toBeVisible();
  });

  test('keeps the two numbers visibly different kinds of thing', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The reading failure, guarded directly. The index carries a decimal and
       always will — including a trailing zero, so the week it happens to round
       even is not the week it disguises itself as the other number. A DOTS is a
       bare integer. Same card, two shapes.

       This is the test that fails if somebody "tidies up" the formatting. */
    await signInAs(page, context, baseURL!, theMeet);
    await page.goto('/progress');
    await weighIn(page, 83);

    /* Located by where each number sits, not by what it looks like. The first
       version matched "a span of digits with one decimal" anywhere on the page,
       which also matched a lift row's delta — and its last assertion, that the
       two differ, could never fail. Now each is read from its own place and
       held to its own shape. */
    const index = page
      .getByRole('heading', { name: 'Strength index' })
      .locator('xpath=../following-sibling::div[1]/span[1]');
    const dots = page
      .getByText('DOTS', { exact: true })
      .locator('xpath=following-sibling::span[1]');

    await expect(index).toHaveText(/^\d+\.\d$/);
    await expect(dots).toHaveText(/^\d+$/);
  });

  test('asks which curve to use, rather than showing a DOTS no calculator makes', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Every account starts at "prefer not to say" and onboarding never asks.
       DOTS used to fill the gap with the midpoint of the two curves — 18% above
       a man's real score at 83 kg — while its explainer promised that any
       calculator would agree. Now it says what it needs instead. */
    await signInAs(page, context, baseURL!, { ...theMeet, sex: 'unspecified' });
    await page.goto('/progress');
    await weighIn(page, 83);

    await expect(page.getByText(/worked out differently for men and women/)).toBeVisible();
    await expect(
      page.getByText('DOTS', { exact: true }).locator('xpath=following-sibling::span[1]'),
    ).toHaveText('—');
  });

  test('explains each number separately, including what it is not', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Two numbers need two "what this is not" notes. The index's says it is
       nobody else's business; DOTS's says it is not a meet total, which is the
       more important one because DOTS is the number somebody might quote. */
    await signInAs(page, context, baseURL!, theMeet);
    await page.goto('/progress');
    await weighIn(page, 83);

    await page.getByRole('button', { name: 'What this number is' }).click();
    await expect(page.getByText(/not for comparing with anyone else/)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'What DOTS is' }).click();
    await expect(page.getByText(/It is not a meet total/)).toBeVisible();
    // And the three lifts it was built from, so the figure is checkable by hand.
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Barbell Bench Press')).toBeVisible();
  });
});
