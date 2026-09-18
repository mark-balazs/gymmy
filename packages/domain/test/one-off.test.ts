import { describe, expect, it } from 'vitest';
import { buildProgram, lastSession } from '../src/coach';
import {
  OFF_PLAN_SESSION,
  index,
  nextSession,
  oneOffs,
  planDayOf,
  programRows,
  sessionsDone,
  weekCoverage,
} from '../src/model';
import type { SetLog } from '../src/types';
import { logsFor, seedSnapshot, withEntries } from './fixture';

/**
 * Training outside the plan — a CrossFit class, a deadlift test on a rest day —
 * logged as ordinary sets under `OFF_PLAN_SESSION`.
 *
 * The decisions these hold: it is training (it counts toward coverage and the
 * week's session count), it is never a day of the plan (nothing that turns a
 * label back into a day number may read it as one), and it is off-plan because
 * of how it was logged, not because of what the program happens to say now.
 */
const MONDAY = '2026-09-07';
const TUESDAY = '2026-09-08';

const base = seedSnapshot('sevenPattern', 3);
const planned = withEntries(
  base,
  buildProgram(index(base), { days: 3, where: 'gym', bias: 'none' }),
);
const ixPlanned = planned;

const named = (name: string) => ixPlanned.exercises.find((e) => e.name === name)!;

/** Sets under a given label, for an exercise, on a date. */
const logged = (
  name: string,
  session: string,
  date: string,
  sets = [{ weight: 60, reps: 5, rir: 2 }],
): SetLog[] => logsFor(named(name).id, sets, date).map((l) => ({ ...l, session }));

const withLogs = (logs: SetLog[]) =>
  index({ ...base, entries: planned.entries, logs } as Parameters<typeof index>[0]);

describe('the off-plan label', () => {
  it('is never read back as a day of the plan', () => {
    expect(planDayOf('A')).toBe(0);
    expect(planDayOf('F')).toBe(5);
    expect(planDayOf(OFF_PLAN_SESSION)).toBeNull();
    // Anything that is not a single letter is no day either — the old inline
    // `charCodeAt(0) - 65` turned '*' into day -23 and Train selected no tab.
    expect(planDayOf('*')).toBeNull();
    expect(planDayOf('AB')).toBeNull();
    expect(planDayOf('')).toBeNull();
  });

  it('fits the wire', () => {
    // The server accepts a session of one to four characters and answers
    // anything else with a 400 — which blocks a device's outbox for good.
    expect(OFF_PLAN_SESSION.length).toBeGreaterThanOrEqual(1);
    expect(OFF_PLAN_SESSION.length).toBeLessThanOrEqual(4);
  });
});

describe('opening Train on the right day', () => {
  it('is not sent to the last day by a set logged outside the plan', () => {
    /* The bug this exists to prevent. Read as a letter, 'X' is day 23, clamped
       to the last day — so one extra set logged first thing would have opened
       Day C all morning on a Monday when Day A was next. */
    const ix = withLogs(logged("Farmer's Carry", OFF_PLAN_SESSION, MONDAY));
    expect(nextSession(ix, MONDAY, 3)).toBe(0);
  });

  it('still resumes a planned day that was started the same morning', () => {
    const plannedName = programRows(ixPlanned, 3).find((r) => r.session === 1)!.exercise!.name;
    const ix = withLogs([
      ...logged(plannedName, 'B', MONDAY),
      ...logged('Kettlebell Swing', OFF_PLAN_SESSION, MONDAY),
    ]);
    expect(nextSession(ix, MONDAY, 3)).toBe(1);
  });

  it('does not count an off-plan set as having trained a day this week', () => {
    /* Monday's class is not Day A, so Tuesday should still offer Day A.

       Honest about what this is: a guard, not a proof. The old inline copy
       happened to get this half right — 'X' simply never matched a day label in
       the week's trained set — so reverting the fix leaves this green. It is
       here so that a later change which starts treating off-plan labels as
       days has something to fail. The test above is the one that proves it. */
    const ix = withLogs(logged('Kettlebell Swing', OFF_PLAN_SESSION, MONDAY));
    expect(nextSession(ix, TUESDAY, 3)).toBe(0);
  });
});

