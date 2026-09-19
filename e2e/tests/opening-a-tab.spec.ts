import type { BrowserContext, Page } from '@playwright/test';
import type { DatedSet } from '../fixtures/auth';
import {
  expect,
  localLogCount,
  logSet,
  logSuggested,
  recordedSet,
  signInAs,
  test,
} from '../fixtures/test';

/**
 * A tab holds its data from its first render (GYM-13).
 *
 * Every page used to read the local database for itself, and a fresh read has
 * nothing on its first render. That first render is the one a navigation
 * slides in — so the slide carried an empty page and the real one popped in
 * after it — and it is the one Train chose its day from, and then kept. So
 * after a reload Train opened on Day A whatever had been trained.
 *
 * Now one read serves the whole app and the layout draws no page before it
 * holds a profile. These check what a person sees of that, from the two ways a
 * tab is reached: a load (a reload, opening the app) and a navigation.
 *
 * A profile is not the whole history, though: on a new phone it comes with the
 * first page of the sync, and the sets follow 500 to a page. So Train keeps
 * following the data until the person picks a day or logs a set — checked
 * below with the later pages held back.
 */

const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Any date this week other than today — a day already trained, but not one
 *  Train would take for "started today" and reopen. Monday unless that is
 *  today, when it is Tuesday: the rule reads the week, not the past. */
function otherDayThisWeek(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (monday.getDate() === d.getDate()) monday.setDate(monday.getDate() + 1);
  return iso(monday);
}

/** Today, as the app reckons it: the local date. */
const today = () => iso(new Date());

const day = (page: Page, letter: string) =>
  page.getByRole('button', { name: `Day ${letter}`, exact: true });

/** A set of Day A — the fixture logs every set under A. */
const dayA = (date: string): DatedSet => ({
  exercise: 'Goblet Squat',
  date,
  weight: 40,
  reps: 8,
  rir: 2,
});

/**
 * `n` sets from before this week, one a day going back from a week ago.
 *
 * Written ahead of the sets that matter, so they take the lower change
 * numbers and those come after them in the sync — a page is the 500 lowest.
 */
function oldSets(n: number): DatedSet[] {
  const lifts = ['Goblet Squat', 'Barbell Bench Press', 'Kettlebell Swing'];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - 7 - i);
    return { exercise: lifts[i % lifts.length]!, date: iso(d), weight: 40, reps: 8, rir: 2 };
  });
}

/**
 * Lets a new phone's first sync page through and holds every later one until
 * the test says so.
 *
 * The first page is the one asked for from nothing (`since` 0); every later
 * one asks from a cursor. Holding those makes "the page is drawn, the rest of
 * the history is not in yet" a moment a test can act in, not a race. `asked`
 * settles once a later page has been asked for — so an account that fits one
 * page fails here instead of passing with nothing held.
 */
async function holdLaterPages(context: BrowserContext) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let wasAsked!: () => void;
  const asked = new Promise<void>((r) => (wasAsked = r));
  await context.route('**/api/sync', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { since?: number };
    if ((body.since ?? 0) > 0) {
      wasAsked();
      await gate;
    }
    await route.continue();
  });
  return { asked, release };
}

/**
 * Every set is on the phone, and the page has had a moment to draw from it.
 *
 * The count comes from IndexedDB directly; the page reads the same store a
 * moment later, through its own live query. What would move a day moves
 * within that moment, so it is waited out before a test says nothing moved.
 */
async function allArrived(page: Page, sets: number): Promise<void> {
  await expect.poll(() => localLogCount(page), { timeout: 30_000 }).toBe(sets);
  await page.waitForTimeout(750);
}

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

test.describe('Train on a new phone, while the history is still arriving', () => {
  /* More than one page of sets, with Day A of this week written last — so it
     comes in the second page, after the first has opened the app. */
  const OLD = 550;

  test('moves to the right day once this week’s sets arrive', async ({
    page,
    context,
    baseURL,
  }) => {
    const later = await holdLaterPages(context);
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sets: [...oldSets(OLD), dayA(otherDayThisWeek())],
    });
    await later.asked;

    // Drawn from the first page: 500 old sets and nothing from this week.
    await expect(day(page, 'A')).toHaveAttribute('aria-pressed', 'true');

    // The reviewer's report: it stayed on Day A.
    later.release();
    await expect(day(page, 'B')).toHaveAttribute('aria-pressed', 'true');
    await expect(day(page, 'A')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a day tapped before the rest arrives stays picked', async ({ page, context, baseURL }) => {
    const later = await holdLaterPages(context);
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sets: [...oldSets(OLD), dayA(otherDayThisWeek())],
    });
    await later.asked;

    await day(page, 'C').click();
    await expect(day(page, 'C')).toHaveAttribute('aria-pressed', 'true');

    // The rest lands, and would make it Day B — but Day C was a choice.
    later.release();
    await allArrived(page, OLD + 1);
    await expect(day(page, 'C')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a set logged before the rest arrives keeps its day', async ({ page, context, baseURL }) => {
    /* This time Day A of this week is in the first page, so Train opens on
       Day B, and the second page brings a Day A set from earlier today — from
       the old phone, say. "The day already started today" is then Day A. Once
       somebody has logged a set on Day B, it must not jump there. */
    const later = await holdLaterPages(context);
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sets: [...oldSets(499), dayA(otherDayThisWeek()), dayA(today())],
    });
    await later.asked;
    await expect(day(page, 'B')).toHaveAttribute('aria-pressed', 'true');

    await logSuggested(page);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);

    later.release();
    await allArrived(page, 499 + 2 + 1);
    await expect(day(page, 'B')).toHaveAttribute('aria-pressed', 'true');
  });

  test('so does a set logged outside the plan', async ({ page, context, baseURL }) => {
    /* It ticks no day, but it is somebody at work on this screen: the planned
       cards above must not change under them. */
    const later = await holdLaterPages(context);
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sets: [...oldSets(OLD), dayA(otherDayThisWeek())],
    });
    await later.asked;
    await expect(day(page, 'A')).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: '+ Log something else' }).click();
    const picker = page.getByRole('dialog');
    await picker.getByLabel('Search exercises').fill('Kettlebell Swing');
    await picker.getByRole('button', { name: 'Kettlebell Swing', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await logSuggested(page);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);

    later.release();
    await allArrived(page, OLD + 1 + 1);
    await expect(day(page, 'A')).toHaveAttribute('aria-pressed', 'true');
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
