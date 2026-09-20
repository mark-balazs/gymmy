import { expect, localLogCount, logSet, signInAs, test } from '../fixtures/test';
import { rowCount } from '../fixtures/auth';

/**
 * Deleting your account, end to end.
 *
 * The server-side test next to `delete-account.ts` proves the erasure is
 * complete. This proves the other half, which is that a person can actually
 * reach it and that pressing it leaves nothing behind *on the device* either —
 * a local-first app keeps a full copy in IndexedDB, so an account deleted only
 * on the server is an account still sitting on the phone, ready for the next
 * person who signs in on it to inherit.
 */
test.describe('Deleting your account', () => {
  test('removes the training from the server and from the device', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'] },
    });

    await logSet(page, 60, 8);
    await expect(page.getByText('60 kg × 8').first()).toBeVisible();
    // Wait for the push, so what is deleted is an account the server knows about.
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings');
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    // One set three weeks ago and one today: the account the sheet should count.
    expect(await rowCount('set_logs', user.id)).toBe(2);

    await page.getByRole('button', { name: 'Delete my account' }).click();

    const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
    /* Counted from their own data: "everything will be deleted" is a sentence
       people skim, and a number is one they read. The numbers themselves — two
       sets, in two different weeks. "Any number of sets across any number of
       weeks" passed on a sheet that counted nothing. */
    await expect(
      sheet.getByText('This deletes 2 logged sets across 2 weeks of training.'),
    ).toBeVisible();
    /* And that it cannot be taken back, with the reason — no copy is kept.
       That used to be a paragraph on the Settings card as well, before
       anything had been tapped; the sheet that always opens first is where
       it is read. */
    await expect(
      sheet.getByText('It happens straight away. No copy is kept, so it cannot be undone.'),
    ).toBeVisible();

    await sheet.getByRole('button', { name: 'Delete everything' }).click();
    await page.waitForURL('**/sign-in', { timeout: 30_000 });

    // Gone from the server.
    await expect.poll(() => rowCount('set_logs', user.id), { timeout: 15_000 }).toBe(0);
    expect(await rowCount('profiles', user.id)).toBe(0);

    // And gone from this device, which no server-side assertion can see.
    expect(await localLogCount(page)).toBe(0);
  });

  test('leaves the phone alone when the server does not confirm', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The device used to be wiped first and the account deleted afterwards, so
       a deletion that failed left somebody signed in to an account that still
       existed, on a phone with nothing on it and every unsent change gone
       (GYM-74). Now nothing is wiped until the server says the account is
       gone — and neither step runs offline, where the session cannot end. */
    const user = await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 2, exercises: ['Goblet Squat'] },
    });
    await page.goto('/settings');
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });
    const before = await localLogCount(page);
    expect(before).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Delete my account' }).click();
    const sheet = page.getByRole('dialog', { name: 'Delete your account?' });

    // Offline first: refused outright, nothing touched.
    await context.setOffline(true);
    await sheet.getByRole('button', { name: 'Delete everything' }).click();
    await expect(sheet.getByText('You are offline.', { exact: false })).toBeVisible();
    await context.setOffline(false);

    // Online, but the deletion itself fails.
    await context.route('**/settings', (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    );
    await sheet.getByRole('button', { name: 'Delete everything' }).click();
    await expect(
      sheet.getByText('The account was not deleted. Nothing on this phone was touched.'),
    ).toBeVisible({ timeout: 30_000 });
    await context.unroute('**/settings');

    // Still signed in, still on the phone, still on the server.
    await expect(page).toHaveURL(/\/settings/);
    expect(await localLogCount(page)).toBe(before);
    expect(await rowCount('set_logs', user.id)).toBeGreaterThan(0);
  });

  test('can be backed out of', async ({ page, context, baseURL }) => {
    // The button sits one card below Sign out, and only one of them is
    // recoverable. Cancelling has to genuinely cancel.
    const user = await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 2, exercises: ['Goblet Squat'] },
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete my account' }).click();

    const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();

    await expect(page).toHaveURL(/\/settings/);
    expect(await rowCount('set_logs', user.id)).toBeGreaterThan(0);
  });
});
