import type { Page } from '@playwright/test';
import { expect, logSet, recordedSet, signInAs, test } from '../fixtures/test';

/**
 * A tab holds its data from its first render (GYM-13).
 *
 * Every page used to read the local database for itself, and a fresh read has
 * nothing on its first render. That first render is the one a navigation
 * slides in — so the slide carried an empty page and the real one popped in
 * after it — and it is the one Train chose its day from, and then kept. So
 * after a reload Train opened on Day A whatever had been trained.
 *
 * Now one read serves the whole app and the layout draws no page before it has
 * landed. These check what a person sees of that, from the two ways a tab is
 * reached: a load (a reload, opening the app) and a navigation.
 */

/** Any date this week other than today — a day already trained, but not one
 *  Train would take for "started today" and reopen. Monday unless that is
 *  today, when it is Tuesday: the rule reads the week, not the past. */
function otherDayThisWeek(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (monday.getDate() === d.getDate()) monday.setDate(monday.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`;
}

const day = (page: Page, letter: string) =>
  page.getByRole('button', { name: `Day ${letter}`, exact: true });

test.describe('Train opens on the right day', () => {
  test('with Day A done this week, it opens on Day B — loaded or navigated to', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sets: [{ exercise: 'Goblet Squat', date: otherDayThisWeek(), weight: 40, reps: 8, rir: 2 }],
    });

    // Loaded: `signInAs` has just opened /train.
    await expect(day(page, 'B')).toHaveAttribute('aria-pressed', 'true');
    await expect(day(page, 'A')).toHaveAttribute('aria-pressed', 'false');

    // Navigated to: the page mounts inside the move from another tab.
    await page.goto('/home');
    await page.getByRole('navigation').getByRole('link', { name: 'Train', exact: true }).click();
    await page.waitForURL('**/train');
    await expect(day(page, 'B')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a day started today is the day it reopens on after a reload', async ({
    onboardedApp: app,
  }) => {
    /* The report in GYM-13: a set logged on Day B, the app reloaded, and Train
       back on Day A. The rule is "the day already started today", and it was
       being asked of an empty database. */
    await expect(day(app, 'A')).toHaveAttribute('aria-pressed', 'true');
    await day(app, 'B').click();
    await expect(day(app, 'B')).toHaveAttribute('aria-pressed', 'true');
    await logSet(app, 40, 8);
    await recordedSet(app, 8);

    await app.reload();
    await expect(app.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
    await expect(day(app, 'B')).toHaveAttribute('aria-pressed', 'true');
    await expect(day(app, 'A')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('The page that slides in is the real one', () => {
  test('Progress arrives with its lifts, not its empty state', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'], sessions: 3 },
    });
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'gymmy', exact: true })).toBeVisible();

    /* The text of the new page in the commit that puts it in the document —
       read by a MutationObserver, which runs before that frame is painted, so
       this is exactly what the slide carries. */
    await page.evaluate(() => {
      const w = window as unknown as { first: string | null };
      w.first = null;
      const leaving = document.querySelector('[data-page]');
      const watch = new MutationObserver(() => {
        const arrived = Array.from(document.querySelectorAll('[data-page]')).find(
          (p) => p !== leaving,
        );
        if (!arrived) return;
        w.first = arrived.textContent;
        watch.disconnect();
      });
      watch.observe(document.body, { childList: true, subtree: true });
    });

    await page.getByRole('navigation').getByRole('link', { name: 'Progress', exact: true }).click();
    await page.waitForURL('**/progress');
    const first = await page.waitForFunction(
      () => (window as unknown as { first: string | null }).first,
    );
    expect(await first.jsonValue()).toContain('Goblet Squat');
  });

  test('Settings slides in rather than appearing after the slide', async ({
    onboardedApp: app,
  }) => {
    /* Settings drew a bare "Loading…" card on its first render, outside the
       element that slides — so the old page left, nothing arrived, and the
       real page appeared afterwards with no movement at all. */
    await app.evaluate(() => {
      const w = window as unknown as { entered: string[]; until: number };
      w.entered = [];
      w.until = performance.now() + 1500;
      const tick = () => {
        for (const a of document.getAnimations()) {
          const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
          if (pseudo.startsWith('::view-transition-new') && 'animationName' in a) {
            w.entered.push((a as CSSAnimation).animationName);
          }
        }
        if (performance.now() < w.until) requestAnimationFrame(tick);
      };
      tick();
    });
    await app.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true }).click();
    await app.waitForURL('**/settings');
    await app.waitForFunction(
      () => performance.now() > (window as unknown as { until: number }).until,
    );
    expect(
      await app.evaluate(() => (window as unknown as { entered: string[] }).entered),
    ).toContain('slide');
  });
});
