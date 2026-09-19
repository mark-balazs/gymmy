/**
 * The arithmetic of a swipe between tabs: when a drag is sideways, how far
 * the page follows the finger, whether letting go moves to the next tab, and
 * how long the rest of the slide takes. Pure, and unit-tested in
 * `swipe.test.ts`; `swipe-tabs.ts` applies it to the page.
 *
 * The numbers are Ionic's swipe-back, which is the closest thing the web has
 * to a native page gesture, adjusted where a tab is not a stack:
 */

/** How far a finger moves before the gesture decides it is sideways or a
 *  scroll. Small enough that the page moves at once; big enough that a tap
 *  that wobbles is still a tap. */
export const LOCK_PX = 10;

/** Touches that start this close to either edge of the screen belong to the
 *  phone — iOS's Back, Android's back gesture — not to the tabs. */
export const EDGE_PX = 24;

/** Letting go faster than this, towards the next tab, moves there however
 *  short the drag (px/ms — Ionic's value). */
export const FLICK_SPEED = 0.2;

/** Letting go past this share of the screen's width moves there too, unless
 *  the finger was flicking back. Less than Ionic's half: a tab bar is flatter
 *  than a stack, and a third of the way is plainly an intention. */
export const COMMIT_SHARE = 0.3;

/** Only the last stretch of the drag says how fast the finger was going. */
export const SAMPLE_MS = 100;

/** Which way the first real movement went: sideways is ours, anything
 *  steeper is a scroll, and under `LOCK_PX` it is too early to tell. */
export function axisOf(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/**
 * Where the page sits for a finger `dx` from where the gesture locked.
 *
 * One to one while there is a tab to go to. Past the first or last tab it
 * resists — the iOS rubber band, which gives ever less and never reaches the
 * width — so the edge is felt rather than being a dead drag.
 */
export function follow(dx: number, width: number, canGo: boolean): number {
  if (canGo || dx === 0) return dx;
  const d = Math.abs(dx);
  return Math.sign(dx) * (1 - 1 / ((d * 0.55) / width + 1)) * width;
}

/** A point of the drag: where the finger was, and when (ms). */
export interface Sample {
  x: number;
  t: number;
}

/** How fast the finger was moving as it let go, in px/ms, signed like `dx`,
 *  over the last `SAMPLE_MS`. Zero for a finger that stopped before lifting. */
export function releaseSpeed(samples: readonly Sample[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const recent = samples.filter((s) => last.t - s.t <= SAMPLE_MS);
  const first = recent[0]!;
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/**
 * Whether letting go moves to the next tab.
 *
 * `dx` is how far the page was dragged, `speed` the finger's speed as it let
 * go (both signed, negative towards the left). A flick towards the next tab
 * moves however short it was; a long drag moves unless the finger was
 * flicking back, which is somebody changing their mind.
 */
export function commits(dx: number, speed: number, width: number, canGo: boolean): boolean {
  if (!canGo || dx === 0) return false;
  const towards = speed * Math.sign(dx);
  if (towards > FLICK_SPEED) return true;
  return Math.abs(dx) > COMMIT_SHARE * width && towards > -FLICK_SPEED;
}

/**
 * How long the rest of the slide takes once a swipe commits: the distance
 * left to the edge at the finger's own speed, so the page carries on as it
 * was moving — never longer than a tab change (`cap`), never so short that it
 * reads as a jump (`floor`).
 */
export function finishMs(
  dx: number,
  speed: number,
  width: number,
  cap: number,
  floor: number,
): number {
  const rest = Math.max(0, width - Math.abs(dx));
  const towards = Math.abs(speed);
  const ms = towards > 0 ? rest / towards : cap;
  return Math.round(Math.min(cap, Math.max(floor, ms)));
}
