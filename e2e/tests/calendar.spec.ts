import type { Page } from '@playwright/test';
import { confirmSheet, exerciseNameAt, expect, logSet, signInAs, test } from '../fixtures/test';

/** How the calendar names the month a date falls in, in the app's default
 *  language. Matching the component rather than re-deriving it. */
const monthLabel = (d: Date): string =>
  d.toLocaleDateString('en', { month: 'long', year: 'numeric' });

const monthsBack = (n: number): Date => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d;
};

/**
 * Pages the calendar back until `target` is on screen.
 *
 * The seeded history lands on a single day some weeks ago, which is in this
 * month or a previous one depending on today's date — so a test that simply
 * looked at the month it opened on would pass or fail by the calendar. Bounded
 * so a broken arrow fails here rather than spinning.
 */
async function showMonth(page: Page, target: Date): Promise<void> {
  const label = monthLabel(target);
  for (let i = 0; i < 24; i++) {
    if (await page.getByText(label, { exact: true }).isVisible()) return;
    await page.getByRole('button', { name: 'Previous month' }).click();
  }
  throw new Error(`the calendar would not go back to ${label}`);
}

/**
 * The calendar on Home.
 *
 * The claim is that a day you tap shows what actually happened on it. The trap
 * that claim exists to avoid is reading the day off the *plan* — the plan is
 * rebuilt every time somebody changes split, so a September day sourced from it
 * would silently start describing this week's exercises instead.
 */
test.describe('The calendar on Home', () => {
  test('a day you trained opens what you did on it', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true });

    const lift = await exerciseNameAt(page);
    await logSet(page, 0, 62.5, 8);
    await expect(page.getByText('62.5 kg × 8').first()).toBeVisible();

    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.waitForURL('**/home');

    // Today is the only day with anything on it, so it is the only enabled
    // square — which is itself the assertion that untrained days are not
    // pretending to be tappable.
    const squares = page.getByRole('listitem').filter({ hasText: /./ });
    const trained = page.locator('button[aria-label*="1 sets"], button[aria-label*="1 set"]');
    await expect(trained).toHaveCount(1);
    // One square per day of the month, and no more: the padding that lines the
    // first of the month up under its weekday is not a day and is not listed.
    const count = await squares.count();
    expect(count).toBeGreaterThanOrEqual(28);
    expect(count).toBeLessThanOrEqual(31);

    await trained.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(lift)).toBeVisible();
    await expect(sheet.getByText('62.5 kg × 8')).toBeVisible();
    // The three numbers the day is summarised by.
    await expect(sheet.getByText('Strength score')).toBeVisible();
    await expect(sheet.getByText('Bodyweight')).toBeVisible();
    await expect(sheet.getByText('Sets', { exact: true })).toBeVisible();
  });

  test('a day with nothing on it cannot be opened', async ({ page, context, baseURL }) => {
    // An empty square that opens an empty sheet is worse than one that does
    // not respond: it teaches people the feature is broken.
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/home');

    const squares = page.getByRole('listitem');
    await expect(squares.first()).toBeVisible();
    await expect(squares.first()).toBeDisabled();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('still shows a day trained before the week was rebuilt', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The reason this reads the logs rather than the plan. Three weeks of
     * history, then a different split — the plan those sets were logged under
     * no longer exists, and the day must still say what happened. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'] },
    });

    await page.goto('/settings');
    await page.getByRole('button').filter({ hasText: 'Upper / Lower' }).first().click();
    await page.getByRole('button', { name: 'Rebuild my week' }).click();
    await confirmSheet(page);

    await page.goto('/home');
    // Three weeks ago is last month about three weeks in four, so the day has
    // to be navigated to rather than assumed to be on the opening screen.
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible({
      timeout: 15_000,
    });
    const d = new Date();
    d.setDate(d.getDate() - 21);
    await showMonth(page, d);

    const trained = page.getByRole('listitem').and(page.locator('button:not([disabled])'));
    await expect(trained.first()).toBeVisible({ timeout: 15_000 });
    await trained.first().click();

    await expect(page.getByRole('dialog').getByText('Goblet Squat')).toBeVisible();
  });

  test('pages between months, and refuses to page into the future', async ({
    page,
    context,
    baseURL,
  }) => {
    /* It used to be eight rolling weeks: the columns were weekdays but the rows
       belonged to no month, so the 3rd appeared twice on screen in different
       places and there was no way at all to look back at March. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 10, exercises: ['Goblet Squat'] },
    });
    await page.goto('/home');

    const next = page.getByRole('button', { name: 'Next month' });
    const prev = page.getByRole('button', { name: 'Previous month' });

    // It opens on today, and forward from there is the future — which is not a
    // thing anybody needs to look at in a training log.
    await expect(page.getByText(monthLabel(new Date()), { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(next).toBeDisabled();

    await prev.click();
    await expect(page.getByText(monthLabel(monthsBack(1)), { exact: true })).toBeVisible();
    await expect(next).toBeEnabled();

    await next.click();
    await expect(page.getByText(monthLabel(new Date()), { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
  });
});
