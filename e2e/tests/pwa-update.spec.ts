/**
 * Does the installed app actually pick up a new version?
 *
 * Everything else about updating is easy to assert and easy to get wrong
 * anyway: the worker registers, the cache is versioned, the flags are right.
 * None of that proves the thing that matters, which is whether a deploy
 * *reaches a running app*. So this test performs a deploy — it rewrites the
 * served `sw.js` the way a build would — and then watches for the new worker to
 * take over.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, waitForServiceWorker } from '../fixtures/test';

const SW = fileURLToPath(new URL('../../apps/web/public/sw.js', import.meta.url));

// Serial: these mutate the one file the server is serving to everybody.
test.describe.configure({ mode: 'serial' });

test.describe('Picking up a new version', () => {
  let original = '';

  test.beforeAll(async () => {
    original = await readFile(SW, 'utf8');
  });

  test.afterAll(async () => {
    if (original) await writeFile(SW, original);
  });

  test('a deployed worker replaces the running one', async ({ onboardedApp: app }) => {
    await waitForServiceWorker(app);

    const before = await app.evaluate(() => caches.keys());
    const ours = before.filter((k) => k.startsWith('athletic-'));
    expect(ours).toHaveLength(1);

    // Every navigation of the page from here on — there should be exactly one,
    // and only once the app is hidden.
    const navs: string[] = [];
    app.on('framenavigated', (f) => {
      if (f === app.mainFrame()) navs.push(f.url());
    });

    // Ship a new build: the same worker with a different build id, which is
    // exactly what scripts/build-sw.mjs produces on the next deploy.
    const deployed = original.replace(/const BUILD = '[^']*'/, "const BUILD = 'e2e-next-build'");
    expect(deployed).not.toBe(original);
    await writeFile(SW, deployed);

    /* What the app does when it returns to the foreground — the app's own
       trigger, not the test asking for an update itself. Calling reg.update()
       here, as this used to, left the app's foreground check free to vanish
       with the suite green. */
    await app.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    // The new worker skips waiting and claims, so its cache appears...
    await expect
      .poll(() => app.evaluate(() => caches.keys()), { timeout: 20_000 })
      .toContain('athletic-e2e-next-build');

    // ...and the previous one is deleted. Polled separately because the new
    // cache is filled during `install` while the old one is removed later, in
    // `activate` — so there is a real window where both exist.
    await expect
      .poll(
        () =>
          app.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('athletic-')))),
        { timeout: 20_000 },
      )
      .toEqual(['athletic-e2e-next-build']);

    /* Then the page moves onto it — but not under somebody's thumb. The new
       worker controls the page while the script already running in it is the
       old one, so it has to reload; weight and reps being entered live only in
       that page, so it waits until the app is put away. Nothing while it is
       visible, one reload the moment it is hidden: a page that reloaded at once
       fails the first half, and one that never listened for the new worker
       fails the second. */
    await app.waitForTimeout(1500);
    expect(navs, 'the page reloaded while it was being looked at').toEqual([]);
    const loaded = app.waitForEvent('load');
    await app.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await loaded;
  });

  test('an unchanged worker is not treated as a new version', async ({ onboardedApp: app }) => {
    /* The other half of the contract: checking for updates must be cheap and
       silent when there is nothing new, or the app would reload on a loop.

       Asked of the registration, not the caches. An update that finds a new
       worker resolves before that worker's install has opened its cache, so
       the cache list read straight afterwards looked unchanged either way. A
       worker installing or waiting is what a new version found looks like. */
    await waitForServiceWorker(app);

    const r = await app.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
      return { installing: !!reg.installing, waiting: !!reg.waiting };
    });
    expect(r).toEqual({ installing: false, waiting: false });
  });
});
