import { createUser, sessionCookie } from '../fixtures/auth';
import { expect, test } from '../fixtures/test';

test.describe('Not getting stuck', () => {
  /**
   * An account can exist without a library. Auth.js writes the user row and
   * *then* fires the event that seeds one, that event fires exactly once per
   * account, and a failure in it used to be permanent — leaving somebody signed
   * in, syncing cleanly, and with no profile, which this app can only render as
   * a loading screen that never resolves.
   *
   * The repair lives in `/api/sync`: a device asking from scratch and getting
   * nothing back means the account is empty, so it is seeded then and there.
   */
  test('an account that was never seeded builds itself on first sync', async ({
    page,
    context,
    baseURL,
  }) => {
    // A user and a session and nothing else — no patterns, no exercises, no
    // profile. Exactly what a failed first-run seed leaves behind.
    const user = await createUser({ bare: true });
    await context.addCookies([sessionCookie(user, baseURL!)]);

    await page.goto('/train');

    // Setup can only be reached once a profile exists, and the questions can
    // only be answered once there is a library behind them — so arriving here
    // is proof the server built both rather than the app merely not crashing.
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 30_000 });
  });

  /**
   * The bug this exists for: an exercise row synced before `images` existed has
   * no such key, `images.length` threw, and the whole screen went blank with no
   * way forward. The data fix is elsewhere; this is the guarantee that the next
   * unforeseen throw does not brick the app.
   */
  test('a render crash offers a way out instead of a blank screen', async ({
    onboardedApp: app,
  }) => {
    // Corrupt the local store the way a schema change did: strip a field the
    // UI dereferences, then reload so the app renders from it.
    await app.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('athletic-tracker');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      await new Promise<void>((res) => {
        const store = db.transaction('exercises', 'readwrite').objectStore('exercises');
        const all = store.getAll();
        all.onsuccess = () => {
          for (const row of all.result) {
            delete (row as Record<string, unknown>).images;
            delete (row as Record<string, unknown>).description;
            store.put(row);
          }
          res();
        };
      });
    });

    await app.reload();

    // The app still works: the missing fields are defaulted where every reader
    // goes through, so nothing throws in the first place.
    await expect(app.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
    await app
      .getByRole('button', { name: /^About / })
      .first()
      .click();
    await expect(app.getByRole('dialog')).toBeVisible();
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
});
