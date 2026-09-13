import { describe, expect, it } from 'vitest';
import {
  addDays,
  blockWeeks,
  coveragePatterns,
  est1RM,
  index,
  mondayOf,
  periodFor,
  weekCoverage,
} from '../src/model';
import { logsFor, period, seedSnapshot } from './fixture';

describe('estimated 1RM', () => {
  /* Without the RIR term a set left with three in the tank scores the same as
   * one taken to failure, which makes the entire progress view misleading. */
  it('adjusts for reps in reserve', () => {
    expect(est1RM(60, 8, 2)).toBe(80);
    expect(est1RM(60, 8, 0)).toBeLessThan(est1RM(60, 8, 2)!);
  });

  it('returns null rather than zero for an incomplete set', () => {
    expect(est1RM(null, 8, 2)).toBeNull();
    expect(est1RM(60, null, 2)).toBeNull();
  });
});

describe('weeks', () => {
  it('snaps to Monday', () => {
    expect(mondayOf('2026-09-12')).toBe('2026-09-07'); // a Saturday
    expect(mondayOf('2026-09-07')).toBe('2026-09-07');
    expect(mondayOf('2026-09-13')).toBe('2026-09-07'); // Sunday belongs to the week just ended
  });

  it('crosses a year boundary without drifting', () => {
    const weeks = blockWeeks('2026-12-21', 4);
    expect(weeks).toEqual(['2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11']);
  });

  /* Built from local date parts rather than toISOString(), which is UTC and
   * would move a late-evening session to the following day for some users. */
  it('does not shift the date late at night', () => {
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
  });
});

describe('coverage', () => {
  const base = seedSnapshot();

  it('counts a week as incomplete until every pattern is trained', () => {
    const ix = index(base);
    const squat = ix.exercises.find((e) => e.name === 'Goblet Squat')!;
    const withOne = index({
      ...base,
      logs: logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], '2026-09-08'),
    });
    const cov = weekCoverage(withOne, '2026-09-07');
    expect(cov.hit).toBe(1);
    expect(cov.total).toBe(7);
    expect(cov.complete).toBe(false);
    expect(cov.sessions).toBe(1);
  });

  it('ignores soft-deleted sets', () => {
    const ix = index(base);
    const squat = ix.exercises.find((e) => e.name === 'Goblet Squat')!;
    const logs = logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], '2026-09-08').map((l) => ({
      ...l,
      deletedAt: new Date().toISOString(),
    }));
    const cov = weekCoverage(index({ ...base, logs }), '2026-09-07');
    expect(cov.hit).toBe(0);
  });

  it('never counts isolation towards coverage', () => {
    // Accessories sit on top of the patterns, never instead of them — a week of
    // nothing but curls must not read as progress towards a complete week.
    const ix = index(base);
    const iso = ix.patterns.find((p) => p.key === 'isolation')!;
    expect(iso.counts).toBe(false);
    const curl = ix.exercises.find((e) => e.name === 'DB Curl')!;
    const cov = weekCoverage(
      index({ ...base, logs: logsFor(curl.id, [{ weight: 10, reps: 12, rir: 2 }], '2026-09-08') }),
      '2026-09-07',
    );
    expect(cov.hit).toBe(0);
  });
});

/* ------------------------------------------------------- split coverage */

const WEEK_A = '2026-09-07';
const WEEK_B = '2026-09-14';

/** Push, pull and the three leg patterns — no rotation, no carry. */
const PPL_WORK = ['Goblet Squat', 'Romanian Deadlift', 'Walking Lunge', 'Push-Up', 'Inverted Row'];

function logWork(snap: ReturnType<typeof seedSnapshot>, names: string[], date: string) {
  const ix = index(snap);
  return names.flatMap((name) => {
    const ex = ix.exercises.find((e) => e.name === name)!;
    return logsFor(ex.id, [{ weight: 40, reps: 8, rir: 2 }], date);
  });
}

