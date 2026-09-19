import type { Locator, Page } from '@playwright/test';
import { expect, numberButton, test } from '../fixtures/test';

/**
 * Sheets leave the way they came, and a finger can pull one away (GYM-17).
 *
 * Touches go through Chrome's own input pipeline (CDP), as the tab swipes in
 * `navigation.spec.ts` do: an event built in the page would only prove the
 * listener hears what the test dispatched, not that a thumb reaches it. The
 * speed of a drag is set by pausing: a pause longer than the 100 ms the
 * release speed is read over leaves the finger with no speed, so only the
 * distance decides.
 *
 * The drags use the "Log something else" sheet: it holds the whole library,
 * so it is always as tall as a sheet gets and always scrolls.
 */

/** One finger (or two) on the screen, moved by hand. */
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y]) => ({ x, y })),
    });
  return {
    down: (...points: [number, number][]) => send('touchStart', points),
    move: (...points: [number, number][]) => send('touchMove', points),
    up: async () => {
      await send('touchEnd', []);
      await cdp.detach();
    },
  };
}

/** The open sheet's panel — the part that moves. */
const panelOf = (page: Page): Locator =>
  page.locator('[data-sheet][data-state="open"] .animate-sheet');

/** How far down the panel is, from the transform the drag writes. */
const offsetOf = (panel: Locator): Promise<number> =>
  panel.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === 'none' ? 0 : new DOMMatrixReadOnly(t).m42;
  });

/** Waits for an overlay's entrance to finish, so what a test sees next is
 *  its own doing and not the arrival. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const box = document.querySelector('[data-sheet], [data-keypad]');
    return !!box && box.getAnimations({ subtree: true }).every((a) => a.playState !== 'running');
  });
}

/** Opens "Log something else" and returns what opened it, and where its handle is. */
async function openPicker(page: Page) {
  const opener = page.getByRole('button', { name: '+ Log something else' });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Log something else' })).toBeVisible();
  await settled(page);
  const box = (await panelOf(page).boundingBox())!;
  return { opener, x: box.x + box.width / 2, y: box.y + 10, height: box.height };
}

/**
 * Presses a button inside an overlay and reports what is on screen a frame
 * later — inside the page, because the whole exit is 220 ms and a round trip
 * from the test could miss it.
 */
async function pressAndLook(page: Page, overlay: string, button: string) {
  return page.evaluate(
    async ({ overlay, button }) => {
      const box = document.querySelector(overlay)!;
      const target = Array.from(box.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label') === button || b.textContent?.trim() === button,
      )!;
      target.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const still = document.querySelector(overlay);
      return {
        inPage: !!still,
        state: still?.getAttribute('data-state') ?? null,
        inert: still?.hasAttribute('inert') ?? false,
        moving:
          still?.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length ??
          0,
      };
    },
    { overlay, button },
  );
}

