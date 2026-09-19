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

    await page.goto('/train');
    await expect(page.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();

    await page
      .getByRole('button', { name: /^Log set/ })
      .first()
      .click();

    await expect(page.getByText('Not saved on this device')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Could not sync')).toHaveCount(0);

    /* And what a sighted person sees. The words are for screen readers and the
       tooltip; on screen the badge is a dot, and its colour is the whole
       message — so a dot that stayed green would leave the label correct and
       the person none the wiser. */
    const bad = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--color-bad)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    });
    await expect(page.getByTitle('Not saved on this device').locator('[aria-hidden]')).toHaveCSS(
      'background-color',
      bad,
    );
  });
});

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

    // Kept on the device, so it goes as soon as the server answers again.
    await context.unroute('**/api/sync');
    await page.reload();
    await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });
    await expect.poll(async () => (await serverSets(user.id)).length, { timeout: 30_000 }).toBe(1);
  });
});
