/**
 * Five months of plausible training, for showing the app to someone.
 *
 * An empty account demonstrates nothing: the coverage grid has no ticks, the
 * progress charts have no line, the strength score has nothing to divide, and
 * "ready for more weight" — the thing that makes the app worth using — cannot
 * appear at all, because it needs history to derive a verdict from. So the demo
 * account arrives having already trained.
 *
 * Realism is the whole job here, and it is easy to get wrong in ways that are
 * obvious to anyone who lifts. The first version assigned loads per *movement
 * pattern*, which logged a goblet squat at 90 kg and drew the identical
 * staircase on all seventy charts. Loads now come from `demo-loads.ts`, one
 * entry per exercise, and the shape of the progress is:
 *
 *  - **quick early, flattening later**, because that is what five months looks
 *    like — not a straight line, and not the 100%+ gains the old version
 *    produced on light movements;
 *  - **rounded to real plate jumps**, which produces plateaus of uneven length
 *    on its own: you sit at the same weight for three weeks and then move;
 *  - **interrupted** — a deload every sixth week, a bad session about one in
 *    ten, a missed session, and a week off entirely.
 *
 * Nothing here is random. The same account seeded twice produces byte-identical
 * history, which is what lets the whole seed be safely re-run — see seed-user.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  bodyLogs,
  exercises as exercisesTable,
  patterns,
  programEntries,
  setLogs,
} from '@/lib/db/schema';
import { mondayOf, sessionLabel } from '@athletic/domain';
import { BY_PATTERN, DEMO_LOADS, type DemoLoad } from './demo-loads';
import { nextSeq, seedId } from './seed-user';

/**
 * Which address gets this treatment.
 *
 * Read at call time from the environment rather than frozen at import, so a
 * test can point it somewhere harmless. A constant would force the test to
 * create — and then delete — the real demo account, on whatever database it
 * happened to be pointed at.
 */
export const demoEmail = (): string =>
  (process.env.DEMO_EMAIL ?? 'demo-gymmy@yopmail.com').trim().toLowerCase();

export const isDemoEmail = (email?: string | null): boolean =>
  (email ?? '').trim().toLowerCase() === demoEmail();

/** Roughly five months. Long enough for the progress charts to have a shape
 *  and for the strength score to have moved. */
export const DEMO_WEEKS = 22;

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

/**
 * How far through the block's total gain you are by week `w`.
 *
 * Rises quickly and flattens, which is the shape of real training and the one
 * thing a linear ramp gets most obviously wrong.
 */
const curve = (w: number): number => 1 - (1 - w / (DEMO_WEEKS - 1)) ** 1.8;

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

/** The working weight and rep target for one exercise in one session. */
function setFor(
  load: DemoLoad,
  w: number,
  session: number,
  setNo: number,
  sets: number,
): { weight: number; reps: number; rir: number } {
  const t = curve(w);
  const deload = isDeload(w);
  // Roughly one session in ten goes badly — you slept poorly, the gym was
  // full, the bar felt heavy. Charts without one of these look synthetic.
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
    reps = load.reps + Math.round(jitter(w, session, 3));
  }

  // Straight sets with the last one hardest, which is what the app's own
  // suggestion engine expects to read back.
  reps = Math.max(1, reps - (setNo - 1) - (bad ? 1 : 0));

  const rir = deload ? 4 : setNo === sets ? (jitter(w, session, setNo) > 0 ? 0 : 1) : 2;
  return { weight, reps, rir };
}

/**
 * Fills an account that already has the default library with training history.
 *
 * Reads the program back out of the database rather than regenerating it, so
 * the logs point at the exercises this account was actually given — inventing a
 * parallel plan here is how a demo ends up with progress charts for lifts that
 * are not in its own week.
 */
export async function seedDemoHistory(userId: string): Promise<void> {
  const [plan, library, patternRows] = await Promise.all([
    db
      .select()
      .from(programEntries)
      .where(sql`${programEntries.userId} = ${userId}`),
    db
      .select()
      .from(exercisesTable)
      .where(sql`${exercisesTable.userId} = ${userId}`),
    db
      .select()
      .from(patterns)
      .where(sql`${patterns.userId} = ${userId}`),
  ]);
  if (!plan.length) return;

  const keyByPattern = new Map(patternRows.map((p) => [p.id, p.key]));
  /** Exercise → what it is called and what it trains, which is what decides a
   *  sane weight. A deadlift and a lateral raise have nothing in common. */
  const loadOf = new Map<string, DemoLoad>(
    library.map((e) => [
      e.id,
      DEMO_LOADS[e.name] ??
        BY_PATTERN[keyByPattern.get(e.patternId) ?? 'isolation'] ??
        BY_PATTERN.isolation!,
    ]),
  );

  const thisMonday = mondayOf(new Date());
  const rows: (typeof setLogs.$inferInsert)[] = [];
  const weights: (typeof bodyLogs.$inferInsert)[] = [];

  const sessions = [...new Set(plan.map((p) => p.sessionIndex))].sort((a, b) => a - b);

  for (let w = 0; w < DEMO_WEEKS; w++) {
    // w counts forward from the oldest week, so the progression reads the way
    // it was lived rather than backwards from today.
    const weekStart = addDays(thisMonday, -7 * (DEMO_WEEKS - w));

    weights.push({
      id: seedId(userId, 'demoWeight', weekStart),
      userId,
      updatedAt: new Date(`${weekStart}T07:00:00Z`),
      deletedAt: null,
      seq: 0,
      date: weekStart,
      weight: bodyWeightFor(w),
      note: '',
    });

    if (isOff(w)) continue;

    for (const session of sessions) {
      // A missed session here and there — nobody trains every planned day.
      if (w === 3 && session === 2) continue;
      if (w === 16 && session === 1) continue;

      const date = addDays(weekStart, session * 2);
      if (date >= thisMonday) continue;

      for (const entry of plan.filter((p) => p.sessionIndex === session)) {
        if (!entry.exerciseId) continue;
        const load = loadOf.get(entry.exerciseId) ?? BY_PATTERN.isolation!;
        const sets = entry.sets || 3;

        for (let setNo = 1; setNo <= sets; setNo++) {
          const { weight, reps, rir } = setFor(load, w, session, setNo, sets);
          rows.push({
            // Derived, not random, for the same reason the rest of the seed is:
            // this has to be safe to run again over a history it half wrote.
            id: seedId(userId, 'demoLog', `${date}:${entry.exerciseId}:${setNo}`),
            userId,
            updatedAt: new Date(`${date}T18:00:00Z`),
            deletedAt: null,
            seq: 0,
            date,
            session: sessionLabel(session),
            exerciseId: entry.exerciseId,
            setNo,
            weight,
            reps,
            rir,
            note: '',
          });
        }
      }
    }
  }

  // Chunked: a single statement with thousands of parameters trips Postgres's
  // limit, and this is the one place that inserts in bulk.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, seq: nextSeq }));
    await db.insert(setLogs).values(chunk).onConflictDoNothing();
  }
  await db
    .insert(bodyLogs)
    .values(weights.map((r) => ({ ...r, seq: nextSeq })))
    .onConflictDoNothing();
}
