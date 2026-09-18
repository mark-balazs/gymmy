/** Flow 01 — see ../flows/01-first-run.md */

import { completeOnboarding, expect, logSet, test } from '../fixtures/test';

test.describe('First run', () => {
  test('five questions produce a complete week', async ({ app }) => {
    await app.goto('/train');
    // Not onboarded, so the app redirects rather than showing an empty plan.
    await app.waitForURL('**/onboarding');

    // The split comes first: it decides which day counts the next step offers.
    await expect(
      app.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible();
    await app.getByRole('button').filter({ hasText: 'Seven movement patterns' }).first().click();

    await expect(app.getByRole('heading', { name: 'How often can you train?' })).toBeVisible();
    await app.getByRole('button', { name: /^3 days/ }).click();

    await expect(app.getByRole('heading', { name: 'Where do you train?' })).toBeVisible();
    await app.getByRole('button', { name: /^A gym/ }).click();

    await expect(app.getByRole('heading', { name: /Anything you want to bring up/ })).toBeVisible();
    await app.getByRole('button', { name: /^Shoulders/ }).click();

    /* And bodyweight, which is the difference between having a strength
       score and not having one — it is a ratio, so without this the number
       is null and the page can only say so. */
    await expect(app.getByRole('heading', { name: 'What do you weigh?' })).toBeVisible();
    await app.getByLabel('What do you weigh?').fill('78.5');
    await app.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(app.getByRole('heading', { name: 'Here is your week' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Day A' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Day C' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Day 4' })).toHaveCount(0);

    await app.getByRole('button', { name: 'Start training' }).click();
    await app.waitForURL('**/train');
    await expect(app.getByRole('heading', { name: 'Train' })).toBeVisible();
  });

  test('does not ask again on a later visit', async ({ app }) => {
    await completeOnboarding(app);
    await app.goto('/train');
    await expect(app).toHaveURL(/\/train/);
    await expect(app.getByRole('heading', { name: 'Train' })).toBeVisible();
  });

  test('the generated week covers every pattern', async ({ app }) => {
    await completeOnboarding(app);
    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');

    // The seven coverage boxes are the point of the method; all must be present.
    for (const name of ['Squat', 'Hinge', 'Lunge', 'Push', 'Pull', 'Rotate', 'Carry']) {
      await expect(app.getByText(name, { exact: true })).toBeVisible();
    }

    // Three days, five slots each.
    await expect(app.getByRole('heading', { name: 'Day A' })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Swap' })).toHaveCount(15);
  });

  test('starts tracking a strength score as soon as it trains', async ({ app }) => {
    /* The point of asking for bodyweight during setup. Every account in
       production had trained and had no strength score at all, because the
       score is a ratio and nothing had ever asked for the denominator — so
       the app's headline number only worked for people who went looking for
       a field in Settings. */
    await completeOnboarding(app, { weight: 78.5 });
    await logSet(app, 60, 8);
    // Waited for: the set has to be in the local store before Progress can
    // read it, and a bare goto races that.
    await expect(app.getByText('60 kg × 8').first()).toBeVisible();

    await app.goto('/progress');
    await expect(app.getByRole('heading', { name: 'Strength index' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(app.getByText('Add your bodyweight and this starts tracking.')).toBeHidden();
    // A real number rather than a dash.
    await expect(app.locator('span').filter({ hasText: /^\d+$/ }).first()).toBeVisible();
  });

  test('says what is missing when the weight question is skipped', async ({ app }) => {
    /* The other half, and what makes the test above mean something: skipping
       leaves the score genuinely unavailable, and the page says so rather
       than inventing a denominator. */
    await completeOnboarding(app, { weight: null });
    await logSet(app, 60, 8);
    // Waited for: the set has to be in the local store before Progress can
    // read it, and a bare goto races that.
    await expect(app.getByText('60 kg × 8').first()).toBeVisible();

    await app.goto('/progress');
    await expect(app.getByText('Add your bodyweight and this starts tracking.')).toBeVisible({
      timeout: 15_000,
    });
  });
});
