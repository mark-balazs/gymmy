import { describe, expect, it } from 'vitest';
import {
  SEED_EXERCISES,
  SEED_PATTERNS,
  attention,
  buildProgram,
  buildSlots,
  findSplit,
  index,
  mondayOf,
  progressSummary,
  strengthSeries,
  type Indexed,
  type Snapshot,
} from '@athletic/domain';
import { DEMO_WEEKS, bodyWeightFor, demoHistory, type DemoPlanEntry } from './demo-history';

/**
 * The demo account is the one account we know will be looked at, and what makes
 * it worth looking at is that things went wrong on it. A generator where every
 * lift climbs forever renders the Progress page's lead section empty on exactly
 * the account we use to sell the page.
 *
 * So these assert the *shape* of the history rather than its numbers: that a
 * lift has stalled, one has slid, one has been left alone. They run the real
 * `attention()` over the real generated sets, because a test that re-derived
 * the thresholds here would agree with itself while the page stayed blank.
 *
 * The plan is built the way `seed-user` builds it — same split, same generator
 * — so if the program builder ever stops picking the lifts the arcs are
 * attached to, this fails rather than quietly reverting to the old behaviour.
 */

const today = mondayOf(new Date());
const now = new Date().toISOString();
let n = 0;
const id = (p: string) => `${p}-${++n}`;

function demoAccount(): { ix: Indexed; plan: DemoPlanEntry[] } {
  const patterns = SEED_PATTERNS.map((p, i) => ({
    id: id('pat'),
    updatedAt: now,
    deletedAt: null,
    key: p.key,
    name: p.key,
    role: p.role,
    counts: p.counts,
    position: i,
  }));
  const patternIdByKey = new Map(patterns.map((p) => [p.key, p.id]));

  const exercises = SEED_EXERCISES.map((x) => ({
    id: id('ex'),
    updatedAt: now,
    deletedAt: null,
    name: x.name,
    patternId: patternIdByKey.get(x.pattern)!,
    where: x.where,
    tags: x.tags,
    description: x.description,
    images: x.images,
  }));

  const split = findSplit('sevenPattern')!;
  const slots = buildSlots(split, split.defaultDays).map((s) => ({
    ...s,
    id: id('slot'),
    updatedAt: now,
    deletedAt: null,
  }));

  const base: Snapshot = {
    patterns,
    exercises,
    slots,
    splitPeriods: [
      {
        id: id('period'),
        updatedAt: now,
        deletedAt: null,
        split: split.key,
        days: split.defaultDays,
        startWeek: today,
        patternKeys: [...split.covers],
      },
    ],
    entries: [],
    logs: [],
    refSets: [],
    bodyLogs: [],
    goals: [],
    profile: null,
  };

  const entries = buildProgram(index(base), {
    days: split.defaultDays,
    where: 'gym',
    bias: 'none',
  }).map((d) => ({ ...d, id: id('entry'), updatedAt: now, deletedAt: null }));

  const withPlan = index({ ...base, entries });
  const plan: DemoPlanEntry[] = entries.flatMap((e) => {
    const exercise = e.exerciseId ? withPlan.exerciseById.get(e.exerciseId) : null;
    if (!e.exerciseId || !exercise) return [];
    return [
      {
        sessionIndex: e.sessionIndex,
        exerciseId: e.exerciseId,
        name: exercise.name,
        patternKey: withPlan.patternById.get(exercise.patternId)?.key ?? null,
        sets: e.sets,
      },
    ];
  });

  const { sets, weights } = demoHistory(plan, today);

  return {
    ix: index({
      ...base,
      entries,
      logs: sets.map((s) => ({ ...s, id: id('log'), updatedAt: now, deletedAt: null, note: '' })),
      bodyLogs: weights.map((b) => ({
        ...b,
        id: id('bw'),
        updatedAt: now,
        deletedAt: null,
        note: '',
      })),
    }),
    plan,
  };
}

const { ix, plan } = demoAccount();
const summary = progressSummary(ix, {
  from: '1970-01-01',
  to: today,
  sessions: findSplit('sevenPattern')!.defaultDays,
});
/* Every chartable lift, so the demo's arcs can be asserted. A real account
   sees none of this without setting a goal — the gate is tested in the domain
   suite; what this file is about is whether the generated history has the
   shape the page would report IF asked. */
const triage = attention(summary, today, {
  limit: 20,
  growing: new Set(summary.map((s) => s.exercise.id)),
});
const kinds = triage.map((a) => a.kind);
const byName = (name: string) => summary.find((p) => p.exercise.name === name);
const verdictOn = (name: string) => triage.find((a) => a.progress.exercise.name === name)?.kind;

