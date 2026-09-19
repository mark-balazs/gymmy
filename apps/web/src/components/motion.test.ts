import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FALLBACK, parseEasing, parseTime } from './motion';

/**
 * The motion system: one set of tokens in `globals.css`, read by JavaScript
 * through `motion.ts`, and nothing hand-rolled beside it.
 *
 * Most of this reads the stylesheet and the source as text. That is
 * deliberate: the failures it guards against — a copy of a number drifting, a
 * press that transitions the wrong property, reduced motion going back to
 * zeroing everything — are all in what is written, and all silent in a
 * browser.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');

/** The declarations of the first `selector { … }` block after `after`. */
function block(selector: string, after = ''): Record<string, string> {
  const from = after ? css.indexOf(after) : 0;
  expect(from, `"${after}" is in globals.css`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf(`${selector} {`, from);
  expect(open, `a "${selector}" block`).toBeGreaterThanOrEqual(0);
  // Nested blocks (the linear() spring spans lines, not braces) end at the first `}`.
  const body = css.slice(open + selector.length + 2, css.indexOf('}', open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.replace(/\s+/g, ' ').trim();
  }
  return out;
}

const tokens = block(':root', '-- motion */');
const spring = block(':root', '@supports (transition-timing-function: linear(0, 1))');
// The reduced-motion block that holds the tokens — other rules (the switch's
// thumb) have reduced-motion blocks of their own, earlier in the file.
const reduced = block(':root', '@media (prefers-reduced-motion: reduce) {\n  :root {');

describe('the tokens', () => {
  it('JavaScript falls back to exactly what the stylesheet says', () => {
    for (const [name, value] of Object.entries(FALLBACK)) {
      expect(tokens[name], name).toBe(value);
    }
  });

  it('every duration is a time, and they run from a press to a sheet', () => {
    const ms = (n: string) => parseTime(tokens[n]!)!;
    expect(ms('--dur-press')).toBeLessThan(ms('--dur-fast'));
    expect(ms('--dur-fast')).toBeLessThan(ms('--dur-base'));
    expect(ms('--dur-base')).toBeLessThan(ms('--dur-page'));
    expect(ms('--dur-page')).toBeLessThan(ms('--dur-sheet'));
    // Exits are shorter than entrances.
    expect(ms('--dur-sheet-out')).toBeLessThan(ms('--dur-sheet'));
    // Used many times a session, so kept at or under 300 ms.
    expect(ms('--dur-page')).toBeLessThanOrEqual(300);
  });

  it('the spring is a real one where the browser can draw it', () => {
    const value = spring['--ease-spring'];
    expect(value).toMatch(/^linear\(/);
    const f = parseEasing(value!);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    // Past the target and back, by a little: a reward, not a wobble.
    let peak = 0;
    for (let x = 0; x <= 1; x += 0.01) peak = Math.max(peak, f(x));
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.08);
    // Most of the way there before halfway.
    expect(f(0.3)).toBeGreaterThan(0.9);
  });
});

describe('reduced motion', () => {
  it('takes every distance away', () => {
    expect(reduced['--press']).toBe('1');
    expect(reduced['--press-deep']).toBe('1');
    expect(reduced['--pop-from']).toBe('1');
    expect(reduced['--rise']).toBe('0px');
    expect(reduced['--slide-by']).toBe('0px');
  });

  it('shortens everything longer than a short fade to one', () => {
    const fast = parseTime(tokens['--dur-fast']!)!;
    for (const [name, value] of Object.entries(tokens)) {
      if (!name.startsWith('--dur-') || parseTime(value)! <= fast) continue;
      expect(reduced[name], name).toBe('var(--dur-fast)');
    }
  });

  it('no longer zeroes every animation, fades included', () => {
    expect(css).not.toMatch(/(animation|transition)-duration:\s*0\.01ms/);
    expect(css).not.toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*duration/);
  });
});

describe('easing curves', () => {
  it('reads a cubic-bezier the way CSS does', () => {
    const f = parseEasing('cubic-bezier(0.2, 0, 0, 1)');
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    // Decelerating: well past halfway at the halfway mark.
    expect(f(0.5)).toBeGreaterThan(0.8);
  });

  it('reads linear() with and without positions', () => {
    const f = parseEasing('linear(0, 0.5 25%, 1)');
    expect(f(0.25)).toBeCloseTo(0.5);
    expect(f(0.625)).toBeCloseTo(0.75);
    // A point with no position sits halfway between its neighbours.
    const g = parseEasing('linear(0, 0.8, 1)');
    expect(g(0.5)).toBeCloseTo(0.8);
    expect(g(0.25)).toBeCloseTo(0.4);
  });

  it('reads times in either unit', () => {
    expect(parseTime('160ms')).toBe(160);
    expect(parseTime('0.3s')).toBe(300);
    expect(parseTime('var(--dur-fast)')).toBeNull();
  });
});

describe('a press', () => {
  it('transitions the property it changes', () => {
    for (const name of ['press', 'press-deep']) {
      const at = css.indexOf(`@utility ${name} {`);
      expect(at, name).toBeGreaterThanOrEqual(0);
      const body = css.slice(at, css.indexOf('}', css.indexOf('}', at) + 1));
      expect(body).toMatch(/transition-property:[^;]*\bscale\b/);
      expect(body).toMatch(/scale:\s*var\(--press(-deep)?\)/);
    }
  });
});

/** Every source file under src, with its text. */
function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) {
        out.push({ file: relative(SRC, p).replaceAll('\\', '/'), text: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(SRC);
  return out;
}

describe('nothing beside the system', () => {
  /** Each pattern, and what to use instead. */
  const banned: [RegExp, string][] = [
    [/active:scale-/, 'the `press` utility'],
    [/\bduration-(\d|\[(?!1ms\]))/, 'a --dur-* token, `duration-(--dur-fast)`'],
    // Not preceded by `-`, so `var(--ease-out)` itself is not a hit.
    [/(?<![-\w])ease-(\[|(in|out|in-out|linear)\b(?!-))/, 'an --ease-* token, `ease-(--ease-out)`'],
    [/--ease-out-soft/, '--ease-out'],
    [
      /matchMedia\?*\.?\(\s*['"]\(prefers-reduced-motion/,
      '`reducedMotion()` from components/motion',
    ],
  ];

  for (const [pattern, instead] of banned) {
    it(`no ${pattern.source}`, () => {
      const hits = sources()
        .filter((s) => s.file !== 'components/motion.ts')
        .filter((s) => pattern.test(s.text))
        .map((s) => s.file);
      expect(hits, `use ${instead}`).toEqual([]);
    });
  }
});
