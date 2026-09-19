/** Flow 05 — see ../flows/05-offline.md
 *
 * The reason the local-first architecture exists. If these fail, the sync
 * engine, the outbox and the IndexedDB layer bought nothing and should be
 * replaced with something far simpler.
 */

import type { BrowserContext } from '@playwright/test';
import { serverSets } from '../fixtures/auth';
import {
  expect,
  logSet,
  openCard,
  openExercise,
  recordedSet,
  signInAs,
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

  test('catches up once the network returns', async ({ page, context, baseURL }) => {
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await logSet(page, 80, 5);
    await expect(page.getByText(/Offline/)).toBeVisible();
    const line = await recordedSet(page, 5);
    expect(await serverSets(user.id)).toEqual([]);

    await context.setOffline(false);

    // The engine retries on the `online` event rather than waiting for a poll.
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    /* And the set really did reach the server — asked of the server. This used
       to reload and look for the set on screen, but a reload reads this
       device's IndexedDB, where the set was all along: a push that silently
       dropped it passed, and so did a write that was never queued, because an
       empty queue reads "All saved" whether or not anything went. */
    await expect
      .poll(async () => (await serverSets(user.id)).map((s) => `${s.weight} kg × ${s.reps}`), {
        timeout: 30_000,
      })
      .toContain(line);
  });
});

/**
 * Holds each push at the network until the test lets that one go.
 *
 * Every request is held, and each has its own release — nothing is left
 * pending at the end, which matters: a request held forever keeps the sync
 * engine's one in-flight promise open, and every later sync then waits on it.
 */
async function holdPushes(context: BrowserContext) {
  const seen: { body: string; release: () => void }[] = [];
  const waiting: { match: (body: string) => boolean; found: (i: number) => void }[] = [];
  await context.route('**/api/sync', async (route) => {
    let release!: () => void;
    const go = new Promise<void>((r) => (release = r));
    const body = route.request().postData() ?? '';
    const i = seen.push({ body, release }) - 1;
    for (const w of waiting.splice(0)) {
      if (w.match(body)) w.found(i);
      else waiting.push(w);
    }
    await go;
    await route.continue();
  });
  return {
    /** The next held push after `from` whose body matches, once it is sent. */
    next(match: (body: string) => boolean = () => true, from = 0): Promise<number> {
      const already = seen.findIndex((s, i) => i >= from && match(s.body));
      if (already >= 0) return Promise.resolve(already);
      return new Promise((found) => waiting.push({ match, found }));
    },
    release(i: number): void {
      seen[i]!.release();
    },
    releaseAll(): void {
      for (const s of seen) s.release();
    },
    count: () => seen.length,
  };
}

const carriesSet = (body: string) => body.includes('"table":"logs"');
const carriesProfile = (body: string) => body.includes('"table":"profile"');

test.describe('Writing while a push is travelling', () => {
  /*
   * The subtle part of the sync engine, which flow 05 describes and nothing
   * exercised: a push takes time, and the person keeps using the app while it
   * travels. Whatever they do in that window is queued behind it, and the
   * pull that comes back with the push must not overwrite it.
   */

  test('a set logged while a push is in flight stays queued and reaches the server', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Only what a push actually carried leaves the queue when it lands. A
       second set logged mid-flight was not in it, so clearing the whole queue
       on success would lose that set — on this device and everywhere. */
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });
    const pushes = await holdPushes(context);

    await logSet(page, 60, 8);
    const first = await pushes.next(carriesSet);
    await logSet(page, 60, 9);
    await recordedSet(page, 9);
    pushes.release(first);

    // Everything after the first goes straight through.
    const drain = setInterval(() => pushes.releaseAll(), 100);
    try {
      await expect
        .poll(async () => (await serverSets(user.id)).map((s) => s.reps).sort(), {
          timeout: 30_000,
        })
        .toEqual([8, 9]);
    } finally {
      clearInterval(drain);
    }
  });

  test('a delete made while a push is travelling stays deleted', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The push carrying the set comes back with the server's copy of it — not
       deleted, because the delete had not been sent yet. Applied as it
       arrives, that copy brings the set back until the delete's own push
       lands, and a set that was deleted reappears. The engine re-applies what
       is still queued over every pull; this is that. The second push is held
       while the screen is read, so it cannot hide the flicker by landing. */
    await signInAs(page, context, baseURL!, { onboarded: true });
    await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });
    const pushes = await holdPushes(context);

    await logSet(page, 60, 8);
    const first = await pushes.next(carriesSet);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/^0 of \d+ sets$/)).toBeVisible();

    pushes.release(first);
    // The delete's push leaves only once the first has been applied.
    const second = await pushes.next(carriesSet, first + 1);
    await expect(page.getByText(/^0 of \d+ sets$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    pushes.release(second);
    pushes.releaseAll();
  });

  test('a setting changed mid-sync is not lost', async ({ page, context, baseURL }) => {
    /* The profile is one row, rewritten whole on every change. A pull that
       lands while a change is queued puts the older row back on the device,
       and the next change is then built on top of that older row — so the
       queued change is sent, and then overwritten by the one after it. Here:
       the entry style is changed and its push held; the theme is changed
       behind it; the push lands; the unit is changed. Every one of the three
       must survive.

       Unit rather than language for the third change, because a language
       change translates the "All saved" this waits on. */
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings');
    await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });
    const pushes = await holdPushes(context);

    const pressed = (name: string) =>
      expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

    await page.getByRole('button', { name: 'Ruler', exact: true }).click();
    await pressed('Ruler');
    const first = await pushes.next(carriesProfile);

    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await pressed('Dark');
    pushes.release(first);

    const second = await pushes.next(carriesProfile, first + 1);
    await page.getByRole('button', { name: 'lb', exact: true }).click();
    await pressed('lb');
    pushes.release(second);

    const drain = setInterval(() => pushes.releaseAll(), 100);
    try {
      await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });
      await expect.poll(() => pushes.count()).toBeGreaterThan(second + 1);
      await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });
    } finally {
      clearInterval(drain);
    }
    await context.unroute('**/api/sync');

    await page.reload();
    await pressed('Dark');
    await pressed('lb');
    await pressed('Ruler');
  });
});

test.describe('Staying up to date', () => {
  /**
   * An installed PWA can sit in the app switcher for weeks, so the update path
   * has to work without a cold start. This is one of its preconditions — it
   * silently disables updating rather than breaking anything visible, which is
   * why it is asserted rather than trusted. That each build gets its own cache
   * is `pwa-update.spec.ts`'s, which performs a deploy and watches for it.
   */
  test('the worker is revalidated on every update check', async ({ onboardedApp: app }) => {
    await waitForServiceWorker(app);

    const state = await app.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { updateViaCache: reg.updateViaCache };
    });

    /* The default ('imports') already fetches sw.js itself past the HTTP
       cache; 'none' extends that to any script the worker imports, so adding
       an importScripts later cannot bring back a stale update. */
    expect(state.updateViaCache).toBe('none');
  });
});
