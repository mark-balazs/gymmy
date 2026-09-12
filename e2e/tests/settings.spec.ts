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
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings');

    // Selected, and marked as the one in use rather than merely highlighted.
    const upperLower = page.getByRole('button').filter({ hasText: 'Upper / Lower' }).first();
    await expect(upperLower).toHaveAttribute('aria-pressed', 'true');
    await expect(upperLower).toContainText('In use');

    await expect(page.getByRole('button', { name: '5', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('This is what you are training now.')).toBeVisible();
  });

  test('an edit is held until it is applied, then sticks', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true, split: 'upperLower', days: 5 });
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings');

    await page.getByRole('button', { name: '4', exact: true }).click();
    await expect(page.getByText('Not applied yet')).toBeVisible();

    await page.getByRole('button', { name: 'Rebuild my week' }).click();
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
    await expect(page.getByText('This is what you are training now.')).toBeVisible();
  });
});
