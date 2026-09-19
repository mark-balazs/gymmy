import { createUser, rowCount, seedPatternsOnly, sessionCookie } from '../fixtures/auth';
import { completeOnboarding, expect, test } from '../fixtures/test';

test.describe('Not getting stuck', () => {
  /**
   * An account can exist without its first rows — the patterns, slot skeleton,
   * split period and profile. Auth.js writes the user row and *then* fires the
   * event that seeds them, that event fires exactly once per account, and a
   * failure in it used to be permanent — leaving somebody signed in, syncing
   * cleanly, and with no profile, which this app can only render as a loading
   * screen that never resolves.
   *
   * The repair lives in `/api/sync`: a device asking from scratch and getting
   * nothing back means the account is empty, so it is seeded then and there.
   */
  test('an account that was never seeded builds itself on first sync', async ({
    page,
    context,
    baseURL,
  }) => {
    // A user and a session and nothing else — no patterns, slot skeleton,
    // split period or profile. Exactly what a failed first-run seed leaves.
    const user = await createUser({ bare: true });
    await context.addCookies([sessionCookie(user, baseURL!)]);

    await page.goto('/train');

    /* Setup renders once a profile exists, and it can only produce a week once
       the patterns are there: a card on Train is proof the server seeded both.
       The heading alone proved only the profile — a repair that wrote nothing
       else reached it, and then handed over an empty week. */
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 30_000 });
    await completeOnboarding(page);
    await expect(page.getByRole('button', { name: /^About / }).first()).toBeVisible();
  });

  test('an account whose seed died halfway still builds itself', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The seed is written a statement at a time with no transaction around
       it, so a timeout can leave the patterns and nothing else. The repair
       above only runs for an account with no rows at all, and this one has
       some: the first pull returns them, the cursor moves past zero, and the
       repair can never run again — a loading screen, then the recovery panel,
       and "Try again" only syncs again.

       Expected to fail until the repair checks for the profile itself, on every
       pull, rather than for "asked from zero and got nothing". Remove the
       marker with the fix. */
    test.fail(true, 'the sync route only repairs an account with no rows at all');
    const user = await createUser({ bare: true });
    await seedPatternsOnly(user.id);
    await context.addCookies([sessionCookie(user, baseURL!)]);

    await page.goto('/train');
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 30_000 });
    // Finished, not duplicated: the rows written before are the rows kept.
    expect(await rowCount('patterns', user.id)).toBe(8);
    expect(await rowCount('profiles', user.id)).toBe(1);
  });

  /**
   * The guarantee that the next unforeseen throw does not brick the app. Found
   * when an exercise row synced before `images` existed made `images.length`
   * throw and the whole screen went blank with no way forward.
   *
   * Forced here by a store that throws when read, so it happens during render.
   * The test this replaces corrupted exercise rows instead, which stopped
   * reaching the screen once the library became the catalogue — it went on
   * passing and exercised nothing. That the library defaults a missing field is
   * the domain suite's to hold.
   */
  test('a render crash offers a way out instead of a blank screen', async ({
    page,
    context,
    baseURL,
  }) => {
    // Train reads goals through the snapshot, and nothing gating the shell
    // does, so the shell comes up and the page under it throws.
    await context.addInitScript(() => {
      for (const m of ['getAll', 'openCursor'] as const) {
        const orig = IDBObjectStore.prototype[m] as (...a: unknown[]) => unknown;
        (IDBObjectStore.prototype as unknown as Record<string, unknown>)[m] = function (
          this: IDBObjectStore,
          ...a: unknown[]
        ) {
          if (this.name === 'goals') throw new Error('simulated render crash');
          return orig.apply(this, a);
        };
      }
    });
    const user = await createUser({ onboarded: true });
    await context.addCookies([sessionCookie(user, baseURL!)]);
    await page.goto('/train');

    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible({
      timeout: 15_000,
    });
    for (const name of ['Try again', 'Reload the app', 'Reset this device']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
  });

  test('a wedged load stops pretending and offers a way out', async ({
    page,
    context,
    baseURL,
  }) => {
    // No session, and sync blocked: the profile can never arrive. Previously
    // this was a loading screen with no exit, on every restart, forever.
    await context.route('**/api/sync', (route) => route.abort());
    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: 'not-a-real-session',
        domain: new URL(baseURL!).hostname,
        path: '/',
      },
    ]);

    await page.goto('/train');

    // The deadline is 12s; the recovery panel must appear without a reload.
    await expect(page.getByRole('heading', { name: /taking too long|túl sokáig/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('button', { name: /Reset this device|alaphelyzet/i }),
    ).toBeVisible();
  });

  test('resetting the device says what it will lose, and clears it', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The last way out, and the only one that can lose work — so it counts
       what is still queued before it goes, and then really does empty the
       device. Only its button was ever looked at. The state it has to remove is
       planted by hand, and checked for after the reload rather than the
       database or the cache as a whole: the page the reset lands on opens a
       fresh database and registers the worker again, correctly. */
    test.setTimeout(60_000);
    await context.route('**/api/sync', (route) => route.abort());
    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: 'not-a-real-session',
        domain: new URL(baseURL!).hostname,
        path: '/',
      },
    ]);
    await page.goto('/train');
    await expect
      .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)))
      .toContain('athletic-tracker');

    // One change that never synced, and a cache the next worker will not make.
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('athletic-tracker');
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('outbox', 'readwrite');
          tx.objectStore('outbox').add({
            table: 'logs',
            rowId: 'x',
            row: { id: 'x' },
            queuedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      });
      await caches.open('athletic-old');
    });

    await page.reload();
    await expect(page.getByRole('heading', { name: /taking too long/ })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Reset this device' }).click();
    // One change, in the singular — it once read "1 changes have".
    await expect(
      page.getByText('1 change has not synced yet and would be lost.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForURL('**/home');

    const outbox = () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const r = indexedDB.open('athletic-tracker');
            r.onsuccess = () => {
              const db = r.result;
              if (!db.objectStoreNames.contains('outbox')) {
                db.close();
                return resolve(0);
              }
              const q = db.transaction('outbox').objectStore('outbox').count();
              q.onsuccess = () => {
                db.close();
                resolve(q.result);
              };
              q.onerror = () => resolve(-1);
            };
            r.onerror = () => resolve(-1);
          }),
      );
    await expect.poll(outbox).toBe(0);
    expect(await page.evaluate(() => caches.keys())).not.toContain('athletic-old');
  });
});
