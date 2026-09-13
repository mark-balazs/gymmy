import { confirmSheet, exerciseNameAt, expect, logSet, signInAs, test } from '../fixtures/test';

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
    const today = page.getByRole('listitem').filter({ hasText: /./ });
    const trained = page.locator('button[aria-label*="1 sets"], button[aria-label*="1 set"]');
    await expect(trained).toHaveCount(1);
    expect(await today.count()).toBeGreaterThan(40);

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
    const trained = page.getByRole('listitem').and(page.locator('button:not([disabled])'));
    await expect(trained.first()).toBeVisible({ timeout: 15_000 });
    await trained.first().click();

    await expect(page.getByRole('dialog').getByText('Goblet Squat')).toBeVisible();
  });
});
