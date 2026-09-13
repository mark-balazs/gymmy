import { expect, test, signInAs } from '../fixtures/test';

test.describe('Syncing more history than one page holds', () => {
  /**
   * The pull queries every table with the same limit and used to advance the
   * cursor to the highest seq it saw anywhere. When one table filled its page
   * while another held a higher seq — the profile row is written last, so it
   * always does — every row in between was skipped and never asked for again.
   *
   * Silent, permanent, and invisible on a small account. It only shows up as a
   * device that is quietly missing months of training.
   */
  const BULK = 1200; // comfortably past SYNC_LIMIT of 500

  test('every logged set reaches the device', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true, bulkLogs: BULK });

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((res, rej) => {
              const r = indexedDB.open('athletic-tracker');
              r.onsuccess = () => res(r.result);
              r.onerror = () => rej(r.error);
            });
            return new Promise<number>((res) => {
              const q = db.transaction('logs').objectStore('logs').count();
              q.onsuccess = () => res(q.result);
            });
          }),
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(BULK);
  });

  test('the server holds the cursor back rather than skipping rows', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, { onboarded: true, bulkLogs: BULK });

    // Asked from scratch, the first page must not claim to have reached the end.
    const first = await page.request.post('/api/sync', { data: { since: 0, mutations: [] } });
    const body = (await first.json()) as { cursor: number; hasMore: boolean };
    expect(body.hasMore).toBe(true);

    // And the cursor must not have run past the rows it actually sent.
    const second = await page.request.post('/api/sync', {
      data: { since: body.cursor, mutations: [] },
    });
    const next = (await second.json()) as { changes: Record<string, unknown[]> };
    expect((next.changes.logs ?? []).length).toBeGreaterThan(0);
  });
});
