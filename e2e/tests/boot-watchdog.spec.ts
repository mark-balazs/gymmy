import { expect, test } from '../fixtures/test';

test.describe('When the app cannot start at all', () => {
  /**
   * The failure that actually strands people: a service worker serving a
   * cached shell whose script bundle no longer exists. Nothing mounts, so no
   * error boundary and no loading deadline can help — both are React code
   * inside the bundle that failed. Every reload reproduces it, because the
   * broken copy is on the device.
   */
  test('a dead bundle still offers a way out', async ({ page, context, baseURL }) => {
    // Kill the application scripts the way a stale cached shell does.
    await context.route('**/_next/static/chunks/**', (route) => route.abort());

    await page.goto(`${baseURL}/sign-in`);

    // No React has run at all — this is plain DOM written by the document.
    await expect(page.getByRole('heading', { name: /could not start/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /Reset and reload/i })).toBeVisible();
  });

  test('it stays out of the way when the app boots', async ({ onboardedApp: app }) => {
    // The watchdog must be invisible in the normal case, or it would flash up
    // on any slow connection.
    await expect(app.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
    await app.waitForTimeout(17_000);
    await expect(app.getByRole('heading', { name: /could not start/i })).toHaveCount(0);
    await expect(app.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
  });
});
