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

import { sessionLabel } from '@athletic/domain';
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
 * Bodyweight, drifting down and then settling — with a wobble that repeats
 * exactly, because this has to be reproducible.
 */
export function bodyWeightFor(w: number): number {
  const drift = 82 - Math.min(w, 14) * 0.2;
  const wobble = [0, 0.4, -0.3, 0.2, -0.5, 0.3][w % 6]!;
  return Math.round((drift + wobble) * 10) / 10;
}

/* ------------------------------------------------------------------ arcs */

const STEADY: DemoArc | null = null;

/** How much of this lift's gain has been realised by week `w`. */
function progressAt(arc: DemoArc | null, w: number): number {
  if (!arc) return ramp(w / LAST);
  switch (arc.kind) {
    case 'stall':
      // Frozen from `from` onward. The weight stops moving because the lifter
      // stopped being able to move it, not because the generator ran out.
      return ramp(Math.min(w, arc.from) / LAST);
    case 'regress': {
      const after = w - arc.peak;
      if (after <= 0) return ramp(w / LAST);
      // Down over about three weeks, then clawing back far more slowly than it
      // went — which is what coming back from a tweak actually feels like.
      const fallen = arc.drop * (Math.min(after, 3) / 3);
      const clawed = Math.min(fallen, Math.max(0, after - 4) * 0.03);
      return Math.max(0, ramp(arc.peak / LAST) - fallen + clawed);
    }
    case 'irregular':
      // Slower, because you are there less often.
      return ramp((0.7 * w) / LAST);
    case 'late':
      // Starts from scratch when it is introduced, not from where the block
      // would have carried it had it been there all along.
      return ramp((w - arc.from) / Math.max(1, LAST - arc.from));
    case 'abandoned':
      return ramp(w / LAST);
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
  weight: number;
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
): { weight: number; reps: number; rir: number } {
  const t = progressAt(arc, w);
  const deload = isDeload(w);
  // Roughly one session in ten goes badly — you slept poorly, the gym was
  // full, the bar felt heavy. Deliberately *not* salted per exercise: a bad
  // day is a bad day for everything you touch that evening, and the charts
  // dipping together is the honest version of it.
  const bad = !deload && jitter(w, session, 7) < -0.8;

  let weight: number;
  let reps: number;

  if (load.bw) {
    /* The load is you, so it tracks bodyweight and the progress shows up in
     * reps — which is how these actually go. A little extra hangs off a belt
     * later on. */
    const added = load.inc * Math.floor(t * 2.5);
    weight = roundTo(load.bw * bodyWeightFor(w) + added, 0.5);
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

  // Straight sets with the last one hardest, which is what the app's own
  // suggestion engine expects to read back.
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
            weight,
            reps,
            rir,
          });
        }
      }
    }
  }

  return { sets, weights };
}
