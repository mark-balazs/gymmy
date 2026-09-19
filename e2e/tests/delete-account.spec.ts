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

    await sheet.getByRole('button', { name: 'Delete everything' }).click();
    await page.waitForURL('**/sign-in', { timeout: 30_000 });

    // Gone from the server.
    await expect.poll(() => rowCount('set_logs', user.id), { timeout: 15_000 }).toBe(0);
    expect(await rowCount('profiles', user.id)).toBe(0);

    // And gone from this device, which no server-side assertion can see.
    expect(await localLogCount(page)).toBe(0);
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
