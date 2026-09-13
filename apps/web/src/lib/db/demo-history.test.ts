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
  type Indexed,
  type Snapshot,
} from '@athletic/domain';
import { DEMO_WEEKS, demoHistory, type DemoPlanEntry } from './demo-history';

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
const triage = attention(summary, today, 20);
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
