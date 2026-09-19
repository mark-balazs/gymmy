/**
 * Five months of plausible training for the demo account, as data points.
 *
 * **This produces sets, and only sets.** One row per set actually performed,
 * carrying what was on the bar, how many reps went up and how many were left in
 * reserve — the same three numbers a person types in. Nothing derived is
 * generated or stored alongside them: no per-exercise curve, no session
 * summary, no progress series. Everything the Progress page draws is computed
 * back out of these points by `progressSummary`, exactly as it is for a real
 * account. If the charts ever disagree with the logs, that is a bug we want to
 * be able to see rather than one the seed has papered over.
 *
 * Realism is the whole job, and it is easy to get wrong in ways obvious to
 * anyone who lifts. The first version assigned loads per *movement pattern*,
 * which logged a goblet squat at 90 kg and drew the identical staircase on all
 * seventy charts. The second fixed the loads but left one shared progress
 * curve, so every lift went up forever and the page's "needs a look" section
 * was empty on the very account we use to show it off. What shapes the history
 * now:
 *
 *  - **a per-exercise arc** — one stalls, one has gone backwards, one is
 *    trained about two weeks in three, one appeared two months in, and one is
 *    still on the plan but has not been touched for over a month;
 *  - **a shared plateau** — a couple of months in the middle where nothing
 *    moved at all. Per-exercise arcs are not enough for this: the strength
 *    score is a sum across five patterns, so one lift pausing vanishes into
 *    the other four and the headline number climbed in eighteen weeks out of
 *    twenty-one, which is the one shape no real chart has;
 *  - **quick early, flattening later**, because that is what five months looks
 *    like — not a straight line, and not the 100%+ gains the old version
 *    produced on light movements;
 *  - **rounded to real plate jumps**, which produces plateaus of uneven length
 *    on its own: you sit at the same weight for three weeks and then move;
 *  - **interrupted** — a deload every sixth week, a bad session about one in
 *    ten, a couple of missed sessions, and a week off entirely.
 *
 * Nothing here is random. The same account seeded twice produces byte-identical
 * history, which is what lets the whole seed be safely re-run — see seed-user.
 */

import { est1RM, loadRuleOf, sessionLabel, type GOAL_HORIZONS } from '@athletic/domain';
import { BY_PATTERN, DEMO_LOADS, type DemoArc, type DemoLoad } from './demo-loads';

/** Roughly five months. Long enough for the progress charts to have a shape
 *  and for the strength score to have moved. */
export const DEMO_WEEKS = 22;

/** The last week of the block, which every arc is expressed relative to. */
const LAST = DEMO_WEEKS - 1;

/** The person the demo is. Their sex and height are set for the same reason
 *  their weight is: the strength score cannot be shown without them. */
export const DEMO_SEX = 'male';
export const DEMO_HEIGHT_CM = 181;

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const roundTo = (value: number, inc: number): number =>
  Math.round(Math.round(value / inc) * inc * 100) / 100;

const clamp01 = (p: number): number => Math.min(1, Math.max(0, p));

/**
 * How far through a lift's total gain you are, `0` to `1`.
 *
 * Rises quickly and flattens, which is the shape of real training and the one
 * thing a linear ramp gets most obviously wrong.
 */
const ramp = (p: number): number => 1 - (1 - clamp01(p)) ** 1.8;

/**
 * A repeatable wobble in [-1, 1].
 *
 * Deterministic on purpose: the seed has to be safe to run twice, and a
 * `Math.random()` here would make the second run disagree with the first about
 * what happened in March.
 */
