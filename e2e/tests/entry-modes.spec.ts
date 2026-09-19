/** Flow 11 — see ../flows/11-entering-a-set.md */

import {
  cardNumber,
  collapsedExercises,
  expect,
  finishOpenExercise,
  numberButton,
  openCard,
  openExercise,
  recordedSet,
  signInAs,
  test,
  typeNumber,
} from '../fixtures/test';
import type { Page } from '@playwright/test';

/**
 * Setting a weight and a rep count without the phone's keyboard.
 *
 * The Train card used to take both numbers in number inputs, and a number input
 * on a phone is the system keyboard: half the screen, the browser scrolling the
 * focused box above it, and the card jumping out from under the thumb — between
 * sets, with a phone that keeps being put down. So the card now sets numbers
 * with its own controls, in one of three styles chosen in Settings, and a tap
 * on any number opens gymmy's own keypad.
 *
 * Day A of a fresh account opens on Goblet Squat — one dumbbell, 1 kg ruler
 * stops from 1 to 80, 2 kg per tap — with Barbell Bench Press further down. The
 * tests that depend on either say so and check it, so a change to the generator
 * fails here with its reason rather than as a wrong number.
 */

const GOBLET = 'Goblet Squat';
const BENCH = 'Barbell Bench Press';

/** Opens the first card and checks it is the one these numbers are about. */
async function onGoblet(page: Page): Promise<void> {
  expect(await openExercise(page), 'Day A no longer opens on a single dumbbell').toBe(GOBLET);
}

/**
 * Changes the two settings in Settings → The app, waits until each has taken,
 * and goes back to Train.
 *
 * Waits on the controls' own state rather than on the tap: the setting is
 * written to the device first and the controls read it back from there, so a
 * pressed segment is a setting that has actually been stored.
 */
async function chooseEntry(
  page: Page,
  opts: { mode?: 'Buttons' | 'Ruler'; plates?: boolean },
): Promise<void> {
  await page.goto('/settings');
  if (opts.mode) {
    const segment = page.getByRole('button', { name: opts.mode, exact: true });
    await segment.click();
    await expect(segment).toHaveAttribute('aria-pressed', 'true');
  }
  if (opts.plates !== undefined) {
    const toggle = plateSwitch(page);
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-checked')) !== String(opts.plates)) await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(opts.plates));
  }
  await page.goto('/train');
  await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
}

const plateSwitch = (page: Page) =>
  page.getByRole('switch', { name: 'Load the bar on barbell lifts' });

const ruler = (page: Page, name: 'Weight' | 'Reps') =>
  page.getByRole('spinbutton', { name, exact: true });

/**
 * No field on the open card that would summon the phone's keyboard.
 *
 * The date picker is the one input Train keeps: it opens the system date
 * picker, not a keyboard, and it sits above the cards rather than on one.
 */
async function expectNoKeyboardFields(page: Page): Promise<void> {
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
  await expect(page.locator('main input:not([type="date"]), main textarea')).toHaveCount(0);
}

