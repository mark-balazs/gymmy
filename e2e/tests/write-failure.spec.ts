import type { Page } from '@playwright/test';
import { serverSets } from '../fixtures/auth';
import { expect, logSet, signInAs, test } from '../fixtures/test';

test.describe('When the device cannot store a set', () => {
  /**
   * The core promise is that a set logged in a basement is kept. If the local
   * write fails — out of space, a private window, a corrupt store — the set is
   * gone, and saying nothing leaves someone believing they logged it.
   *
   * The badge must also not call this "could not sync": that would say the
   * opposite of what happened, which is that nothing was written at all.
   */
  test('it says so instead of losing the set quietly', async ({ page, context, baseURL }) => {
    // Break writes to one store only, so the rest of the app still boots.
    await context.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: unknown[]) {
        if (this.name === 'logs') throw new Error('simulated quota exceeded');
        return (original as (...a: unknown[]) => IDBRequest).apply(this, args);
      } as typeof IDBObjectStore.prototype.put;
    });

    const { createUser, sessionCookie } = await import('../fixtures/auth');
    const user = await createUser({ onboarded: true });
    await context.addCookies([sessionCookie(user, baseURL!)]);

    // The sync the app starts on load, out of the way first, so the one below
    // is certain to begin after the failure rather than be half-way through.
    const loaded = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.ok());
    await page.goto('/train');
    await expect(page.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
    await loaded;

    await page
      .getByRole('button', { name: /^Log set/ })
      .first()
      .click();

    const badge = page.getByTitle('Not saved on this device');
    await expect(page.getByText('Not saved on this device', { exact: true })).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.getByText('Could not sync', { exact: true })).toHaveCount(0);

    /* And what a sighted person sees. The words are for screen readers and the
       tooltip; on screen the badge is all there is — so a badge that stayed
       green would leave the label correct and the person none the wiser. It
       must not look like a sync problem either: that is red and a dot, and
       this is its own colour and a warning triangle. */
    await expect(badge).toHaveAttribute('data-state', 'storage');
    const storage = await themeColour(page, '--color-storage');
    expect(storage).not.toBe(await themeColour(page, '--color-bad'));
    await expect(badge.locator('svg')).toHaveCSS('color', storage);
    await expect(badge.locator('.rounded-full')).toHaveCount(0);

    // A dot has no hover on a phone, so the warning is also said in words.
    const warning = page
      .getByRole('alert')
      .filter({ hasText: 'Your last change was not saved on this device.' });
    await expect(warning).toBeVisible();

    /* It stays, whatever the sync does next. It used to be a sync state, and
       the next sync — "syncing", then "idle", seconds later — replaced it, so
       somebody who looked away never learned the set was saved nowhere. The
       reconnect trigger is the one that also set the state to idle directly. */
    const next = page.waitForRequest((r) => r.url().endsWith('/api/sync'));
    const answered = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.ok());
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await next;
    await answered;
    await expect(badge).toHaveAttribute('data-sync', 'idle');
    await expect(warning).toBeVisible();
    await expect(badge).toHaveAttribute('data-state', 'storage');

    /* And a reload. Nobody has to ask for one: the service worker's update
       reloads the app while it is out of view, and a phone discards a page
       left in the background. Kept only in memory, the warning went with it,
       unseen. Waited for past the load's own sync, so it is also not a
       warning that merely has not been replaced yet. */
    const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.ok());
    await page.reload();
    await reloaded;
    await expect(badge).toHaveAttribute('data-sync', 'idle');
    await expect(warning).toBeVisible();
    await expect(badge).toHaveAttribute('data-state', 'storage');

    // Only the person takes it away, and then the dot says what the sync says.
    await warning.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(warning).toHaveCount(0);
    await expect(page.getByTitle('All saved')).toHaveAttribute('data-state', 'idle');

    /* Taken away for good: a reload does not bring back a warning already
       read. Checked after the load's sync, by which time the header has long
       been listening, so the absence is not just a page still starting. */
    const again = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.ok());
    await page.reload();
    await again;
    await expect(page.getByTitle('All saved')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByRole('alert').filter({ hasText: 'was not saved' })).toHaveCount(0);
  });
});

/** A theme colour as the browser resolves it, to compare with what is drawn. */
function themeColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

test.describe('When the server cannot take a set', () => {
  test('a failed sync says so, keeps the set, and catches up', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The other failure, and the milder one: the set is safe on the device and
       has not reached the server yet. It has a state of its own — nothing
       asserted it, only its absence above. Answered with a 500 that carries a
       well-formed body, because a sync that forgot to check the status would
       read that body, empty the queue, call it saved and lose the set; a body
       it could not parse would fail for the right answer by accident. */
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await context.route('**/api/sync', (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          cursor: 0,
          changes: {},
          serverTime: new Date().toISOString(),
          hasMore: false,
        }),
      }),
    );

    await logSet(page, 60, 8);
    await expect(page.getByText('Could not sync')).toBeAttached({ timeout: 15_000 });
    expect(await page.getByText('All saved').count()).toBe(0);
    expect(await serverSets(user.id)).toHaveLength(0);

    // A red dot: never the storage failure's colour or its triangle.
    const badge = page.getByTitle('Could not sync');
    await expect(badge).toHaveAttribute('data-state', 'error');
    await expect(badge.locator('.rounded-full')).toHaveCSS(
      'background-color',
      await themeColour(page, '--color-bad'),
    );
    await expect(badge.locator('svg')).toHaveCount(0);

    // Kept on the device, so it goes as soon as the server answers again.
    await context.unroute('**/api/sync');
    await page.reload();
    await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });
    await expect.poll(async () => (await serverSets(user.id)).length, { timeout: 30_000 }).toBe(1);
  });
});
