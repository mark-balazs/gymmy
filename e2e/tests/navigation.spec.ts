import type { Page } from '@playwright/test';
import { expect, logSet, signInAs, test } from '../fixtures/test';

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

    /* `:active-view-transition` matches the document only while one is running,
     * so this is the browser confirming a transition started rather than a
     * check that we called something. Armed before the swipe, because a 320ms
     * animation is easy to miss if you go looking for it afterwards. */
    const running = app.waitForFunction(
      () => document.documentElement.matches(':active-view-transition'),
      null,
      { timeout: 3000 },
    );
    await swipe(app, [300, 300], [60, 310]);
    await running;
    await app.waitForURL('**/week');
  });

  test('still navigates with motion turned off', async ({ onboardedApp: app }) => {
    // A slide across the viewport is the most common trigger for motion
    // sensitivity. Removing the animation must not remove the navigation.
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/train');
    await swipe(app, [300, 300], [60, 310]);
    await app.waitForURL('**/week');
    await expect(app.getByRole('list', { name: 'Movement coverage' })).toBeVisible();
  });

  test('a scroll that wandered sideways is not a swipe', async ({ onboardedApp: app }) => {
    await app.goto('/train');
    // Mostly vertical: this is someone scrolling, and taking it as a swipe
    // would make the app feel like it changes tab at random.
    await swipe(app, [200, 500], [140, 180]);
    await expect(app).toHaveURL(/\/train/);
  });

  test('does not leave a screen holding an unsaved draft', async ({ onboardedApp: app }) => {
    // The split editor is the one place with work in progress that a stray
    // thumb could throw away, so swiping is off anywhere that is not a tab.
    await app.goto('/settings/split');
    await expect(app.getByRole('heading', { name: 'Your own split' })).toBeVisible();

    await swipe(app, [300, 300], [60, 310]);
    await expect(app).toHaveURL(/\/settings\/split/);
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
    await logSet(page, 0, 60, 8);
    await expect(page.getByText('60 kg × 8').first()).toBeVisible();

    await page.goto('/progress');
    const chart = page.locator('svg[data-no-swipe]').first();
    await expect(chart).toBeVisible();

    const box = (await chart.boundingBox())!;
    await swipe(
      page,
      [box.x + box.width - 8, box.y + box.height / 2],
      [box.x + 8, box.y + box.height / 2],
    );
    await expect(page).toHaveURL(/\/progress/);
  });
});
