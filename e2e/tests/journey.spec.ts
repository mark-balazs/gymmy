/** Flow 08 — see ../flows/08-a-full-journey.md */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createUser, seedSignInCode, serverSets, sessionCookie } from '../fixtures/auth';
import {
  completeOnboarding,
  expect,
  localLogCount,
  logSet,
  openExercise,
  recordedSet,
  signInAs,
  test,
} from '../fixtures/test';

/**
 * The whole thing, walked the way a person walks it.
 *
 * Every other spec starts from a session row inserted straight into the
 * database. That is deliberate and it keeps sixty tests fast and independent —
 * but it means the front door itself was never opened, and neither was
 * everything that hangs off it: the account the server creates, the rows it
 * seeds, the first sync onto a device that has nothing.
 *
 * That gap was not theoretical. Email sign-in was broken from the day it
 * shipped — the code was posted in the request body and Auth.js reads it off
 * the query string — and the suite was green the entire time, because asking
 * for a code was covered and entering one was not.
 *
 * So these two go end to end with nothing seeded but the code that would have
 * arrived by email.
 */

const freshEmail = () => `journey-${randomUUID().slice(0, 8)}@example.test`;

/** The real front door: request a code, then enter it. */
async function signInWithCode(page: Page, email: string, code: string): Promise<void> {
  await seedSignInCode(email, code);
  await page.goto('/sign-in');

  const field = page.getByLabel('Email address');
  /* Required, not optional. This used to skip when the field was missing, so a
     broken switch — or a stray server on :3000 started without the key —
     reported the front door as skipped and the suite stayed green. */
  await expect(
    field,
    'email sign-in must be on: the e2e webServer sets RESEND_API_KEY',
  ).toBeVisible();

  await field.fill(email);
  await page.getByRole('button', { name: /Email me a code/ }).click();
  /* A throttled request answers 429 and the form advances anyway — by design,
   * so a stranger cannot tell a rate limit from an unknown address. The code
   * below was seeded directly, so it is valid either way and a busy test run
   * cannot make this flaky. */
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

const tab = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

test.describe('A full journey', () => {
  test('a new person signs up, sets up, trains, leaves and comes back', async ({ page }) => {
    const email = freshEmail();

    // 1. Sign up. Nothing about this account exists yet — the server creates
    //    the user and seeds its patterns, slots and profile in response to this.
    await signInWithCode(page, email, '111111');

    // 2. Setup. A brand-new account is sent here rather than to an empty Train
    //    tab, and this is the first proof the seeding actually happened: there
    //    is no profile to be sent here by until the server has written one.
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 30_000 });
    await completeOnboarding(page, { split: 'Push / Pull / Legs', days: '3 days' });

    // 3. Train. A real generated exercise, a real set.
    //
    //    Which exercise, and so what "60" gets recorded as, is not something
    //    this test can know. A real account gets its own offset into the
    //    library, so the first lift differs between accounts — and if it is a
    //    pair of dumbbells, 60 per hand is recorded as 120. The first version
    //    of this step asserted "60 kg × 8" and passed only because every new
    //    account used to get the same week. So the recorded line is read off
    //    the screen here and carried to step 7, which is the assertion that
    //    matters: the same set, back on an emptied device.
    const lift = await openExercise(page);
    await logSet(page, 60, 8);
    const recorded = await recordedSet(page, 8);

    // 4. The week scores it against the split that was chosen, not a default.
    await tab(page, 'Week').click();
    await page.waitForURL('**/week');
    await expect(
      page.getByRole('list', { name: 'Movement coverage' }).getByRole('listitem'),
    ).toHaveCount(5);

    // 5. And it shows up as progress.
    await tab(page, 'Progress').click();
    await page.waitForURL('**/progress');
    await expect(page.getByRole('button', { name: `Show ${lift}` })).toBeVisible();

    // 6. Leave. Signing out wipes this device, so anything that had not
    //    reached the server would be gone for good — wait until it has.
    await tab(page, 'Settings').click();
    await page.waitForURL('**/settings');
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in');
    /* And the device really is empty. Step 7 signs back into this same browser,
       so without this the set coming back proves nothing about the wipe — it
       would still be in IndexedDB either way. */
    expect(await localLogCount(page), 'signing out must empty this device').toBe(0);

    // 7. Come back. No setup this time — the account is already onboarded —
    //    and the training is pulled back down onto an emptied device. This is
    //    the step that proves the sets were ever really saved anywhere.
    await signInWithCode(page, email, '222222');
    await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(recorded).first()).toBeVisible({ timeout: 30_000 });
  });

  test('the same account on a second device shows the same training', async ({
    page,
    browser,
    baseURL,
  }) => {
    // The claim the whole sync engine exists to make. A reload only proves
    // IndexedDB kept it; another device proves the server did.
    const email = freshEmail();

    await signInWithCode(page, email, '333333');
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 30_000 });
    await completeOnboarding(page, { days: '3 days' });

    // Read back rather than assumed, for the same reason as the journey above:
    // each new account gets its own first lift, and a dumbbell pair records
    // 72.5 per hand as 145. Asserting "72.5 kg × 6" passed only on the runs
    // where this account's random id happened not to open on a pair.
    await logSet(page, 72.5, 6);
    const recorded = await recordedSet(page, 6);
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    // A genuinely separate browser: its own storage, its own service worker,
    // its own empty IndexedDB.
    const second = await browser.newContext({ baseURL });
    try {
      const other = await second.newPage();
      await signInWithCode(other, email, '444444');

      await expect(other.getByRole('heading', { name: 'Train', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(other.getByText(recorded).first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await second.close();
    }
  });
});

