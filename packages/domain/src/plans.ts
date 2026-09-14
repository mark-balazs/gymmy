/**
 * A plan, as a thing that can travel between two accounts.
 *
 * A trainer builds one and shares it; somebody else puts it into effect. That
 * crossing is the whole difficulty, and it is the reason this file exists
 * separately from `splits.ts`.
 *
 * **A plan carries no identifiers from anybody's account.** Not the trainer's
 * and not the athlete's. Exercise rows are keyed `sha256(userId, 'exercise',
 * name)`, so a trainer's exercise id is a meaningless string in every other
 * account in the system — a plan that referenced one would apply cleanly,
 * resolve to nothing, and leave somebody with an empty week and no error. So a
 * plan names exercises the way a person would: by name, resolved against the
 * athlete's own library at the moment it is applied.
 *
 * **A plan is applied, not linked.** Putting one into effect materialises
 * ordinary `Slot` rows and an appended `SplitPeriod`, exactly as a preset or a
 * hand-built week does — `installSkeleton` is the single funnel all three go
 * through. Nothing downstream knows a trainer was involved, which is what keeps
 * historisation, offline and last-write-wins working untouched: after the
 * moment of application it is simply your week. A trainer's later edit is a new
 * version to be offered, never a rewrite of a week somebody is standing in.
 */

import type { Indexed } from './model';
import type { SlotDraft } from './splits';
import type { DayKey, PatternKey, SlotKey, SlotRole, Where } from './types';

/** One slot of a plan: the skeleton, plus what the trainer wants done in it. */
export interface PlanSlot {
  sessionIndex: number;
  position: number;
  key: SlotKey | null;
  name: string;
  requiredRole: SlotRole;
  patternKeys: PatternKey[] | null;
  dayKey: DayKey | null;
  /**
   * The exercise the trainer chose, by name — the only handle that means the
   * same thing in two accounts. Null leaves the choice to the generator, which
   * is a legitimate thing for a trainer to want: "a push here, you pick".
   */
  exerciseName: string | null;
  sets: number;
  repRange: string;
}

/** A plan as it travels. No ids, no user, no row that belongs to an account. */
export interface PlanShape {
  name: string;
  description: string;
  /** Cadence: how many sessions a week this plan is written for. */
  days: number;
  where: Where;
  slots: PlanSlot[];
}

/** How a filled slot is addressed once it becomes a row. */
export const planSlotKey = (sessionIndex: number, position: number): string =>
  `${sessionIndex}:${position}`;

/** What a plan asks for in one slot, once its exercise has been resolved. */
export interface PlanFill {
  /** Null when the trainer left it open, or named something this account does
   *  not have — both of which hand the slot back to the generator. */
  exerciseId: string | null;
  sets: number;
  repRange: string;
}

/** Names are matched the way a person would match them. */
const normalise = (name: string): string => name.trim().toLowerCase();

/**
 * The skeleton, in the shape `installSkeleton` already takes.
 *
 * Deliberately drops the exercises: slots are the week's structure and the
 * coverage goal is derived from them, while which exercise fills one is a
 * separate question answered by `planFill`. Keeping them apart is what lets a
 * plan whose exercises do not all resolve still install a correct week.
 */
export function planToDrafts(plan: PlanShape): SlotDraft[] {
  return plan.slots
    .slice()
    .sort((a, b) => a.sessionIndex - b.sessionIndex || a.position - b.position)
    .map((s) => ({
      key: s.key,
      name: s.name,
      requiredRole: s.requiredRole,
      position: s.position,
      sessionIndex: s.sessionIndex,
      patternKeys: s.patternKeys,
      dayKey: s.dayKey,
    }));
}

/**
 * The trainer's choices, resolved against this account's library.
 *
 * Unresolvable names produce a fill with no exercise rather than no fill at
 * all, so the trainer's sets and rep range still land on a slot the generator
 * then chooses a movement for. A plan written around a machine somebody does
 * not have should cost them that exercise, not that session.
 */
export function planFill(plan: PlanShape, ix: Indexed): Map<string, PlanFill> {
  // `index()` has already dropped deleted rows, so this is the live library.
  const byName = new Map(ix.exercises.map((x) => [normalise(x.name), x.id]));

  const out = new Map<string, PlanFill>();
  for (const s of plan.slots) {
    out.set(planSlotKey(s.sessionIndex, s.position), {
      exerciseId: s.exerciseName ? (byName.get(normalise(s.exerciseName)) ?? null) : null,
      sets: s.sets,
      repRange: s.repRange,
    });
  }
  return out;
}

/**
 * The exercises this plan names that this account does not have.
 *
 * Shown before applying, because "your week will not be quite what your trainer
 * wrote" is a thing somebody should learn from a screen rather than from
 * noticing months later that they have never once done the movement they were
 * told to.
 */
export function unresolvedExercises(plan: PlanShape, ix: Indexed): string[] {
  const have = new Set(ix.exercises.map((x) => normalise(x.name)));
  const missing = new Set<string>();
  for (const s of plan.slots) {
    if (s.exerciseName && !have.has(normalise(s.exerciseName))) missing.add(s.exerciseName);
  }
  return [...missing].sort();
}

/** How many distinct sessions a plan actually describes. */
export const planSessions = (plan: PlanShape): number =>
  new Set(plan.slots.map((s) => s.sessionIndex)).size;

/** Which plan a profile is on, if any. */
export interface AppliedPlan {
  id: string;
  version: number;
}

/**
 * The plan in effect, read safely.
 *
 * This exists because of a trap that has already taken the app down once. The
 * server only re-sends a row whose `seq` moved, and **adding a column does not
 * move it** — so a device that synced before `planId` existed holds a profile
 * with no such key, forever. `profile.planId !== null` is then `true` for an
 * account that has never seen a plan, because `undefined !== null`, and the app
 * goes looking for a plan that was never applied.
 *
 * So both fields are required together and normalised here, at the one place
 * everything reads through.
 */
export function planOf(
  profile: { planId?: string | null; planVersion?: number | null } | null,
): AppliedPlan | null {
  const id = profile?.planId ?? null;
  const version = profile?.planVersion ?? null;
  return id && version ? { id, version } : null;
}

/** Whether the trainer has published something newer than what is in effect. */
export const planIsStale = (applied: AppliedPlan | null, latestVersion: number): boolean =>
  applied !== null && latestVersion > applied.version;