/** Wider than the screen shifts every coordinate, so taps land on whatever slid under them. */
async function expectNoSideScroll(page: Page): Promise<void> {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

test.describe('Buttons, the default', () => {
  test('− and + move the number a step, and nothing on the card is a text field', async ({
    onboardedApp: app,
  }) => {
    await onGoblet(app);
    await expectNoKeyboardFields(app);

    // One set of controls, on the one open card.
    for (const name of ['weight −', 'weight +', 'reps −', 'reps +']) {
      await expect(app.getByRole('button', { name, exact: true })).toHaveCount(1);
    }

    const weight = Number(await cardNumber(app, 'weight'));
    const reps = Number(await cardNumber(app, 'reps'));

    // A dumbbell moves 2 kg a tap — the next pair along a kilo rack.
    await app.getByRole('button', { name: 'weight +', exact: true }).click();
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', String(weight + 2));
    await app.getByRole('button', { name: 'weight −', exact: true }).click();
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', String(weight));

    await app.getByRole('button', { name: 'reps +', exact: true }).click();
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', String(reps + 1));
    await app.getByRole('button', { name: 'reps −', exact: true }).click();
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', String(reps));
  });
});

test.describe('The keypad', () => {
  test('Done applies what was typed; Cancel, Escape and an empty Done change nothing', async ({
    onboardedApp: app,
  }) => {
    await onGoblet(app);

    await numberButton(app, 'weight').click();
    const pad = app.getByRole('dialog', { name: 'Weight' });
    await expect(pad).toBeVisible();

    /* Over the whole page, not inside the card: a finished card is faded, and a
       faded or transformed parent turns "cover the screen" into "cover the
       card". And focus goes into it, on the one key that means the same thing
       whatever was typed. */
    await expect(app.locator('main').getByRole('dialog')).toHaveCount(0);
    await expect(pad.getByRole('button', { name: 'Done', exact: true })).toBeFocused();

    // A hardware keyboard's digits work too — the comma is the point on most
    // of Europe's keyboards.
    await app.keyboard.type('62,5');
    await expect(pad.locator('output')).toHaveText(/^62\.5\s*kg$/);
    await pad.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(pad).toHaveCount(0);
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '62.5');
    // And focus comes back to where it was, not to the top of the page.
    await expect(numberButton(app, 'weight')).toBeFocused();

    // Reps are whole: the point is there, and cannot be pressed.
    await numberButton(app, 'reps').click();
    const reps = app.getByRole('dialog', { name: 'Reps' });
    await expect(reps.getByRole('button', { name: '.', exact: true })).toBeDisabled();
    await reps.getByRole('button', { name: '1', exact: true }).click();
    await reps.getByRole('button', { name: '2', exact: true }).click();
    await reps.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(reps).toHaveCount(0);
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', '12');

    // Cancel throws the typing away.
    await numberButton(app, 'reps').click();
    await reps.getByRole('button', { name: '9', exact: true }).click();
    await expect(reps.locator('output')).toHaveText('9');
    await reps.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(reps).toHaveCount(0);
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', '12');

    // So does Escape.
    await numberButton(app, 'reps').click();
    await reps.getByRole('button', { name: '7', exact: true }).click();
    await app.keyboard.press('Escape');
    await expect(reps).toHaveCount(0);
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', '12');

    // Done with nothing typed leaves the number exactly as it was — the faded
    // number on the keypad is where you are, not something entered.
    await numberButton(app, 'reps').click();
    await expect(reps.locator('output')).toHaveText('12');
    await reps.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(reps).toHaveCount(0);
    await expect(numberButton(app, 'reps')).toHaveAttribute('data-value', '12');

    // What the keypad set is what gets logged.
    await app.getByRole('button', { name: /^Log set 1$/ }).click();
    expect(await recordedSet(app, 12)).toBe('62.5 kg × 12');
  });
});

test.describe('The ruler', () => {
  test('is chosen in Settings, spans the equipment, and moves a step per arrow', async ({
    onboardedApp: app,
  }) => {
    await chooseEntry(app, { mode: 'Ruler' });
    await onGoblet(app);
    await expectNoKeyboardFields(app);

    // The rulers replace the buttons rather than joining them.
    await expect(app.getByRole('button', { name: 'weight +', exact: true })).toHaveCount(0);

    // A single dumbbell's ruler runs 1–80 kg; reps run 1–50 for everything.
    const weight = ruler(app, 'Weight');
    await expect(weight).toHaveAttribute('aria-valuemin', '1');
    await expect(weight).toHaveAttribute('aria-valuemax', '80');
    const reps = ruler(app, 'Reps');
    await expect(reps).toHaveAttribute('aria-valuemin', '1');
    await expect(reps).toHaveAttribute('aria-valuemax', '50');

    // The ruler is the number the card holds, not a second copy of it.
    const start = Number(await cardNumber(app, 'weight'));
    await expect(weight).toHaveAttribute('aria-valuenow', String(start));

    // One arrow, one stop — a kilo on this ruler.
    await weight.focus();
    await app.keyboard.press('ArrowRight');
    await expect(weight).toHaveAttribute('aria-valuenow', String(start + 1));
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', String(start + 1));
    await app.keyboard.press('ArrowLeft');
    await expect(weight).toHaveAttribute('aria-valuenow', String(start));

    const r = Number(await cardNumber(app, 'reps'));
    await reps.focus();
    await app.keyboard.press('ArrowRight');
    await expect(reps).toHaveAttribute('aria-valuenow', String(r + 1));

    // The number above each ruler still opens the keypad, for anything the
    // ruler would take a long flick to reach.
    await typeNumber(app, 'weight', 33);
    await expect(weight).toHaveAttribute('aria-valuenow', '33');
    await typeNumber(app, 'reps', 5);
    await expect(reps).toHaveAttribute('aria-valuenow', '5');

    await app.getByRole('button', { name: /^Log set 1$/ }).click();
    expect(await recordedSet(app, 5)).toBe('33 kg × 5');
  });
});

