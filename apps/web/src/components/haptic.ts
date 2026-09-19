/**
 * A small buzz for something that just happened — Android only.
 *
 * iOS has no web vibration at all, and Firefox on Android dropped it, so this
 * is checked for rather than assumed, and a phone without it simply stays
 * still. The one haptic an iPhone gives a web app is a native switch being
 * flipped (components/switch.tsx), which needs nothing from here.
 *
 * Only ever called once the thing it confirms has happened: a buzz for a set
 * that was not saved would be telling somebody the opposite of the truth.
 *
 * - `set`: a set is on the device. Short — it happens about twenty times a
 *   session.
 * - `day`: that set finished the day. One pulse, a little longer; not a
 *   pattern.
 *
 * The last set of a day asks for both, from two places, in either order: the
 * card once its write has landed, the page once the day reads finished — and
 * which comes first depends on the database. A new buzz cuts off the one
 * running, so a `set` straight after the `day` would shorten the one pulse
 * that was meant to be felt. So for a moment after a `day`, a `set` is
 * dropped; a `day` after a `set` simply takes over from it.
 */
export const HAPTICS = { set: 10, day: 24 } as const;

export type Haptic = keyof typeof HAPTICS;

/** Long enough to cover the other half of the same set, short enough that
 *  the next set, a rest later, buzzes as usual. */
const HOLD_MS = 400;

let dayAt = Number.NEGATIVE_INFINITY;

export function haptic(kind: Haptic): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const now = performance.now();
  if (kind === 'set' && now - dayAt < HOLD_MS) return;
  if (kind === 'day') dayAt = now;
  try {
    navigator.vibrate(HAPTICS[kind]);
  } catch {
    /* Refused — no user gesture yet, or blocked by the page's settings. A
       missing buzz is no loss. */
  }
}
