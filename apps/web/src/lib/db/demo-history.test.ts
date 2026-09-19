import { describe, expect, it } from 'vitest';
import {
  GOAL_HORIZONS,
  SEED_PATTERNS,
  addDays,
  daysBetween,
  toEntered,
  loadClassOf,
  attention,
  buildProgram,
  buildSlots,
  checkGoal,
  est1RM,
  findSplit,
  goalProgress,
  growingExercises,
  index,
  isLive,
  mondayOf,
  progressSummary,
  recentGainOf,
  strengthSeries,
  type Goal,
  type Indexed,
  type Snapshot,
} from '@athletic/domain';
import {
  DEMO_WEEKS,
  GOAL_DISTANCE,
  bodyWeightFor,
  demoGoals,
  demoHistory,
  type DemoPlanEntry,
} from './demo-history';
import { DEMO_LOADS } from './demo-loads';

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
 * The plan mirrors `seed-user` by hand — same split, same generator, variety 0
 * — so a change to the program builder or the catalogue that stops picking the
 * lifts the arcs are attached to fails here. It is a copy, though, and a copy
 * cannot see the seed drift away from it: `seed-demo.test.ts` holds the week
 * actually seeded to the same lifts.
 *
 * **Checked on many Mondays, not only today's.** The history is dated back
 * from the Monday it is seeded on, so a run checks one placement of the
 * calendar under its 22 weeks. A dated rule in the domain lands somewhere
 * different in the block every week: leaving out pull-ups logged before
 * `LOAD_CONVENTION_FROM` passed on the day it was written and broke the
 * plateau below when the suite ran between 2026-11-23 and 2026-12-13. So the
 * demo is built on every Monday from the week after that date until six weeks
 * after it has left the block, and on this week's, which is what a seed today
 * would write. `demoHistory` and `demoGoals` take the Monday as an argument;
 * nothing here reads the clock except to add this week.
 */

/** Every Monday from `from` to `to`, both included. */
function mondays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}
const MONDAYS = [...new Set([...mondays('2026-09-21', '2027-03-29'), mondayOf(new Date())])].sort();

let n = 0;
const id = (p: string) => `${p}-${++n}`;

