/** Flow 07 — see ../flows/07-choosing-a-split.md */

import type { Page } from '@playwright/test';
import { completeOnboarding, confirmSheet, expect, signInAs, test } from '../fixtures/test';

const gotoSettings = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/settings');
};

const openEditor = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: /Build your own/ }).click();
  await page.waitForURL('**/settings/split');
  await expect(page.getByRole('heading', { name: 'Your own split' })).toBeVisible();
};

const coverageTiles = (page: Page) =>
  page.getByRole('list', { name: 'Movement coverage' }).getByRole('listitem');

test.describe('Understanding a split before choosing it', () => {
  /**
   * The thing worth explaining is not what a split is called, it is what it
   * will then hold you to. So the assertion is about the coverage set: push/
   * pull/legs must not claim rotation and carry, and the seven-pattern split
   * must.
   */
  test('each preset says what it will call a complete week', async ({ app }) => {
    await completeOnboarding(app, { days: '3 days' });
    await gotoSettings(app);

    await app.getByRole('button', { name: 'What is Push / Pull / Legs?' }).click();
    const sheet = app.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // The days it actually makes.
    await expect(sheet.getByText('Legs', { exact: true })).toBeVisible();
    // And not a word about the two movements it never set out to train.
    await expect(sheet.getByText('Rotate', { exact: true })).toHaveCount(0);
    await expect(sheet.getByText('Carry', { exact: true })).toHaveCount(0);

    await sheet.getByRole('button', { name: 'Close' }).click();

    await app.getByRole('button', { name: 'What is Seven movement patterns?' }).click();
    await expect(sheet.getByText('Rotate', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Carry', { exact: true })).toBeVisible();
  });

  test('the explanation is there at the moment of choosing, in onboarding', async ({ app }) => {
    await app.goto('/onboarding');
    await app.getByRole('button', { name: 'What is Upper / Lower?' }).click();

    const sheet = app.getByRole('dialog');
    await expect(sheet.getByText('Upper', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Lower', { exact: true })).toBeVisible();

    // Reading about a split must not commit you to it.
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(
      app.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible();
  });
});

test.describe('Building your own split', () => {
  test('the editor opens on the week you already train', async ({ app }) => {
    // Not a blank page: arranging a week from nothing is a much harder question
    // than adjusting one, and a preset is a perfectly good first draft.
    await completeOnboarding(app, { days: '3 days' });
    await gotoSettings(app);
    await openEditor(app);

    for (const day of ['A', 'B', 'C']) {
      await expect(app.getByRole('heading', { name: `Day ${day}`, exact: true })).toBeVisible();
    }
    // Five slots a day, as the seven-pattern skeleton ships them.
    await expect(app.getByRole('button', { name: /^Edit / })).toHaveCount(15);
  });

  test('an edited slot is applied and the split becomes custom', async ({ app }) => {
    await completeOnboarding(app, { days: '3 days' });
    await gotoSettings(app);
    await openEditor(app);

    const firstSlot = app.getByRole('button', { name: /^Edit / }).first();
    await firstSlot.click();

    const sheet = app.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Carry', exact: true }).click();
    await sheet.getByRole('button', { name: 'Done', exact: true }).click();

    // The row says what it now holds, before anything has been committed.
    await expect(firstSlot).toContainText('Carry');

    await app.getByRole('button', { name: 'Save my split' }).click();
    await confirmSheet(app);
    await app.waitForURL('**/week');

    // Rearranging the week is not the same as changing what you train for, so
    // the goal it already had is inherited rather than reset.
    await expect(coverageTiles(app)).toHaveCount(7);

    await gotoSettings(app);
    await expect(app.getByRole('link', { name: /Build your own/ })).toContainText('In use');

    // It has to reach the server too — a skeleton that never syncs would leave
    // every other device generating against the old one.
    await expect(app.getByText('All saved')).toBeVisible({ timeout: 30_000 });
  });

  test('a custom week can still answer "I train at home now"', async ({ app }) => {
    // Custom used to disable the rebuild button outright, which left anyone who
    // had arranged their own week unable to change their equipment or bias.
    await completeOnboarding(app, { days: '3 days' });
    await gotoSettings(app);
    await openEditor(app);
    await app.getByRole('button', { name: 'Save my split' }).click();
    await confirmSheet(app);
    await app.waitForURL('**/week');

    await gotoSettings(app);
    await app.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(app.getByText('Not applied yet')).toBeVisible();

    await app.getByRole('button', { name: 'Rebuild my week' }).click();
    await confirmSheet(app);
    await expect(app.getByText('This is what you are training now.')).toBeVisible();
  });

  test('building your own split does not rescore the weeks before it', async ({
    page,
    context,
    baseURL,
  }) => {
    /*
     * The rule the whole period model exists for, exercised through the newest
     * way of writing one. An account that trained seven-pattern three weeks ago
     * and moved to push/pull/legs since must keep reading those weeks as
     * seven-pattern weeks — arranging a custom split today cannot reach back
     * and change what January was scored against.
     */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      split: 'pushPullLegs',
      days: 3,
      history: {
        split: 'sevenPattern',
        weeksBack: 3,
        exercises: ['Goblet Squat', 'Push-Up', 'Inverted Row'],
      },
    });

    await gotoSettings(page);
    await openEditor(page);
    await page.getByRole('button', { name: 'Save my split' }).click();
    await confirmSheet(page);
    await page.waitForURL('**/week');

    // This week now scores against the custom goal, inherited from push/pull/legs.
    await expect(coverageTiles(page)).toHaveCount(5);

    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Back', exact: true }).click();
    }
    await expect(coverageTiles(page)).toHaveCount(7);
    await expect(page.getByText('Scored as Seven movement patterns')).toBeVisible();
  });
});
