/** Flow 01 — see ../flows/01-first-run.md */

import { completeOnboarding, expect, test } from '../fixtures/test';

test.describe('First run', () => {
  test('four questions produce a complete week', async ({ app }) => {
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

    await expect(app.getByRole('heading', { name: 'Here is your week' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Day 1' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Day 3' })).toBeVisible();
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
    await app.getByRole('link', { name: 'Week' }).click();
    await app.waitForURL('**/week');

    // The seven coverage boxes are the point of the method; all must be present.
    for (const name of ['Squat', 'Hinge', 'Lunge', 'Push', 'Pull', 'Rotate', 'Carry']) {
      await expect(app.getByText(name, { exact: true })).toBeVisible();
    }

    // Three days, five slots each.
    await expect(app.getByRole('heading', { name: 'Day 1' })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Swap' })).toHaveCount(15);
  });
});
