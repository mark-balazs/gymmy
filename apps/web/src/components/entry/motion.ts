/**
 * The motion tokens in `globals.css`, for motion that JavaScript drives.
 *
 * The ruler moves by hand — pointer events and animation frames, not CSS —
 * and its readout rolls with the Web Animations API, which cannot read a CSS
 * variable. Both read the token itself at first use rather than keeping a copy
 * of the numbers, so a change to the curve in the stylesheet reaches them too.
 */

type Token = '--ease-spring' | '--ease-out-soft';

/** What each token says today, for a page that cannot read the stylesheet. */
const FALLBACK: Record<Token, string> = {
  '--ease-spring': 'cubic-bezier(0.22, 1.2, 0.36, 1)',
  '--ease-out-soft': 'cubic-bezier(0.2, 0.7, 0.3, 1)',
};

const read = new Map<Token, string>();

/** A token as a CSS easing string, for `element.animate`. */
export function easing(token: Token): string {
  let value = read.get(token);
  if (value === undefined) {
    const css =
      typeof document === 'undefined'
        ? ''
        : getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    value = /^cubic-bezier\(/.test(css) ? css : FALLBACK[token];
    read.set(token, value);
  }
  return value;
}

/**
 * A token as a function from time (0–1) to progress, for a frame loop. It
 * may pass 1 on the way — that overshoot is what makes a spring a spring.
 */
export function curve(token: Token): (x: number) => number {
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = (/\(([^)]*)\)/.exec(easing(token))?.[1] ?? '')
    .split(',')
    .map(Number);
  return cubicBezier(x1, y1, x2, y2);
}

/** The CSS cubic-bezier timing function: solve x(t) for t, answer y(t). */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t: number) => ((ay * t + by) * t + cy) * t;
  const slope = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    // Newton first; a flat stretch of the curve falls back to halving.
    for (let i = 0; i < 8; i++) {
      const miss = xAt(t) - x;
      if (Math.abs(miss) < 1e-5) return yAt(t);
      const d = slope(t);
      if (Math.abs(d) < 1e-6) break;
      t -= miss / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24 && Math.abs(xAt(t) - x) >= 1e-5; i++) {
      if (xAt(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return yAt(t);
  };
}

/** Read at the moment of moving, not once, so changing the setting mid-session
 *  applies to the next flick. Optional-called: a browser without `matchMedia`
 *  gets motion rather than an exception in the middle of a drag. */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
