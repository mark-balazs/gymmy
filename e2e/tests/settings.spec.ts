/** Flow 07 — see ../flows/07-choosing-a-split.md */

import { confirmSheet, expect, signInAs, test } from '../fixtures/test';

test.describe('Settings', () => {
  /**
   * The profile is read from IndexedDB a tick after the first paint. Seeding the
   * form from it once, on that first render, captured nothing — so the page
   * showed the defaults to everyone and a rebuild wrote those defaults over
   * whatever they actually trained.
   */
  test('shows the split and training settings actually in force', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      split: 'upperLower',
      days: 5,
    });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings');

    // Selected, and marked as the one in use rather than merely highlighted.
    const upperLower = page.getByRole('button').filter({ hasText: 'Upper / Lower' }).first();
    await expect(upperLower).toHaveAttribute('aria-pressed', 'true');
    await expect(upperLower).toContainText('In use');

    await expect(page.getByRole('button', { name: '5', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    /* Nothing edited, so nothing to apply and nothing said about it: the line
       under the button only appears once something is waiting to be saved. */
    await expect(page.getByRole('button', { name: 'Rebuild my week' })).toBeDisabled();
    await expect(page.getByText('Not saved yet')).toHaveCount(0);
    // What a rebuild does is said where it is decided, in its sheet — not on
    // the card as well, before anything has changed.
    await expect(page.getByText(/New exercises will be chosen to fit/)).toHaveCount(0);
  });

  test('says what each split is in one line, the day minimum included', async ({
    page,
    context,
    baseURL,
  }) => {
    /* One line under each option, not two: the gist, and — for the split that
       cannot run on two days — its minimum on the same line, because picking it
       on two days quietly moves the week to three. The longer explanation is
       the ⓘ beside it. */
    await signInAs(page, context, baseURL!, { onboarded: true, days: 2 });
    await page.goto('/settings');
    const ppl = page.getByRole('button').filter({ hasText: 'Push / Pull / Legs' }).first();
    await expect(ppl).toContainText('A day each for push, pull and legs · At least 3 days a week');
    await expect(page.getByText('still checked for carries and rotation')).toHaveCount(0);
  });

  test('an edit is held until it is applied, then sticks', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true, split: 'upperLower', days: 5 });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings');

    await page.getByRole('button', { name: '4', exact: true }).click();
    await expect(page.getByText('Not saved yet. Tap Rebuild my week.')).toBeVisible();

    await page.getByRole('button', { name: 'Rebuild my week' }).click();
    await expect(
      page.getByRole('dialog').getByText(/New exercises will be chosen to fit/),
    ).toBeVisible();
    await confirmSheet(page);

    // Let the change reach the server before reloading. Pulling with a cursor
    // from before the push is the one case where a reload could legitimately
    // see the old value, and that is a sync question, not a settings one.
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    // Survives a reload, which is what "persisted" actually means.
    await page.reload();
    await expect(page.getByRole('button', { name: '4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Applied: nothing is waiting, so the line has gone.
    await expect(page.getByText('Not saved yet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rebuild my week' })).toBeDisabled();
  });
});