test.describe('Loading the bar', () => {
  test('a plate adds twice its weight, comes off with a tap, and the bar chip moves the total', async ({
    onboardedApp: app,
  }) => {
    // On by default, for barbell lifts only: the single dumbbell has buttons.
    await onGoblet(app);
    await expect(app.getByRole('button', { name: /^Add .* to each side$/ })).toHaveCount(0);

    await openCard(app, BENCH);
    await expectNoKeyboardFields(app);
    const total = numberButton(app, 'weight');

    // No history, so the empty bar.
    await expect(total).toHaveAttribute('data-value', '20');
    await expect(app.getByText('The empty bar')).toBeVisible();

    // A plate goes on each side, so the total moves by two of it.
    await app.getByRole('button', { name: 'Add 20 kg to each side' }).click();
    await expect(total).toHaveAttribute('data-value', '60');
    await expect(app.getByText('bar 20 + 2 × 20')).toBeVisible();

    // Tapping a plate on the bar takes it off again.
    await app.getByRole('button', { name: 'Remove a 20 kg plate' }).click();
    await expect(total).toHaveAttribute('data-value', '20');

    await app.getByRole('button', { name: 'Add 10 kg to each side' }).click();
    await app.getByRole('button', { name: 'Add 2.5 kg to each side' }).click();
    await expect(total).toHaveAttribute('data-value', '45');

    // A lighter bar under the same plates is a lighter total — what swapping
    // the bar does in the gym.
    await app.getByRole('button', { name: 'Bar 20 kg' }).click();
    await app
      .getByRole('group', { name: 'Bar weight' })
      .getByRole('button', { name: '15 kg', exact: true })
      .click();
    await expect(total).toHaveAttribute('data-value', '40');
    await expect(app.getByRole('button', { name: 'Bar 15 kg' })).toBeVisible();
    await expect(app.getByText('bar 15 + 2 × 12.5')).toBeVisible();

    // The reps keep the buttons.
    await expect(app.getByRole('button', { name: 'reps +', exact: true })).toHaveCount(1);

    // What is logged is the total.
    const reps = Number(await cardNumber(app, 'reps'));
    await app.getByRole('button', { name: /^Log set 1$/ }).click();
    expect(await recordedSet(app, reps)).toBe(`40 kg × ${reps}`);

    /* The bar is remembered for this lift on this device — it is a fact about
       somebody's gym, not training, so it is not synced — and the next set
       starts from the one just logged. */
    await app.reload();
    await expect(app.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
    await openCard(app, BENCH);
    await expect(app.getByRole('button', { name: 'Bar 15 kg' })).toBeVisible();
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '40');
  });

  test('a total plates cannot make is kept, and logged, exactly', async ({ onboardedApp: app }) => {
    await openCard(app, BENCH);
    const total = numberButton(app, 'weight');

    /* 61.25 on a 20 kg bar is 20 a side and 0.625 over, and the smallest plate
       is 1.25. The picture says so rather than rounding the number to fit it:
       the card must never change a number nobody touched. */
    await typeNumber(app, 'weight', 61.25);
    await expect(app.getByText('+0.63 kg a side not in plates')).toBeVisible();
    await expect(app.getByText('bar 20 + 2 × 20')).toBeVisible();

    // A plate from there moves it by exactly the plate, leftover and all.
    await app.getByRole('button', { name: 'Add 1.25 kg to each side' }).click();
    await expect(total).toHaveAttribute('data-value', '63.75');
    await app.getByRole('button', { name: 'Remove a 1.25 kg plate' }).click();
    await expect(total).toHaveAttribute('data-value', '61.25');

    const reps = Number(await cardNumber(app, 'reps'));
    await app.getByRole('button', { name: /^Log set 1$/ }).click();
    expect(await recordedSet(app, reps)).toBe(`61.25 kg × ${reps}`);

    // Below the bar reads as that, not as a negative number of plates.
    await typeNumber(app, 'weight', 15);
    await expect(app.getByText('Lighter than the bar')).toBeVisible();
    await expect(app.getByRole('button', { name: /^Remove a / })).toHaveCount(0);
  });

  test('switched off, a barbell gets the same buttons or ruler as everything else', async ({
    onboardedApp: app,
  }) => {
    await chooseEntry(app, { plates: false });
    await openCard(app, BENCH);
    await expect(app.getByRole('button', { name: /^Add .* to each side$/ })).toHaveCount(0);

    // Buttons, stepping a barbell's 2.5 kg from the empty bar.
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '20');
    await app.getByRole('button', { name: 'weight +', exact: true }).click();
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '22.5');

    // And the ruler, from the bar to 300 kg.
    await chooseEntry(app, { mode: 'Ruler' });
    await openCard(app, BENCH);
    await expect(app.getByRole('button', { name: /^Add .* to each side$/ })).toHaveCount(0);
    const weight = ruler(app, 'Weight');
    await expect(weight).toHaveAttribute('aria-valuemin', '20');
    await expect(weight).toHaveAttribute('aria-valuemax', '300');
    await expect(weight).toHaveAttribute('aria-valuenow', '20');
    await weight.focus();
    await app.keyboard.press('ArrowRight');
    await expect(weight).toHaveAttribute('aria-valuenow', '22.5');
  });
});

