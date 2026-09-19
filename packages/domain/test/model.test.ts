import { describe, expect, it } from 'vitest';
import {
  addDays,
  blockWeeks,
  coveragePatterns,
  programRows,
  sessionLabel,
  sessionsDone,
  MAX_EST_REPS_TO_FAILURE,
  est1RM,
  index,
  isoDate,
  mondayOf,
  periodFor,
  weekCoverage,
  weekPages,
} from '../src/model';
import { buildProgram } from '../src/coach';
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
    expect(est1RM(0, 8, 2)).toBeNull();
  });

  it('scores an unrated set as taken to failure, rather than refusing it', () => {
    /* The whole rated/confident mechanism rests on this: an unrated set still
       has a point on the chart, read as if nothing was left, which is why it
       sits lower than the same set rated and why a comparison across the two
       is marked unfair rather than judged. */
    expect(est1RM(60, 8, null)).toBe(76);
    expect(est1RM(60, 8, null)).toBeLessThan(est1RM(60, 8, 2)!);
  });

  it('refuses to estimate from a set nobody could estimate from', () => {
    /* Epley is linear in reps and stays linear, so a high-rep set is not a
       noisy maximum — it is a maximum invented by extrapolation, and always
       upward. Twenty-one thrusters is conditioning; thirty reps at 100 kg is
       not a 200 kg deadlift. The app has nothing to say about a maximum here,
       and says it the same way it does for a set with no weight. */
    expect(est1RM(100, 21, 0)).toBeNull();
    expect(est1RM(100, 30, 0)).toBeNull();
    expect(est1RM(9, 50, 0)).toBeNull();
  });

  it('draws the line where the literature draws it, not where our programming does', () => {
    /* Ten, not twelve. Twelve was the top of REP_RANGE.big — this app's own
       prescribed range, which is not a published bound and is above every
       bound that is: Brzycki 1993 says under ten, Reynolds 2006 "no more than
       10", Mayhew 1995 found all six common equations biased past it. */
    expect(MAX_EST_REPS_TO_FAILURE).toBe(10);
    expect(est1RM(100, 10, 0)).not.toBeNull();
    expect(est1RM(100, 11, 0)).toBeNull();
  });

  it('counts the reps left in the tank against the ceiling', () => {
    /* The correction that matters. Epley is fed `reps + rir`, so a ceiling on
       `reps` alone guarded a quantity the estimate never used: a twelve-rep set
       with four in reserve passed a check for twelve and was then extrapolated
       from as a sixteen — the exact invented maximum the ceiling exists to
       refuse. Eight and two is a ten-rep effort and estimable; eight and three
       is eleven and is not. */
    expect(est1RM(100, 8, 2)).not.toBeNull();
    expect(est1RM(100, 8, 3)).toBeNull();
    expect(est1RM(100, 12, 4)).toBeNull();
  });

  it('costs us most of the estimates, knowingly', () => {
    /* Not a fact about the formula — a fact about this app, recorded so nobody
       "fixes" the ceiling later without meeting it. The effort control defaults
       to two in reserve and the app prescribes 6-12, so the majority of what it
       asks for now produces no estimate at all. On the demo account this takes
       the estimable share of logged sets from 77% to 39%. Those sets still
       count as training and still chart by the weight on the bar. */
    expect(est1RM(60, 9, 2)).toBeNull();
    expect(est1RM(60, 12, 2)).toBeNull();
    expect(est1RM(60, 8, 2)).not.toBeNull();
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

  /* The Week tab pages through these. The block is written once, when the
   * account is made, and never moves on — so paging through the block alone
   * lost this week from week nine, and the tab opened on the account's first
   * week with no way forward to today. */
  describe('the Week tab’s pages', () => {
    const today = '2026-09-17'; // a Thursday; its week starts 2026-09-14

    it('reach this week once the first block is over', () => {
      const pages = weekPages('2026-07-06', 8, today); // ten weeks back
      expect(pages[0]).toBe('2026-07-06');
      expect(pages.at(-1)).toBe('2026-09-14');
      expect(pages).toHaveLength(11);
      // Every week between, a week apart: paging back reaches each one.
      pages.slice(1).forEach((w, i) => expect(w).toBe(addDays(pages[i]!, 7)));
    });

    it('reach this week on the demo, a week after it was seeded', () => {
      // Seeded 22 weeks back with a 23-week block, which ended last week.
      const seeded = '2026-09-07';
      const pages = weekPages(addDays(seeded, -7 * 22), 23, today);
      expect(pages.at(-1)).toBe('2026-09-14');
      expect(pages).toHaveLength(24);
    });

    it('keep the whole first block while the account is inside it', () => {
      // Unchanged for a young account: its eight weeks, this one among them.
      expect(weekPages('2026-08-31', 8, today)).toEqual(blockWeeks('2026-08-31', 8));
      expect(weekPages('2026-08-31', 8, today)).toContain('2026-09-14');
    });

    it('include this week when the block starts after it', () => {
      // Only a phone clock set ahead can write a block start in the future.
      const pages = weekPages('2026-10-05', 8, today);
      expect(pages[0]).toBe('2026-09-14');
      expect(pages).toHaveLength(8);
    });
  });

  /* Built from local date parts rather than toISOString(), which is UTC and
   * would move a late-evening session to the following day for some users —
   * and "today" with it, since todayIso goes through isoDate. The two Date
   * cases only bite away from UTC, which is why vitest.config.ts pins the
   * suite to New York: CI runs in UTC, where this bug cannot show. */
  it('keeps the local date near midnight and across DST', () => {
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(isoDate(new Date(2026, 8, 19, 23, 30))).toBe('2026-09-19');
    expect(isoDate(new Date(2026, 8, 19, 0, 30))).toBe('2026-09-19');
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
    /* A row named from the catalogue is replaced by the catalogue entry, whose
       description and images come from code, so stripping those rows alone
       never reached the default. Only a row the catalogue does not know
       exercises it, and one is added here for that reason. */
    const base = seedSnapshot();
    const legacy = base.exercises.map((e) => {
      const { description: _d, images: _i, ...rest } = e;
      return rest as (typeof base.exercises)[number];
    });
    const own = {
      id: 'own-1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      name: 'Sled Drag (own)',
      patternId: base.patterns[0]!.id,
      where: 'gym',
      tags: [],
    } as unknown as (typeof base.exercises)[number];

    const ix = index({ ...base, exercises: [...legacy, own] });

    for (const e of ix.exercises) {
      expect(Array.isArray(e.images)).toBe(true);
      expect(typeof e.description).toBe('string');
    }
    expect(ix.exerciseById.get('own-1')!.images).toEqual([]);
    expect(ix.exerciseById.get('own-1')!.description).toBe('');
    // The property that actually crashed.
    expect(() => ix.exercises.map((e) => e.images.length)).not.toThrow();
  });
});

