import { describe, expect, it } from 'vitest';
import {
  attention,
  drawdownOf,
  findSplit,
  metricFor,
  progressSummary,
  type ExerciseProgress,
  type SessionPoint,
  type SetLog,
} from '../src';
import { seedSnapshot } from './fixture';
import { index } from '../src/model';

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

  it('does not call one bad day a regression', () => {
    // Peaked, dipped hard for a single session, came back. Comparing the last
    // point alone would read this as −10%; comparing recent form reads it as
    // what it is, which is a Tuesday.
    expect(drawdownOf(series([100, 105, 110, 99, 110]))).toBeNull();
  });

  it('reports a slide that has lasted', () => {
    const d = drawdownOf(series([100, 110, 120, 106, 105, 107]));
    expect(d).not.toBeNull();
    expect(d!.best).toBe(120);
    // Recent form is the *best* of the last three, not the last point — being
    // judged on your worst recent session would be the same unfairness again.
    expect(d!.form).toBe(107);
    expect(d!.pct).toBe(-11);
  });

  it('marks the comparison unfair when one end is unrated', () => {
    // est1RM scores an unrated set as taken to failure, so it reads lower for
    // reasons that have nothing to do with strength.
    const rated = [true, true, true, false, false, false];
    expect(drawdownOf(series([100, 110, 120, 106, 105, 107], { rated }))!.confident).toBe(false);
    expect(drawdownOf(series([100, 110, 120, 106, 105, 107]))!.confident).toBe(true);
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

describe('a lift trained above the estimate ceiling', () => {
  /* `est1RM` stops estimating above twelve reps, which means a set can now be
     real training that produces no point on any chart. Two things downstream
     used to assume those were the same thing. */
  const base = seedSnapshot();
  const ix0 = index(base);
  const bench = ix0.exercises.find((e) => e.name === 'Barbell Bench Press')!;
  const sessions = findSplit('sevenPattern')!.defaultDays;

  const log = (date: string, weight: number, reps: number): SetLog => ({
    id: `l-${date}-${reps}`,
    updatedAt: `${date}T12:00:00.000Z`,
    deletedAt: null,
    date,
    session: 'A',
    exerciseId: bench.id,
    setNo: 1,
    weight,
    reps,
    rir: 0,
    note: '',
  });

  const summarise = (logs: SetLog[]) =>
    progressSummary(index({ ...base, logs }), {
      from: '2026-01-01',
      to: '2026-09-14',
      sessions,
    }).find((p) => p.exercise.id === bench.id)!;

  it('still says when it was last trained', () => {
    /* Read off the chart, "last trained" freezes on the last heavy day while
       somebody is in the gym doing the lift — and drifts into "not trained in
       three weeks", which is the one verdict that needs no goal and so would be
       said unprompted. */
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
    /* A movement only ever trained for high reps would otherwise get the right
       axis label over an empty chart. Falling back to the heaviest set is the
       same demotion isolation already gets, for the same reason. */
    const p = summarise([log('2026-08-01', 50, 20), log('2026-09-10', 60, 25)]);
    expect(p.metric).toBe('weight');
    expect(p.sessions.map((s) => s.value)).toEqual([50, 60]);
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
    // The empty state is the most useful thing this page says on most days.
    expect(attention([progress({ sessions: series([100, 104, 108, 112]) })], '2026-09-13')).toEqual(
      [],
    );
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
  });

  it('notices a planned lift you have stopped doing', () => {
    const p = progress({
      sessions: series([100, 104, 108, 112], { from: '2026-06-01' }),
      daysSince: 40,
    });
    const [first] = attention([p], '2026-09-13', { growing });
    expect(first?.kind).toBe('dormant');
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
  });
});