test.describe('The choice', () => {
  test('survives a reload, and follows the account to another device', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await chooseEntry(page, { mode: 'Ruler', plates: false });
    await expect(ruler(page, 'Weight')).toHaveCount(1);

    // Kept on this device…
    await page.reload();
    await expect(ruler(page, 'Weight')).toHaveCount(1);
    await expect(ruler(page, 'Reps')).toHaveCount(1);

    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Ruler', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(plateSwitch(page)).toHaveAttribute('aria-checked', 'false');
    // …and on the server, which is what a reload cannot show.
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    /* A genuinely separate browser, its IndexedDB empty: everything it knows
       about the setting came down from the server. Like the unit and the
       theme, it belongs to the person, not the phone. */
    const { sessionCookie } = await import('../fixtures/auth');
    const second = await browser.newContext({ baseURL });
    try {
      await second.addCookies([sessionCookie(user, baseURL!)]);
      const other = await second.newPage();
      await other.goto('/train');
      await expect(ruler(other, 'Weight')).toHaveCount(1, { timeout: 30_000 });
      await openCard(other, BENCH);
      await expect(ruler(other, 'Weight')).toHaveAttribute('aria-valuemin', '20');
      await expect(other.getByRole('button', { name: /^Add .* to each side$/ })).toHaveCount(0);
    } finally {
      await second.close();
    }
  });
});

/** The open card's log button is on screen and clear of the tab bar. */
async function logClearsTabBar(page: Page): Promise<boolean> {
  const log = await page.getByRole('button', { name: /^Log set 1$/ }).boundingBox();
  const nav = await page.getByRole('navigation').boundingBox();
  return !!log && !!nav && log.y >= 0 && log.y + log.height <= nav.y;
}

