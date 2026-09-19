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

    /* What a broken device is holding: the app's database, and a cache. Planted
       by hand, because with no bundle nothing else will make them — and that
       is also why the chunks stay blocked after the reset: the page it reloads
       into cannot put back what the reset removed, so finding them gone means
       the reset removed them. */
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('athletic-tracker');
        r.onsuccess = () => {
          r.result.close();
          resolve();
        };
        r.onerror = () => reject(r.error);
      });
      await caches.open('athletic-old');
    });

    // No React has run at all — this is plain DOM written by the document.
    await expect(page.getByRole('heading', { name: /could not start/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /Reset and reload/i })).toBeVisible();

    /* And the button does what it says. The watchdog is plain DOM that names
       the database by hand — it cannot import the name the app uses — so a
       rename in one place and not the other would leave the broken copy exactly
       where it was. Checked before the next page's own watchdog fires. */
    await page.getByRole('button', { name: 'Reset and reload' }).click();
    // The server-rendered sign-in page, which the panel had replaced: reloaded.
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)))
      .not.toContain('athletic-tracker');
    expect(await page.evaluate(() => caches.keys())).not.toContain('athletic-old');
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
