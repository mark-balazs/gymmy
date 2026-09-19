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

test.describe('The tab bar', () => {
  test('a second tab tapped while the first move is sliding is not lost', async ({
    onboardedApp: app,
  }) => {
    /* The bar is pinned during a slide by a view-transition name, and the
       browser skips named elements when it hit-tests — so this tap used to
       land on the page root and do nothing. */
    const progress = (await tab(app, 'Progress').boundingBox())!;
    await tab(app, 'Week').click();
    await app.waitForFunction(
      () => document.documentElement.matches(':active-view-transition'),
      null,
      { polling: 'raf' },
    );
    await app.touchscreen.tap(progress.x + progress.width / 2, progress.y + progress.height / 2);
    await app.waitForURL('**/progress');
  });

  test('the mark glides to the tab you chose, and jumps with motion off', async ({
    onboardedApp: app,
  }) => {
    const mark = app.locator('[data-tab-mark]');
    const gliding = () =>
      app.waitForFunction(
        () =>
          document
            .querySelector('[data-tab-mark]')!
            .getAnimations()
            .some((a) => (a as CSSTransition).transitionProperty === 'translate'),
        null,
        { polling: 'raf', timeout: 2000 },
      );
    /** The mark's centre against the centre of a tab. */
    const under = async (name: string) => {
      await expect(mark).toHaveCount(1);
      await app.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
      await expect
        .poll(async () => {
          const m = (await mark.boundingBox())!;
          const t = (await tab(app, name).boundingBox())!;
          return Math.abs(m.x + m.width / 2 - (t.x + t.width / 2));
        })
        .toBeLessThan(1);
    };

    await under('Train');
    const glide = gliding();
    await tab(app, 'Progress').click();
    await glide;
    await under('Progress');

    await app.emulateMedia({ reducedMotion: 'reduce' });
    const jump = gliding();
    await tab(app, 'Home').click();
    await expect(jump).rejects.toThrow();
    await under('Home');
  });

  test('the title crossfades, with motion or without', async ({ onboardedApp: app }) => {
    /** The animations run on the title's two pictures while `act` moves. */
    const title = async (act: () => Promise<unknown>) => {
      await app.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
      await app.evaluate(() => {
        const w = window as unknown as { seen: string[]; until: number };
        w.seen = [];
        w.until = performance.now() + 1000;
        const tick = () => {
          for (const a of document.getAnimations()) {
            const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
            if (pseudo.endsWith('(app-title)') && 'animationName' in a) {
              w.seen.push(`${pseudo.split('(')[0]} ${(a as CSSAnimation).animationName}`);
            }
          }
          if (performance.now() < w.until) requestAnimationFrame(tick);
        };
        tick();
      });
      await act();
      await app.waitForFunction(
        () => performance.now() > (window as unknown as { until: number }).until,
      );
      return app.evaluate(() => [...new Set((window as unknown as { seen: string[] }).seen)]);
    };

    const both = ['::view-transition-old fade', '::view-transition-new fade'];
    expect((await title(() => tab(app, 'Week').click())).sort()).toEqual(both.sort());

    await app.emulateMedia({ reducedMotion: 'reduce' });
    expect((await title(() => tab(app, 'Train').click())).sort()).toEqual(both.sort());
  });

  test('a tab sinks under the thumb', async ({ onboardedApp: app }) => {
    const timing = await tab(app, 'Week').evaluate((el) => {
      const s = getComputedStyle(el);
      return { props: s.transitionProperty.split(', '), duration: s.transitionDuration };
    });
    expect(timing.props).toContain('scale');
    expect(timing.duration.split(', ')[0]).toBe('0.1s');
  });
});

/**
 * One finger, driven a step at a time through Chrome's touch pipeline, so a
 * test can look at the page between moves. `touches` > 1 puts a second finger
 * down beside the first.
 *
 * Every event carries its own time, a frame (16 ms) after the one before
 * unless `hold` says otherwise. The app reads the finger's speed from those
 * times, and the real gaps between CDP calls grow under a loaded machine — a
 * flick sent in 30 ms on a quiet one arrived over 150 ms on a busy one and read
 * as a slow drag.
 */
async function finger(page: Page, touches = 1) {
  const cdp = await page.context().newCDPSession(page);
  let at: [number, number] = [0, 0];
  let clock = Date.now() / 1000;
  const tick = (ms: number) => (clock += ms / 1000);
  const points = ([x, y]: [number, number]) =>
    Array.from({ length: touches }, (_, i) => ({ x, y: y + i * 60, id: i }));
  return {
    async down(x: number, y: number) {
      at = [x, y];
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: points(at),
        timestamp: clock,
      });
    },
    async move(x: number, y: number, steps = 4) {
      const [x0, y0] = at;
      for (let i = 1; i <= steps; i++) {
        const p: [number, number] = [x0 + ((x - x0) * i) / steps, y0 + ((y - y0) * i) / steps];
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: points(p),
          timestamp: tick(16),
        });
      }
      at = [x, y];
    },
    /** Keeps the finger still for `ms` before whatever comes next. */
    hold(ms: number) {
      tick(ms);
    },
    async up() {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
        timestamp: tick(8),
      });
      await cdp.detach();
    },
  };
}

