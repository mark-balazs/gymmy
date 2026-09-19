import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';

/**
 * The ⓘ that replaces explanations written out on the screen.
 *
 * Exercised on Settings → The app, which has two: how sets are entered, and
 * Load the bar. Every other screen uses the same component, so what holds here
 * holds there; a screen that puts one inside a sheet should add the Escape
 * check below for its sheet (the tip must close and the sheet stay).
 */

const ENTRY = 'More on Logging sets';
const PLATES = 'More on Load the bar on barbell lifts';

const info = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const tip = (page: Page, name: string) => page.getByRole('note', { name, exact: true });

async function onSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(info(page, ENTRY)).toBeVisible();
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

test.describe('An ⓘ', () => {
  test('is described by its text before it is opened', async ({ onboardedApp: app }) => {
    await onSettings(app);
    // A screen reader hears the explanation on the ⓘ itself, without opening it.
    await expect(info(app, ENTRY)).toHaveAccessibleDescription(/tap any number/i);
    await expect(info(app, ENTRY)).toHaveAttribute('aria-expanded', 'false');
    await expect(tip(app, ENTRY)).toBeHidden();
    // And the text no longer sits on the screen as a paragraph.
    await expect(app.getByText(/How you set weight and reps/)).toBeHidden();
  });

  test('a tap opens it where it can be read, a second tap closes it', async ({
    onboardedApp: app,
  }) => {
    await onSettings(app);
    const button = info(app, ENTRY);
    await button.tap();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const note = tip(app, ENTRY);
    await expect(note).toBeVisible();
    await expect(note).toContainText('How you set weight and reps on Train.');

    // On the screen, clear of both sides, and not shrunk or faded once it has landed.
    const width = app.viewportSize()!.width;
    const b = await box(note);
    expect(b.x).toBeGreaterThanOrEqual(15.5);
    expect(b.x + b.width).toBeLessThanOrEqual(width - 15.5);
    await expect
      .poll(() =>
        note.evaluate((el) => {
          const s = getComputedStyle(el);
          // Once the pop has finished, whether it reports its end scale or none.
          return `${s.opacity} ${s.scale === 'none' ? '1' : s.scale} ${s.fontSize}`;
        }),
      )
      .toBe('1 1 13px');
    // Anchored: it opens just under the ⓘ that opened it.
    const anchor = await box(button);
    expect(b.y).toBeGreaterThan(anchor.y + anchor.height);
    expect(b.y).toBeLessThan(anchor.y + anchor.height + 20);

    await button.tap();
    await expect(note).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('a tap anywhere else closes it, and so does Escape', async ({ onboardedApp: app }) => {
    await onSettings(app);
    await info(app, ENTRY).tap();
    await expect(tip(app, ENTRY)).toBeVisible();
    await app.getByRole('heading', { name: 'The app' }).tap();
    await expect(tip(app, ENTRY)).toBeHidden();

    await info(app, ENTRY).tap();
    await expect(tip(app, ENTRY)).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(tip(app, ENTRY)).toBeHidden();
    await expect(app).toHaveURL(/\/settings$/);
  });

  test('only one is open at a time', async ({ onboardedApp: app }) => {
    await onSettings(app);
    await info(app, ENTRY).tap();
    await expect(tip(app, ENTRY)).toBeVisible();
    await info(app, PLATES).tap();
    await expect(tip(app, PLATES)).toBeVisible();
    await expect(tip(app, ENTRY)).toBeHidden();
    await expect(info(app, ENTRY)).toHaveAttribute('aria-expanded', 'false');
  });

  test('opening one moves nothing on the page', async ({ onboardedApp: app }) => {
    await onSettings(app);
    const below = app.getByRole('button', { name: 'Ruler', exact: true });
    // In view first: the tap would otherwise scroll the page — a move, but not the tip's.
    await info(app, ENTRY).scrollIntoViewIfNeeded();
    const before = await box(below);
    await info(app, ENTRY).tap();
    await expect(tip(app, ENTRY)).toBeVisible();
    expect(await box(below)).toEqual(before);
  });

  test('tapping the ⓘ beside a switch does not flip the switch', async ({ onboardedApp: app }) => {
    await onSettings(app);
    const toggle = app.getByRole('switch', { name: 'Load the bar on barbell lifts' });
    await expect(toggle).toBeChecked();
    await info(app, PLATES).tap();
    await expect(tip(app, PLATES)).toContainText('Tap the plates');
    /* Watched for long enough that a flip would have landed: the setting is
       written to the device first and the switch reads it back, so a check
       made at once passes whether or not the tap reached the switch. */
    await expect(expect(toggle).not.toBeChecked({ timeout: 1500 })).rejects.toThrow();
  });
});
