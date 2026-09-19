import { describe, expect, it } from 'vitest';
import {
  attention,
  coveragePatterns,
  drawdownOf,
  findSplit,
  metricFor,
  patternWeeks,
  progressSummary,
  recentWeeks,
  type ExerciseProgress,
  type SessionPoint,
  type SetLog,
} from '../src';
import { logsFor, period, seedSnapshot } from './fixture';
import { addDays, index } from '../src/model';

/** One point per training day, oldest first — the shape `sessionsOf` produces. */
const series = (
  values: number[],
  opts: { rated?: boolean[]; from?: string; everyDays?: number } = {},
): SessionPoint[] => {
  let best = -Infinity;
  return values.map((value, i) => {
    const peak = value > best;
    if (peak) best = value;
    const d = new Date(`${opts.from ?? '2026-04-06'}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * (opts.everyDays ?? 7));
    return {
      date: d.toISOString().slice(0, 10),
      value,
      sets: 3,
      peak,
      rated: opts.rated?.[i] ?? true,
    };
  });
};

describe('drawdownOf', () => {
  it('says nothing when the best session is a recent one', () => {
    // Still climbing. There is no gap between "your best" and "what you lift
    // now" to report, because they are the same session.
    expect(drawdownOf(series([100, 102, 104, 106]))).toBeNull();
  });

  it('says nothing while the best is one of the last three sessions', () => {
    // The best (110) is two sessions back, so there is nothing to compare it
    // against yet: it is itself part of recent form. The edge of that window.
    expect(drawdownOf(series([100, 105, 110, 99, 110]))).toBeNull();
  });

  it('does not call one bad day a regression', () => {
    // Peaked, then one hard dip in the latest session. Comparing the last point
    // alone would read this as −12%; comparing recent form reads it as what it
    // is, which is a Tuesday.
    const d = drawdownOf(series([100, 110, 120, 119, 118, 105]))!;
    expect(d.form).toBe(119);
    expect(d.pct).toBe(-1);
  });

  it('reports a slide that has lasted', () => {
    const s = series([100, 110, 120, 107, 105, 106]);
    const d = drawdownOf(s);
    expect(d).not.toBeNull();
    expect(d!.best).toBe(120);
    // Recent form is the *best* of the last three, not the last point — being
    // judged on your worst recent session would be the same unfairness again.
    // The best of the three is the oldest of them here, so the two rules differ.
    expect(d!.form).toBe(107);
    expect(d!.pct).toBe(-11);
    expect(d!.formDate).toBe(s[3]!.date);
  });

  it('marks the comparison unfair when one end is unrated', () => {
    // est1RM scores an unrated set as taken to failure, so it reads lower for
    // reasons that have nothing to do with strength.
    const v = [100, 110, 120, 106, 105, 107];
    const rated = [true, true, true, false, false, false];
    expect(drawdownOf(series(v, { rated }))!.confident).toBe(false);
    expect(drawdownOf(series(v))!.confident).toBe(true);
    // The rule is that the two ends agree, in either direction. Somebody who
    // never rates is compared fairly against themselves.
    expect(drawdownOf(series(v, { rated: v.map(() => false) }))!.confident).toBe(true);
    expect(
      drawdownOf(series(v, { rated: [false, false, false, true, true, true] }))!.confident,
    ).toBe(false);
  });

  it('has nothing to say about a single session', () => {
    expect(drawdownOf(series([100]))).toBeNull();
  });
});

describe('metricFor', () => {
  const ix = index(seedSnapshot());
  const of = (key: string) => ix.patterns.find((p) => p.key === key) ?? null;

  it('gives carries and rotation no chart at all', () => {
    // Their reps are metres and seconds. An estimated 1RM from them is not a
    // number about strength.
    expect(metricFor(of('carry'))).toBeNull();
    expect(metricFor(of('rotate'))).toBeNull();
  });

  it('measures isolation by the weight on the bar', () => {
    // Ten to fifteen reps is outside the range Epley was fitted for.
    expect(metricFor(of('isolation'))).toBe('weight');
  });

  it('measures the big patterns by estimated 1RM', () => {
    for (const key of ['squat', 'hinge', 'lunge', 'push', 'pull']) {
      expect(metricFor(of(key))).toBe('e1rm');
    }
  });
});

describe('progressSummary', () => {
  const base = seedSnapshot();
  const ix0 = index(base);
  const bench = ix0.exercises.find((e) => e.name === 'Barbell Bench Press')!;
  const sessions = findSplit('sevenPattern')!.defaultDays;

  const log = (
    date: string,
    weight: number,
    reps: number,
    rir: number | null = 0,
    setNo = 1,
  ): SetLog => ({
    id: `l-${date}-${weight}-${reps}-${setNo}`,
    updatedAt: `${date}T12:00:00.000Z`,
    deletedAt: null,
    date,
    session: 'A',
    exerciseId: bench.id,
    setNo,
    weight,
    reps,
    rir,
    note: '',
  });

  const summarise = (logs: SetLog[]) =>
    progressSummary(index({ ...base, logs }), {
      from: '2026-01-01',
      to: '2026-09-14',
      sessions,
    }).find((p) => p.exercise.id === bench.id)!;

  it('reads only the window it was given', () => {
    /* The Progress page passes the last twelve weeks, and the triage relies on
       it. A March best outside the window must not turn a lift climbing now
       into a regression, and a set after `to` must not become the last one. */
    const weekly = Array.from({ length: 15 }, (_, i) =>
      log(addDays('2026-06-01', 7 * i), 90 + i, 1),
    );
    const ix = index({
      ...base,
      logs: [log('2026-03-02', 130, 1), ...weekly, log('2026-09-20', 150, 1)],
    });
    const of = (from: string) =>
      progressSummary(ix, { from, to: '2026-09-14', sessions }).find(
        (p) => p.exercise.id === bench.id,
      )!;

    const recent = of('2026-06-15');
    expect(recent.sessions.every((s) => s.date >= '2026-06-15' && s.date <= '2026-09-14')).toBe(
      true,
    );
    expect(recent.lastDate).toBe('2026-09-07');
    expect(recent.drawdown).toBeNull();
    expect(attention([recent], '2026-09-14', { growing: new Set([bench.id]) })).toEqual([]);
    // The same history read from January does reach the March best.
    expect(of('2026-01-01').drawdown!.pct).toBeLessThan(-5);
  });

  it('judges a day rated by the set that made its number', () => {
    /* An unrated back-off set must not make a rated top set unfair. Judged by
       the whole day instead, one unlogged effort on a back-off set would drop
       a regression verdict the user asked for with a goal. */
    const ratedTop = summarise([
      log('2026-08-01', 100, 5, 2, 1),
      log('2026-08-01', 80, 5, null, 2),
    ]);
    expect(ratedTop.sessions[0]!.rated).toBe(true);
    const unratedTop = summarise([
      log('2026-08-01', 100, 5, null, 1),
      log('2026-08-01', 80, 5, 2, 2),
    ]);
    expect(unratedTop.sessions[0]!.rated).toBe(false);
  });

  describe('a lift trained above the estimate ceiling', () => {
    /* `est1RM` stops estimating once reps plus reps in reserve exceed ten
       (MAX_EST_REPS_TO_FAILURE), which means a set can now be real training
       that produces no point on any chart. Two things downstream used to assume
       those were the same thing. */

    it('still says when it was last trained', () => {
      /* Read off the chart, "last trained" freezes on the last heavy day while
         somebody is in the gym doing the lift — and drifts into "not trained in
         three weeks", which is the one verdict that needs no goal and so would
         be said unprompted. */
      const p = summarise([log('2026-08-01', 100, 5), log('2026-09-10', 60, 20)]);
      expect(p.lastDate).toBe('2026-09-10');
      expect(p.daysSince).toBeLessThan(21);
    });

    it('charts the heavy days and simply leaves the rest off the line', () => {
      const p = summarise([log('2026-08-01', 100, 5), log('2026-09-10', 60, 20)]);
      expect(p.metric).toBe('e1rm');
      expect(p.sessions.map((s) => s.date)).toEqual(['2026-08-01']);
    });

    it('measures by the weight on the bar when nothing can be estimated', () => {
      /* A movement only ever trained for high reps would otherwise get the
         right axis label over an empty chart. Falling back to the heaviest set
         is the same demotion isolation already gets, for the same reason. */
      const p = summarise([log('2026-08-01', 50, 20), log('2026-09-10', 60, 25)]);
      expect(p.metric).toBe('weight');
      expect(p.sessions.map((s) => s.value)).toEqual([50, 60]);
    });
  });
});

describe('the pattern grid', () => {
  it('marks each week against the split in force that week', () => {
    /* A split change is not applied to the weeks before it. A carry done under
       the seven-pattern split was asked for; the same carry the week after a
       move to push/pull/legs was not, and the grid has to say both. Isolation
       is not a counted pattern, so it gets no row at all. */
    const snap = seedSnapshot('sevenPattern');
    const ix0 = index(snap);
    const carry = ix0.exercises.find((e) => e.name === "Farmer's Carry")!;
    const curl = ix0.exercises.find((e) => e.name === 'DB Curl')!;
    const ix = index({
      ...snap,
      splitPeriods: [period('sevenPattern', '2026-09-07'), period('pushPullLegs', '2026-09-14')],
      logs: [
        ...logsFor(carry.id, [{ weight: 40, reps: 30, rir: 2 }], '2026-09-08'),
        ...logsFor(carry.id, [{ weight: 40, reps: 30, rir: 2 }], '2026-09-15'),
        ...logsFor(curl.id, [{ weight: 10, reps: 12, rir: 2 }], '2026-09-08'),
      ],
    });
    const weeks = recentWeeks('2026-09-16', 2);
    expect(weeks).toEqual(['2026-09-07', '2026-09-14']);

    const grid = patternWeeks(ix, weeks, (w) =>
      coveragePatterns(ix, w).flatMap((p) => (p.key ? [p.key] : [])),
    );
    expect(grid.find((r) => r.pattern.key === 'carry')!.weeks).toEqual([
      { weekOf: '2026-09-07', sets: 1, wanted: true },
      { weekOf: '2026-09-14', sets: 1, wanted: false },
    ]);
    expect(grid.some((r) => r.pattern.key === 'isolation')).toBe(false);
  });
});

describe('attention', () => {
  const ix = index(seedSnapshot());
  const exercise = ix.exercises[0]!;
  const pattern = ix.patternById.get(exercise.patternId) ?? null;

  /* The permission slip. Progression verdicts are gated on a live goal for
     the lift, so a test that wants one has to say so — which is the whole
     behaviour, expressed as an argument. */
  const growing = new Set([exercise.id]);

  const progress = (over: Partial<ExerciseProgress>): ExerciseProgress => {
    const sessions = over.sessions ?? [];
    return {
      exercise,
      pattern,
      metric: 'e1rm',
      sessions,
      topSet: null,
      totalSets: sessions.length * 3,
      lastDate: sessions.at(-1)?.date ?? null,
      daysSince: 0,
      drawdown: drawdownOf(sessions),
      sessionsSinceBest: 0,
      inPlan: true,
      ...over,
    };
  };

  it('stays quiet when nothing is wrong', () => {
    /* The empty state is the most useful thing this page says on most days. A
       dip inside week-to-week noise is not a verdict, even on a lift with a
       goal: the quiet here has to come from the judgement, not from the goal
       gate or from a series still climbing, which is all this test used to
       show. */
    const p = progress({ sessions: series([100, 110, 120, 116, 115, 116]) });
    expect(p.drawdown!.pct).toBe(-3);
    expect(attention([p], '2026-09-13', { growing })).toEqual([]);
  });

  it('calls a 5% drop a regression, exactly at the line', () => {
    // "A confident drawdown of 5% or worse": the line itself is inside.
    const p = progress({ sessions: series([100, 110, 120, 114, 113, 114]) });
    expect(p.drawdown!.pct).toBe(-5);
    expect(attention([p], '2026-09-13', { growing }).map((a) => a.kind)).toEqual(['regressed']);
  });

  it('will not accuse you on an unfair comparison', () => {
    const rated = [true, true, true, false, false, false];
    const p = progress({ sessions: series([100, 110, 120, 100, 101, 100], { rated }) });
    expect(p.drawdown!.pct).toBeLessThan(-5);
    expect(attention([p], '2026-09-13', { growing })).toEqual([]);
  });

  it('has no verdict for a movement with no metric', () => {
    const p = progress({ metric: null, sessions: series([100, 110, 120, 100, 101, 100]) });
    expect(attention([p], '2026-09-13', { growing })).toEqual([]);
  });

  it('calls a sustained slide a regression', () => {
    const p = progress({ sessions: series([100, 110, 120, 100, 101, 100]) });
    const [first] = attention([p], '2026-09-13', { growing });
    expect(first?.kind).toBe('regressed');
  });

  it('calls a long flat stretch a stall', () => {
    // Same number, week after week, for two months and nine attempts. That is
    // the lift having stopped, not the calendar.
    const p = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120], {
        from: '2026-05-04',
      }),
      sessionsSinceBest: 9,
    });
    const [first] = attention([p], '2026-09-13', { growing });
    expect(first?.kind).toBe('stalled');
    expect(first?.weeksSinceBest).toBeGreaterThanOrEqual(8);
  });

  it('does not call ordinary training a stall', () => {
    // The rule that shipped first flagged nine lifts out of eleven on an
    // account that was training perfectly well. Each of these is a stall under
    // that rule and is not one under this rule, which is the whole difference.

    // Five weeks at the same number, trained every one of them. A month at the
    // same weight is a month — and anything loaded off a 5 kg stack physically
    // cannot move faster than that.
    const recentPeak = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120], { from: '2026-07-20' }),
      sessionsSinceBest: 5,
      daysSince: 0,
    });
    expect(attention([recentPeak], '2026-09-13', { growing })).toEqual([]);

    // Long enough ago, but trained fortnightly, so it has only been attempted
    // five times since. Five attempts is not enough to have established that
    // anything is stuck.
    const fewAttempts = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120], {
        from: '2026-06-08',
        everyDays: 14,
      }),
      sessionsSinceBest: 5,
      daysSince: 0,
    });
    expect(fewAttempts.drawdown).not.toBeNull();
    expect(attention([fewAttempts], '2026-09-13', { growing })).toEqual([]);

    // Nine attempts, but the best is only seven weeks old, so the time
    // threshold alone refuses it. Both cases above stop at the attempts.
    const sevenWeeks = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120], {
        from: '2026-07-10',
        everyDays: 5,
      }),
      sessionsSinceBest: 9,
    });
    expect(attention([sevenWeeks], '2026-09-13', { growing })).toEqual([]);
  });

  it('calls it a stall from the eighth week', () => {
    // The other side of the seven-week case: the same nine attempts, a week
    // older. With the long stall above, any threshold up to sixteen passed.
    const eightWeeks = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120], {
        from: '2026-07-03',
        everyDays: 5,
      }),
      sessionsSinceBest: 9,
    });
    const [first] = attention([eightWeeks], '2026-09-13', { growing });
    expect(first?.kind).toBe('stalled');
    expect(first?.weeksSinceBest).toBe(8);
  });

  it('notices a planned lift you have stopped doing', () => {
    const p = progress({
      sessions: series([100, 104, 108, 112], { from: '2026-06-01' }),
      daysSince: 40,
    });
    const [first] = attention([p], '2026-09-13', { growing });
    expect(first?.kind).toBe('dormant');
  });

  it('calls it dormant from the twenty-first day', () => {
    // Three weeks, counted inclusively. Every other case sits at 40 days or at
    // none, which any threshold between passes.
    const at = (daysSince: number) =>
      attention(
        [progress({ sessions: series([100, 104, 108, 112], { from: '2026-06-01' }), daysSince })],
        '2026-09-13',
      ).map((a) => a.kind);
    expect(at(21)).toEqual(['dormant']);
    expect(at(20)).toEqual([]);
  });

  it('calls a lift you walked away from dormant, not stuck', () => {
    /* It qualifies as both: flat for months, and untouched for six weeks. But
       "stuck" means you keep turning up and it will not move, and that claim
       needs you to have turned up. Reported the other way round it reads "no
       higher than June, and 0 sessions since then" — nonsense, and it buries
       the only useful thing to say, which is that it is still in your week and
       you are not doing it. */
    const p = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120, 120], { from: '2026-05-04' }),
      sessionsSinceBest: 6,
      daysSince: 42,
    });
    // Genuinely a stall by every other measure — which is what makes the
    // ordering the thing under test rather than the thresholds.
    expect(p.drawdown?.confident).toBe(true);
    expect(attention([p], '2026-09-13', { growing }).map((x) => x.kind)).toEqual(['dormant']);
  });

  it('does not nag about something you dropped from the plan', () => {
    const p = progress({
      sessions: series([100, 104, 108, 112], { from: '2026-06-01' }),
      daysSince: 40,
      inPlan: false,
    });
    expect(attention([p], '2026-09-13', { growing })).toEqual([]);
  });

  it('shows a mix of kinds rather than three of the same', () => {
    // Three stalls in a row would bury the lift nobody has touched since July,
    // and those are different problems with different answers.
    const dormant = progress({
      sessions: series([100, 104, 108, 112], { from: '2026-06-01' }),
      daysSince: 40,
    });
    const stalled = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120, 120, 120], {
        from: '2026-05-04',
      }),
      sessionsSinceBest: 7,
    });
    const small = progress({ sessions: series([100, 110, 120, 112, 111, 112]) });
    const big = progress({ sessions: series([100, 110, 120, 90, 91, 90]) });

    expect(
      attention([dormant, stalled, small, big], '2026-09-13', { growing }).map((x) => x.kind),
    ).toEqual(['regressed', 'stalled', 'dormant']);
  });

  it('says nothing about growth until somebody asks it to', () => {
    /* The whole point of the gate, and the behaviour this file used to get
       wrong. Both of these are unambiguous by every other measure — a 17%
       slide, and two months flat across nine attempts — and with no goal on
       the lift the app has nothing to say about either.

       Telling somebody their bench press has stopped moving is a judgement
       about what they were trying to do, and the app does not know that.
       Aimed at somebody maintaining deliberately, or coming back from an
       injury, it costs motivation and buys nothing. */
    const slid = progress({ sessions: series([100, 110, 120, 100, 101, 100]) });
    const flat = progress({
      sessions: series([100, 110, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120], {
        from: '2026-05-04',
      }),
      sessionsSinceBest: 9,
    });

    expect(attention([slid, flat], '2026-09-13')).toEqual([]);

    // The evidence is still computed — the chart is honest description, and
    // only the *verdict* needed permission.
    expect(slid.drawdown!.pct).toBeLessThan(-5);

    // And with the goal, both come back.
    expect(attention([slid, flat], '2026-09-13', { growing }).map((a) => a.kind)).toEqual([
      'regressed',
      'stalled',
    ]);
  });

  it('still says what you planned and have not done, goal or no goal', () => {
    /* Dormancy is not a claim about growth. "This is in your week and you have
       not done it in three weeks" is an observation about the plan the user
       chose themselves, so it needs no permission — and it is the one thing
       here somebody would want to know either way. */
    const p = progress({
      sessions: series([100, 104, 108, 112], { from: '2026-06-01' }),
      daysSince: 40,
    });
    expect(attention([p], '2026-09-13').map((a) => a.kind)).toEqual(['dormant']);
  });

  it('takes the worst of a kind before the next-worst of that kind', () => {
    const small = progress({ sessions: series([100, 110, 120, 112, 111, 112]) });
    const big = progress({ sessions: series([100, 110, 120, 90, 91, 90]) });
    const picked = attention([small, big], '2026-09-13', { limit: 2, growing });
    expect(picked[0]!.progress.drawdown!.pct).toBeLessThan(picked[1]!.progress.drawdown!.pct);

    // Each kind has its own "worst", and it decides which lift survives the
    // limit: the longest stall, and the lift left longest.
    const flat = [100, 110, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120];
    const ten = progress({ sessions: series(flat, { from: '2026-06-15' }), sessionsSinceBest: 9 });
    const sixteen = progress({
      sessions: series(flat, { from: '2026-05-04' }),
      sessionsSinceBest: 9,
    });
    expect(
      attention([ten, sixteen], '2026-09-13', { limit: 2, growing }).map((a) => a.weeksSinceBest),
    ).toEqual([16, 10]);

    const s = series([100, 104, 108, 112], { from: '2026-06-01' });
    expect(
      attention(
        [progress({ sessions: s, daysSince: 25 }), progress({ sessions: s, daysSince: 60 })],
        '2026-09-13',
        { limit: 1 },
      )[0]!.progress.daysSince,
    ).toBe(60);
  });
});