describe('coverage is defined by the split', () => {
  it('a push/pull/legs week is complete without a carry', () => {
    // The correction that drove this design: a split is complete when it has
    // done what it set out to do. Failing push/pull/legs for missing a carry
    // scores it against a method the user did not choose.
    const base = seedSnapshot('pushPullLegs', 3);
    const snap = { ...base, logs: logWork(base, PPL_WORK, '2026-09-08') };

    const cov = weekCoverage(index(snap), WEEK_A);
    expect(cov.total).toBe(5);
    expect(cov.cells.map((c) => c.pattern.key).sort()).toEqual([
      'hinge',
      'lunge',
      'pull',
      'push',
      'squat',
    ]);
    expect(cov.complete).toBe(true);
  });

  it('the identical training is incomplete under the seven-pattern split', () => {
    const base = seedSnapshot('sevenPattern', 3);
    const snap = { ...base, logs: logWork(base, PPL_WORK, '2026-09-08') };

    const cov = weekCoverage(index(snap), WEEK_A);
    expect(cov.total).toBe(7);
    expect(cov.hit).toBe(5);
    expect(cov.complete).toBe(false);
  });
});

describe('coverage is historised', () => {
  /** Trained seven-pattern in week A, switched to push/pull/legs in week B. */
  const build = () => {
    const base = seedSnapshot('sevenPattern', 3);
    return index({
      ...base,
      splitPeriods: [period('sevenPattern', WEEK_A), period('pushPullLegs', WEEK_B)],
      logs: [...logWork(base, PPL_WORK, '2026-09-08'), ...logWork(base, PPL_WORK, '2026-09-15')],
    });
  };

  it('keeps an old week scored against the split it was trained under', () => {
    const cov = weekCoverage(build(), WEEK_A);
    expect(cov.split).toBe('sevenPattern');
    expect(cov.total).toBe(7);
    expect(cov.complete).toBe(false);
  });

  it('applies the new split from its own week onward', () => {
    const cov = weekCoverage(build(), WEEK_B);
    expect(cov.split).toBe('pushPullLegs');
    expect(cov.total).toBe(5);
    expect(cov.complete).toBe(true);
  });

  it('switching split never rewrites what an earlier week meant', () => {
    // The same set of logs, read before and after the switch is recorded.
    const base = seedSnapshot('sevenPattern', 3);
    const logs = logWork(base, PPL_WORK, '2026-09-08');
    const before = weekCoverage(index({ ...base, logs }), WEEK_A);
    const after = weekCoverage(
      index({
        ...base,
        logs,
        splitPeriods: [period('sevenPattern', WEEK_A), period('pushPullLegs', WEEK_B)],
      }),
      WEEK_A,
    );
    expect(after.total).toBe(before.total);
    expect(after.hit).toBe(before.hit);
    expect(after.complete).toBe(before.complete);
  });

  it('resolves the period by week boundary, not by day', () => {
    const ix = build();
    expect(periodFor(ix, WEEK_A)?.split).toBe('sevenPattern');
    expect(periodFor(ix, addDays(WEEK_B, -1))?.split).toBe('sevenPattern');
    expect(periodFor(ix, WEEK_B)?.split).toBe('pushPullLegs');
    expect(periodFor(ix, addDays(WEEK_B, 70))?.split).toBe('pushPullLegs');
  });

  it('falls back to every counted pattern when no period was ever recorded', () => {
    // Accounts that pre-date periods were scored against all seven, and must
    // keep reading that way rather than inheriting whatever is current.
    const base = seedSnapshot('pushPullLegs', 3);
    const ix = index({ ...base, splitPeriods: [] });
    expect(coveragePatterns(ix, WEEK_A)).toHaveLength(7);
    expect(weekCoverage(ix, WEEK_A).split).toBe(null);
  });
});

describe('rows written before a field existed', () => {
  /**
   * A device only receives a row again when its `seq` moves, and adding a
   * column does not move it. So an exercise sitting in IndexedDB from before
   * `images` existed has no `images` key at all — and `images.length` on that
   * throws, which took out the whole screen when the detail sheet opened.
   */
  it('defaults fields missing from older local rows', () => {
    const base = seedSnapshot();
    const legacy = base.exercises.map((e) => {
      const { description: _d, images: _i, ...rest } = e;
      return rest as (typeof base.exercises)[number];
    });

    const ix = index({ ...base, exercises: legacy });

    for (const e of ix.exercises) {
      expect(Array.isArray(e.images)).toBe(true);
      expect(typeof e.description).toBe('string');
    }
    // The property that actually crashed.
    expect(() => ix.exercises.map((e) => e.images.length)).not.toThrow();
  });
});
