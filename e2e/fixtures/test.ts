/**
 * Base fixtures.
 *
 * `app` gives a page already signed in as a fresh user. `onboardedApp` skips
 * the setup flow and lands on a generated week, which is the starting state for
 * every flow except the first-run one.
 */

import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { closeDb, createUser, sessionCookie, type CreateUserOptions, type TestUser } from './auth';

interface Fixtures {
  user: TestUser;
  app: Page;
  onboardedApp: Page;
}

export const test = base.extend<Fixtures>({
  user: async ({}, use) => {
    await use(await createUser({ onboarded: false }));
  },

  app: async ({ page, context, baseURL, user }, use) => {
    await context.addCookies([sessionCookie(user, baseURL!)]);
    await use(page);
  },

  onboardedApp: async ({ page, context, baseURL }, use) => {
    const ready = await createUser({ onboarded: true });
    await context.addCookies([sessionCookie(ready, baseURL!)]);
    await page.goto('/train');
    // The first paint is local-first and empty; wait for the sync to land.
    await expect(page.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
    await use(page);
  },
});

test.afterAll(async () => {
  await closeDb();
});

export { expect };

/**
 * Waits until the service worker has activated.
 *
 * Registration is deferred to the window `load` event, so cutting the network
 * before that point leaves a reload with nothing to serve it —
 * `ERR_INTERNET_DISCONNECTED`, which reads like an offline-support failure but
 * is really the test starting too early. Anything that goes offline waits here
 * first.
 *
 * An *activated registration* is the condition that matters, not
 * `navigator.serviceWorker.controller`: the page that registered the worker may
 * not be claimed yet, while the reload this is protecting is a fresh navigation
 * and picks up the active worker regardless.
 */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker?.ready.then((r) => r.active?.state === 'activated') ?? false,
    undefined,
    { timeout: 20_000 },
  );
}

/**
 * Signs in as a user seeded to order — used where the standard fixtures are not
 * enough, such as an account that has already trained under an earlier split.
 */
export async function signInAs(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  opts: CreateUserOptions,
): Promise<void> {
  const user = await createUser(opts);
  await context.addCookies([sessionCookie(user, baseURL)]);
  await page.goto('/train');
  await expect(page.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
}

/**
 * Confirms whatever sheet is open.
 *
 * Scoped to the dialog and given a moment to settle: the sheet slides up from
 * the bottom edge, and a click fired mid-animation lands where the button is
 * about to be rather than where it is.
 */
export async function confirmSheet(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: /^(Confirm|Rendben)$/ });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(dialog).toHaveCount(0);
}

/** Completes onboarding with the given answers. The split is asked first,
 *  because it decides which day counts are on offer in the next step. */
export async function completeOnboarding(
  page: Page,
  opts: {
    split?: 'Seven movement patterns' | 'Push / Pull / Legs' | 'Upper / Lower';
    days?: '2 days' | '3 days' | '4 days' | '5 days' | '6 days';
    where?: 'A gym' | 'Home';
    bias?: string;
  } = {},
): Promise<void> {
  await page.goto('/onboarding');
  // Matched on visible text rather than a pattern: "Push / Pull / Legs" is a
  // label, and turning it into a RegExp would only invite escaping bugs.
  await page
    .getByRole('button')
    .filter({ hasText: opts.split ?? 'Seven movement patterns' })
    .first()
    .click();
  await page.getByRole('button', { name: new RegExp(opts.days ?? '3 days') }).click();
  await page.getByRole('button', { name: new RegExp(opts.where ?? 'A gym') }).click();
  await page
    .getByRole('button', { name: new RegExp(opts.bias ?? 'Nothing in particular') })
    .click();
  await expect(page.getByRole('heading', { name: 'Here is your week' })).toBeVisible();
  await page.getByRole('button', { name: 'Start training' }).click();
  await page.waitForURL('**/train');
}

/**
 * Logs one set of whichever exercise sits at `index` on the current day.
 *
 * Everything is on the card itself — there is no sheet to open — so each
 * locator is scoped with `.nth(index)` to that exercise's card.
 */
export async function logSet(
  page: Page,
  index: number,
  weight: number,
  reps: number,
  effort: 'Maxed' | '1 more' | '2 more' | 'Easy' = '2 more',
): Promise<void> {
  // Exact, because the stepper's − and + buttons are labelled "weight −"/"weight +"
  // and a substring match would hit all three.
  await page.getByLabel('weight', { exact: true }).nth(index).fill(String(weight));
  await page.getByLabel('reps', { exact: true }).nth(index).fill(String(reps));

  await page.getByRole('button', { name: effort, exact: true }).nth(index).click();
  await page
    .getByRole('button', { name: /^Log set|Add another set/ })
    .nth(index)
    .click();
}

/**
 * Logs a set taking everything the coach suggested — the one-tap path, and the
 * one almost every real set goes through.
 */
export async function logSuggested(page: Page, index: number): Promise<void> {
  await page
    .getByRole('button', { name: /^Log set|Add another set/ })
    .nth(index)
    .click();
}