describe('which of the week’s sessions are finished', () => {
  /* Drives the tick on the Train day tabs. The interesting cases are all about
     what "finished" must NOT mean. */
  /* The seeded snapshot has no program entries, so nothing is planned and
     nothing can be finished. A real week has to be generated first. */
  const seeded = seedSnapshot('sevenPattern', 3);
  const drafts = buildProgram(index(seeded), { days: 3, where: 'gym', bias: 'none' });
  const base = {
    ...seeded,
    entries: drafts.map((d, i) => ({
      ...d,
      id: `plan-${i}`,
      updatedAt: '2026-09-01T00:00:00.000Z',
      deletedAt: null,
    })),
  };
  const ix0 = index(base);

  /** Every planned exercise of one session, with `sets` logged against each. */
  const fullSession = (session: number, date: string, sets: number) =>
    programRows(ix0, 3)
      .filter((r) => r.session === session && r.exercise)
      .flatMap((r) =>
        logsFor(
          r.exercise!.id,
          Array.from({ length: sets }, () => ({ weight: 40, reps: 8, rir: 2 })),
          date,
        ).map((l) => ({ ...l, session: sessionLabel(session) })),
      );

  it('counts nothing as finished on an untouched week', () => {
    expect(sessionsDone(ix0, 3, WEEK_A)).toEqual([false, false, false]);
  });

  it('ticks a day whose every planned set is logged', () => {
    const ix = index({ ...base, logs: fullSession(0, '2026-09-08', 3) });
    expect(sessionsDone(ix, 3, WEEK_A)).toEqual([true, false, false]);
  });

  it('does not tick a day that is only part-done', () => {
    // Two of three sets on every exercise. Nearly finished is not finished.
    const ix = index({ ...base, logs: fullSession(0, '2026-09-08', 2) });
    expect(sessionsDone(ix, 3, WEEK_A)).toEqual([false, false, false]);

    // Every set of every exercise but one: one skipped exercise is not a
    // finished day either. The case above cannot tell "every" from "some".
    const full = fullSession(0, '2026-09-08', 3);
    const skip = full[0]!.exerciseId;
    expect(
      sessionsDone(index({ ...base, logs: full.filter((l) => l.exerciseId !== skip) }), 3, WEEK_A),
    ).toEqual([false, false, false]);
  });

  it('looks across the whole week, not one date', () => {
    /* You trained Day A on Tuesday and you are looking at the app on Thursday.
       Scoped to the selected date, every tab would read as unfinished the moment
       you paged the date forward — which is most of the week. */
    const ix = index({ ...base, logs: fullSession(0, '2026-09-08', 3) });
    expect(sessionsDone(ix, 3, WEEK_A)[0]).toBe(true);

    // …and the week boundary still holds: last week's work does not tick this
    // week's tabs.
    expect(sessionsDone(ix, 3, WEEK_B)).toEqual([false, false, false]);
  });

  it('never ticks a day with nothing planned', () => {
    // `done >= target` is trivially true when the target is zero, so an empty
    // day would arrive pre-ticked. Nothing to do is not the same as done.
    const empty = index({ ...base, entries: [] });
    expect(sessionsDone(empty, 3, WEEK_A)).toEqual([false, false, false]);
  });
});
