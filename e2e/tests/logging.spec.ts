/** Flow 02 — see ../flows/02-logging-a-session.md */

import { expect, logSet, logSuggested, test } from '../fixtures/test';

test.describe('Logging a session', () => {
  test('a straight set costs one tap', async ({ onboardedApp: app }) => {
    // The reason the sheet was removed. Set one still needs a starting weight,
    // but from there on the card already holds what to do next, so recording it
    // is a single press — three sets, three taps, no typing.
    await logSet(app, 0, 60, 8, '2 more');

    await logSuggested(app, 0);
    await logSuggested(app, 0);

    await expect(app.getByText(/3 of \d+ sets/)).toBeVisible();
    // Counted by delete buttons, not by text: the card's hint line also reads
    // "Last time 60 kg × 8", so a text count would include it.
    await expect(app.getByRole('button', { name: 'Delete' })).toHaveCount(3);
  });

  test('the numbers hold still between sets', async ({ onboardedApp: app }) => {
    // If the inputs re-read the coach after every set they would drift mid-
    // exercise, and straight sets would cost typing again.
    await logSet(app, 0, 62.5, 7, '2 more');

    await expect(app.getByLabel('weight', { exact: true }).first()).toHaveValue('62.5');
    await expect(app.getByLabel('reps', { exact: true }).first()).toHaveValue('7');

    await logSuggested(app, 0);
    await expect(app.getByRole('button', { name: 'Delete' })).toHaveCount(2);
    await expect(app.getByText('62.5 kg × 7').first()).toBeVisible();
  });

  test('logs a set and shows it back', async ({ onboardedApp: app }) => {
    await expect(app.getByText(/0 of \d+ sets/)).toBeVisible();

    // With no history the app asks for a starting weight rather than inventing one.
    await expect(app.getByText(/First time — find a weight/).first()).toBeVisible();

    await logSet(app, 0, 60, 8, '2 more');

    await expect(app.getByText('60 kg × 8').first()).toBeVisible();
    await expect(app.getByText(/1 of \d+ sets/)).toBeVisible();
    await expect(app.getByRole('button', { name: 'Log set 2' })).toBeVisible();
  });

  test('shows effort in plain words, never as RIR', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 8, '2 more');

    await expect(app.getByText('2 more').first()).toBeVisible();
    // Reps-in-reserve is stored as a number and never shown as one.
    await expect(app.getByText(/RIR/i)).toHaveCount(0);
  });

  test('a deleted set stops counting', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 8);
    await expect(app.getByText(/1 of \d+ sets/)).toBeVisible();

    await app.getByRole('button', { name: 'Delete' }).first().click();
    await expect(app.getByText(/0 of \d+ sets/)).toBeVisible();
  });

  test('survives a reload', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 8);
    // Wait for the write to land before reloading — clicking Save returns
    // before the IndexedDB write commits, and reloading into that gap would be
    // testing the race rather than the persistence.
    await expect(app.getByText('60 kg × 8').first()).toBeVisible();

    await app.reload();
    await expect(app.getByText('60 kg × 8').first()).toBeVisible();
  });
});

test.describe('Fits the phone', () => {
  /**
   * A page wider than the screen is not just ugly on a phone — it shifts every
   * coordinate, so taps land on whatever has slid underneath them. That is how
   * this was found: a stepper that could not shrink pushed the layout sideways
   * and the bottom nav stopped being clickable.
   */
  for (const path of ['/train', '/week', '/progress', '/settings']) {
    test(`${path} never scrolls sideways`, async ({ onboardedApp: app }) => {
      await app.goto(path);
      await expect(app.getByRole('navigation')).toBeVisible();

      const overflow = await app.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        view: document.documentElement.clientWidth,
      }));
      expect(overflow.doc).toBeLessThanOrEqual(overflow.view);
    });
  }
});
