import type { Page } from '@playwright/test';
import { expect, logSet, openExercise, signInAs, test } from '../fixtures/test';

/**
 * Swiping between tabs.
 *
 * Driven through Chrome's own input pipeline rather than by constructing
 * `TouchEvent`s in the page: a hand-made event would only prove that the
 * listener reacts to something we dispatched ourselves, not that a thumb on a
 * phone reaches it.
 */
async function swipe(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from[0], y: from[1] }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from[0] + ((to[0] - from[0]) * i) / steps,
          y: from[1] + ((to[1] - from[1]) * i) / steps,
        },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * Which way the move `act` starts slides: the view transition type the browser
 * reports while it runs. Armed before the act, because a 300 ms slide is easy
 * to miss if you go looking for it afterwards; `none` if nothing slid.
 */
async function slideOf(page: Page, act: () => Promise<unknown>): Promise<string> {
  // The move before this one may still be sliding, and it is not this one.
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
  const seen = page.waitForFunction(
    () => {
      const html = document.documentElement;
      if (html.matches(':active-view-transition-type(nav-forward)')) return 'nav-forward';
      if (html.matches(':active-view-transition-type(nav-back)')) return 'nav-back';
      return false;
    },
    null,
    { polling: 'raf', timeout: 3000 },
  );
  await act();
  const direction = await seen.then((h) => h.jsonValue() as Promise<string>).catch(() => 'none');
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
  return direction;
}

const tab = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('link', { name, exact: true });

