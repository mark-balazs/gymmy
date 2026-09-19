import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';

/**
 * The motion system, as the browser applies it.
 *
 * `motion.test.ts` holds what is written in the stylesheet; this holds what a
 * browser makes of it, which is where both of the bugs these guard against
 * lived: a press that listed the wrong property and so snapped, and reduced
 * motion that removed the fades along with the movement.
 */

/** How an opening sheet's panel looks on its first frame. */
async function sheetFirstFrame(page: Page) {
  await page
    .getByRole('button', { name: /^About / })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const frame = await dialog.locator('.animate-sheet').evaluate((el) => {
    const run = el.getAnimations()[0] as CSSAnimation | undefined;
    if (!run) return null;
    run.pause();
    run.currentTime = 0;
    const s = getComputedStyle(el);
    return { name: run.animationName, opacity: s.opacity, translate: s.translate };
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return frame;
}

/** The names of the animations the view transition ran while `act` navigated. */
async function transitionAnimations(page: Page, act: () => Promise<void>): Promise<string[]> {
  await page.evaluate(() => {
    const w = window as unknown as { seen: string[]; watching: boolean };
    w.seen = [];
    w.watching = true;
    const until = performance.now() + 1200;
    const tick = () => {
      for (const a of document.getAnimations()) {
        const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
        if (pseudo.startsWith('::view-transition') && 'animationName' in a) {
          w.seen.push((a as CSSAnimation).animationName);
        }
      }
      if (performance.now() < until) requestAnimationFrame(tick);
      else w.watching = false;
    };
    tick();
  });
  await act();
  await page.waitForFunction(() => !(window as unknown as { watching: boolean }).watching);
  return page.evaluate(() => [...new Set((window as unknown as { seen: string[] }).seen)]);
}

test.describe('One motion system', () => {
  test('a press eases in rather than snapping', async ({ onboardedApp: app }) => {
    /* Tailwind's `active:scale-*` sets the `scale` property. The buttons listed
       `transform` as the one to transition, so every press jumped. */
    const log = app.getByRole('button', { name: /^Log set/ });
    await expect(log).toBeVisible();
    const timing = await log.evaluate((el) => {
      const s = getComputedStyle(el);
      return { props: s.transitionProperty.split(', '), duration: s.transitionDuration };
    });
    expect(timing.props).toContain('scale');
    expect(timing.duration.split(', ')[0]).toBe('0.1s');
  });

  test('reduced motion keeps the fade and takes the movement away', async ({
    onboardedApp: app,
  }) => {
    // With motion: the sheet rises as it fades in.
    expect(await sheetFirstFrame(app)).toEqual({
      name: 'sheet-up',
      opacity: '0',
      translate: '0px 24px',
    });

    /* Asked for less motion: the same fade, from where it will stand. It used
       to be no animation at all, which reads as a flash rather than calm. */
    await app.emulateMedia({ reducedMotion: 'reduce' });
    const still = await sheetFirstFrame(app);
    expect(still?.name).toBe('sheet-up');
    expect(still?.opacity).toBe('0');
    expect(still?.translate).not.toContain('24px');
  });

  test('a tab change slides, and under reduced motion only crossfades', async ({
    onboardedApp: app,
  }) => {
    const tab = (name: string) =>
      app.getByRole('navigation').getByRole('link', { name, exact: true });

    const moving = await transitionAnimations(app, async () => {
      await tab('Week').click();
      await app.waitForURL('**/week');
    });
    expect(moving).toContain('slide');
    expect(moving).toContain('fade');

    await app.emulateMedia({ reducedMotion: 'reduce' });
    const calm = await transitionAnimations(app, async () => {
      await tab('Train').click();
      await app.waitForURL('**/train');
    });
    expect(calm).toContain('fade');
    expect(calm).not.toContain('slide');
  });
});