test.describe('Moving between exercises', () => {
  /** Waits for a smooth scroll to finish — the position stops changing. */
  async function scrollSettled(page: Page): Promise<number> {
    let last = Number.NaN;
    await expect
      .poll(
        async () => {
          const y = await page.evaluate(() => window.scrollY);
          const still = y === last;
          last = y;
          return still;
        },
        { intervals: [150] },
      )
      .toBe(true);
    return last;
  }

  test('finishing one opens the next and brings all of it into view', async ({
    onboardedApp: app,
  }) => {
    /* A small phone, where the next card opens with its log button below the
       tab bar. The page scrolls just enough to show the card, once it has
       finished opening. */
    await app.setViewportSize({ width: 360, height: 640 });
    const next = (await collapsedExercises(app))[0]!;

    await finishOpenExercise(app);
    await expect(app.getByRole('heading', { name: next, exact: true })).toBeVisible();
    /* Waited for by where the log button ends up, not by the page going still:
       the scroll starts only once the card has finished opening, so the page
       is still — at the top — for a moment first, and the first version of
       this test measured that moment. */
    await expect.poll(() => logClearsTabBar(app), { timeout: 5_000 }).toBe(true);
    await expect(app.getByRole('heading', { name: next, exact: true })).toBeInViewport();
    // Still one open card, one set of controls.
    await expect(numberButton(app, 'weight')).toHaveCount(1);
    await expectNoSideScroll(app);
  });

  test('a card opened by hand stays where it was tapped', async ({ onboardedApp: app }) => {
    /* Somebody who tapped a card is looking at it. Opening it closes the card
       above, and without help everything below slides up by that card's
       height — the card jumps away from the thumb, the screen jumping again.

       Measured on the card, not on window.scrollY: the page is *supposed* to
       scroll here, by exactly the height that closed. And Chrome's own scroll
       anchoring is switched off, because Safari has none — with it on, this
       would pass on Chrome's behaviour and prove nothing about an iPhone. The
       first version of this test compared scrollY and failed on Playwright's
       own scroll to the row before tapping it. */
    await app.setViewportSize({ width: 360, height: 640 });
    await app.addStyleTag({ content: '*{overflow-anchor:none!important}' });
    const rows = await collapsedExercises(app);
    const row = app.getByRole('button', { name: new RegExp(`^${rows[rows.length - 1]!}`) });
    await row.scrollIntoViewIfNeeded();
    await scrollSettled(app);
    /* The card itself, held as an element: the row sits inside the card's
       padding, and once tapped the row is gone — replaced by the open card's
       heading — while the card element stays the same one throughout. */
    const card = await row.evaluateHandle((el) => el.closest('[class*="rounded"]')!);
    const before = (await card.asElement()!.boundingBox())!.y;

    await row.click();
    await expect(
      app.getByRole('heading', { name: rows[rows.length - 1]!, exact: true }),
    ).toBeVisible();
    // Past the other card's closing, then watched until still.
    await app.waitForTimeout(500);
    await scrollSettled(app);
    expect(Math.abs((await card.asElement()!.boundingBox())!.y - before)).toBeLessThanOrEqual(2);
  });

  test('on a phone too short for the card, the next one still shows its log button', async ({
    onboardedApp: app,
  }) => {
    /* Shorter than any card with a ruler — landscape, or an old small phone.
       The card cannot fit, so it is brought in by its bottom: the controls and
       the log button are what the next set needs. */
    await app.setViewportSize({ width: 360, height: 480 });
    await finishOpenExercise(app);
    await expect.poll(() => logClearsTabBar(app), { timeout: 5_000 }).toBe(true);
  });
});

test.describe('Fits the phone', () => {
  test('no mode makes a 360 px screen scroll sideways', async ({ onboardedApp: app }) => {
    await app.setViewportSize({ width: 360, height: 740 });

    await expect(numberButton(app, 'weight')).toHaveCount(1);
    await expectNoSideScroll(app);

    await openCard(app, BENCH);
    await expect(app.getByRole('button', { name: 'Add 1.25 kg to each side' })).toBeVisible();
    // A loaded bar is the widest the picture gets.
    for (let i = 0; i < 6; i++) {
      await app.getByRole('button', { name: 'Add 25 kg to each side' }).click();
    }
    await expect(numberButton(app, 'weight')).toHaveAttribute('data-value', '320');
    await expectNoSideScroll(app);

    await chooseEntry(app, { mode: 'Ruler' });
    await expect(ruler(app, 'Weight')).toHaveCount(1);
    await expectNoSideScroll(app);
  });
});

test.describe('Bodyweight', () => {
  test('"None" is logged as no added weight', async ({ page, context, baseURL }) => {
    const user = await signInAs(page, context, baseURL!, { onboarded: true });

    // A push-up, picked outside the plan so it does not depend on the split.
    await page.getByRole('button', { name: '+ Log something else' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Search exercises').fill('Push-Up');
    await sheet.getByRole('button', { name: 'Push-Up', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Push-Up', exact: true })).toBeVisible();

    // Nothing added is what the card starts on, and what it says.
    await expect(numberButton(page, 'weight')).toHaveAttribute('data-value', '0');
    await expect(numberButton(page, 'weight')).toContainText('None');
    await expect(page.getByRole('button', { name: 'weight −', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: /^Log set 1$/ }).click();

    // Stored as no weight at all rather than as zero kilos, as it always was.
    const { serverSets } = await import('../fixtures/auth');
    await expect
      .poll(async () => (await serverSets(user.id)).map((s) => s.weight), { timeout: 30_000 })
      .toEqual([null]);
  });
});
