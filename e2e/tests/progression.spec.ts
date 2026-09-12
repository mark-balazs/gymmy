/** Flow 04 — see ../flows/04-progression.md */

import { expect, logSet, test } from '../fixtures/test';
import type { Page } from '@playwright/test';

/**
 * What the coach is proposing for the next set.
 *
 * It used to be a line of text; it is now the value sitting in the card's own
 * weight and reps inputs, ready to be logged with a single tap. Reading it back
 * from the inputs is the stronger assertion anyway — it checks what pressing
 * the button would actually record, not a label beside it.
 */
async function target(page: Page, index = 0): Promise<string> {
  const weight = await page.getByLabel('weight', { exact: true }).nth(index).inputValue();
  const reps = await page.getByLabel('reps', { exact: true }).nth(index).inputValue();
  return `${weight} × ${reps}`;
}

/** Moves the date field forward so "last time" means a previous session. */
async function setDate(page: import('@playwright/test').Page, daysAhead: number): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const iso = d.toISOString().slice(0, 10);
  await page.locator('input[type="date"]').fill(iso);
}

test.describe('Progressive overload', () => {
  test('asks for one more rep mid-range', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 8, '2 more');
    await logSet(app, 0, 60, 8, '2 more');
    await logSet(app, 0, 60, 8, '2 more');

    await setDate(app, 3);

    await expect.poll(() => target(app)).toBe('60 × 9');
    await expect(app.getByText(/Last time 60 kg × 8 — go for one more/).first()).toBeVisible();
  });

  test('adds weight and resets reps at the top of the range', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 12, '2 more');
    await logSet(app, 0, 60, 12, '2 more');
    await logSet(app, 0, 60, 12, '2 more');

    await setDate(app, 3);

    // Double progression: weight up, reps back to the bottom of the range.
    await expect.poll(() => target(app)).toBe('62.5 × 6');
  });

  test('does not add weight after a set taken to failure', async ({ onboardedApp: app }) => {
    await logSet(app, 0, 60, 12, 'Maxed');

    await setDate(app, 3);

    // Loading a set that already failed is how people get hurt; repeat instead.
    await expect(app.getByText(/nothing left — repeat it before adding/).first()).toBeVisible();
    // Repeat the same load rather than adding to a set that already failed.
    await expect.poll(() => target(app)).toBe('60 × 12');
  });
});