describe('the demo history', () => {
  it('logs sets and nothing else', () => {
    // Every number the Progress page shows is derived back out of these, the
    // same way it is for a real account. Nothing pre-computed is stored.
    const { sets } = demoHistory(plan, today);
    expect(sets.length).toBeGreaterThan(500);
    for (const s of sets.slice(0, 50)) {
      expect(Object.keys(s).sort()).toEqual([
        'date',
        'exerciseId',
        'reps',
        'rir',
        'session',
        'setNo',
        'weight',
      ]);
    }
  });

  it('is the same history every time it is generated', () => {
    // The seed re-runs on every sign-in. A second run that disagreed with the
    // first about what happened in March would leave the account half-rewritten.
    expect(demoHistory(plan, today)).toEqual(demoHistory(plan, today));
  });

  it('gives the Progress page something to lead with', () => {
    // The point of the whole exercise. If this is empty, the page's first
    // section renders blank on the one account anybody will ever open.
    expect(kinds).toContain('regressed');
    expect(kinds).toContain('stalled');
    expect(kinds).toContain('dormant');
  });

  it('does not flag most of the account at once', () => {
    // A page that says nine of your eleven lifts need a look is a page nobody
    // acts on. This is the assertion that catches a threshold loose enough to
    // fire on ordinary training, which unit fixtures are too tidy to show.
    const chartable = summary.filter((p) => p.metric !== null).length;
    expect(kinds.length).toBeLessThanOrEqual(Math.ceil(chartable / 2));
    expect(kinds.filter((k) => k === 'stalled').length).toBeLessThanOrEqual(3);
  });

  it('has a lift that went backwards and has not come back', () => {
    const lunge = byName('Reverse Lunge');
    expect(verdictOn('Reverse Lunge')).toBe('regressed');
    expect(lunge?.drawdown?.pct).toBeLessThanOrEqual(-10);
    // Every demo set records reps in reserve, so there is no excuse for the
    // comparison being unfair — if this ever goes false the generator has
    // stopped rating something and the verdict would be silently dropped.
    expect(lunge?.drawdown?.confident).toBe(true);
  });

  it('has a lift that stopped moving months ago', () => {
    const bench = byName('Barbell Bench Press');
    expect(verdictOn('Barbell Bench Press')).toBe('stalled');
    // Still trained every week — a stall is not the same thing as having
    // stopped, and the two verdicts want different answers from the user.
    expect(bench?.daysSince).toBeLessThan(14);
    expect(bench?.sessionsSinceBest).toBeGreaterThanOrEqual(6);
  });

  it('has a planned lift nobody has touched in over a month', () => {
    const tricep = byName('Overhead Tricep Extension');
    expect(verdictOn('Overhead Tricep Extension')).toBe('dormant');
    expect(tricep?.inPlan).toBe(true);
    expect(tricep?.daysSince).toBeGreaterThanOrEqual(28);
  });

  it('has a lift that only appears partway through the block', () => {
    const stepUp = byName('Step-Up')!;
    // Another lift on the same day, so the comparison is about when each was
    // introduced rather than which weekday it falls on.
    const row = byName('Barbell Row')!;
    expect(stepUp.sessions.length).toBeGreaterThan(3);
    expect(stepUp.sessions.length).toBeLessThan(row.sessions.length / 2);
    // Its line starts months after the block does, which is the case the
    // chart's time-proportional axis exists to draw honestly.
    const weeksLate =
      (Date.parse(stepUp.sessions[0]!.date) - Date.parse(row.sessions[0]!.date)) /
      (7 * 24 * 60 * 60 * 1000);
    expect(weeksLate).toBeGreaterThanOrEqual(8);
  });

  it('has a lift with real gaps in it', () => {
    // Trained about two weeks in three, so consecutive sessions are sometimes
    // a fortnight apart — what the chart draws as a dotted connector.
    const row = byName('Chest-Supported Row')!;
    const gaps = row.sessions
      .slice(1)
      .map(
        (s, i) => (Date.parse(s.date) - Date.parse(row.sessions[i]!.date)) / (24 * 60 * 60 * 1000),
      );
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(14);
    expect(row.sessions.length).toBeLessThan(DEMO_WEEKS - 4);
  });

  it('does not move every lift on the same day by the same amount', () => {
    // The tell that one curve drew all of them: two different exercises whose
    // week-on-week percentage changes match step for step.
    const shape = (name: string) =>
      byName(name)!
        .sessions.slice(1)
        .map((s, i) => Math.sign(s.value - byName(name)!.sessions[i]!.value))
        .join('');
    expect(shape('Goblet Squat')).not.toBe(shape('Trap Bar Deadlift'));
  });

  it('keeps the weights plausible for the movement', () => {
    // A deadlift and a lateral raise sharing a number is the tell that the
    // generator lost track of what it was filling.
    const top = (name: string) => byName(name)?.topSet?.weight ?? 0;
    expect(top('Trap Bar Deadlift')).toBeGreaterThan(top('Goblet Squat'));
    expect(top('Goblet Squat')).toBeGreaterThan(top('Hammer Curl'));
  });
});