test.describe('Back and the history', () => {
  /* The fixture opens /train from a blank page, so the history is
     [about:blank, /train] — and "Back leaves the app" is Back reaching the
     blank page. */

  test('switching tabs, by tap or swipe, adds nothing for Back to walk through', async ({
    onboardedApp: app,
  }) => {
    await swipe(app, [300, 300], [60, 310]);
    await app.waitForURL('**/week');
    await tab(app, 'Progress').click();
    await app.waitForURL('**/progress');
    await tab(app, 'Home').click();
    await app.waitForURL('**/home');

    await app.goBack();
    await expect(app).toHaveURL('about:blank');
  });

  test('Back comes out of a screen, sliding back, and then leaves', async ({
    onboardedApp: app,
  }) => {
    await tab(app, 'Settings').click();
    await app.waitForURL('**/settings');
    await app.getByRole('link', { name: /Build your own/ }).click();
    await app.waitForURL('**/settings/split');
    await expect(app.getByRole('heading', { name: 'Your own split' })).toBeVisible();

    /* Next.js restores Back with no transition at all; the app takes it over
       and replays it as a move, so it slides the way it went. */
    expect(await slideOf(app, () => app.goBack())).toBe('nav-back');
    await expect(app).toHaveURL(/\/settings$/);
    await expect(app.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

    await app.goBack();
    await expect(app).toHaveURL('about:blank');
  });

  test('leaving a screen for another tab leaves one entry, not three', async ({
    onboardedApp: app,
  }) => {
    await tab(app, 'Settings').click();
    await app.waitForURL('**/settings');
    await app.getByRole('link', { name: /Build your own/ }).click();
    await app.waitForURL('**/settings/split');

    expect(await slideOf(app, () => tab(app, 'Week').click())).toBe('nav-back');
    await expect(app).toHaveURL(/\/week$/);
    await expect(app.getByRole('list', { name: 'Movement coverage' })).toBeVisible();

    await app.goBack();
    await expect(app).toHaveURL('about:blank');
  });

  test("the screen's own back link steps back rather than piling on", async ({
    onboardedApp: app,
  }) => {
    await tab(app, 'Settings').click();
    await app.waitForURL('**/settings');
    await app.getByRole('link', { name: /Build your own/ }).click();
    await app.waitForURL('**/settings/split');

    const back = app.locator('main a[href="/settings"]');
    expect(await slideOf(app, () => back.click())).toBe('nav-back');
    await expect(app).toHaveURL(/\/settings$/);

    await app.goBack();
    await expect(app).toHaveURL('about:blank');
  });
});

test.describe('Every move slides its way', () => {
  test('the links inside pages, the avatar and a button carry a direction', async ({
    onboardedApp: app,
  }) => {
    // Home → Train and Home → Week: tabs to the right.
    await tab(app, 'Home').click();
    await app.waitForURL('**/home');
    expect(await slideOf(app, () => app.locator('main a[href="/train"]').click())).toBe(
      'nav-forward',
    );
    await tab(app, 'Home').click();
    await app.waitForURL('**/home');
    expect(await slideOf(app, () => app.locator('main a[href="/week"]').click())).toBe(
      'nav-forward',
    );

    // Week's "Train this": a tab to the left.
    expect(
      await slideOf(app, () => app.getByRole('button', { name: 'Train this' }).first().click()),
    ).toBe('nav-back');
    await expect(app).toHaveURL(/\/train$/);

    // The avatar: Settings is the last tab.
    expect(await slideOf(app, () => app.getByRole('link', { name: 'Your profile' }).click())).toBe(
      'nav-forward',
    );
    await expect(app).toHaveURL(/\/settings$/);

    // Into the split editor, and out of it by the browser's Back.
    expect(
      await slideOf(app, () => app.getByRole('link', { name: /Build your own/ }).click()),
    ).toBe('nav-forward');
    await expect(app).toHaveURL(/\/settings\/split$/);
    expect(await slideOf(app, () => app.goBack())).toBe('nav-back');
    await expect(app).toHaveURL(/\/settings$/);
  });
});

test.describe('Swiping between tabs', () => {
  test('left goes forward, right goes back', async ({ onboardedApp: app }) => {
    await app.goto('/train');
    await expect(app.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();

    // Left drags the next tab into view, which is what every phone has taught
    // people to expect.
    await swipe(app, [300, 300], [60, 310]);
    await app.waitForURL('**/week');

    await swipe(app, [60, 300], [300, 310]);
    await app.waitForURL('**/train');
  });

  test('the move is animated, and the direction comes from the gesture', async ({
    onboardedApp: app,
  }) => {
    await app.goto('/train');
    await expect(app.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();

    /* `:active-view-transition-type()` matches the document only while a
     * transition of that type is running, so this is the browser confirming
     * which way the slide went rather than a check that we called something.
     * Checked for both directions: a transition merely running passed with the
     * two types swapped, and the pages slid the wrong way. Armed before each
     * swipe, because a 320ms animation is easy to miss if you go looking for it
     * afterwards. */
    const running = (type: string) =>
      app.waitForFunction(
        (t) => document.documentElement.matches(`:active-view-transition-type(${t})`),
        type,
        { timeout: 3000 },
      );

    const forward = running('nav-forward');
    await swipe(app, [300, 300], [60, 310]);
    await forward;
    await app.waitForURL('**/week');
    await app.waitForFunction(
      () => !document.documentElement.matches(':active-view-transition'),
      null,
      { timeout: 5000 },
    );

    const back = running('nav-back');
    await swipe(app, [60, 300], [300, 310]);
    await back;
    await app.waitForURL('**/train');
  });

  test('nothing moves once the slide has landed', async ({ onboardedApp: app }) => {
    /*
     * The regression this exists for: the per-card entry animation was
     * suppressed *during* the transition, so the instant it ended the rule
     * stopped matching, the animation applied fresh, and every card re-animated
     * from zero. It read as the page reloading after every swipe.
     */
    await app.goto('/train');
    // The shell draws the header, and attaches the swipe listener, only once
    // the profile has loaded — a swipe before that goes nowhere.
    await expect(app.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
    await swipe(app, [300, 300], [60, 310]);
    await app.waitForURL('**/week');
    await app.waitForFunction(
      () => !document.documentElement.matches(':active-view-transition'),
      null,
      { timeout: 5000 },
    );

    const stillMoving = await app.evaluate(() => {
      const page = document.querySelector('[data-page]');
      if (!page) return -1;
      // Scoped to the page's own content: the sync badge pulses on its own
      // schedule and has nothing to do with navigating.
      return document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .filter((a) => {
          const target = (a as unknown as { effect?: { target?: Element | null } }).effect?.target;
          return !!target && page.contains(target);
        }).length;
    });

    expect(stillMoving).toBe(0);
  });

  test('still navigates with motion turned off', async ({ onboardedApp: app }) => {
    // A slide across the viewport is the most common trigger for motion
    // sensitivity. Removing the animation must not remove the navigation.
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/train');
    await expect(app.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
    await swipe(app, [300, 300], [60, 310]);
    await app.waitForURL('**/week');
    await expect(app.getByRole('list', { name: 'Movement coverage' })).toBeVisible();
  });

  test('a scroll that wandered sideways is not a swipe', async ({ onboardedApp: app }) => {
    await app.goto('/train');
    await expect(app.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
    /* Mostly vertical: this is someone scrolling, and taking it as a swipe
       would make the app feel like it changes tab at random. Far enough
       sideways to be a swipe on distance alone — 110 px — so it is the ratio
       to the vertical that has to turn it down; the drift this used to test
       was too short to count as a swipe at all. And watched for long enough
       that a tab change would have landed: a URL read at once is still the
       old one whatever the gesture did. */
    await swipe(app, [300, 650], [190, 250]);
    await expect(app.waitForURL('**/week', { timeout: 1500 })).rejects.toThrow();
  });

  test('does not leave a screen holding an unsaved draft', async ({ onboardedApp: app }) => {
    // The split editor is the one place with work in progress that a stray
    // thumb could throw away, so swiping is off anywhere that is not a tab.
    await app.goto('/settings/split');
    await expect(app.getByRole('heading', { name: 'Your own split' })).toBeVisible();

    /* Towards Progress. Settings is the last tab, so a swipe the other way has
       nowhere to go even from Settings itself — it could not fail on the
       regression this is for, which is the editor being taken for the tab. */
    await swipe(app, [60, 300], [300, 310]);
    await expect(app.waitForURL('**/progress', { timeout: 1500 })).rejects.toThrow();
    await expect(app.getByRole('heading', { name: 'Your own split' })).toBeVisible();
  });

  test('dragging a chart reads the chart, it does not change tab', async ({
    page,
    context,
    baseURL,
  }) => {
    /* A chart needs two weeks before it draws anything, so this account has
     * training behind it and adds a set today. Without both, the locator finds
     * nothing and the test passes for the wrong reason. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'] },
    });
    const lift = await openExercise(page);
    await logSet(page, 60, 8);
    await expect(page.getByText('60 kg × 8').first()).toBeVisible();

    await page.goto('/progress');
    await page.getByRole('button', { name: `Show ${lift}` }).click();

    const sheet = page.getByRole('dialog');
    const chart = sheet.locator('svg[data-no-swipe]');
    await expect(chart).toBeVisible();

    const box = (await chart.boundingBox())!;
    await swipe(
      page,
      [box.x + box.width - 8, box.y + box.height / 2],
      [box.x + 8, box.y + box.height / 2],
    );

    /* Neither outcome the gesture could otherwise have had: the tab bar does
       not move, and the sheet the chart is in does not dismiss. Watched for
       long enough that a tab change would have landed — read at once, the URL
       is still Progress whether or not the swipe was taken. */
    await expect(
      page.waitForURL((u) => !u.pathname.startsWith('/progress'), { timeout: 2000 }),
    ).rejects.toThrow();
    await expect(page).toHaveURL(/\/progress/);
    await expect(chart).toBeVisible();
  });
});
