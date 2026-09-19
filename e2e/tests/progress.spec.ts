import type { Page } from '@playwright/test';
import { expect, logSet, openCard, recordedSet, signInAs, test } from '../fixtures/test';

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
    /* And an account from before the catalogue: the history is logged against
       its old copied rows, today's set against the catalogue's id. They are
       one lift only because `index()` reads the old rows as aliases by name —
       so the two-point chart and the two-row table below are also the one
       end-to-end witness of that path. Every other fixture account has no
       exercise rows at all, like every account created today. */
    legacyLibrary: true,
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

    /* No verdict card: progression verdicts need a goal, and the one ungated
       verdict (dormant: in the plan, untouched 21+ days) has nothing to say
       here, because Goblet Squat was trained today and Push-Up / Inverted Row
       are not in the plan. `goals.spec.ts` walks the other half.

       The lift list first, because the page's first paint is the empty state
       — before the snapshot arrives there is no card of any kind, so an
       absence checked then passes whatever the page goes on to draw. */
    await expect(page.getByRole('heading', { name: 'Every lift' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toHaveCount(0);

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
    /* One row per session, and in each the estimated 1RM rather than the weight
       that was on the bar — which is what the column says and what the chart is
       drawn from. So the numbers themselves: 40 × 8 and 60 × 8, both with two
       in reserve, are 53.3 and 80. "Any number in kilos" also passed on the bar
       weights, 40 and 60, which is the mix-up this exists to catch. */
    await expect(table.getByRole('row')).toHaveCount(3);
    await expect(table.getByRole('cell', { name: /^53\.3 kg/ })).toBeVisible();
    await expect(table.getByRole('cell', { name: /^80 kg/ })).toBeVisible();
    await expect(
      sheet.getByRole('img', { name: 'Your estimated best single lift, session by session' }),
    ).toBeVisible();
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

    /* The cells, not just the rows. Every counted pattern gets a row whatever
       was logged, so row headers alone would pass on a grid that counted
       nothing. The squat logged three weeks ago is one set in one week; carry
       was never trained, and this week's square is still going rather than
       missed. Attribute locators, because the cells are plain divs. */
    const row = (n: string) =>
      grid.locator('tr').filter({ has: page.getByRole('rowheader', { name: n, exact: true }) });
    // "1 set": the label is counted, so one set is said in the singular.
    await expect(row('Squat').locator('[aria-label="1 set"]')).toHaveCount(1);
    await expect(
      row('Carry').locator(
        '[aria-label$=" set"], [aria-label$=" sets"]:not([aria-label="0 sets"])',
      ),
    ).toHaveCount(0);
    await expect(row('Carry').locator('[aria-label="This week, still going"]')).toHaveCount(1);
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
  /**
   * A squat and a bench: the index has something to say, and DOTS is still
   * missing two lifts. The bench is one of DOTS's own three, so the sentence
   * has to leave it out — with none of the three trained, a list that ignored
   * what was trained would read the same.
   */
  const twoLifts = {
    onboarded: true,
    history: {
      split: 'sevenPattern',
      weeksBack: 3,
      exercises: ['Goblet Squat', 'Barbell Bench Press'],
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
    await signInAs(page, context, baseURL!, twoLifts);
    await page.goto('/progress');
    await weighIn(page, 83);

    await expect(page.getByText(/Still missing:/)).toHaveText(
      'Needs a barbell squat, bench press and deadlift. Still missing: Barbell Back Squat, Conventional Deadlift.',
    );

    /* The index, meanwhile, is perfectly happy with two of five patterns — an
       untrained pattern counts as zero rather than blanking the number. Read
       from where the index sits: a page-wide "one decimal" span also matched
       the lift row's change beside it, which was there with or without an
       index. Two bests of 60 over 83 kg to the two-thirds is 6.3. */
    await expect(
      page
        .getByRole('heading', { name: 'Strength index' })
        .locator('xpath=../following-sibling::div[1]/span[1]'),
    ).toHaveText('6.3');
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

    /* The number, and the total it was computed from, stated so it is not just
       asserted at the reader. Three bests of 60 is 180, which at 83 kg on the
       men's curve is 122. The sentence alone renders whenever nothing is
       missing, whatever the total — a wrong coefficient still makes an integer
       and the same words. */
    await expect(
      page.getByText('DOTS', { exact: true }).locator('xpath=following-sibling::span[1]'),
    ).toHaveText('122');
    await expect(page.getByText('180 kg across the three lifts')).toBeVisible();
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

       This is the test that fails if somebody "tidies up" the formatting —
       which is why the bodyweight is 89.4: there the index is 9.004, a round
       number, and dropping the fixed decimal renders it as "9". At 83 kg it is
       9.46, which reads "9.5" either way and could not tell. */
    await signInAs(page, context, baseURL!, theMeet);
    await page.goto('/progress');
    await weighIn(page, 89.4);

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

    await expect(index).toHaveText('9.0');
    await expect(dots).toHaveText('117');
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
    /* And the patterns it was built from, so the figure is checkable by hand:
       squat, hinge and push at 60 each, lunge and pull never trained. Exact,
       so the explanatory paragraphs above cannot match. */
    await expect(page.getByRole('dialog').getByText('60 kg', { exact: true })).toHaveCount(3);
    await expect(page.getByRole('dialog').getByText('—', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'What DOTS is' }).click();
    await expect(page.getByText(/It is not a meet total/)).toBeVisible();
    /* And the three lifts it was built from, with their numbers. The names
       alone are always there — the sheet lists all three whatever was lifted —
       so it is the figures that make it checkable. */
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Barbell Bench Press')).toBeVisible();
    await expect(sheet.getByText('60 kg', { exact: true })).toHaveCount(3);
  });

  test('names a lift trained too light to estimate, rather than calling it missing', async ({
    page,
    context,
    baseURL,
  }) => {
    /* A bench trained only above the rep ceiling has no estimate, and it used
       to be reported as "still missing" to somebody who had benched that very
       week. It is trained; it just has no number yet, and the sentence says
       which, and why. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sex: 'male',
      history: {
        split: 'sevenPattern',
        weeksBack: 3,
        exercises: ['Barbell Back Squat', 'Conventional Deadlift'],
        sessions: 3,
      },
    });
    await openCard(page, 'Barbell Bench Press');
    await logSet(page, 60, 12, '2 more'); // 12 + 2 > 10: trained, but nothing to estimate from
    await recordedSet(page, 12);

    await page.goto('/progress');
    await weighIn(page, 83);

    await expect(
      page.getByText('No number for Barbell Bench Press yet — it needs a set of 10 reps or fewer.'),
    ).toBeVisible();
    await expect(page.getByText(/Still missing:/)).toHaveCount(0);
    await expect(
      page.getByText('DOTS', { exact: true }).locator('xpath=following-sibling::span[1]'),
    ).toHaveText('—');
  });
});
