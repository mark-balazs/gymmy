/** Flow 05 — see ../flows/05-offline.md
 *
 * The reason the local-first architecture exists. If these fail, the sync
 * engine, the outbox and the IndexedDB layer bought nothing and should be
 * replaced with something far simpler.
 */

import {
  expect,
  logSet,
  openCard,
  openExercise,
  test,
  waitForServiceWorker,
} from '../fixtures/test';

test.describe('Training offline', () => {
  test('logs sets with no network at all', async ({ onboardedApp: app, context }) => {
    const name = await openExercise(app);
    await logSet(app, 60, 8);
    await expect(app.getByText(/1 of \d+ sets/)).toBeVisible();

    await waitForServiceWorker(app);
    await context.setOffline(true);

    // The core action must behave identically — this is a basement gym.
    await logSet(app, 60, 9);
    await logSet(app, 60, 10);

    await expect(app.getByText(/3 of \d+ sets/)).toBeVisible();

    /* The third set finishes the exercise, so it folds away and its set list
       goes with it. Reopening is the read-back, and doing it while still
       offline is the point — the record has to be there with no network. */
    await openCard(app, name);
    await expect(app.getByText('60 kg × 9').first()).toBeVisible();
    await expect(app.getByText('60 kg × 10').first()).toBeVisible();

    await context.setOffline(false);
  });

  test('tells the truth about where the data is', async ({ onboardedApp: app, context }) => {
    await waitForServiceWorker(app);
    await context.setOffline(true);
    await logSet(app, 50, 10);

    // "Saved on this device" is a meaningfully different promise from "saved",
    // and the user is the one who needs to know which they have.
    await expect(app.getByText(/Offline — saved on this device/)).toBeVisible();

    await context.setOffline(false);
  });

  test('survives a reload while still offline', async ({ onboardedApp: app, context }) => {
    await waitForServiceWorker(app);
    await context.setOffline(true);
    await logSet(app, 70, 6);
    await expect(app.getByText('70 kg × 6').first()).toBeVisible();

    await app.reload();

    // Written to IndexedDB, not held in memory — a crash cannot lose it.
    await expect(app.getByText('70 kg × 6').first()).toBeVisible();

    await context.setOffline(false);
  });

  test('catches up once the network returns', async ({ onboardedApp: app, context }) => {
    await waitForServiceWorker(app);
    await context.setOffline(true);
    await logSet(app, 80, 5);
    await expect(app.getByText(/Offline/)).toBeVisible();

    await context.setOffline(false);

    // The engine retries on the `online` event rather than waiting for a poll.
    await expect(app.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    // And the set really did reach the server: a reload pulls it back down.
    await app.reload();
    await expect(app.getByText('80 kg × 5').first()).toBeVisible();
  });
});

test.describe('Staying up to date', () => {
  /**
   * An installed PWA can sit in the app switcher for weeks, so the update path
   * has to work without a cold start. These are its preconditions — each one
   * silently disables updating rather than breaking anything visible, which is
   * why they are asserted rather than trusted.
   */
  test('the worker is versioned and revalidated', async ({ onboardedApp: app }) => {
    await waitForServiceWorker(app);

    const state = await app.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { updateViaCache: reg.updateViaCache, caches: await caches.keys() };
    });

    // Left at the default, the browser answers update checks from its own HTTP
    // cache for up to 24 hours.
    expect(state.updateViaCache).toBe('none');

    // A cache name fixed at build time means every deploy shares one cache and
    // the activate-time cleanup can never retire anything.
    const own = state.caches.filter((k) => k.startsWith('athletic-'));
    expect(own).toHaveLength(1);
    expect(own[0]).not.toBe('athletic-v1');
    expect(own[0]!.length).toBeGreaterThan('athletic-'.length);
  });
});