/**
 * Leaving, with a device somebody else will pick up.
 *
 * Signing out does two things in order: it pushes what is still queued, then it
 * empties the device. The journey above signs back into its own account, so
 * whatever was left behind would come back to the right person and nothing
 * would look wrong — these hand the phone to someone else, or leave something
 * unsent at the moment of leaving.
 */
test.describe('Signing out', () => {
  test('wipes the device before the next account signs in', async ({ page, context, baseURL }) => {
    /* Without the wipe the next account inherits the last one's training on
       screen, its cursor, and its queue — which the sync engine would then push
       up under the new name. */
    await signInAs(page, context, baseURL!, { onboarded: true });
    await logSet(page, 60, 8);
    const line = await recordedSet(page, 8);
    await tab(page, 'Settings').click();
    await page.waitForURL('**/settings');
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in');

    const next = await createUser({ onboarded: true });
    await context.addCookies([sessionCookie(next, baseURL!)]);
    await page.goto('/train');
    await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();

    expect(await localLogCount(page), 'the last account left its sets on this device').toBe(0);
    await expect(page.getByText(line)).toHaveCount(0);
    expect(await serverSets(next.id)).toEqual([]);
  });

  test('pushes what is still queued before wiping', async ({ page, context, baseURL }) => {
    /* The last push is the only thing standing between an unsynced set and the
       wipe. The journey waits for "All saved" before signing out, so that push
       never had anything to carry there. Here it is the only push that can:
       the set is logged while the server is unreachable, the network comes
       back, and nothing else is sent before the tap. */
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await context.route('**/api/sync', (route) => route.abort());
    await logSet(page, 60, 8);
    await expect(page.getByText('Could not sync')).toBeAttached({ timeout: 15_000 });
    expect(await serverSets(user.id)).toEqual([]);
    await context.unroute('**/api/sync');

    // Client-side, so no page load starts a sync of its own on the way.
    await tab(page, 'Settings').click();
    await page.waitForURL('**/settings');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in');

    await expect.poll(async () => (await serverSets(user.id)).length, { timeout: 30_000 }).toBe(1);
  });

  test('does not wipe a set logged while a push was travelling', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Sign-out's last push joins one already in flight rather than starting
       its own, and the one in flight left before this set was logged. So the
       wipe that follows takes the set with it: nothing drains the queue first.

       Expected to fail until sign-out drains the queue — waiting out the push
       in flight and pushing again while anything is still queued — before it
       wipes. Remove the marker with the fix. */
    test.fail(true, 'sign-out wipes a set queued behind a push already in flight');
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await expect(page.getByText('All saved')).toBeAttached({ timeout: 30_000 });

    // Hold the first push that carries a set, until told to let it go.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    const carrying = page.waitForRequest(
      (r) => r.url().endsWith('/api/sync') && (r.postData() ?? '').includes('"table":"logs"'),
    );
    await context.route('**/api/sync', async (route) => {
      if (!held && (route.request().postData() ?? '').includes('"table":"logs"')) {
        held = true;
        await gate;
      }
      await route.continue();
    });

    await logSet(page, 60, 8);
    await carrying;
    await logSet(page, 60, 9);
    await recordedSet(page, 9);

    await tab(page, 'Settings').click();
    await page.waitForURL('**/settings');
    await page.getByRole('button', { name: 'Sign out' }).click();
    release();
    await page.waitForURL('**/sign-in');

    await expect.poll(async () => (await serverSets(user.id)).length, { timeout: 20_000 }).toBe(2);
  });
});
