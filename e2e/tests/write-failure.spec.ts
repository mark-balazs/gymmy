import { expect, test } from '../fixtures/test';

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
  });
});