function jitter(a: number, b: number, c: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * A small stable number per exercise.
 *
 * Without it the wobble is keyed on the week and the session alone, so every
 * lift on a Monday gains and loses the same rep together — five charts moving
 * in lockstep, which is the tell that one generator drew all of them.
 */
function salt(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return h;
}

/** Every sixth week is lighter. Nobody adds weight for five months straight. */
const isDeload = (w: number): boolean => w > 0 && w % 6 === 5;

/** A whole week missed, two months in. Life happens, and the coverage view
 *  should have something to say about it. */
const isOff = (w: number): boolean => w === 11;

/**
 * Bodyweight: a cut that runs out of steam, then maintenance.
 *
 * Two things were visible here on a chart and neither happens to a person. The
 * drift was `Math.min(w, 14) * 0.2` — a dead-straight slope that stops *dead*
 * at week fourteen, which nobody's weight does; and the wobble was a six-entry
 * array indexed by `w % 6`, so the same zigzag was drawn five times in a row.
 * Together they made a sawtooth with a visible period, on the one series in the
 * app somebody might actually recognise their own in.
 *
 * So: an exponential approach to a new settling point, which is what losing
 * weight looks like — quick at first, then increasingly stubborn — and noise
 * from the same deterministic wobble everything else here uses, which does not
 * repeat. Still identical on every run, which is the constraint that matters.
 */
export function bodyWeightFor(w: number): number {
  const cut = 3.2 * (1 - Math.exp(-w / 6));
  return Math.round((82 - cut + jitter(w, 0, 5) * 0.45) * 10) / 10;
}

/* ------------------------------------------------------------------ arcs */

const STEADY: DemoArc | null = null;

/**
 * A month somewhere in the middle where nothing moved.
 *
 * Every lift on its own smooth ramp produces a strength score that rises in
 * eighteen weeks out of twenty-one, and that is the one thing no real chart
 * does. A block has runs, and it has stretches where the same weights keep
 * coming back around — a heavy month at work, a fortnight of being ill, or
 * simply the point at which what worked in week two stops working.
 *
 * It is shared rather than per-lift on purpose. A plateau is something that
 * happens to the person, not to the barbell, so it lands on everything at once
 * — which is also the only version of it the strength score can show, since
 * that score is a sum across five patterns and one lift pausing disappears
 * into the other four.
 */
const PLATEAU = { from: 8, weeks: 5 };

/**
 * Weeks of *progress* banked by calendar week `w`.
 *
 * The plateau contributes none, so it costs the block the gains it would have
 * made — which is the honest version. A plateau that the curve caught up from
 * afterwards would be a plateau with no consequences, and would leave the
 * five-month total exactly where it was.
 */
const earnedWeeks = (w: number): number =>
  w < PLATEAU.from ? w : Math.max(PLATEAU.from, w - PLATEAU.weeks);

/** How much of this lift's gain has been realised by week `w`. */
function progressAt(arc: DemoArc | null, w: number): number {
  const e = earnedWeeks(w);
  if (!arc) return ramp(e / LAST);
  switch (arc.kind) {
    case 'stall':
      // Frozen from `from` onward. The weight stops moving because the lifter
      // stopped being able to move it, not because the generator ran out.
      return ramp(Math.min(e, earnedWeeks(arc.from)) / LAST);
    case 'regress': {
      // Calendar weeks, not earned ones: a knee gives way on a date, and it
      // heals over real time rather than over training that did not happen.
      const after = w - arc.peak;
      if (after <= 0) return ramp(e / LAST);
      // Down over about three weeks, then clawing back far more slowly than it
      // went — which is what coming back from a tweak actually feels like.
      const fallen = arc.drop * (Math.min(after, 3) / 3);
      const clawed = Math.min(fallen, Math.max(0, after - 4) * 0.03);
      return Math.max(0, ramp(earnedWeeks(arc.peak) / LAST) - fallen + clawed);
    }
    case 'irregular':
      // Slower, because you are there less often.
      return ramp((0.7 * e) / LAST);
    case 'late': {
      // Starts from scratch when it is introduced, not from where the block
      // would have carried it had it been there all along.
      const begun = earnedWeeks(arc.from);
      return ramp((e - begun) / Math.max(1, LAST - begun));
    }
    case 'abandoned':
      return ramp(e / LAST);
  }
}

/** Whether this lift was trained at all in this week's session. */
function trainsIn(arc: DemoArc | null, w: number, session: number, seed: number): boolean {
  if (!arc) return true;
  switch (arc.kind) {
    case 'late':
      return w >= arc.from;
    case 'abandoned':
      return w <= arc.after;
    case 'irregular':
      return jitter(w, session, 11 + seed) > -0.35;
    default:
      return true;
  }
}

/**
 * A stalled lift's reps stop moving too.
 *
 * This is not a detail. Grinding the same five reps at the same weight week
 * after week *is* the stall; letting the reps wobble instead would put the
 * best session wherever the wobble happened to land, and a plateau whose peak
 * is last Tuesday does not read as a plateau to anything downstream.
 */
const isGrinding = (arc: DemoArc | null, w: number): boolean =>
  arc?.kind === 'stall' && w >= arc.from;

/* ------------------------------------------------------------- the sets */

/** One set, as it would have been logged. */
export interface DemoSet {
  date: string;
  session: string;
  exerciseId: string;
  setNo: number;
  /** Null for a bodyweight lift done with nothing added — as the app logs it. */
  weight: number | null;
  reps: number;
  rir: number;
}

/** One morning on the scales. */
export interface DemoWeight {
  date: string;
  weight: number;
}

/** What the account is programmed to do, read back from its own plan. */
export interface DemoPlanEntry {
  sessionIndex: number;
  exerciseId: string;
  name: string;
  patternKey: string | null;
  sets: number;
}

function setFor(
  load: DemoLoad,
  arc: DemoArc | null,
  seed: number,
  w: number,
  session: number,
  setNo: number,
  sets: number,
): { weight: number | null; reps: number; rir: number } {
  const t = progressAt(arc, w);
  const deload = isDeload(w);
  // Roughly one session in ten goes badly — you slept poorly, the gym was
  // full, the bar felt heavy. Deliberately *not* salted per exercise: a bad
  // day is a bad day for everything you touch that evening, and the charts
  // dipping together is the honest version of it.
  const bad = !deload && jitter(w, session, 7) < -0.8;

  let weight: number | null;
  let reps: number;

  if (load.bw) {
    /* The load is you, so the progress shows up in reps — which is how these
     * actually go — and a little extra hangs off a belt later on. Logged the
     * way the app logs it: the weight *added*, and none at all until there is
     * some. This used to log a share of bodyweight as the weight, so a demo
     * Pull-Up opened on about 80 kg under a caption saying to leave it at None
     * unless you added weight. */
    const added = load.inc * Math.floor(t * 2.5);
    weight = added > 0 ? added : null;
    reps = load.reps + Math.round((load.repGain ?? 0) * t);
  } else {
    const earned = roundTo(load.start * (1 + load.gain * t), load.inc);
    weight = deload
      ? Math.max(load.start, roundTo(earned * 0.9, load.inc))
      : bad
        ? Math.max(load.start, earned - load.inc)
        : earned;
    reps = load.reps + (isGrinding(arc, w) ? 0 : Math.round(jitter(w, session, 3 + seed)));
  }

  // Straight sets with the last one hardest — what a real straight-set session
  // looks like in the logs.
  reps = Math.max(1, reps - (setNo - 1) - (bad ? 1 : 0));

  const rir = deload ? 4 : setNo === sets ? (jitter(w, session, setNo + seed) > 0 ? 0 : 1) : 2;
  return { weight, reps, rir };
}

export const loadFor = (name: string, patternKey: string | null): DemoLoad =>
  DEMO_LOADS[name] ?? BY_PATTERN[patternKey ?? 'isolation'] ?? BY_PATTERN.isolation!;

/**
 * Every set and every weigh-in the demo account arrives with.
 *
 * Pure: it takes the plan and today's Monday and returns rows. That is what
 * makes the shape of the history — the stall, the slide, the gaps — assertable
 * without a database, which is where the interesting mistakes are.
 */
export function demoHistory(
  plan: DemoPlanEntry[],
  thisMonday: string,
): { sets: DemoSet[]; weights: DemoWeight[] } {
  const sets: DemoSet[] = [];
  const weights: DemoWeight[] = [];
  const sessions = [...new Set(plan.map((p) => p.sessionIndex))].sort((a, b) => a - b);

  for (let w = 0; w < DEMO_WEEKS; w++) {
    // w counts forward from the oldest week, so the progression reads the way
    // it was lived rather than backwards from today.
    const weekStart = addDays(thisMonday, -7 * (DEMO_WEEKS - w));
    weights.push({ date: weekStart, weight: bodyWeightFor(w) });

    if (isOff(w)) continue;

    for (const session of sessions) {
      // A missed session here and there — nobody trains every planned day.
      if (w === 3 && session === 2) continue;
      if (w === 16 && session === 1) continue;

      const date = addDays(weekStart, session * 2);
      if (date >= thisMonday) continue;

      for (const entry of plan.filter((p) => p.sessionIndex === session)) {
        const load = loadFor(entry.name, entry.patternKey);
        const arc = load.arc ?? STEADY;
        const seed = salt(entry.name);
        if (!trainsIn(arc, w, session, seed)) continue;

        const count = entry.sets || 3;
        for (let setNo = 1; setNo <= count; setNo++) {
          const { weight, reps, rir } = setFor(load, arc, seed, w, session, setNo, count);
          sets.push({
            date,
            session: sessionLabel(session),
            exerciseId: entry.exerciseId,
            setNo,
            /* `demo-loads` is written the way a person writes a training log —
               what you pick up, per implement — so a 26 kg dumbbell bench press
               reads as 26 kg dumbbells. Storage wants the combined load, and the
               conversion belongs here rather than in that table: doubling the
               fourteen dumbbell entries by hand would leave the file meaning two
               different things depending on the row, and the next person to add
               one would have no way of telling which. */
            weight: weight === null ? null : weight * loadRuleOf(entry.name).factor,
            reps,
            rir,
          });
        }
      }
    }
  }

  return { sets, weights };
}
/* ---------------------------------------------------------------- goals */

/** One goal the demo account arrives already having set. */
export interface DemoGoal {
  exerciseId: string;
  baseline: number;
  target: number;
  startedOn: string;
  targetDate: string;
}

/**
 * Which lift each goal is on, and the **oldest** it should be.
 *
 * The two ages are the point. Set on the same day, the climbing one would
 * already be finished — seven percent is a few weeks of a lift that gains a
 * third over a block, and a goal that arrives complete shows the ending and
 * never the bar. So the stalled one has been running long enough to have
 * visibly not moved, and the climbing one is recent enough to still be
 * climbing. Which is also how goals turn up on a real account: at different
 * times, for different reasons.
 *
 * `weeksAgo` is a ceiling rather than a fixture, and the difference matters:
 * these were fixed numbers, hand-tuned until the demo looked right, and they
 * rotted the first time something upstream moved. Tightening the estimator's
 * rep ceiling lowered every baseline, which lowered every target with it, and
 * the climbing goal arrived already achieved — the exact state the paragraph
 * above says it must never be in. A constant cannot notice that. The search in
 * `demoGoals` can, and re-derives the age from the history it is actually
 * looking at.
 */
const GOAL_PLAN: { want: DemoArc['kind'] | null; weeksAgo: number }[] = [
  { want: 'stall', weeksAgo: 6 },
  { want: null, weeksAgo: 3 },
];

/**
 * One of the horizons the goal sheet offers, or the demo shows a goal nobody
 * could have set. Sixteen leaves the stalled goal ten weeks to run when the
 * account is seeded, so the demo keeps its story between resets.
 */
const GOAL_WEEKS: (typeof GOAL_HORIZONS)[number] = 16;
/**
 * Seven percent: past the 5% floor, and short of the ambition warning.
 *
 * The warning fires past 1.5 times what the lift can afford, and the least it
 * can afford is 5%, so 7.5% is the ceiling for a lift with slow or no recent
 * gain — the stalled bench is exactly that. Eight percent tripped it on both
 * goals, and the demo showed goals the app itself called unrealistic.
 */
export const GOAL_DISTANCE = 0.07;

/**
 * The two goals the demo account arrives with.
 *
 * Without one the app says nothing evaluative at all, which is correct on a
 * real account and useless on a demo — it would leave the whole feature, and
 * the triage card that depends on it, invisible. So the demo has asked to be
 * pushed on exactly two lifts, chosen for what they demonstrate:
 *
 *  - **the one that stalled**, so the verdict card has something in it and a
 *    reader can see what a goal buys;
 *  - **one that is climbing steadily**, so the other state — a bar moving, on
 *    track, nothing to say about it — is on screen beside it.
 *
 * Both are picked off the arcs in `demo-loads` rather than named here, because
 * which exercises the generator puts in the demo's week depends on the split
 * and would drift. If neither arc is in the plan the account simply arrives
 * with fewer goals; a demo missing a card is better than a seed that throws.
 */
export function demoGoals(plan: DemoPlanEntry[], sets: DemoSet[], thisMonday: string): DemoGoal[] {
  /** The best estimated one-rep max this lift reached in a window, using the
   *  same estimator the app itself would use — so a goal seeded here is one the
   *  app's own arithmetic agrees with. `to` of null means "up to today". */
  const bestIn = (exerciseId: string, from: string, to: string | null): number => {
    let best = 0;
    for (const s of sets) {
      if (s.exerciseId !== exerciseId || s.date < from) continue;
      if (to !== null && s.date >= to) continue;
      const e = est1RM(s.weight, s.reps, s.rir);
      if (e !== null && e > best) best = e;
    }
    return Math.round(best * 10) / 10;
  };

  return GOAL_PLAN.flatMap(({ want, weeksAgo }) => {
    const entry = plan.find((e) => (loadFor(e.name, e.patternKey).arc?.kind ?? null) === want);
    if (!entry) return [];

    /* Oldest first, because age is what makes the goal worth looking at — a
       bar that has had time to move. The first age that is still *unfinished*
       wins, which is the invariant the demo actually needs and the one a fixed
       `weeksAgo` could only approximate. A lift climbing fast simply gets a
       younger goal rather than a finished one. */
    for (let age = weeksAgo; age >= 1; age--) {
      const startedOn = addDays(thisMonday, -7 * age);
      const baseline = bestIn(entry.exerciseId, addDays(startedOn, -56), startedOn);
      if (baseline <= 0) continue;

      // To the nearest half, because that is what a person would type.
      const target = Math.round(baseline * (1 + GOAL_DISTANCE) * 2) / 2;
      /* Floored at the baseline exactly as `goalProgress` floors it, so this
         asks the same question the card will: has the target been reached? */
      const reached = Math.max(bestIn(entry.exerciseId, startedOn, null), baseline);
      if (reached >= target) continue;

      return [
        {
          exerciseId: entry.exerciseId,
          baseline,
          target,
          startedOn,
          targetDate: addDays(startedOn, 7 * GOAL_WEEKS),
        },
      ];
    }
    return [];
  });
}
