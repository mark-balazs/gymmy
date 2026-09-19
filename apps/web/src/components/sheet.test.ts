import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLOSE_AT,
  FLICK,
  SAMPLE_MS,
  dismisses,
  finishMs,
  releaseVelocity,
  rubberBand,
} from './sheet-gesture';

/**
 * Sheets: the arithmetic of a drag, and the one rule the source has to keep
 * for a sheet to be able to leave at all. What a finger actually does to a
 * sheet is `e2e/tests/sheets.spec.ts`.
 */

describe('pulled up past where it rests', () => {
  const height = 500;

  it('gives, but less the further it goes', () => {
    expect(rubberBand(0, height)).toBe(0);
    const a = rubberBand(40, height);
    const b = rubberBand(80, height);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(40);
    // Twice the pull is less than twice the movement.
    expect(b).toBeLessThan(2 * a);
    expect(b).toBeGreaterThan(a);
  });

  it('starts at about half the finger and never runs away', () => {
    expect(rubberBand(2, height) / 2).toBeCloseTo(0.55, 1);
    expect(rubberBand(1e6, height)).toBeLessThan(height);
  });
});

describe('the speed a finger lets go at', () => {
  it('is read from the last moments of the drag', () => {
    const samples = [
      { t: 0, y: 0 }, // long ago: slow start, not counted
      { t: 900, y: 10 },
      { t: 950, y: 40 },
      { t: 1000, y: 70 },
    ];
    // 60 px over the 100 ms up to letting go.
    expect(releaseVelocity(samples, 1000)).toBeCloseTo(60 / 100);
  });

  it('is nothing if the finger stopped before it lifted', () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 20, y: 80 },
    ];
    expect(releaseVelocity(samples, 20 + SAMPLE_MS + 50)).toBe(0);
  });

  it('is negative for a finger going back up', () => {
    const samples = [
      { t: 950, y: 200 },
      { t: 1000, y: 150 },
    ];
    expect(releaseVelocity(samples, 1000)).toBeLessThan(0);
  });
});

describe('letting go', () => {
  const height = 400;

  it('closes on a flick, however short', () => {
    expect(dismisses(12, FLICK + 0.1, height)).toBe(true);
  });

  it('closes past a quarter of the height, even slowly', () => {
    expect(dismisses(height * CLOSE_AT + 1, 0.05, height)).toBe(true);
  });

  it('springs back from a short, slow drag', () => {
    expect(dismisses(40, 0.1, height)).toBe(false);
  });

  it('springs back when thrown back up, however far it got', () => {
    expect(dismisses(height * 0.6, -(FLICK + 0.1), height)).toBe(false);
  });

  it('never closes from being pulled up', () => {
    expect(dismisses(-30, FLICK * 3, height)).toBe(false);
  });
});

describe('finishing a flick', () => {
  it('carries on at the finger speed, capped', () => {
    expect(finishMs(300, 2, 220)).toBe(150);
    expect(finishMs(300, 0.5, 220)).toBe(220);
    expect(finishMs(300, 0, 220)).toBe(220);
  });
});

/* ------------------------------------------------------------ the source */

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Every component source under src, with comments blanked out (their line
 *  breaks kept, so a line number still points at the file). */
function sources(): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = [];
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(f)) {
        const code = readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, blank)
          .replace(/^\s*\/\/.*$/gm, blank);
        out.push({ file: relative(SRC, p).replaceAll('\\', '/'), code });
      }
    }
  };
  walk(SRC);
  return out;
}

describe('every sheet can leave', () => {
  /*
   * A sheet its caller mounts with `{x && …}` is taken out of the page the
   * moment `x` goes false, and nothing inside it can play an exit once it is
   * gone. A `<Presence>` around the condition keeps it until it has. Without
   * one it vanishes in a frame, which is what every sheet did before GYM-17 —
   * and nothing in a browser test would say which sheet had gone back to it.
   */
  const files = sources();

  /** `Sheet`, and every component that renders one always open (`open` with
   *  no value): its callers decide whether it exists at all. */
  const conditional = new Set(['Sheet']);
  for (const { code } of files) {
    // Up to the tag's closing `>`, stepping over the arrows in its handlers.
    for (const m of code.matchAll(/<Sheet\b((?:=>|[^>])*)>/g)) {
      if (!/(^|\s)open(\s|$)/.test(m[1]!)) continue;
      const before = code.slice(0, m.index);
      const owner = [...before.matchAll(/function (\w+)\s*\(/g)].pop()?.[1];
      if (owner && /^[A-Z]/.test(owner)) conditional.add(owner);
    }
  }

  it('finds the sheets it is guarding', () => {
    // If these go, the scan above is reading nothing and passing for it.
    for (const name of ['ExercisePicker', 'ExerciseSheet', 'SplitSheet', 'DetailSheet']) {
      expect(conditional, name).toContain(name);
    }
  });

  it('a sheet mounted with `&&` sits inside a <Presence>', () => {
    const bare: string[] = [];
    for (const { file, code } of files) {
      for (const name of conditional) {
        for (const m of code.matchAll(new RegExp(`&&\\s*\\(?\\s*<${name}\\b`, 'g'))) {
          const before = code.slice(0, m.index);
          if (!/<Presence>\s*\{[^{}<>]*$/.test(before)) {
            bare.push(`${file}:${before.split('\n').length} <${name}>`);
          }
        }
      }
    }
    expect(bare, 'wrap the condition: <Presence>{x && <…/>}</Presence>').toEqual([]);
  });
});
