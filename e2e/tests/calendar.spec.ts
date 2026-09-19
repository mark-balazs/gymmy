import type { Page } from '@playwright/test';
import {
  confirmSheet,
  expect,
  historyStart,
  logSet,
  openExercise,
  signInAs,
  test,
} from '../fixtures/test';

/** How the calendar names the month a date falls in, in the app's default
 *  language. Matching the component rather than re-deriving it. */
const monthLabel = (d: Date): string =>
  d.toLocaleDateString('en', { month: 'long', year: 'numeric' });

const monthsBack = (n: number): Date => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d;
};

/**
 * Pages the calendar back until `target` is on screen.
 *
 * The seeded history lands on a single day some weeks ago, which is in this
 * month or a previous one depending on today's date — so a test that simply
 * looked at the month it opened on would pass or fail by the calendar. Bounded
 * so a broken arrow fails here rather than spinning.
 */
async function showMonth(page: Page, target: Date): Promise<void> {
  const label = monthLabel(target);
  for (let i = 0; i < 24; i++) {
    if (await page.getByText(label, { exact: true }).isVisible()) return;
    await page.getByRole('button', { name: 'Previous month' }).click();
  }
  throw new Error(`the calendar would not go back to ${label}`);
}

/**
 * The calendar on Home.
 *
 * The claim is that a day you tap shows what actually happened on it. The trap
 * that claim exists to avoid is reading the day off the *plan* — the plan is
 * rebuilt every time somebody changes split, so a September day sourced from it
 * would silently start describing this week's exercises instead.
 */
test.describe('The calendar on Home', () => {
  test('a day you trained opens what you did on it', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true });

    const lift = await openExercise(page);
    await logSet(page, 62.5, 8);
    await expect(page.getByText('62.5 kg × 8').first()).toBeVisible();

    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.waitForURL('**/home');

    /* One square per day of this month, and no more: the padding that lines the
       first of the month up under its weekday is not a day and is not listed.
       Counted exactly — a range of 28 to 31 passed with a padding square or
       two counted in, on any month short enough to leave room. */
    const now = new Date();
    const inMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    await expect(page.getByRole('listitem')).toHaveCount(inMonth);
    // Today is the only day with anything on it, so it is the only square that
    // can be pressed — untrained days are not pretending to be tappable.
    const trained = page.getByRole('listitem').and(page.locator('button:not([disabled])'));
    await expect(trained).toHaveCount(1);

    await trained.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(lift)).toBeVisible();
    await expect(sheet.getByText('62.5 kg × 8')).toBeVisible();
    /* The three numbers the day is summarised by — read, not just labelled:
       the labels are there whatever the numbers are. One set, and no
       bodyweight on record, so no index either. */
    const stat = (label: string) =>
      sheet.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
    await expect(stat('Sets')).toHaveText('1');
    await expect(stat('Bodyweight')).toHaveText('—');
    await expect(stat('Strength index')).toHaveText('—');
  });

  test('a day with nothing on it cannot be opened', async ({ page, context, baseURL }) => {
    // An empty square that opens an empty sheet is worse than one that does
    // not respond: it teaches people the feature is broken.
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/home');

    const squares = page.getByRole('listitem');
    await expect(squares.first()).toBeVisible();
    await expect(squares.first()).toBeDisabled();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('still shows a day trained before the week was rebuilt', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The reason this reads the logs rather than the plan. Three weeks of
     * history, then a different split — the plan those sets were logged under
     * no longer exists, and the day must still say what happened. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'] },
    });

    await page.goto('/settings');
    await page.getByRole('button').filter({ hasText: 'Upper / Lower' }).first().click();
    await page.getByRole('button', { name: 'Rebuild my week' }).click();
    await confirmSheet(page);

    await page.goto('/home');
    /* The day the fixture logged, navigated to by that date rather than
       assumed to be on the opening screen. It used to page to "21 days ago",
       which is the Monday or so before the Tuesday actually logged — a
       different month on a few days a year, when the arrow either refused to
       go back or stopped a month short. */
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible({
      timeout: 15_000,
    });
    const seeded = new Date(`${historyStart(3)}T12:00:00`);
    await showMonth(page, seeded);
    const label = seeded.toLocaleDateString('en', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    // One set, said in the singular: the label used to read "1 sets".
    await page.getByRole('listitem', { name: `${label} — 1 set`, exact: true }).click();

    // What was logged, and only that: the plan that day's letter now points
    // at is Upper / Lower's, and none of the old Day A that was not lifted.
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Goblet Squat')).toBeVisible();
    await expect(sheet.getByText('Barbell Bench Press')).toHaveCount(0);
    await expect(
      sheet.getByText('Sets', { exact: true }).locator('xpath=following-sibling::span[1]'),
    ).toHaveText('1');
  });

  test('shows the index to one decimal, trailing zero included', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The index is always written to one decimal, including a trailing zero,
       so the week it happens to be round is not the week it looks like a DOTS
       — Progress holds that, and the calendar's day sheet shows the same
       number. At 89.4 kg a best of 60 is an index of 3.0 — the calendar once
       wrote it with String(), which reads "3". */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'], sessions: 3 },
    });
    await logSet(page, 20, 8); // a set today, lighter than the seeded best of 60
    await expect(page.getByText('20 kg × 8').first()).toBeVisible();

    await page.goto('/progress');
    await page.getByLabel('Today (kg)').fill('89.4');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page
        .getByRole('heading', { name: 'Strength index' })
        .locator('xpath=../following-sibling::div[1]/span[1]'),
    ).toHaveText('3.0');

    await page.goto('/home');
    const label = new Date().toLocaleDateString('en', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    await page.getByRole('listitem', { name: new RegExp(`^${label} — `) }).click();
    await expect(
      page
        .getByRole('dialog')
        .getByText('Strength index', { exact: true })
        .locator('xpath=following-sibling::span[1]'),
    ).toHaveText('3.0');
  });

  test('pages between months, and refuses to page into the future', async ({
    page,
    context,
    baseURL,
  }) => {
    /* It used to be eight rolling weeks: the columns were weekdays but the rows
       belonged to no month, so the 3rd appeared twice on screen in different
       places and there was no way at all to look back at March. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 10, exercises: ['Goblet Squat'] },
    });
    await page.goto('/home');

    const next = page.getByRole('button', { name: 'Next month' });
    const prev = page.getByRole('button', { name: 'Previous month' });

    // It opens on today, and forward from there is the future — which is not a
    // thing anybody needs to look at in a training log.
    await expect(page.getByText(monthLabel(new Date()), { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(next).toBeDisabled();

    await prev.click();
    await expect(page.getByText(monthLabel(monthsBack(1)), { exact: true })).toBeVisible();
    await expect(next).toBeEnabled();

    await next.click();
    await expect(page.getByText(monthLabel(new Date()), { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
  });
});
