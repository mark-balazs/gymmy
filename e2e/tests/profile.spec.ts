import type { Page } from '@playwright/test';
import { expect, logSet, signInAs, test } from '../fixtures/test';

/** The hero number on Progress: the only span on the page that is nothing but
 *  digits. The chips carry words, the delta reads "+6 vs 8 weeks ago", and the
 *  chart's axis labels are SVG text rather than spans. */
const strengthScore = (page: Page) => page.locator('span').filter({ hasText: /^\d+$/ }).first();

/**
 * The profile section.
 *
 * The interesting assertion is not that the fields exist — it is that the year
 * of birth **reaches the strength score**. The score has supported an age
 * allowance for some time and there was nowhere to enter an age, so that code
 * had never once run for a real person. A test that only typed into the box and
 * read it back would have passed against exactly that.
 */
test.describe('Your profile', () => {
  const seeded = {
    onboarded: true,
    history: { split: 'sevenPattern', weeksBack: 4, exercises: ['Goblet Squat'] },
  } as const;

  test('remembers a name across a reload', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/settings');

    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Mark');
    // Committed on blur rather than on every keystroke — otherwise the field
    // fights you, syncing and re-rendering under the cursor.
    await name.blur();

    await page.reload();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Mark', {
      timeout: 15_000,
    });
  });

  test('refuses a year that cannot be a birth year', async ({ page, context, baseURL }) => {
    // A typo here shifts the age allowance on every week of the score, and
    // silently — so it is rejected rather than stored and quietly ignored.
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/settings');

    const year = page.getByLabel('Year of birth');
    await year.fill('19');
    await year.blur();
    await expect(page.getByText(/Enter a year between 1900 and \d{4}/)).toBeVisible();

    await year.fill('1990');
    await year.blur();
    await expect(page.getByText(/Enter a year between/)).toBeHidden();
  });

  test('the year of birth changes the strength score', async ({ page, context, baseURL }) => {
    /* The whole point of collecting it. A masters lifter's score is adjusted
     * upward for age, so the same lifting with an older birth year must not
     * produce the same number — and if it does, the field is decoration. */
    await signInAs(page, context, baseURL!, seeded);
    await logSet(page, 0, 100, 5);
    await expect(page.getByText('100 kg × 5').first()).toBeVisible();

    await page.goto('/settings');
    await page.getByLabel('Sex').selectOption('male');
    await page.getByLabel('Height').fill('180');
    await page.getByLabel('Height').blur();

    await page.goto('/progress');
    await page.getByPlaceholder(/Today \(kg\)/).fill('80');
    await page.getByRole('button', { name: 'Save' }).click();

    const score = strengthScore(page);
    await expect(score).toBeVisible({ timeout: 15_000 });
    const noAllowance = Number(await score.textContent());
    expect(noAllowance).toBeGreaterThan(0);

    await page.goto('/settings');
    const year = page.getByLabel('Year of birth');
    await year.fill('1955');
    await year.blur();

    await page.goto('/progress');
    /* Strictly higher, not merely different. The masters allowance scales a
       score up with age, so "different" would also be satisfied by the field
       being wired to the wrong thing — or backwards. */
    await expect
      .poll(async () => Number(await score.textContent()), { timeout: 15_000 })
      .toBeGreaterThan(noAllowance);
  });

  test('gathers everything about you into one card', async ({ page, context, baseURL }) => {
    // Name, age and picture had nowhere to go, while sex and height sat under a
    // separate "About you" heading — a different box for facts of the same kind.
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'You', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About you' })).toBeHidden();

    const you = page.getByRole('region', { name: 'You' });
    // Not `exact`: for a wrapping <label> around a <select>, the computed label
    // text picks up every option as well ("Sex" plus "Male", "Female"…), so an
    // exact match can never succeed on a dropdown. Scoping to the region is
    // what makes the loose match unambiguous.
    for (const label of ['Name', 'Year of birth', 'Sex', 'Height']) {
      await expect(you.getByLabel(label)).toBeVisible();
    }
    await expect(you.getByRole('button', { name: 'Add a picture' }).first()).toBeVisible();
  });
});
