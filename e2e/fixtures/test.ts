/**
 * Base fixtures.
 *
 * `app` gives a page already signed in as a fresh user. `onboardedApp` skips
 * the setup flow and lands on a generated week, which is the starting state for
 * every flow except the first-run one.
 */

import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { closeDb, createUser, sessionCookie, type CreateUserOptions, type TestUser } from './auth';

export { historyStart } from './auth';

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
  // Returned so a test can look the account up in the database afterwards —
  // which is the only way to assert that something was actually deleted.
): Promise<TestUser> {
  const user = await createUser(opts);
  await context.addCookies([sessionCookie(user, baseURL)]);
  await page.goto('/train');
  await expect(page.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();
  return user;
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
    /** Bodyweight, or null to take the skip. Defaults to answering, because
     *  that is what most people will do and what makes the score exist. */
    weight?: number | null;
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

  /* Bodyweight. Asked here rather than left to Settings because the strength
     score is a ratio: without it there is no score at all, which is how every
     account in production ended up with training and no number. */
  const weight = opts.weight === undefined ? 78.5 : opts.weight;
  if (weight === null) {
    await page.getByRole('button', { name: 'Skip for now' }).click();
  } else {
    await page.getByLabel('What do you weigh?').fill(String(weight));
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  await expect(page.getByRole('heading', { name: 'Here is your week' })).toBeVisible();
  await page.getByRole('button', { name: 'Start training' }).click();
  await page.waitForURL('**/train');
}

/** Which of the open card's two numbers. */
export type CardNumber = 'weight' | 'reps';

/**
 * The button that shows one of the open card's numbers and opens the keypad
 * for it — "Type weight" or "Type reps".
 *
 * There is no number input on Train any more: an input means the phone's
 * keyboard, and the keyboard shoves the card up the screen between sets. Every
 * way of setting a number — the buttons, the ruler, the picture of the bar —
 * has this one button, which is what lets a test reach the keypad the same way
 * in all three. Exact, because the buttons either side of it are named
 * "weight −" and "weight +".
 */
export function numberButton(page: Page, which: CardNumber): Locator {
  return page.getByRole('button', {
    name: which === 'weight' ? 'Type weight' : 'Type reps',
    exact: true,
  });
}

/**
 * The number the open card holds, exactly as it holds it — without the unit,
 * per hand for a dumbbell pair, and "0" where the card says "None".
 *
 * Read from the attribute the controls keep for this, not from the text: the
 * visible number drops its unit when space is short and reads "None" for no
 * added weight, and neither is the number that gets logged.
 */
export async function cardNumber(page: Page, which: CardNumber): Promise<string> {
  return (await numberButton(page, which).getAttribute('data-value')) ?? '';
}

/**
 * Sets one of the open card's numbers on gymmy's keypad, key by key, the way a
 * thumb does — and waits for the card to show it.
 *
 * The keys are tapped rather than typed on a hardware keyboard because tapping
 * them is the path somebody in a gym takes; `entry-modes.spec.ts` covers the
 * keyboard separately. Scoped to the dialog, because while it is open the page
 * behind it has buttons called "1" and "Delete" too.
 */
export async function typeNumber(page: Page, which: CardNumber, value: number): Promise<void> {
  await numberButton(page, which).click();
  const pad = page.getByRole('dialog', { name: which === 'weight' ? 'Weight' : 'Reps' });
  await expect(pad).toBeVisible();
  for (const key of String(value)) {
    await pad.getByRole('button', { name: key, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(pad).toHaveCount(0);
  await expect(numberButton(page, which)).toHaveAttribute('data-value', String(value));
}

/**
 * Logs one set of the exercise currently open on Train.
 *
 * There is nothing to disambiguate: Train is an accordion, one exercise open at
 * a time, and a collapsed card renders no controls at all. So these locators
 * are deliberately *unscoped* — Playwright's strict mode then fails loudly if
 * two cards are ever open at once, which is a bug worth a failing test.
 *
 * This used to take an `index` and scope every locator with `.nth(index)`.
 * Every one of its thirty-five call sites passed 0, and the argument became a
 * lie rather than a limitation the moment the cards started collapsing.
 *
 * Note that finishing an exercise's planned sets collapses it and opens the
 * next, so a test logging a fourth set to the same exercise must reopen it —
 * see `openCard`.
 */
export async function logSet(
  page: Page,
  weight: number,
  reps: number,
  effort: 'Maxed' | '1 more' | '2 more' | 'Easy' = '2 more',
): Promise<void> {
  await typeNumber(page, 'weight', weight);
  await typeNumber(page, 'reps', reps);

  await page.getByRole('button', { name: effort, exact: true }).click();
  await page.getByRole('button', { name: /^Log set|Add another set/ }).click();
}

/**
 * The line for a set just logged, exactly as the app recorded it — read off the
 * screen, never assumed from what was typed.
 *
 * Two things make "I typed 60, so it says 60" untrue. A pair of dumbbells is
 * entered per hand and recorded as both, so 60 becomes 120. And a real account
 * gets its own offset into the library, so which lift opens Day A differs from
 * account to account. Tests that asserted "60 kg × 8" after onboarding a fresh
 * account passed only on the runs where that account's first lift was not a
 * pair — which is a test that fails at random, not a test.
 *
 * Waits for the row, so it also serves as "the set has reached the local store".
 *
 * Anchored against the effort chip, which follows the reps with no space
 * between them — the row reads "33 kg × 52 more" — so the reps returned are
 * the ones stored rather than an echo of the argument: unanchored, a row
 * holding 50 reps matched a search for 5.
 */
export async function recordedSet(page: Page, reps: number): Promise<string> {
  const pattern = new RegExp(`^\\d+(\\.\\d+)? kg × ${reps}(?=(Nothing left|[12] more|Easy)$)`);
  const row = page.locator('main .num').filter({ hasText: pattern }).first();
  await expect(row).toBeVisible();
  return (await row.innerText()).match(pattern)![0];
}

/**
 * Opens a named exercise's card, if it is not already the open one.
 *
 * A collapsed card is a button showing the exercise name; the open one shows
 * the name as a heading. So "is it already open" is exactly "is there a heading
 * with that name", and tapping otherwise is what a person would do.
 */
export async function openCard(page: Page, name: string): Promise<void> {
  const heading = page.getByRole('heading', { name, exact: true });
  if (await heading.isVisible().catch(() => false)) return;
  // Not exact: a collapsed row also announces its set count, so its accessible
  // name is "Goblet Squat 2 of 3" rather than the bare exercise name.
  await page.getByRole('button', { name, exact: false }).first().click();
  await expect(heading).toBeVisible();
}

/** The open exercise's name, read off its heading. */
export async function openExercise(page: Page): Promise<string> {
  return (await page.locator('main h2').first().innerText()).trim();
}

/**
 * Logs sets until the open exercise is finished, and waits for it to fold away.
 *
 * The waiting is the whole point. Clicking the log button resolves before the
 * IndexedDB write and the re-render that follows it, so a test that reads the
 * page immediately afterwards sees the *previous* state — which is how the
 * first version of the accordion tests failed: the heading of a just-finished
 * exercise was still on screen, so reopening it was a no-op and the assertion
 * ran against the next exercise instead.
 *
 * So each set waits for the button it just clicked to stop existing, which is
 * true whether the next set's button replaced it or the card collapsed.
 */
export async function finishOpenExercise(page: Page): Promise<string> {
  const name = await openExercise(page);
  const heading = page.getByRole('heading', { name, exact: true });

  for (let guard = 0; guard < 12; guard++) {
    /* Stop the moment *this* exercise folds away. Looping on "is there a log
       button" instead ran straight past the collapse and into the next
       exercise's first set, quietly finishing the whole day — which made a test
       about one exercise pass for the wrong reason. */
    if (!(await heading.count())) break;

    const log = page.getByRole('button', { name: /^Log set \d+$/ });
    if (!(await log.count())) break;
    const label = (await log.innerText()).trim();
    await log.click();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }

  await expect(heading).toHaveCount(0);
  return name;
}

/** Finishes every exercise of the open day, in order. Returns their names. */
export async function finishDay(page: Page): Promise<string[]> {
  const done: string[] = [];
  for (let guard = 0; guard < 12; guard++) {
    if (!(await page.locator('main h2').count())) break;
    done.push(await finishOpenExercise(page));
  }
  return done;
}

/**
 * The names of the collapsed rows, in the order the session runs.
 *
 * Waits for the first row: `count()` does not, and read before Train has
 * rendered it answers an empty list — whose `[0]!` is undefined, which a
 * `getByRole('heading', { name })` then treats as "any heading".
 *
 * The bar chip on an open barbell card ("Bar 20 kg") is a collapsed disclosure
 * too, correctly — it opens the list of bars — so it is left out by name. So
 * is a closed ⓘ (it opens its tip), left out because it has no text: its name
 * is a label, and its mark a picture. Both are controls on the open card, not
 * exercises.
 */
export async function collapsedExercises(page: Page): Promise<string[]> {
  const rows = page
    .getByRole('button', { expanded: false })
    .filter({ hasNotText: /^Bar \d/ })
    .filter({ hasText: /\S/ });
  await expect(rows.first()).toBeVisible();
  const out: string[] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    // The row's text is the name, then its progress on its own line.
    const label = (await rows.nth(i).innerText()).trim();
    out.push(label.split(/\r?\n/)[0]!.trim());
  }
  return out;
}

/**
 * Logs a set taking the numbers already in the card — the one-tap path, and the
 * one almost every real set goes through.
 *
 * Unscoped for the same reason as `logSet`: one card is open, so there is one
 * button, and two would be a bug worth failing on.
 */
export async function logSuggested(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Log set|Add another set/ }).click();
}

/**
 * How many sets this device's IndexedDB still holds.
 *
 * The one witness to what a sign-out or a deletion left *on the phone*: a
 * screen that shows nothing looks the same whether the rows are gone or merely
 * not rendered, and the next person to sign in on the device inherits whatever
 * is still there. Zero when the database is gone altogether.
 */
export async function localLogCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name);
    if (!names.includes('athletic-tracker')) return 0;
    return new Promise<number>((resolve) => {
      const req = indexedDB.open('athletic-tracker');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('logs')) {
          db.close();
          return resolve(0);
        }
        const count = db.transaction('logs').objectStore('logs').count();
        count.onsuccess = () => {
          db.close();
          resolve(count.result);
        };
        count.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(0);
    });
  });
}
