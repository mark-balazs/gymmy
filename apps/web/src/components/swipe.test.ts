import { describe, expect, it } from 'vitest';
import {
  COMMIT_SHARE,
  FLICK_SPEED,
  LOCK_PX,
  axisOf,
  commits,
  finishMs,
  follow,
  releaseSpeed,
} from './swipe';

/**
 * The arithmetic of a swipe between tabs (GYM-14): the owner's rule is that
 * the page follows the finger, locks to an axis after about 10 px, resists at
 * the ends, commits on a flick faster than 0.2 px/ms or a drag past about 30%
 * of the width, and finishes at the finger's speed within a tab change's time.
 * `navigation.spec.ts` drives the same thing with real touches.
 */

const W = 400;

describe('which way a drag is going', () => {
  it('is too early to tell inside the lock distance', () => {
    expect(axisOf(LOCK_PX - 1, 0)).toBeNull();
    expect(axisOf(-(LOCK_PX - 1), LOCK_PX - 1)).toBeNull();
  });

  it('is sideways only when flatter than it is steep', () => {
    expect(axisOf(LOCK_PX, 2)).toBe('x');
    expect(axisOf(-12, 11)).toBe('x');
    // A scroll that wandered: steeper than level, however far sideways.
    expect(axisOf(-18, 66)).toBe('y');
    expect(axisOf(10, 10)).toBe('y');
  });
});

describe('where the page sits under the finger', () => {
  it('follows one to one when there is a tab to go to', () => {
    expect(follow(-120, W, true)).toBe(-120);
    expect(follow(37, W, true)).toBe(37);
  });

  it('resists past the first or last tab, and never reaches the edge', () => {
    const r = follow(-200, W, false);
    expect(r).toBeLessThan(0);
    expect(Math.abs(r)).toBeLessThan(200 / 2);
    // Ever less for each extra pixel, and never the whole width.
    expect(Math.abs(follow(-400, W, false)) - Math.abs(r)).toBeLessThan(Math.abs(r));
    expect(Math.abs(follow(-10_000, W, false))).toBeLessThan(W);
    expect(follow(50, W, false)).toBeGreaterThan(0);
  });
});

describe('how fast the finger was going', () => {
  it('reads the last stretch only', () => {
    // Slow for a long while, then fast for the last 50 ms.
    const samples = [
      { x: 300, t: 0 },
      { x: 290, t: 400 },
      { x: 280, t: 800 },
      { x: 230, t: 850 },
    ];
    expect(releaseSpeed(samples)).toBeCloseTo(-50 / 50);
  });

  it('is zero for a finger that stopped before lifting', () => {
    expect(releaseSpeed([{ x: 200, t: 0 }])).toBe(0);
    expect(
      releaseSpeed([
        { x: 200, t: 0 },
        { x: 200, t: 300 },
      ]),
    ).toBe(0);
  });
});

describe('whether letting go moves to the next tab', () => {
  it('moves on a flick towards it, however short', () => {
    expect(commits(-20, -(FLICK_SPEED + 0.05), W, true)).toBe(true);
    expect(commits(25, FLICK_SPEED + 0.05, W, true)).toBe(true);
  });

  it('moves on a drag past the share of the width', () => {
    expect(commits(-(COMMIT_SHARE * W + 1), 0, W, true)).toBe(true);
    expect(commits(-(COMMIT_SHARE * W - 1), 0, W, true)).toBe(false);
  });

  it('stays when the finger was flicking back', () => {
    expect(commits(-(COMMIT_SHARE * W + 40), FLICK_SPEED + 0.05, W, true)).toBe(false);
    expect(commits(-20, 0.5, W, true)).toBe(false);
  });

  it('stays past the first or last tab', () => {
    expect(commits(-300, -2, W, false)).toBe(false);
  });
});

describe('how long the rest of the slide takes', () => {
  it('is the distance left at the finger’s speed', () => {
    // 150 px dragged of 400: 250 px left, at 1.25 px/ms.
    expect(finishMs(-150, -1.25, W, 300, 100)).toBe(200);
  });

  it('is never longer than a tab change, nor so short it jumps', () => {
    expect(finishMs(-130, -0.1, W, 300, 100)).toBe(300);
    expect(finishMs(-130, 0, W, 300, 100)).toBe(300);
    expect(finishMs(-390, -5, W, 300, 100)).toBe(100);
  });
});
