/** Flow 10 — see ../flows/10-something-else.md */

import { expect, logSet, openExercise, test } from '../fixtures/test';
import type { Page } from '@playwright/test';

/**
 * Training that is not a day of the plan.
 *
 * Reported as feedback: somebody did a CrossFit class, different every week,
 * and had nowhere to put it. The decision was one button below the planned
 * cards — pick an exercise, log sets, done — with the sets counting as training
 * like any other.
 *
 * What these tests hold is mostly what must *not* happen, because an extra set
 * is easy to log and hard to keep in its lane: it must not tick a planned day,
 * must not change which day Train opens on, and must not inflate the day's own
 * counter.
 */

const logOther = (page: Page) => page.getByRole('button', { name: '+ Log something else' });

/** Opens the picker, searches, and picks the first exact match. */
async function pickOther(page: Page, name: string, search = name): Promise<void> {
  await logOther(page).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Search exercises').fill(search);
  await sheet.getByRole('button', { name, exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

/** The day's own counter at the top of the screen, e.g. "1 of 15 sets". */
const dayCounter = (page: Page) => page.locator('main .num').filter({ hasText: /of \d+ sets/ });

test.describe('Logging something outside the plan', () => {
  test('is one button below the day, and the card opens on the chosen lift', async ({
    onboardedApp: app,
  }) => {
    await expect(logOther(app)).toBeVisible();
    await expect(app.getByText('Outside the plan')).toHaveCount(0);

    await pickOther(app, 'Kettlebell Swing', 'kettlebell sw');

    // Labelled as outside the plan, with the note saying it still counts.
    await expect(app.getByText('Outside the plan')).toBeVisible();
    await expect(app.getByText(/still counts as training this week/)).toBeVisible();
    // And it is the open card now — only one card is ever open.
    expect(await openExercise(app)).toBe('Kettlebell Swing');
  });

  test('logs sets without touching the planned day', async ({ onboardedApp: app }) => {
    const before = await dayCounter(app).innerText();

    await pickOther(app, 'Kettlebell Swing');
    await logSet(app, 24, 15);
    await logSet(app, 24, 15);

    // The sets are there, on the card that logged them…
    await expect(app.locator('main .num').filter({ hasText: /^24 kg × 15/ })).toHaveCount(2);
    // …and the day's counter did not move. Two extra sets are not two sets of
    // Day A, and "2 of 15" would be the app claiming they were.
    await expect(dayCounter(app)).toHaveText(before);
    // Nor is Day A ticked off.
    await expect(app.getByRole('button', { name: /Day A/ })).not.toContainText('✓');
  });

  test('survives a reload, and does not move Train to another day', async ({
    onboardedApp: app,
  }) => {
    /* The bug this whole reserved-label design had to avoid. Read back as a
       letter, the off-plan label is day 23, clamped to the last day — so a
       single extra set logged first thing would have made Train open the last
       day of the week every time it was opened that day. */
    await pickOther(app, 'Kettlebell Swing');
    await logSet(app, 24, 15);
    await expect(app.locator('main .num').filter({ hasText: /^24 kg × 15/ })).toHaveCount(1);

    await app.reload();

    await expect(app.getByRole('button', { name: 'Day A', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Rebuilt from the logs, not from state that died with the page.
    await expect(app.getByText('Outside the plan')).toBeVisible();
    await expect(app.getByRole('button', { name: /Kettlebell Swing/ })).toBeVisible();
  });

  test('picking a lift the open day already plans opens that card instead', async ({
    onboardedApp: app,
  }) => {
    /* Choosing Barbell Bench Press on a day that plans it means the day's own
       card. Logging it off-plan instead would leave the planned card unticked
       while the sets sat underneath it looking identical. */
    await pickOther(app, 'Barbell Bench Press', 'bench');
    expect(await openExercise(app)).toBe('Barbell Bench Press');
    await expect(app.getByText('Outside the plan')).toHaveCount(0);
  });

  test('offers the movements the generator never programs', async ({ onboardedApp: app }) => {
    /* The swap sheet's filter excludes exactly the off-plan conditioning
       movements, which is why the picker does not reuse it. What this checks is
       the sheet's shape: an empty search says so plainly rather than showing a
       blank sheet, and the library is grouped by pattern in the app's order. */
    await logOther(app).click();
    const sheet = app.getByRole('dialog');
    await sheet.getByLabel('Search exercises').fill('zzzz');
    await expect(sheet.getByText('Nothing matches “zzzz”.')).toBeVisible();

    // Grouped by movement pattern, in the app's own order.
    await sheet.getByLabel('Search exercises').fill('');
    const groups = await sheet.locator('h3').allInnerTexts();
    expect(groups.slice(0, 3).map((g) => g.toLowerCase())).toEqual(['squat', 'hinge', 'lunge']);
  });
});