describe('what an off-plan set counts for', () => {
  it('ticks coverage, because training is training', () => {
    const before = weekCoverage(withLogs([]), MONDAY);
    const after = weekCoverage(
      withLogs(logged('Kettlebell Swing', OFF_PLAN_SESSION, MONDAY)),
      MONDAY,
    );
    expect(after.hit).toBe(before.hit + 1);
    expect(after.cells.find((c) => c.pattern.key === 'hinge')?.sets).toBeGreaterThan(0);
  });

  it('counts as a session in the week — the accepted inflation', () => {
    /* Decided, not overlooked: a one-off always counts. Extra sets on a day that
       also has a planned session therefore read as two sessions that day. */
    const plannedName = programRows(ixPlanned, 3).find((r) => r.session === 0)!.exercise!.name;
    const onlyPlanned = weekCoverage(withLogs(logged(plannedName, 'A', MONDAY)), MONDAY);
    const both = weekCoverage(
      withLogs([
        ...logged(plannedName, 'A', MONDAY),
        ...logged('Kettlebell Swing', OFF_PLAN_SESSION, MONDAY),
      ]),
      MONDAY,
    );
    expect(both.sessions).toBe(onlyPlanned.sessions + 1);
  });

  it('never ticks a planned day, even when it is the planned exercise', () => {
    /* The reason an off-plan set cannot simply be logged under whichever day tab
       is open: that would mark the day trained. Here the exact lift Day A plans
       is done outside the plan, and Day A must stay unticked. */
    const dayA = programRows(ixPlanned, 3).filter((r) => r.session === 0);
    const logs = dayA.flatMap((r) =>
      logged(r.exercise!.name, OFF_PLAN_SESSION, MONDAY, [
        { weight: 60, reps: 5, rir: 2 },
        { weight: 60, reps: 5, rir: 2 },
        { weight: 60, reps: 5, rir: 2 },
      ]),
    );
    expect(sessionsDone(withLogs(logs), 3, MONDAY)[0]).toBe(false);
  });

  it('is what "last time" shows, since it is the last time', () => {
    // A planned card's history line reads the most recent session of that lift,
    // wherever it was logged. Pretending the off-plan set had not happened would
    // prefill last month's numbers under somebody who did it on Saturday.
    const id = named('Kettlebell Swing').id;
    const ix = withLogs(
      logged('Kettlebell Swing', OFF_PLAN_SESSION, TUESDAY, [{ weight: 32, reps: 10, rir: 1 }]),
    );
    expect(lastSession(ix, id)?.weight).toBe(32);
  });
});

describe('reading back a day of off-plan training', () => {
  it('groups by exercise, in the order they were started', () => {
    const swing = logged('Kettlebell Swing', OFF_PLAN_SESSION, MONDAY, [
      { weight: 24, reps: 15, rir: 2 },
      { weight: 24, reps: 15, rir: 2 },
    ]).map((l, i) => ({ ...l, updatedAt: `2026-09-07T10:0${i}:00Z` }));
    const carry = logged('Suitcase Carry', OFF_PLAN_SESSION, MONDAY).map((l) => ({
      ...l,
      updatedAt: '2026-09-07T10:05:00Z',
    }));
    const out = oneOffs(withLogs([...carry, ...swing]), MONDAY);
    expect(out.map((o) => o.exercise.name)).toEqual(['Kettlebell Swing', 'Suitcase Carry']);
    expect(out[0]!.done).toBe(2);
    expect(out[0]!.logs.map((l) => l.setNo)).toEqual([1, 2]);
  });

  it('ignores planned sets and other dates', () => {
    const plannedName = programRows(ixPlanned, 3).find((r) => r.session === 0)!.exercise!.name;
    const ix = withLogs([
      ...logged(plannedName, 'A', MONDAY),
      ...logged('Kettlebell Swing', OFF_PLAN_SESSION, TUESDAY),
    ]);
    expect(oneOffs(ix, MONDAY)).toEqual([]);
    expect(oneOffs(ix, TUESDAY).map((o) => o.exercise.name)).toEqual(['Kettlebell Swing']);
  });

  it('does not depend on what the program says now', () => {
    /* Off-plan because of how it was logged, and that never changes. Deriving it
       from "not in any program entry" would turn last month's extra deadlifts
       into planned ones the day somebody rebuilt their week. */
    const logs = logged('Kettlebell Swing', OFF_PLAN_SESSION, MONDAY);
    const withPlan = oneOffs(withLogs(logs), MONDAY);
    const withoutPlan = oneOffs(
      index({ ...base, entries: [], logs } as Parameters<typeof index>[0]),
      MONDAY,
    );
    expect(withoutPlan.map((o) => o.exercise.name)).toEqual(withPlan.map((o) => o.exercise.name));
  });
});