/**
 * The longest run of consecutive weeks whose score stays within `tolerance`.
 *
 * Callers measure it over a *prefix* of the block rather than the whole of it,
 * and that is the point. A flat tail is not a plateau — it is where the chart
 * happens to end — and the generator that had no plateau anywhere already had
 * one of those, so a test looking at the whole series would have passed against
 * exactly the thing it exists to rule out.
 */
function longestFlatRun(scores: number[], tolerance: number): number {
  let best = 1;
  for (let a = 0; a < scores.length; a++) {
    for (let b = a + 1; b < scores.length; b++) {
      const seg = scores.slice(a, b + 1);
      const lo = Math.min(...seg);
      if (Math.max(...seg) - lo > lo * tolerance) break;
      best = Math.max(best, b - a + 1);
    }
  }
  return best;
}

describe('the demo strength score', () => {
  const scores = strengthSeries(ix, mondayOf(ix.logs[0]!.date), DEMO_WEEKS, {
    unit: 'kg',
    sex: 'male',
    birthYear: null,
  })
    .map((p) => p.score)
    .filter((n): n is number => n !== null);

  it('has a couple of months in the middle where nothing moved', () => {
    /* Every lift used to ride its own smooth ramp, and the sum of five of them
       climbed in eighteen weeks out of twenty-one. A strength score that rises
       almost every week for five months is the one shape no real chart has.
       This asserts a shared plateau exists, and that it sits somewhere the
       person would have lived through rather than at the end. */
    const middle = scores.slice(0, Math.ceil(scores.length * 0.75));
    expect(longestFlatRun(middle, 0.01)).toBeGreaterThanOrEqual(6);
  });

  it('still ends up meaningfully stronger than it started', () => {
    // The other half of it. A plateau is only honest if the block around it
    // went somewhere, and a demo whose headline number never moves shows
    // nothing at all.
    const first = scores[0]!;
    const last = scores[scores.length - 1]!;
    expect(last / first).toBeGreaterThan(1.08);
    // And not a novice's five months, which is what adding a fifth to every
    // pattern at once would be describing.
    expect(last / first).toBeLessThan(1.25);
  });
});

describe('the demo bodyweight', () => {
  it('does not repeat the same wobble every six weeks', () => {
    /* It was a straight drift plus a six-entry array indexed by `w % 6`, so the
       chart drew one zigzag five times over. The week-on-week *change* is what
       exposes that: with a period-six wobble, the step from week w to w+1 is
       identical to the step from w+6 to w+7, for every week the trend is
       straight. Comparing the six-week-apart weights instead would not catch
       it — the drift cancels and the flat tail supplies variety of its own,
       which is how the first version of this test passed against the bug. */
    const step = (w: number) => bodyWeightFor(w + 1) - bodyWeightFor(w);
    const echoes = Array.from(
      { length: DEMO_WEEKS - 7 },
      (_, w) => Math.abs(step(w + 6) - step(w)) < 0.05,
    ).filter(Boolean).length;
    expect(echoes).toBeLessThan(3);
  });

  it('loses weight quickly and then keeps drifting', () => {
    const first = bodyWeightFor(0);
    const half = bodyWeightFor(Math.floor(DEMO_WEEKS / 2));
    expect(first - half).toBeGreaterThan(1.5);
    expect(first - bodyWeightFor(DEMO_WEEKS - 1)).toBeLessThan(5);

    /* And it does not stop dead. `Math.min(w, 14) * 0.2` meant the trend was
       exactly, permanently flat from week fourteen, with only the repeating
       wobble on top — so these two three-week averages came out the wrong way
       round. Averaged rather than compared point to point, because a single
       week is mostly wobble. */
    const mean = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => bodyWeightFor(from + i)).reduce(
        (a, b) => a + b,
        0,
      ) /
      (to - from);
    expect(mean(14, 17)).toBeGreaterThan(mean(19, 22));
  });
});
