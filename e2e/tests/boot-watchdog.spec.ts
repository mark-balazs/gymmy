import { serverSets } from '../fixtures/auth';
import {
  expect,
  holdBootBack,
  logSet,
  queuedChanges,
  recordedSet,
  releaseBoot,
  signInAs,
  test,
  waitForServiceWorker,
} from '../fixtures/test';

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

    /* And the button does what it says — which is now *less* than it used to
       say. It replaces the app's copy of itself and nothing else: the database
       is the one thing on the device that may hold the only copy of a set, and
       this screen deleted it (GYM-78). */
    await page.getByRole('button', { name: 'Reset and reload' }).click();
    // The server-rendered sign-in page, which the panel had replaced: reloaded.
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(await page.evaluate(() => caches.keys())).not.toContain('athletic-old');
    expect(
      await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)),
    ).toContain('athletic-tracker');
  });

  /**
   * GYM-78, end to end: the watchdog is the screen a stranded person reaches,
   * and it used to be the screen that threw their unsynced sets away.
   *
   * So the set is logged offline through the real card, the watchdog is made
   * to fire over the top of it, and the reset is tapped — and then the *server*
   * is asked whether the set arrived. The device's own screens cannot answer
   * that: one that shows nothing looks identical whether the row is gone or
   * merely not drawn.
   *
   * Nothing may sync between logging and resetting, or the test would pass on
   * a lucky push rather than on the reset keeping the queue.
   */
  test('a set queued offline survives the reset and still reaches the server', async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await logSet(page, 62.5, 7);
    await recordedSet(page, 7);
    expect(await serverSets(user.id)).toEqual([]);

    // The queue must still be full when the reset happens.
    await context.route('**/api/sync', (route) => route.abort());
    await context.setOffline(false);

    // A cache to watch: the app's copy of itself is what the reset may remove.
    await page.evaluate(async () => void (await caches.open('athletic-old')));
    await holdBootBack(page);
    await page.reload();

    await expect(page.getByRole('heading', { name: /could not start/i })).toBeVisible({
      timeout: 30_000,
    });
    /* No promise that anything is already saved, and no warning that resetting
       costs anything — because it no longer does. */
    await expect(page.getByText(/waiting to sync/)).toBeVisible();
    await expect(page.getByText(/will be lost|safe on the server/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Reset and reload' }).click();

    // The app's copy went; the training did not.
    await expect
      .poll(() => page.evaluate(() => caches.keys()), { timeout: 30_000 })
      .not.toContain('athletic-old');
    await expect.poll(() => queuedChanges(page), { timeout: 30_000 }).toBeGreaterThan(0);

    // And with a working network and a working bundle, the set goes up.
    await releaseBoot(page);
    await context.unroute('**/api/sync');
    await page.goto('/train');
    await expect(page.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
    await expect.poll(() => serverSets(user.id), { timeout: 30_000 }).toHaveLength(1);
  });

  /**
   * Offline there is nothing to download, so clearing the cached copy would
   * turn a broken app into no app at all — and on a phone in a basement the
   * queue it would have taken with it is the only copy of this session.
   */
  test('offline it clears nothing and does not offer a reset', async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await signInAs(page, context, baseURL!, { onboarded: true });
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await logSet(page, 55, 6);
    await recordedSet(page, 6);

    await holdBootBack(page);
    await page.reload();

    await expect(page.getByRole('heading', { name: /could not start/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/offline/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset and reload' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    // Nothing was touched: the queue is intact and the cached app is still here.
    expect(await queuedChanges(page)).toBeGreaterThan(0);
    expect(await page.evaluate(() => caches.keys())).not.toEqual([]);

    await releaseBoot(page);
    await context.setOffline(false);
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
