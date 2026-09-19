/** Flow 02 — see ../flows/02-logging-a-session.md, "What a set feels like" */

import type { Page } from '@playwright/test';
import {
  collapsedExercises,
  expect,
  finishDay,
  finishOpenExercise,
  openCard,
  openExercise,
  signInAs,
  test,
} from '../fixtures/test';

/**
 * What logging a set looks and feels like — the hot path, about twenty times a
 * session.
 *
 * How it feels is for a phone in a hand. What a browser can hold is the shape
 * of it, and every one of these was a way to get it wrong: the button dimming
 * for every save, the whole list of sets re-animating instead of the one just
 * logged, every filled dot popping again, a tick drawing itself on a day that
 * was finished yesterday, a buzz for a set that was never saved.
 *
 * Read off the browser's own list of running animations, sampled every frame
 * while the step happens: which property or animation, on what, for how long,
 * and which way it moved.
 */

interface Moved {
  /** A CSS transition, a CSS animation, or one started from script. */
  kind: 'transition' | 'animation' | 'script';
  /** The transition's property or the animation's name. */
  name: string;
  /** How long it runs. */
  ms: number;
  /** The first keyframe's transform — which way a rolling digit came from. */
  from: string;
  /** The element's own text. */
  text: string;
  /** The text of the `.num` it sits in, if any. */
  num: string;
  /** The name of the button it sits in, if any. */
  button: string;
  /** Its place among its siblings. */
  at: number;
}

/** Starts writing down every animation that begins inside the page. */
async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { moved: Moved[]; runs: number; live: number };
    w.moved = [];
    // Each recording has its own number, so the loop of the one before stops
    // even if its last frame comes after this one has started.
    const mine = (w.runs ?? 0) + 1;
    w.runs = mine;
    w.live = mine;
    // Whatever is already running, or holding its end state, is not news.
    const seen = new WeakSet<Animation>(document.getAnimations());
    const tick = () => {
      for (const a of document.getAnimations()) {
        if (seen.has(a)) continue;
        seen.add(a);
        const effect = a.effect as KeyframeEffect | null;
        const el = effect?.target ?? null;
        if (!el?.closest('main')) continue;
        const button = el.closest('button');
        w.moved.push({
          kind:
            a instanceof CSSTransition
              ? 'transition'
              : a instanceof CSSAnimation
                ? 'animation'
                : 'script',
          name:
            a instanceof CSSTransition
              ? a.transitionProperty
              : a instanceof CSSAnimation
                ? a.animationName
                : '',
          ms: Number(effect?.getComputedTiming().duration ?? 0),
          from: String(effect?.getKeyframes()[0]?.transform ?? ''),
          text: el.textContent ?? '',
          num: el.closest('.num')?.textContent ?? '',
          button: button?.getAttribute('aria-label') ?? button?.textContent ?? '',
          at: el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : -1,
        });
      }
      if (w.live === mine) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Stops recording, a few frames on so that whatever the step started is in. */
async function recorded(page: Page): Promise<Moved[]> {
  return page.evaluate(
    () =>
      new Promise<Moved[]>((resolve) => {
        const w = window as unknown as { moved: Moved[]; live: number };
        let n = 0;
        const later = () => {
          if (++n < 4) return requestAnimationFrame(later);
          w.live = 0;
          resolve(w.moved);
        };
        requestAnimationFrame(later);
      }),
  );
}

/** Until nothing in the page is moving — the rest between two sets. */
async function still(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === 'running' &&
                ((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('main'),
            ).length,
      ),
    )
    .toBe(0);
}

/** Every buzz the page asks for, instead of the phone's vibration. */
async function listenForBuzzes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { buzzes: unknown[] };
    w.buzzes = [];
    Object.defineProperty(Navigator.prototype, 'vibrate', {
      configurable: true,
      value: (pattern: unknown) => {
        w.buzzes.push(pattern);
        return true;
      },
    });
  });
}

const buzzes = (page: Page) =>
  page.evaluate(() => (window as unknown as { buzzes: unknown[] }).buzzes);

const deletes = (page: Page) => page.getByRole('button', { name: 'Delete' });
const counter = /^\d+ of \d+ sets$/;
/** A logged set's row growing in — not the card's body opening, which holds rows too. */
const rowsGrown = (moved: Moved[]) =>
  moved.filter((m) => m.name === 'grid-template-rows' && /^\d+(\.\d+)? kg × \d+/.test(m.text));

