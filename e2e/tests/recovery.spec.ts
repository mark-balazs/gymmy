import { expect, test } from '../fixtures/test';

test.describe('Not getting stuck', () => {
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
