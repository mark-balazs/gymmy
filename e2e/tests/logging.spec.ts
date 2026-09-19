/** Flow 02 — see ../flows/02-logging-a-session.md */

import type { Page } from '@playwright/test';
import { serverSets, sessionCookie } from '../fixtures/auth';
import {
  expect,
  logSet,
  logSuggested,
  numberButton,
  openCard,
  openExercise,
  recordedSet,
  signInAs,
  test,
} from '../fixtures/test';

test.describe('Logging a session', () => {
  test('a straight set costs one tap', async ({ onboardedApp: app }) => {
    // The reason the sheet was removed. Set one still needs a starting weight,
    // but from there on the card already holds what to do next, so recording it
    // is a single press — three sets, three taps, no typing.
    const name = await openExercise(app);
    await logSet(app, 60, 8, '2 more');

    await logSuggested(app);
    await logSuggested(app);

    await expect(app.getByText(/3 of \d+ sets/)).toBeVisible();

    /* Three of three finishes the exercise, which folds it away and takes its
       set list with it — so inspecting what was logged means opening it again,
       which is what a person would do. */
    await openCard(app, name);
    // Counted by delete buttons, not by text: the card's hint line also reads
    // "Last time 60 kg × 8", so a text count would include it.
    await expect(app.getByRole('button', { name: 'Delete' })).toHaveCount(3);
  });

  test('the numbers hold still between sets', async ({ onboardedApp: app }) => {
    /* If the numbers re-read history after every set they would drift mid-
       exercise, and straight sets would cost typing again. There are two ways
       to get that wrong, and this holds both.

       Reading the numbers back after the first set proves neither: history
       after that set *is* 62.5 × 7, so a card that re-seeded from it, or was
       remounted, shows the same numbers. The effort tells a remount apart,
       because a fresh card is back on its default. Moving history out from
       under the card tells a re-seed apart. Each read waits for the Delete
       count first, or it reads the render from before the write landed. */
    await logSet(app, 62.5, 7, 'Maxed');
    const deletes = app.getByRole('button', { name: 'Delete' });
    await expect(deletes).toHaveCount(1);
    // A card remounted after the set would be back on its default effort.
    await expect(app.getByRole('button', { name: 'Maxed', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '62.5');
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', '7');

    /* Move history under the card. With the heavier second set deleted, last
       time is 62.5 × 7 again while a set is still done — and the card, last
       set to 65 × 5, must not follow it back. */
    await logSet(app, 65, 5);
    await expect(deletes).toHaveCount(2);
    await deletes.nth(1).click();
    await expect(deletes).toHaveCount(1);
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '65');
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', '5');
  });

  test('logs a set and shows it back', async ({ onboardedApp: app }) => {
    await expect(app.getByText(/0 of \d+ sets/)).toBeVisible();

    /* With no history the card says it has none. It used to suggest a starting
       weight and a rep target here; the app no longer proposes a load it has no
       basis for — see progression.spec.ts. */
    await expect(app.getByText('First time', { exact: true }).first()).toBeVisible();

    await logSet(app, 60, 8, '2 more');

    // The logged row itself. A page-wide "60 kg × 8" finds the "Last time"
    // line above it first, and that line appears the moment the set lands
    // whether or not the row does.
    expect(await recordedSet(app, 8)).toBe('60 kg × 8');
    await expect(app.getByText(/1 of \d+ sets/)).toBeVisible();
    await expect(app.getByRole('button', { name: 'Log set 2' })).toBeVisible();
  });

  test('shows effort in plain words, never as RIR', async ({ onboardedApp: app }) => {
    /* Maxed, because it is the one effort whose chip and control read
       differently: the control says "Maxed", the logged row says what was
       stored — "Nothing left". Logged at "2 more", the row and the control
       above it said the same words, and the control was what matched. */
    await logSet(app, 60, 8, 'Maxed');

    await expect(app.locator('main .num').filter({ hasText: /kg ×/ })).toContainText(
      'Nothing left',
    );
    // Reps-in-reserve is stored as a number and never shown as one.
    await expect(app.getByText(/RIR/i)).toHaveCount(0);
  });

  test('a double tap on the log button records one set', async ({ page, context, baseURL }) => {
    /* The button stays where it is after a tap, and on a laggy phone a second
       tap lands before the first set has been written. The card holds the
       button down while it saves; without that, one set is logged twice. */
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await page.getByRole('button', { name: 'Log set 1', exact: true }).dblclick();

    // Once the server holds a row, a second write from the same double tap
    // would long since be local — so that is the moment to count.
    await expect
      .poll(async () => (await serverSets(user.id)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);
    await expect(page.getByText(/^1 of \d+ sets$/)).toBeVisible();
    expect((await serverSets(user.id)).length).toBe(1);
  });

  test('a deleted set stops counting', async ({ onboardedApp: app }) => {
    await logSet(app, 60, 8);
    await expect(app.getByText(/1 of \d+ sets/)).toBeVisible();

    await app.getByRole('button', { name: 'Delete' }).first().click();
    await expect(app.getByText(/0 of \d+ sets/)).toBeVisible();
  });

  test('a deleted set is deleted everywhere', async ({ page, context, browser, baseURL }) => {
    /* The counter above only proves this device dropped it. A delete is a
       soft delete so that it can travel: a row simply removed from IndexedDB
       would leave the server — and every other phone — still holding it. */
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await logSet(page, 60, 8);
    await logSet(page, 60, 9);
    const deletes = page.getByRole('button', { name: 'Delete' });
    await expect(deletes).toHaveCount(2);
    // Sorted by set number, so the first is the eight.
    await deletes.first().click();
    await expect(deletes).toHaveCount(1);

    await expect
      .poll(async () => (await serverSets(user.id)).map((s) => [s.weight, s.reps]), {
        timeout: 30_000,
      })
      .toEqual([[60, 9]]);

    // And a second device, which knows only what the server told it.
    const second = await browser.newContext({ baseURL });
    try {
      await second.addCookies([sessionCookie(user, baseURL!)]);
      const other = await second.newPage();
      await other.goto('/train');
      await expect(other.getByText(/^1 of \d+ sets$/)).toBeVisible({ timeout: 30_000 });
      // The logged rows, not the page: the "Last time" line repeats numbers.
      await expect(other.locator('main .num').filter({ hasText: /kg ×/ })).toHaveText([
        /^60 kg × 9/,
      ]);
    } finally {
      await second.close();
    }
  });

  test('survives a reload', async ({ onboardedApp: app }) => {
    await logSet(app, 60, 8);
    // Wait for the write to land before reloading — clicking Save returns
    // before the IndexedDB write commits, and reloading into that gap would be
    // testing the race rather than the persistence.
    await expect(app.getByText('60 kg × 8').first()).toBeVisible();

    await app.reload();
    await expect(app.getByText('60 kg × 8').first()).toBeVisible();
  });
});

test.describe('Fits the phone', () => {
  /**
   * A page wider than the screen is not just ugly on a phone — it shifts every
   * coordinate, so taps land on whatever has slid underneath them. That is how
   * this was found: a stepper that could not shrink pushed the layout sideways
   * and the bottom nav stopped being clickable.
   *
   * At 360 px, the phone the app is sized for, rather than the project's
   * default Pixel 7 at 412: a card 370 px wide fits the one and not the other.
   * And measured once the page's own content is there. The tab bar appears as
   * soon as the profile has loaded and the content a read later, so measuring
   * at the tab bar measured an empty page. Train is not here: `entry-modes`
   * holds it at 360 px in every entry style.
   */
  const screens: [string, (page: Page) => Promise<void>][] = [
    ['/week', (page) => expect(page.getByRole('button', { name: 'Swap' })).toHaveCount(15)],
    [
      '/progress',
      (page) => expect(page.getByRole('heading', { name: 'Every lift' })).toBeVisible(),
    ],
    [
      '/settings',
      (page) => expect(page.getByRole('heading', { name: 'Split', exact: true })).toBeVisible(),
    ],
    [
      '/settings/split',
      (page) => expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(15),
    ],
  ];

  for (const [path, loaded] of screens) {
    test(`${path} never scrolls sideways`, async ({ page, context, baseURL }) => {
      // Some training behind it, so Progress draws its whole page rather than
      // the one-line empty state.
      await signInAs(page, context, baseURL!, {
        onboarded: true,
        history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'] },
      });
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(path);
      await loaded(page);

      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, 'the page scrolls sideways').toBeLessThanOrEqual(0);
    });
  }
});