function demoAccount(today: string): { ix: Indexed; plan: DemoPlanEntry[] } {
  // Stamped from the Monday rather than the clock, so a run on any day builds
  // the same account for it.
  const now = `${today}T12:00:00.000Z`;
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
  const split = findSplit('sevenPattern')!;
  const slots = buildSlots(split, split.defaultDays).map((s) => ({
    ...s,
    id: id('slot'),
    updatedAt: now,
    deletedAt: null,
  }));

  const base: Snapshot = {
    patterns,
    // None, as seeded: the library is the catalogue, which `index()` supplies.
    exercises: [],
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
    bodyLogs: [],
    goals: [],
    profile: null,
  };

  const entries = buildProgram(index(base), {
    days: split.defaultDays,
    where: 'gym',
    bias: 'none',
    variety: 0,
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

it('is checked on every Monday of the spread, and on this one', () => {
  // Twenty-eight Mondays: every place the cutover can sit in the block, and
  // six weeks with it gone. A spread that shrank to a day would pass anything.
  expect(MONDAYS.length).toBeGreaterThanOrEqual(28);
  expect(MONDAYS).toContain('2026-11-23');
  expect(MONDAYS).toContain(mondayOf(new Date()));
});

describe.each(MONDAYS)('the demo, seeded on %s', (today) => {
  const now = `${today}T12:00:00.000Z`;
  const { ix, plan } = demoAccount(today);
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
      // Two seeds can overlap: createUser and the first sync of a still-empty
      // account, or two devices at once. Log ids are derived from
      // date:exercise:setNo, so the two runs converge only if the generator
      // agrees with itself.
      expect(demoHistory(plan, today)).toEqual(demoHistory(plan, today));
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
          (s, i) =>
            (Date.parse(s.date) - Date.parse(row.sessions[i]!.date)) / (24 * 60 * 60 * 1000),
        );
      /* The dotted-connector case exists — but it would for any lift on this
       day: the week off and the missed session give a steady lift fortnight
       gaps too. So this is not what tells "irregular" apart. */
      expect(Math.max(...gaps)).toBeGreaterThanOrEqual(14);
      /* This is: fewer sessions than the steady lift trained the same day. Held
       against that lift rather than a fixed count, which passed with no margin
       at all when the irregular arc was switched off (18 < 18) — one more
       missed day in the generator and it would have stopped noticing. */
      const steady = byName('Barbell Row')!;
      expect(row.sessions.length).toBeLessThanOrEqual(steady.sessions.length - 2);
    });

    it('does not wobble every lift on the same day in lockstep', () => {
      /* The tell that one curve drew all of them: two exercises whose reps go up
       and down together, session for session. Read off the reps rather than
       the estimated 1RM, because the 1RM of two lifts with different starts,
       increments and gains diverges whatever the wobble does — the per-exercise
       salt could be deleted and a comparison of those would still pass. */
      const { sets } = demoHistory(plan, today);
      const repShape = (name: string) => {
        const exId = byName(name)!.exercise.id;
        const r = sets.filter((s) => s.exerciseId === exId && s.setNo === 1).map((s) => s.reps);
        return r
          .slice(1)
          .map((x, i) => Math.sign(x - r[i]!))
          .join('');
      };
      expect(repShape('Goblet Squat')).not.toBe(repShape('Trap Bar Deadlift'));
    });

    it('keeps the weights plausible for the movement', () => {
      /* A deadlift and a lateral raise sharing a number is the tell that the
       generator lost track of what it was filling.

       Compared per implement — what you actually pick up — rather than on the
       stored figure, because those are not the same question once a pair of
       dumbbells is stored combined. Two 18 kg dumbbells really do out-weigh a
       36 kg goblet squat as a *total*, and this test used to read that true
       fact as the generator having gone wrong. What it means to check is that
       the thing in your hand for a curl is lighter than the thing in your hands
       for a squat. */
      /* Asserted, not defaulted. A `?? 0` here turned a lift that had left the
       demo's week into a comparison with nothing — which is how this used to
       hold the deadlift against a DB Bench Press the week does not have. */
      const top = (name: string) => toEntered(name, byName(name)!.topSet!.weight!)!;
      expect(top('Trap Bar Deadlift')).toBeGreaterThan(top('Goblet Squat'));
      expect(top('Goblet Squat')).toBeGreaterThan(top('Hammer Curl'));

      // And the stored side stays ordered where the numbers are commensurable:
      // a loaded barbell hinge outweighs everything a pair of dumbbells can do.
      // Found rather than named, like the pairs test below.
      const stored = (name: string) => byName(name)!.topSet!.weight!;
      const pairs = summary.filter((p) => loadClassOf(p.exercise.name) === 'dumbbellPair');
      expect(pairs.length).toBeGreaterThan(0);
      for (const p of pairs) {
        expect(stored('Trap Bar Deadlift'), p.exercise.name).toBeGreaterThan(p.topSet!.weight!);
      }
    });

    it('stores a pair of dumbbells combined', () => {
      /* The convention, asserted on generated history rather than on a unit
       fixture — `demo-loads` is authored per implement, so this is the only
       place that proves the generator applies the conversion on the way out.
       Without it the demo would quietly be the one account in the app still
       logging the old meaning. */
      /* Found rather than named: which exercises the generator puts in the demo's
       week depends on the split and has drifted before. Hard-coding one here
       gave a test that failed with "cannot read topSet of undefined", which
       says nothing about the convention it was meant to be checking. */
      /* Held against the table it was authored from, per implement. The first
       version checked the stored weight was even and that halving it gave half
       of it — and every per-hand load in the table is already even, so it
       passed with the doubling deleted. A top set at least twice the authored
       per-hand starting load cannot come from undoubled history: no lift in
       the table gains more than 35% over the block. */
      const pairs = summary.filter((p) => loadClassOf(p.exercise.name) === 'dumbbellPair');
      expect(pairs.length).toBeGreaterThan(0);
      for (const p of pairs) {
        const stored = p.topSet?.weight ?? 0;
        const authored = DEMO_LOADS[p.exercise.name]!.start;
        expect(stored, p.exercise.name).toBeGreaterThanOrEqual(2 * authored);
      }
      // A single implement is untouched, which is the other half of the rule: the
      // goblet squat's top set stays within its own authored range, not twice it.
      const goblet = byName('Goblet Squat')!.topSet!.weight!;
      expect(goblet).toBeLessThan(2 * DEMO_LOADS['Goblet Squat']!.start);
      expect(toEntered('Goblet Squat', goblet)).toBe(goblet);
    });

    it('logs a bodyweight lift as the weight added to the body, none until there is some', () => {
      /* The app's convention: a bodyweight lift is logged with nothing, or with
       what hangs off a belt. The generator used to log a share of bodyweight
       as the weight, so the demo's Pull-Up opened on about 80 kg under a
       caption telling you to leave it at None. Found, not named, like the
       pairs above — and there has to be at least one, or this checks nothing. */
      const bodyweight = plan.filter((e) => DEMO_LOADS[e.name]?.bw);
      expect(bodyweight.length, 'the demo week has no bodyweight lift to check').toBeGreaterThan(0);
      for (const e of bodyweight) expect(loadClassOf(e.name), e.name).toBe('bodyweight');

      const ids = new Set(bodyweight.map((e) => e.exerciseId));
      const logged = demoHistory(plan, today).sets.filter((s) => ids.has(s.exerciseId));
      expect(logged.length).toBeGreaterThan(0);
      // Early on nothing is added: stored as no weight at all, not as zero.
      expect(
        logged.some((s) => s.weight === null),
        'never logged as nothing added',
      ).toBe(true);
      // And what is added is a belt's worth, never a person's.
      expect(logged.every((s) => s.weight === null || s.weight < 30)).toBe(true);
    });
  });

  describe('the demo strength score', () => {
    const scores = strengthSeries(ix, mondayOf(ix.logs[0]!.date), DEMO_WEEKS, {
      unit: 'kg',
      sex: 'male',
      birthYear: null,
    })
      .map((p) => p.index)
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

  describe('the demo goals', () => {
    const { sets } = demoHistory(plan, today);
    const goals = demoGoals(plan, sets, today);

    /** A `DemoGoal` as the row the app would have written. */
    const toRow = (g: (typeof goals)[number]): Goal => ({
      id: `goal-${g.exerciseId}`,
      updatedAt: now,
      deletedAt: null,
      retiredAt: null,
      ...g,
    });

    /** The account as it arrives: its own history, plus its own goals. */
    const withGoals: Indexed = { ...ix, goals: goals.map(toRow) };

    it('asks to be pushed on the lift that stalled, and on one that is climbing', () => {
      /* Without a goal the app says nothing evaluative — right on a real account
       and useless on a demo, where it would leave both the goal card and the
       verdict card invisible. Two, so both states are on screen at once: one
       lift the app now has something to say about, and one it does not. */
      expect(goals).toHaveLength(2);
      /* By name: the stalled bench, and the first steady lift in the order the
       week was built — the seed reads its plan back in that order too. */
      const named = goals.map(
        (g) => summary.find((p) => p.exercise.id === g.exerciseId)?.exercise.name,
      );
      expect(named.sort()).toEqual(['Barbell Bench Press', 'Goblet Squat']);

      // And the gate opens for exactly those two, not for the other fifteen.
      expect(growingExercises(withGoals, today).size).toBe(2);
    });

    it('makes the verdict card say something a reader can act on', () => {
      // The whole reason the demo has goals. Bench stalled months ago, and with
      // the permission in place the page reports it.
      const shown = attention(summary, today, {
        limit: 3,
        growing: growingExercises(withGoals, today),
      });
      expect(shown.map((a) => a.progress.exercise.name)).toContain('Barbell Bench Press');
      expect(shown.find((a) => a.progress.exercise.name === 'Barbell Bench Press')?.kind).toBe(
        'stalled',
      );
      /* And the other goal draws nothing: it is on a lift that is climbing, so
       the card has nothing to say about it, and the demo shows both states side
       by side. A goal that drifted onto a lift in trouble would still be a goal,
       still be live, and still satisfy every other test in this block. */
      const benchId = byName('Barbell Bench Press')!.exercise.id;
      const other = goals.find((g) => g.exerciseId !== benchId)!;
      expect(
        shown.map((a) => a.progress.exercise.id),
        'the climbing goal has nothing to say',
      ).not.toContain(other.exerciseId);
    });

    it('passes the app’s own guardrails, without a warning', () => {
      /* A seeded goal the app itself would have refused is a demo of a bug. Asked
       the way the goal sheet asks it: with the goals already running counted,
       and with this lift's own trailing gain from before the goal was set.
       Zero and null for every goal, as this used to pass, is a question the
       app never asks — it held with room for only one live goal.

       And no ambition warning either. At 8% both goals tripped it — the
       stalled bench on its slow trailing gain, a lift with little history on
       the 7.5% the warning allows — so the demo showed goals the app itself
       called unrealistic. `allowed` alone could not see that. */
      goals.forEach((g, i) => {
        const before: Indexed = { ...ix, logs: ix.logs.filter((l) => l.date < g.startedOn) };
        const check = checkGoal({
          ...g,
          liveCount: i,
          ownRecentGain: recentGainOf(before, g.exerciseId, g.startedOn),
        });
        expect(check.allowed, g.exerciseId).toBe(true);
        expect(check.reason, g.exerciseId).toBeNull();
        expect(check.warning, `${g.exerciseId}: ${g.baseline} → ${g.target}`).toBeNull();
      });
    });

    it('runs a horizon the goal sheet offers', () => {
      /* A goal the app wrote itself should still be one a person could have
       set, and the sheet offers only these horizons. */
      for (const g of goals) {
        const weeks = daysBetween(g.startedOn, g.targetDate) / 7;
        expect(GOAL_HORIZONS, `${g.exerciseId}: ${weeks} weeks`).toContain(weeks);
      }
    });

    it('is still running, with weeks left to watch', () => {
      for (const g of goals) {
        const p = goalProgress(toRow(g), withGoals, today);
        expect(isLive(p.goal, today)).toBe(true);
        expect(p.daysLeft).toBeGreaterThan(7);
        // Neither is finished, because a demo of a goal that is already done
        // shows the ending and never the bar.
        expect(p.achieved).toBe(false);
      }
    });

    it('measures from where the lift actually was', () => {
      /* The baseline comes off the same sets the chart is drawn from. A round
       number picked by hand would put a finish line on the page with no
       relationship to the line underneath it. */
      for (const g of goals) {
        const before = sets.filter((s) => s.exerciseId === g.exerciseId && s.date < g.startedOn);
        const best = Math.max(...before.map((s) => est1RM(s.weight, s.reps, s.rir) ?? 0));
        expect(g.baseline).toBeCloseTo(best, 1);
        expect(g.target).toBeGreaterThan(g.baseline);
      }
    });

    it('sets each goal as far back as the history allows', () => {
      /* The invariant the hand-tuned `weeksAgo` constants used to stand in for,
       stated directly so it cannot rot again. Age is what makes a goal worth
       looking at — a bar that has had time to move — so the generator takes the
       oldest start date that does not arrive finished.

       Both halves matter. Without the search, a goal is as old as the constant
       says and may be complete on arrival, which is what a tighter rep ceiling
       caused. With a search that gave up too early, every goal would be a week
       old with a flat bar, and the existing tests would all still pass.

       So: one week older than it was given would have been too old. The stalled
       lift is the exception by construction — it never reaches any target, so
       nothing stops it sitting at its ceiling — and it is asserted the other
       way round, that it is genuinely old rather than freshly minted. */
      const weeksOld = (startedOn: string) =>
        Math.round(
          (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${startedOn}T12:00:00Z`)) / 6048e5,
        );

      const bench = goals.find((g) => g.exerciseId === byName('Barbell Bench Press')!.exercise.id)!;
      expect(weeksOld(bench.startedOn)).toBeGreaterThanOrEqual(6);

      for (const g of goals) {
        const age = weeksOld(g.startedOn);
        if (g === bench) continue;

        // Re-derive what a goal one week older would have been, the way the
        // generator does: baseline off the preceding eight weeks, GOAL_DISTANCE on.
        const older = addDays(today, -7 * (age + 1));
        const bestIn = (from: string, to: string | null) =>
          Math.max(
            0,
            ...sets
              .filter(
                (s) =>
                  s.exerciseId === g.exerciseId && s.date >= from && (to === null || s.date < to),
              )
              .map((s) => est1RM(s.weight, s.reps, s.rir) ?? 0),
          );
        const baseline = Math.round(bestIn(addDays(older, -56), older) * 10) / 10;
        const target = Math.round(baseline * (1 + GOAL_DISTANCE) * 2) / 2;

        expect(baseline).toBeGreaterThan(0);
        expect(Math.max(bestIn(older, null), baseline)).toBeGreaterThanOrEqual(target);
      }
    });

    it('gives the same account the same goals twice', () => {
      // Same reason the rest of the seed is derived rather than random: it has
      // to be safe to run again over a history it half wrote.
      expect(demoGoals(plan, sets, today)).toEqual(goals);
    });
  });
});

/* Not dated: the weigh-ins are a function of the week number alone. */
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
