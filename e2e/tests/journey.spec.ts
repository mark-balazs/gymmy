/** Flow 08 — see ../flows/08-a-full-journey.md */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { seedSignInCode } from '../fixtures/auth';
import { completeOnboarding, expect, logSet, test } from '../fixtures/test';

/**
 * The whole thing, walked the way a person walks it.
 *
 * Every other spec starts from a session row inserted straight into the
 * database. That is deliberate and it keeps sixty tests fast and independent —
 * but it means the front door itself was never opened, and neither was
 * everything that hangs off it: the account the server creates, the library it
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
  // Only meaningful when email sign-in is switched on for this deployment.
  if ((await field.count()) === 0) test.skip();

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
    //    the user and seeds the whole default library in response to this.
    await signInWithCode(page, email, '111111');

    // 2. Setup. A brand-new account is sent here rather than to an empty Train
    //    tab, and this is the first proof the seeding actually happened: none
    //    of these questions can be answered without a library behind them.
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 30_000 });
    await completeOnboarding(page, { split: 'Push / Pull / Legs', days: '3 days' });

    // 3. Train. A real generated exercise, a real set.
    await logSet(page, 0, 60, 8);
    await expect(page.getByText('60 kg × 8').first()).toBeVisible();

    // 4. The week scores it against the split that was chosen, not a default.
    await tab(page, 'Week').click();
    await page.waitForURL('**/week');
    await expect(
      page.getByRole('list', { name: 'Movement coverage' }).getByRole('listitem'),
    ).toHaveCount(5);

    // 5. And it shows up as progress.
    await tab(page, 'Progress').click();
    await page.waitForURL('**/progress');
    await expect(page.getByText('60', { exact: false }).first()).toBeVisible();

    // 6. Leave. Signing out wipes this device, so anything that had not
    //    reached the server would be gone for good — wait until it has.
    await tab(page, 'Settings').click();
    await page.waitForURL('**/settings');
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in');

    // 7. Come back. No setup this time — the account is already onboarded —
    //    and the training is pulled back down onto an emptied device. This is
    //    the step that proves the sets were ever really saved anywhere.
    await signInWithCode(page, email, '222222');
    await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('60 kg × 8').first()).toBeVisible({ timeout: 30_000 });
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

    await logSet(page, 0, 72.5, 6);
    await expect(page.getByText('72.5 kg × 6').first()).toBeVisible();
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
      await expect(other.getByText('72.5 kg × 6').first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await second.close();
    }
  });
});
