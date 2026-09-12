/** Flow 05 — see ../flows/05-offline.md
 *
 * The reason the local-first architecture exists. If these fail, the sync
 * engine, the outbox and the IndexedDB layer bought nothing and should be
 * replaced with something far simpler.
 */

import { expect, logSet, test, waitForServiceWorker } from '../fixtures/test';

test.describe('Training offline', () => {
  test('logs sets with no network at all', async ({ onboardedApp: app, context }) => {
    await logSet(app, 0, 60, 8);
    await expect(app.getByText(/1 of \d+ sets/)).toBeVisible();

    await waitForServiceWorker(app);
    await context.setOffline(true);

    // The core action must behave identically — this is a basement gym.
    await logSet(app, 0, 60, 9);
    await logSet(app, 0, 60, 10);

    await expect(app.getByText('60 kg × 9').first()).toBeVisible();
    await expect(app.getByText('60 kg × 10').first()).toBeVisible();
    await expect(app.getByText(/3 of \d+ sets/)).toBeVisible();

    await context.setOffline(false);
  });

  test('tells the truth about where the data is', async ({ onboardedApp: app, context }) => {
    await waitForServiceWorker(app);
    await context.setOffline(true);
    await logSet(app, 0, 50, 10);

    // "Saved on this device" is a meaningfully different promise from "saved",
    // and the user is the one who needs to know which they have.
    await expect(app.getByText(/Offline — saved on this device/)).toBeVisible();

    await context.setOffline(false);
  });

  test('survives a reload while still offline', async ({ onboardedApp: app, context }) => {
    await waitForServiceWorker(app);
    await context.setOffline(true);
    await logSet(app, 0, 70, 6);
    await expect(app.getByText('70 kg × 6').first()).toBeVisible();

    await app.reload();

    // Written to IndexedDB, not held in memory — a crash cannot lose it.
    await expect(app.getByText('70 kg × 6').first()).toBeVisible();

    await context.setOffline(false);
  });

  test('catches up once the network returns', async ({ onboardedApp: app, context }) => {
    await waitForServiceWorker(app);
    await context.setOffline(true);
    await logSet(app, 0, 80, 5);
    await expect(app.getByText(/Offline/)).toBeVisible();

    await context.setOffline(false);

    // The engine retries on the `online` event rather than waiting for a poll.
    await expect(app.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    // And the set really did reach the server: a reload pulls it back down.
    await app.reload();
    await expect(app.getByText('80 kg × 5').first()).toBeVisible();
  });
});
