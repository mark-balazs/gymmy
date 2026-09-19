import { expect, test, signInAs } from '../fixtures/test';

test.describe('Syncing more history than one page holds', () => {
  /**
   * The pull queries every table with the same limit and used to advance the
   * cursor to the highest seq it saw anywhere. When one table filled its page
   * while another held a higher seq — the profile row, the moment any setting
   * has changed — every row in between was skipped and never asked for again.
   *
   * Silent, permanent, and invisible on a small account. It only shows up as a
   * device that is quietly missing months of training.
   *
   * The fixture moves the profile above every logged set for exactly this. It
   * used to write the profile first, below them all, so the highest seq on the
   * first page was a log either way — and both tests here passed against the
   * very cursor rule they exist to forbid.
   */
  const BULK = 1200; // comfortably past SYNC_LIMIT of 500

  test('every logged set reaches the device', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true, bulkLogs: BULK });

    // Exactly: the account has no other sets, so anything short is rows lost.
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
      .toBe(BULK);
  });

  test('the server holds the cursor back rather than skipping rows', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, { onboarded: true, bulkLogs: BULK });

    /* Walked page by page from scratch, the way a new device asks, counting
       every set that comes back. The first page must not claim to have reached
       the end, and a cursor that ran past the rows it sent — to the profile
       above them, or one past the last log — shows up as sets that never
       arrive. Asked of the server alone, so nothing on the device can fill the
       gap. */
    let since = 0;
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const res = await page.request.post('/api/sync', { data: { since, mutations: [] } });
      const body = (await res.json()) as {
        cursor: number;
        hasMore: boolean;
        changes: Record<string, { id: string }[]>;
      };
      if (i === 0) expect(body.hasMore, 'the first page claimed to be the last').toBe(true);
      for (const r of body.changes.logs ?? []) ids.add(r.id);
      since = body.cursor;
      if (!body.hasMore) break;
    }
    expect(ids.size).toBe(BULK);
  });
});