test.describe('What a set feels like', () => {
  test('the button stays lit, and only the new row, the new dot and the count move', async ({
    onboardedApp: app,
  }) => {
    /* The button used to be disabled for the length of every save, which dims
       it to 40%: a flicker on the one button pressed twenty times a session.
       Watched for the whole save, not checked after it. */
    const log = app.getByRole('button', { name: 'Log set 1', exact: true });
    await log.evaluate((el) => {
      const w = window as unknown as { dimmed: boolean };
      w.dimmed = false;
      new MutationObserver(() => {
        if ((el as HTMLButtonElement).disabled) w.dimmed = true;
      }).observe(el, { attributes: true });
    });

    await record(app);
    await log.click();
    await expect(deletes(app)).toHaveCount(1);
    let moved = await recorded(app);

    expect(await app.evaluate(() => (window as unknown as { dimmed: boolean }).dimmed)).toBe(false);
    // The row grows in, rather than the card getting a row taller in one frame…
    expect(rowsGrown(moved)).toHaveLength(1);
    // …with its numbers starting in the accent colour and settling.
    expect(moved.some((m) => m.name === 'color' && /kg ×/.test(m.num))).toBe(true);
    // The dot that set filled pops; there is no other.
    expect(moved.filter((m) => m.name === 'dot-pop').map((m) => m.at)).toEqual([0]);
    // The day's count ticks up: its digit comes in from below.
    const ticked = moved.filter((m) => m.kind === 'script' && counter.test(m.num));
    expect(ticked.map((m) => m.from)).toContain('translateY(60%)');
    // Nothing on the hot path runs past a quarter of a second.
    expect(moved.filter((m) => m.ms > 240)).toEqual([]);

    // The second set, after a rest, moves the second row and the second dot —
    // not the first ones again.
    await still(app);
    await record(app);
    await app.getByRole('button', { name: 'Log set 2', exact: true }).click();
    await expect(deletes(app)).toHaveCount(2);
    moved = await recorded(app);
    expect(rowsGrown(moved).map((m) => m.at)).toEqual([1]);
    expect(moved.filter((m) => m.name === 'dot-pop').map((m) => m.at)).toEqual([1]);

    /* And a card opened again has nothing new in it: its body opens, and the
       sets already in it are simply there. Remounted rows are new elements to
       the browser, so without the card keeping track they would all grow in
       again — on every open, and on every arrival at a half-done card. */
    const name = await openExercise(app);
    await openCard(app, (await collapsedExercises(app))[0]!);
    await record(app);
    await openCard(app, name);
    await expect(deletes(app)).toHaveCount(2);
    moved = await recorded(app);
    expect(moved.some((m) => m.name === 'grid-template-rows')).toBe(true);
    expect(rowsGrown(moved)).toEqual([]);
    expect(moved.filter((m) => m.name === 'dot-pop')).toEqual([]);
  });

  test('a number rolls the way it moved', async ({ onboardedApp: app }) => {
    const rolls = (moved: Moved[], button: string) =>
      moved.filter((m) => m.kind === 'script' && m.button === button).map((m) => m.from);

    // Buttons: up comes in from below, down from above.
    await record(app);
    await app.getByRole('button', { name: 'reps +', exact: true }).click();
    expect(rolls(await recorded(app), 'Type reps')).toContain('translateY(60%)');
    await record(app);
    await app.getByRole('button', { name: 'reps −', exact: true }).click();
    expect(rolls(await recorded(app), 'Type reps')).toContain('translateY(-60%)');

    // The bar's total, as a plate goes on and comes off.
    await openCard(app, 'Barbell Bench Press');
    await record(app);
    await app.getByRole('button', { name: 'Add 20 kg to each side' }).click();
    expect(rolls(await recorded(app), 'Type weight')).toContain('translateY(60%)');
    await record(app);
    await app.getByRole('button', { name: 'Remove a 20 kg plate' }).click();
    expect(rolls(await recorded(app), 'Type weight')).toContain('translateY(-60%)');
  });

  test('finishing draws a tick; finishing the day draws its tab’s, says so and buzzes once', async ({
    onboardedApp: app,
  }) => {
    await listenForBuzzes(app);
    await app.reload();
    await expect(app.getByRole('button', { name: /^Log set 1$/ })).toBeVisible();

    // One exercise: its tick draws on the row it folds into.
    await record(app);
    const first = await finishOpenExercise(app);
    let moved = await recorded(app);
    expect(moved.filter((m) => m.name === 'draw').map((m) => m.button)).toEqual([
      expect.stringMatching(new RegExp(`^${first}`)),
    ]);
    await expect(app.getByText(/^Day A done$/)).toHaveCount(0);

    // The rest of the day: each exercise's tick, then the day's own, once.
    await record(app);
    const rest = await finishDay(app);
    const line = app.getByRole('status').filter({ hasText: 'Day A done' });
    await expect(line).toBeVisible();
    moved = await recorded(app);
    const draws = moved.filter((m) => m.name === 'draw');
    expect(draws.filter((m) => /^Day A/.test(m.button))).toHaveLength(1);
    expect(draws).toHaveLength(rest.length + 1);

    /* A buzz for every set, and one longer one for the day, felt last — the
       set that finished the day never cuts it short. */
    const felt = await buzzes(app);
    const sets = 3 * (rest.length + 1);
    expect(felt.filter((b) => b === 24)).toHaveLength(1);
    expect(felt.at(-1)).toBe(24);
    expect(felt.filter((b) => b === 10).length).toBeGreaterThanOrEqual(sets - 1);
    expect(felt.filter((b) => b === 10).length).toBeLessThanOrEqual(sets);

    /* Come back to it: ticked, and quiet. The day was finished before this
       page existed, and on the first render every day reads unfinished — the
       case that would celebrate it again on every visit. Recorded from the
       first frame of the page. */
    await app.addInitScript(() => {
      const w = window as unknown as { moved: string[] };
      w.moved = [];
      const seen = new WeakSet<Animation>();
      const tick = () => {
        for (const a of document.getAnimations()) {
          if (seen.has(a)) continue;
          seen.add(a);
          if (a instanceof CSSAnimation) w.moved.push(a.animationName);
          else if (!(a instanceof CSSTransition)) w.moved.push('script');
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await app.reload();
    const dayA = app.getByRole('button', { name: /^Day A/ });
    await expect(dayA.locator('svg')).toHaveCount(1);
    await app.waitForTimeout(500);
    const onArrival = await app.evaluate(() => (window as unknown as { moved: string[] }).moved);
    expect(onArrival.filter((n) => ['draw', 'dot-pop', 'script'].includes(n))).toEqual([]);
    await expect(app.getByText(/^Day A done$/)).toHaveCount(0);
  });

  test('a set the phone could not keep does not buzz', async ({ page, context, baseURL }) => {
    /* The buzz says "saved". Where the write fails — out of space, a private
       window — it would say the opposite of what happened. */
    await context.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: unknown[]) {
        if (this.name === 'logs') throw new Error('simulated quota exceeded');
        return (original as (...a: unknown[]) => IDBRequest).apply(this, args);
      } as typeof IDBObjectStore.prototype.put;
    });
    await listenForBuzzes(page);
    await signInAs(page, context, baseURL!, { onboarded: true });

    await page.getByRole('button', { name: 'Log set 1', exact: true }).click();
    await expect(page.getByText('Not saved on this device', { exact: true })).toBeAttached({
      timeout: 15_000,
    });
    expect(await buzzes(page)).toEqual([]);
  });

  test('under reduced motion the colour still fades and nothing moves', async ({
    onboardedApp: app,
  }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });

    await record(app);
    await app.getByRole('button', { name: 'reps +', exact: true }).click();
    await app.getByRole('button', { name: 'Log set 1', exact: true }).click();
    await expect(deletes(app)).toHaveCount(1);
    const moved = await recorded(app);

    // No digit rolls, no dot swells.
    expect(moved.filter((m) => m.kind === 'script')).toEqual([]);
    expect(moved.filter((m) => m.name === 'dot-pop')).toEqual([]);
    // The row is simply there — a 1 ms change so the sequence still ends…
    expect(rowsGrown(moved).map((m) => m.ms)).toEqual([1]);
    // …and its tint still fades, because colour is not motion.
    expect(moved.filter((m) => m.name === 'color' && /kg ×/.test(m.num))[0]?.ms).toBeGreaterThan(1);

    // A finished exercise's tick fades in whole instead of drawing.
    await record(app);
    const name = await finishOpenExercise(app);
    const ticks = (await recorded(app)).filter((m) => ['draw', 'fade'].includes(m.name));
    expect(ticks.map((m) => [m.name, m.button.startsWith(name)])).toEqual([['fade', true]]);
  });
});