/** How far the page sits from where it belongs, and whether it is being told
 *  a transform is coming. */
function pageState(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-page]')!;
    const t = getComputedStyle(el).transform;
    return {
      x: t === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(t).m41),
      willChange: el.style.willChange,
    };
  });
}

test.describe('The page follows the finger', () => {
  /* The owner's decision: the page moves with the finger from the moment the
     drag is plainly sideways, resists past the last tab, and on letting go
     either finishes the move from where it is or springs back. */

  test('moves with the drag, and springs back from a short one', async ({ onboardedApp: app }) => {
    const f = await finger(app);
    await f.down(300, 300);
    await f.move(284, 301, 1); // 16 px: sideways now, and the page starts here
    await f.move(204, 302);
    expect(await pageState(app)).toEqual({ x: -80, willChange: 'transform' });

    // Back most of the way, held still, and let go: not far enough, not a flick.
    await f.move(264, 302);
    expect((await pageState(app)).x).toBe(-20);
    f.hold(200);
    await f.up();

    await expect.poll(() => pageState(app)).toEqual({ x: 0, willChange: '' });
    await expect(app).toHaveURL(/\/train$/);
  });

  test('resists past the first tab rather than going nowhere', async ({ onboardedApp: app }) => {
    await tab(app, 'Home').click();
    await app.waitForURL('**/home');
    await app.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));

    const f = await finger(app);
    await f.down(100, 300);
    await f.move(116, 300, 1);
    await f.move(316, 300); // 200 px towards a tab that is not there
    const { x } = await pageState(app);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(100);
    await f.up();

    await expect.poll(() => pageState(app)).toEqual({ x: 0, willChange: '' });
    await expect(app).toHaveURL(/\/home$/);
  });

  test('a drag past a third of the screen finishes the move from where the page is', async ({
    onboardedApp: app,
  }) => {
    const swiping = app.waitForFunction(
      () => document.documentElement.matches(':active-view-transition-type(swipe)'),
      null,
      { polling: 'raf', timeout: 3000 },
    );
    const f = await finger(app);
    await f.down(330, 300);
    await f.move(314, 300, 1);
    await f.move(164, 302); // 150 px of 412, held, then let go slowly
    const left = await app.evaluate(
      () => document.querySelector('[data-page]')!.getBoundingClientRect().left,
    );
    expect(left).toBeLessThan(-100);
    f.hold(200);

    /* Where the leaving page is when the transition takes its picture — which
       is where its exit starts. Back at zero would be the page snapping home
       before it slid away. */
    await app.evaluate(() => {
      const start = document.startViewTransition.bind(document);
      const w = window as unknown as { pictured: number | null };
      w.pictured = null;
      document.startViewTransition = ((arg: never) => {
        w.pictured ??= document.querySelector('[data-page]')!.getBoundingClientRect().left;
        return start(arg);
      }) as typeof document.startViewTransition;
    });
    await f.up();

    await swiping;
    const pictured = await app.evaluate(() => (window as unknown as { pictured: number }).pictured);
    expect(pictured).toBeCloseTo(left, 0);
    await app.waitForURL('**/week');
  });

  test('a quick flick moves however short it was', async ({ onboardedApp: app }) => {
    const f = await finger(app);
    await f.down(300, 300);
    await f.move(284, 300, 1);
    // 80 px of page — short of a third of the screen — and lifted at speed.
    await f.move(204, 300, 2);
    expect((await pageState(app)).x).toBe(-80);
    await f.up();
    await app.waitForURL('**/week');
  });

  test('a touch from the edge of the screen belongs to the phone', async ({
    onboardedApp: app,
  }) => {
    const f = await finger(app);
    await f.down(10, 300);
    await f.move(250, 300);
    expect(await pageState(app)).toEqual({ x: 0, willChange: '' });
    await f.up();
    await expect(app.waitForURL('**/home', { timeout: 1500 })).rejects.toThrow();
  });

  test('two fingers are not a swipe', async ({ onboardedApp: app }) => {
    const f = await finger(app, 2);
    await f.down(300, 300);
    await f.move(60, 300);
    expect((await pageState(app)).x).toBe(0);
    await f.up();
    await expect(app.waitForURL('**/week', { timeout: 1500 })).rejects.toThrow();
  });

  test('with motion turned off the page stays still, and the swipe still counts', async ({
    onboardedApp: app,
  }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    const f = await finger(app);
    await f.down(330, 300);
    await f.move(314, 300, 1);
    await f.move(164, 300);
    expect(await pageState(app)).toEqual({ x: 0, willChange: '' });
    f.hold(200);
    await f.up();
    await app.waitForURL('**/week');
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
