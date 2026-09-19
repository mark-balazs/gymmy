/**
 * The motion tokens in `globals.css`, for motion that JavaScript drives.
 *
 * The ruler moves by hand — pointer events and animation frames, not CSS —
 * and the rolling digits use the Web Animations API, which cannot read a CSS
 * variable. Both read the token itself rather than keeping a copy of the
 * numbers, so a change in the stylesheet reaches them too, and a duration read
 * under reduced motion is already the shortened one the stylesheet gives.
 *
 * `FALLBACK` is only for a page that cannot read the stylesheet (a test, a
 * browser without custom properties). `motion.test.ts` holds it to the CSS.
 */

export type EaseToken = '--ease-out' | '--ease-in' | '--ease-drawer' | '--ease-spring';
export type DurToken =
  '--dur-press' | '--dur-fast' | '--dur-base' | '--dur-page' | '--dur-sheet' | '--dur-sheet-out';

/** What each token says in the stylesheet, before any `@supports` or media query. */
export const FALLBACK: Record<EaseToken | DurToken, string> = {
  '--ease-out': 'cubic-bezier(0.2, 0, 0, 1)',
  '--ease-in': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  '--ease-drawer': 'cubic-bezier(0.32, 0.72, 0, 1)',
  '--ease-spring': 'cubic-bezier(0.22, 1.2, 0.36, 1)',
  '--dur-press': '100ms',
  '--dur-fast': '160ms',
  '--dur-base': '240ms',
  '--dur-page': '300ms',
  '--dur-sheet': '360ms',
  '--dur-sheet-out': '220ms',
};

const EASING = /^(cubic-bezier|linear)\(/;

/** The token as the stylesheet resolves it right now, or '' off the page. */
function token(name: EaseToken | DurToken): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const easings = new Map<EaseToken, string>();

/**
 * A token as a CSS easing string, for `element.animate`. `linear()` where the
 * browser has it (the spring), `cubic-bezier()` otherwise — whichever the
 * stylesheet chose. Easings do not change under reduced motion, so the first
 * read is kept.
 */
export function easing(name: EaseToken): string {
  let value = easings.get(name);
  if (value === undefined) {
    const css = token(name);
    value = EASING.test(css) ? css : FALLBACK[name];
    if (css) easings.set(name, value);
  }
  return value;
}

/**
 * A token as milliseconds. Read each time rather than kept: the reduced-motion
 * block shortens the long ones, and the setting can change mid-session. Called
 * when a movement starts, never per frame.
 */
export function duration(name: DurToken): number {
  return parseTime(token(name)) ?? (parseTime(FALLBACK[name]) as number);
}

/** `160ms` or `0.16s` as milliseconds; null for anything else. */
export function parseTime(css: string): number | null {
  const m = /^(-?[\d.]+)(ms|s)$/.exec(css.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] === 's' ? n * 1000 : n;
}

/**
 * A token as a function from time (0–1) to progress, for a frame loop. It
 * may pass 1 on the way — that overshoot is what makes a spring a spring.
 */
export function curve(name: EaseToken): (x: number) => number {
  return parseEasing(easing(name));
}

/** `cubic-bezier(…)` or `linear(…)` as a function; anything else is linear. */
export function parseEasing(css: string): (x: number) => number {
  const args = /\(([^)]*)\)/.exec(css)?.[1] ?? '';
  if (css.startsWith('linear(')) return linearFn(args);
  if (css.startsWith('cubic-bezier(')) {
    const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = args.split(',').map(Number);
    return cubicBezier(x1, y1, x2, y2);
  }
  return (x) => Math.min(1, Math.max(0, x));
}

/**
 * CSS `linear()`: points joined by straight lines. A point is an output and an
 * optional input percentage; a point without one sits halfway between its
 * neighbours that have one, as the spec says.
 */
function linearFn(args: string): (x: number) => number {
  const raw = args
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .filter((p) => p[0] !== '')
    .map(([out, at]) => ({
      y: Number(out),
      x: at === undefined ? null : Number(at.replace('%', '')) / 100,
    }));
  if (raw.length === 0) return (x) => x;
  if (raw[0]!.x === null) raw[0]!.x = 0;
  if (raw[raw.length - 1]!.x === null) raw[raw.length - 1]!.x = 1;
  // Fill the gaps evenly between known inputs, and never let an input go back.
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]!.x !== null) {
      raw[i]!.x = Math.max(raw[i]!.x!, i > 0 ? raw[i - 1]!.x! : 0);
      continue;
    }
    let j = i;
    while (raw[j]!.x === null) j++;
    const a = raw[i - 1]!.x!;
    const b = raw[j]!.x!;
    for (let k = i; k < j; k++) raw[k]!.x = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  const pts = raw as { x: number; y: number }[];

  return (x) => {
    if (x <= pts[0]!.x) return pts[0]!.y;
    for (let i = 1; i < pts.length; i++) {
      const b = pts[i]!;
      if (x <= b.x) {
        const a = pts[i - 1]!;
        return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      }
    }
    return pts[pts.length - 1]!.y;
  };
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

/**
 * Whether the person asked for less motion. Read at the moment of moving, not
 * once, so changing the setting mid-session applies to the next movement.
 * Optional-called: a browser without `matchMedia` gets motion rather than an
 * exception in the middle of a drag.
 *
 * The CSS side needs no call: distances and long durations are tokens the
 * stylesheet already shortens under the same media query. This is for motion
 * the stylesheet cannot see — a smooth scroll, a frame loop, a Web Animation.
 */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