test.describe('A sheet', () => {
  test('plays its exit before it goes, and gives focus back to what opened it', async ({
    onboardedApp: app,
  }) => {
    // The exercise sheet, opened from inside a card on Train.
    const about = app.getByRole('button', { name: /^About / }).first();
    await about.click();
    await expect(app.getByRole('dialog')).toBeVisible();
    await settled(app);
    // Focus went into it as it opened.
    await expect(app.getByRole('dialog')).toBeFocused();

    /* Still in the page a frame after Close — on its way out, taking no taps,
       hidden from assistive technology — and moving. It used to be gone in
       that frame, with nothing played. */
    expect(await pressAndLook(app, '[data-sheet]', 'Close')).toEqual({
      inPage: true,
      state: 'closed',
      inert: true,
      moving: 2, // the panel, and the dimmed page behind it
    });
    // Not "the dialog" any more, for a screen reader or a test.
    await expect(app.getByRole('dialog')).toHaveCount(0);
    // Then gone, and focus back on the name that opened it.
    await expect(app.locator('[data-sheet]')).toHaveCount(0);
    await expect(about).toBeFocused();
  });

  test('dragged down, it follows the finger; far enough, it goes', async ({
    onboardedApp: app,
  }) => {
    const { opener, x, y, height } = await openPicker(app);
    const panel = panelOf(app);

    const finger = await touch(app);
    await finger.down([x, y]);
    await finger.move([x, y + 4]); // the sheet's gesture now, but still a tap
    expect(await offsetOf(panel)).toBe(0);
    await finger.move([x, y + 24]); // past the slop: it moves from here
    await finger.move([x, y + 124]);
    // Follows the finger: a hundred pixels on, a hundred pixels down.
    expect(await offsetOf(panel)).toBeCloseTo(100, 0);

    // Past a quarter of its height, then held still before letting go, so it
    // is the distance that decides and not the speed.
    await finger.move([x, y + 24 + height * 0.4]);
    await app.waitForTimeout(200);
    await finger.up();

    await expect(app.getByRole('dialog')).toHaveCount(0);
    await expect(app.locator('[data-sheet]')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('a short, slow drag springs back', async ({ onboardedApp: app }) => {
    const { x, y, height } = await openPicker(app);
    const panel = panelOf(app);
    // Forty pixels is well under a quarter of it.
    expect(height * 0.25).toBeGreaterThan(80);

    const finger = await touch(app);
    await finger.down([x, y]);
    await finger.move([x, y + 4]);
    await finger.move([x, y + 24]);
    await finger.move([x, y + 64]);
    expect(await offsetOf(panel)).toBeCloseTo(40, 0);
    await app.waitForTimeout(200);
    await finger.up();

    // Still open, and back where it rests.
    await expect(app.getByRole('dialog')).toBeVisible();
    await expect.poll(() => offsetOf(panel)).toBe(0);
  });

  test('a flick closes it, however short', async ({ onboardedApp: app }) => {
    const { x, y, height } = await openPicker(app);
    // A hundred pixels: not far enough to close it on distance.
    expect(height * 0.25).toBeGreaterThan(100);

    // Let go straight after moving, so the finger still has its speed.
    const finger = await touch(app);
    await finger.down([x, y]);
    await finger.move([x, y + 4]);
    await finger.move([x, y + 24]);
    await finger.move([x, y + 124]);
    await finger.up();

    await expect(app.getByRole('dialog')).toHaveCount(0);
  });

  test('pulled up, it gives a little and comes back', async ({ onboardedApp: app }) => {
    const { x, y } = await openPicker(app);
    const panel = panelOf(app);

    const finger = await touch(app);
    await finger.down([x, y]);
    await finger.move([x, y - 4]);
    await finger.move([x, y - 24]);
    await finger.move([x, y - 124]);
    // It resists: some of the hundred pixels, not all of them.
    const up = await offsetOf(panel);
    expect(up).toBeLessThan(0);
    expect(up).toBeGreaterThan(-100);
    await finger.up();

    await expect(app.getByRole('dialog')).toBeVisible();
    await expect.poll(() => offsetOf(panel)).toBe(0);
  });

  test('two fingers do not drag it', async ({ onboardedApp: app }) => {
    const { x, y } = await openPicker(app);
    const panel = panelOf(app);

    const fingers = await touch(app);
    await fingers.down([x - 60, y], [x + 60, y]);
    await fingers.move([x - 60, y + 40], [x + 60, y + 40]);
    await fingers.move([x - 60, y + 300], [x + 60, y + 300]);
    expect(await offsetOf(panel)).toBe(0);
    await fingers.up();

    await expect(app.getByRole('dialog')).toBeVisible();
  });

  test('scrolled down, a drag scrolls it back up instead of closing it', async ({
    onboardedApp: app,
  }) => {
    await openPicker(app);
    const scroller = app.locator('[data-sheet] .overflow-auto');
    await scroller.evaluate((el) => el.scrollTo({ top: 400 }));
    // Past the guard that takes a scroll this recent for one still going.
    await app.waitForTimeout(250);
    const box = (await scroller.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 60;

    // Fast and far: taken by the sheet, this would close it on either rule.
    const finger = await touch(app);
    await finger.down([x, y]);
    for (let i = 1; i <= 8; i++) await finger.move([x, y + i * 30]);
    await finger.up();

    await expect(app.getByRole('dialog')).toBeVisible();
    expect(await offsetOf(panelOf(app))).toBe(0);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeLessThan(400);
  });

  test('a sideways swipe on it does not change the tab behind it', async ({
    onboardedApp: app,
  }) => {
    const { x, y } = await openPicker(app);
    const across = y + 200;

    const finger = await touch(app);
    await finger.down([x + 150, across]);
    for (let i = 1; i <= 6; i++) await finger.move([x + 150 - i * 50, across + 4]);
    await finger.up();

    // Watched long enough for a tab change to have landed.
    await expect(app.waitForURL('**/week', { timeout: 1500 })).rejects.toThrow();
    await expect(app.getByRole('dialog')).toBeVisible();
  });

  test('under reduced motion it leaves by fading where it stands', async ({
    onboardedApp: app,
  }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    const { x, y, height } = await openPicker(app);

    // Dragged well down and let go: with motion it would carry on off the
    // screen. Here it fades out at the height it was let go at.
    const finger = await touch(app);
    await finger.down([x, y]);
    await finger.move([x, y + 4]);
    await finger.move([x, y + 24]);
    await finger.move([x, y + 24 + height * 0.4]);
    await app.waitForTimeout(200);
    const watching = app.evaluate(
      () =>
        new Promise<Keyframe[]>((resolve) => {
          const look = () => {
            const leaving = document.querySelector(
              '[data-sheet][data-state="closed"] .animate-sheet',
            );
            // The exit is a script animation; the entrance is a CSS one.
            const run = leaving
              ?.getAnimations()
              .find((a) => a.playState === 'running' && !('animationName' in a));
            if (run) resolve((run.effect as KeyframeEffect).getKeyframes());
            else requestAnimationFrame(look);
          };
          look();
        }),
    );
    await finger.up();
    const frames = await watching;
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    expect(Number(last.opacity)).toBe(0);
    expect(last.transform).toBe(first.transform);

    await expect(app.locator('[data-sheet]')).toHaveCount(0);
  });
});

test.describe('The keypad', () => {
  test('leaves the same way, and gives focus back to its number', async ({ onboardedApp: app }) => {
    await numberButton(app, 'weight').click();
    await expect(app.getByRole('dialog', { name: 'Weight' })).toBeVisible();
    await settled(app);

    expect(await pressAndLook(app, '[data-keypad]', 'Cancel')).toEqual({
      inPage: true,
      state: 'closed',
      inert: true,
      moving: 2,
    });
    await expect(app.getByRole('dialog', { name: 'Weight' })).toHaveCount(0);
    await expect(app.locator('[data-keypad]')).toHaveCount(0);
    await expect(numberButton(app, 'weight')).toBeFocused();
  });

  test('opened again while the last one leaves, it starts from nothing typed', async ({
    onboardedApp: app,
  }) => {
    await numberButton(app, 'reps').click();
    const pad = app.getByRole('dialog', { name: 'Reps' });
    await pad.getByRole('button', { name: '9', exact: true }).click();
    await expect(pad.locator('output')).toHaveText('9');

    /* Cancel, and a frame later the number again — well inside the exit, so
       the new keypad opens while the old one is still on screen. What was
       typed into that one must not turn up in this one. */
    const shown = await app.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      const old = document.querySelector('[data-keypad]')!;
      Array.from(old.querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === 'Cancel')!
        .click();
      await frame();
      (document.querySelector('button[aria-label="Type reps"]') as HTMLButtonElement).click();
      await frame();
      const pads = Array.from(document.querySelectorAll('[data-keypad]'));
      return {
        pads: pads.map((p) => p.getAttribute('data-state')),
        typed: document.querySelector('[data-keypad][data-state="open"] output span')?.textContent,
        faded: !!document.querySelector('[data-keypad][data-state="open"] output .opacity-35'),
      };
    });
    // The fresh one is showing the number as it stands, faded, not a 9.
    expect(shown.pads).toContain('open');
    expect(shown.faded).toBe(true);
    expect(shown.typed).not.toBe('9');
  });
});
