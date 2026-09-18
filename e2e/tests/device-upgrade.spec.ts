import { expect, test } from '../fixtures/test';

/**
 * A device still holding the previous build's database, opened by this one.
 *
 * Every other spec starts from an empty browser, so the local database is
 * created at the current version and its upgrade path never runs. That path is
 * the one place a schema change on the device can lose somebody's training: a
 * set logged offline and not yet synced lives only here.
 *
 * Version 5 of the local store deletes `refSets`, which never had a reader or a
 * writer. The assertion that matters is not that it is gone — it is that
 * nothing *else* went with it: an unsynced set logged on the old build is still
 * there after the upgrade, and still reaches the server.
 */

/** The previous build's schema, exactly as Dexie declared it at version 4. */
const V4_STORES: Record<
  string,
  { keyPath: string; auto?: boolean; indexes: (string | string[])[] }
> = {
  patterns: { keyPath: 'id', indexes: ['position'] },
  exercises: { keyPath: 'id', indexes: ['patternId', 'name'] },
  slots: { keyPath: 'id', indexes: ['position'] },
  entries: { keyPath: 'id', indexes: [['sessionIndex', 'slotId']] },
  logs: { keyPath: 'id', indexes: ['date', 'exerciseId', ['date', 'session']] },
  refSets: { keyPath: 'id', indexes: ['date'] },
  profile: { keyPath: 'id', indexes: [] },
  outbox: { keyPath: 'seq', auto: true, indexes: ['table', 'rowId'] },
  meta: { keyPath: 'key', indexes: [] },
  splitPeriods: { keyPath: 'id', indexes: ['startWeek'] },
  bodyLogs: { keyPath: 'id', indexes: ['date'] },
  goals: { keyPath: 'id', indexes: ['exerciseId'] },
};

test('a device on the previous build keeps its unsynced set through the upgrade', async ({
  page,
  context,
  baseURL,
}) => {
  const { createUser, sessionCookie } = await import('../fixtures/auth');
  const user = await createUser({ onboarded: true });
  await context.addCookies([sessionCookie(user, baseURL!)]);

  // A same-origin page that does not boot the app, so nothing opens the
  // database before it has been put in the old shape.
  await page.goto('/manifest.webmanifest');

  const today = new Date().toISOString().slice(0, 10);
  const pending = {
    id: 'set-from-the-old-build',
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    date: today,
    session: 'A',
    exerciseId: 'ex-from-before',
    setNo: 1,
    weight: 42.5,
    reps: 7,
    rir: 2,
    note: '',
  };

  await page.evaluate(
    ({ stores, row }) =>
      new Promise<void>((resolve, reject) => {
        // Dexie stores version n as IndexedDB version n × 10.
        const req = indexedDB.open('athletic-tracker', 40);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const [name, def] of Object.entries(stores)) {
            const store = db.createObjectStore(name, {
              keyPath: def.keyPath,
              autoIncrement: def.auto ?? false,
            });
            for (const ix of def.indexes) {
              store.createIndex(Array.isArray(ix) ? `[${ix.join('+')}]` : ix, ix);
            }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['logs', 'outbox'], 'readwrite');
          tx.objectStore('logs').put(row);
          // Queued for sync exactly as the old build's `put()` would have left it.
          tx.objectStore('outbox').add({ table: 'logs', rowId: row.id, row });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { stores: V4_STORES, row: pending },
  );

  // The new build opens the old database.
  await page.goto('/train');
  await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();

  const after = await page.evaluate(
    (id) =>
      new Promise<{ version: number; stores: string[]; kept: boolean }>((resolve, reject) => {
        const req = indexedDB.open('athletic-tracker');
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('logs').objectStore('logs').get(id);
          get.onsuccess = () => {
            resolve({
              version: db.version,
              stores: Array.from(db.objectStoreNames),
              kept: get.result !== undefined,
            });
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    pending.id,
  );

  expect(after.version).toBe(50);
  expect(after.stores).not.toContain('refSets');
  // The point: the upgrade took the dead store and nothing else.
  expect(after.stores).toEqual(expect.arrayContaining(['logs', 'outbox', 'goals', 'bodyLogs']));
  expect(after.kept).toBe(true);

  // And the set still reaches the server — the upgrade did not strand the
  // outbox either.
  await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });
});
