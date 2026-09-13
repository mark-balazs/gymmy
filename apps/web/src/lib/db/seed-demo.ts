/**
 * Six weeks of plausible training, for showing the app to someone.
 *
 * An empty account demonstrates nothing: the coverage grid has no ticks, the
 * progress charts have no line, and "ready for more weight" — the thing that
 * makes the app worth using — cannot appear at all, because it needs history to
 * derive a verdict from. So the demo account arrives having already trained.
 *
 * The history is generated rather than fixed, so it always ends *last week* and
 * the demo never looks abandoned. It is also deliberately imperfect: one week
 * has a missed session and the carries are patchy, because a demo where every
 * box is green never shows what the app is actually for.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exercises as exercisesTable, patterns, programEntries, setLogs } from '@/lib/db/schema';
import { mondayOf, sessionLabel } from '@athletic/domain';
import { nextSeq } from './seed-user';

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

const WEEKS = 6;

/** Roughly where a healthy intermediate starts, per movement. */
const START: Record<string, { weight: number; reps: number; step: number }> = {
  squat: { weight: 70, reps: 6, step: 2.5 },
  hinge: { weight: 90, reps: 6, step: 5 },
  lunge: { weight: 20, reps: 8, step: 2.5 },
  push: { weight: 50, reps: 6, step: 2.5 },
  pull: { weight: 45, reps: 8, step: 2.5 },
  rotate: { weight: 15, reps: 12, step: 2.5 },
  carry: { weight: 24, reps: 30, step: 4 },
  isolation: { weight: 12, reps: 12, step: 1 },
};

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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

  /** Exercise → its movement pattern, which is what decides a sane weight: a
   *  deadlift and a lateral raise have nothing in common numerically. */
  const keyByPattern = new Map(patternRows.map((p) => [p.id, p.key]));
  const patternOfExercise = new Map(
    library.map((e) => [e.id, keyByPattern.get(e.patternId) ?? 'isolation']),
  );

  const now = new Date();
  const thisMonday = mondayOf(now);
  const rows: (typeof setLogs.$inferInsert)[] = [];

  for (let w = WEEKS; w >= 1; w--) {
    const weekStart = addDays(thisMonday, -7 * w);

    // One week off, so the coverage view has something to say.
    const skipWeek = w === 3;

    const sessions = [...new Set(plan.map((p) => p.sessionIndex))].sort((a, b) => a - b);
    for (const session of sessions) {
      // A missed session here and there — nobody trains every planned day.
      if (skipWeek && session === 2) continue;

      const date = addDays(weekStart, session * 2);
      if (date >= thisMonday) continue;

      for (const entry of plan.filter((p) => p.sessionIndex === session)) {
        if (!entry.exerciseId) continue;

        const pattern = patternOfExercise.get(entry.exerciseId) ?? 'isolation';
        const base = START[pattern] ?? START.isolation!;

        // Progress week on week, held back slightly so it looks like training
        // rather than a straight line.
        const gained = Math.floor((WEEKS - w) / 2) * base.step;
        const weight = base.weight + gained;

        for (let setNo = 1; setNo <= (entry.sets || 3); setNo++) {
          rows.push({
            id: crypto.randomUUID(),
            userId,
            updatedAt: new Date(`${date}T18:00:00Z`),
            deletedAt: null,
            seq: 0,
            date,
            session: sessionLabel(session),
            exerciseId: entry.exerciseId,
            setNo,
            weight,
            // The last set is always the hard one.
            reps: Math.max(1, base.reps - (setNo - 1)),
            rir: setNo === (entry.sets || 3) ? 0 : 2,
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
    await db.insert(setLogs).values(chunk);
  }
}
