/**
 * The exercise library: one catalogue, authored here, that every account gets.
 *
 * **Why it lives in code.** It used to be copied into each account at sign-up —
 * seventy rows per user, with ids that meant nothing outside that account — and
 * seeding only ever ran for a new, empty account. So an exercise added to the
 * library reached nobody who already had one: shipping the conditioning
 * movements a CrossFit class is made of would have needed a hand-written insert
 * into every existing account. Everything else about an exercise already lived
 * in code, keyed by name — its description and photographs (`details.ts`), its
 * load class (`load.ts`), its translations (`exercise-names.ts`). The rows were
 * the one part that did not, and nothing in the app could edit them anyway.
 *
 * Decided as "global content": one catalogue everybody gets, in the next
 * release, with **no stored id ever rewritten**. Rewriting ids was the design
 * that was ruled out, and for a specific reason: a bad id migration is the one
 * failure here that looks to the user like their training was deleted, and it
 * would have run behind no foreign key, against devices still pushing the old
 * ids from their outboxes.
 *
 * ## How existing accounts keep their history
 *
 * Their per-account rows stay exactly where they are and become **aliases**.
 * `index()` — the single point every screen reads through — matches each row to
 * its catalogue entry by name and reads every set, plan entry and goal that
 * points at the old id as pointing at the catalogue one. Nothing is written.
 * New sets are logged against catalogue ids, and a lift with history under both
 * is one lift with one history.
 *
 * ## The rules this file has to keep
 *
 * - **An id is written out, never computed.** `ex-` plus a slug of the name at
 *   the time it was added — and then frozen. Deriving it from the name at
 *   runtime would mean renaming "DB Row" to "Dumbbell Row" silently orphaned
 *   every set ever logged against it.
 * - **Every id ever published stays published.** `catalogue-ids.ts` is the
 *   append-only record, and `catalogue.test.ts` fails if an id in it no longer
 *   resolves here.
 * - **`retired` is the only way to remove one.** A retired exercise still
 *   resolves, so its history keeps its name and its chart; it is simply never
 *   offered again — not programmed, not swappable, not in the picker.
 * - **Names are frozen too, for now.** Descriptions, load classes and
 *   translations are keyed by the English name, and tests hold every one of
 *   those tables to this list — so a rename fails the suite loudly rather than
 *   quietly losing a description.
 */

import type { PatternKey, Where } from './types';

/**
 * A movement the app will record but will never put in somebody's week.
 *
 * The library carries conditioning work — thrusters, wall balls, box jumps —
 * so that a CrossFit class can be logged at all. Every one
 * of those is a legitimate thing to have done and a poor thing to be
 * *prescribed*: a generated slot arrives asking for three sets of six to twelve,
 * which is not what anybody does with a medicine ball, and a week built out of
 * them would read as a programme nobody wrote.
 *
 * It is a tag rather than a column because `tags` is already a string array on
 * the wire, in Dexie and in Postgres — so this costs no migration, no schema
 * change and no version bump, and an older row that has never heard of it
 * simply does not carry it.
 *
 * It bounds the *generator* and nothing else. A trainer may still name one of
 * these in a plan deliberately, and anybody may log one.
 */
export const OFF_PLAN = 'offPlan';

export interface CatalogueExercise {
  /** `ex-` plus a slug, written out literally. Never computed, never changed. */
  readonly id: string;
  /** The English name. Frozen: the other tables are keyed by it. */
  readonly name: string;
  readonly pattern: PatternKey;
  readonly where: Where;
  /** Bias tags, plus `OFF_PLAN` for movements the generator never programs. */
  readonly tags: readonly string[];
  /** The only legal way to remove an exercise. It stays resolvable for history. */
  readonly retired?: true;
}

const c = (
  id: string,
  name: string,
  pattern: PatternKey,
  where: Where,
  ...tags: string[]
): CatalogueExercise => ({ id, name, pattern, where, tags });

/**
 * The library, in the order the generator's pools use.
 *
 * Order is behaviour, not presentation: `pick()` indexes into each pattern's
 * pool, so moving an entry changes which exercise a generated week gets. The
 * demo account's history and the e2e suite's named lifts are built against this
 * order. Append new exercises at the end of their pattern's group.
 */
export const CATALOGUE: readonly CatalogueExercise[] = [
  /* squat */
  c('ex-goblet-squat', 'Goblet Squat', 'squat', 'home', 'legs'),
  c('ex-leg-press', 'Leg Press', 'squat', 'gym', 'legs'),
  c('ex-barbell-back-squat', 'Barbell Back Squat', 'squat', 'gym', 'legs'),
  c('ex-barbell-front-squat', 'Barbell Front Squat', 'squat', 'gym', 'legs'),
  c('ex-hack-squat', 'Hack Squat', 'squat', 'gym', 'legs'),
  c('ex-zercher-squat', 'Zercher Squat', 'squat', 'gym', 'legs'),
  c('ex-box-squat', 'Box Squat', 'squat', 'gym', 'legs'),
  c('ex-smith-machine-squat', 'Smith Machine Squat', 'squat', 'gym', 'legs'),
  c('ex-bodyweight-squat', 'Bodyweight Squat', 'squat', 'home', 'legs'),
  c('ex-db-squat', 'DB Squat', 'squat', 'home', 'legs'),

  /* hinge */
  c('ex-romanian-deadlift', 'Romanian Deadlift', 'hinge', 'home', 'glutes', 'legs'),
  c('ex-conventional-deadlift', 'Conventional Deadlift', 'hinge', 'gym', 'back'),
  c('ex-trap-bar-deadlift', 'Trap Bar Deadlift', 'hinge', 'gym', 'legs'),
  c('ex-hip-thrust', 'Hip Thrust', 'hinge', 'home', 'glutes'),
  c('ex-good-morning', 'Good Morning', 'hinge', 'gym', 'glutes'),
  c('ex-back-extension', 'Back Extension', 'hinge', 'gym', 'back'),
  c('ex-kettlebell-swing', 'Kettlebell Swing', 'hinge', 'home', 'glutes'),
  c('ex-single-leg-rdl', 'Single-Leg RDL', 'hinge', 'home', 'glutes'),
  c('ex-cable-pull-through', 'Cable Pull-Through', 'hinge', 'gym', 'glutes'),
  c('ex-sumo-deadlift', 'Sumo Deadlift', 'hinge', 'gym', 'glutes', 'legs'),
  c('ex-nordic-curl', 'Nordic Curl', 'hinge', 'home', 'legs'),

  /* lunge */
  c('ex-walking-lunge', 'Walking Lunge', 'lunge', 'home', 'legs', 'glutes'),
  c('ex-reverse-lunge', 'Reverse Lunge', 'lunge', 'home', 'legs'),
  c('ex-bulgarian-split-squat', 'Bulgarian Split Squat', 'lunge', 'home', 'legs', 'glutes'),
  c('ex-step-up', 'Step-Up', 'lunge', 'home', 'legs'),
  c('ex-split-squat', 'Split Squat', 'lunge', 'home', 'legs'),
  c('ex-curtsy-lunge', 'Curtsy Lunge', 'lunge', 'home', 'glutes'),
  c('ex-lateral-lunge', 'Lateral Lunge', 'lunge', 'home', 'legs'),
  c('ex-barbell-reverse-lunge', 'Barbell Reverse Lunge', 'lunge', 'gym', 'legs'),

  /* push */
  c('ex-db-bench-press', 'DB Bench Press', 'push', 'home', 'chest'),
  c('ex-barbell-bench-press', 'Barbell Bench Press', 'push', 'gym', 'chest'),
  c('ex-overhead-press', 'Overhead Press', 'push', 'gym', 'shoulders'),
  c('ex-db-shoulder-press', 'DB Shoulder Press', 'push', 'home', 'shoulders'),
  c('ex-incline-db-press', 'Incline DB Press', 'push', 'home', 'chest'),
  c('ex-push-up', 'Push-Up', 'push', 'home', 'chest'),
  c('ex-dip', 'Dip', 'push', 'gym', 'chest', 'arms'),
  c('ex-machine-chest-press', 'Machine Chest Press', 'push', 'gym', 'chest'),
  c('ex-landmine-press', 'Landmine Press', 'push', 'gym', 'shoulders'),
  c('ex-close-grip-bench-press', 'Close-Grip Bench Press', 'push', 'gym', 'chest', 'arms'),
  c('ex-incline-barbell-press', 'Incline Barbell Press', 'push', 'gym', 'chest'),
  c('ex-push-press', 'Push Press', 'push', 'gym', 'shoulders'),

  /* pull */
  c('ex-lat-pulldown', 'Lat Pulldown', 'pull', 'gym', 'back'),
  c('ex-pull-up', 'Pull-Up', 'pull', 'home', 'back'),
  c('ex-chin-up', 'Chin-Up', 'pull', 'home', 'back', 'arms'),
  c('ex-seated-cable-row', 'Seated Cable Row', 'pull', 'gym', 'back'),
  c('ex-barbell-row', 'Barbell Row', 'pull', 'gym', 'back'),
  c('ex-db-row', 'DB Row', 'pull', 'home', 'back'),
  c('ex-chest-supported-row', 'Chest-Supported Row', 'pull', 'gym', 'back'),
  c('ex-face-pull', 'Face Pull', 'pull', 'gym', 'shoulders', 'back'),
  c('ex-inverted-row', 'Inverted Row', 'pull', 'home', 'back'),
  c('ex-t-bar-row', 'T-Bar Row', 'pull', 'gym', 'back'),
  c('ex-weighted-pull-up', 'Weighted Pull-Up', 'pull', 'gym', 'back'),

  /* rotate */
  c('ex-pallof-press', 'Pallof Press', 'rotate', 'gym'),
  c('ex-cable-woodchop', 'Cable Woodchop', 'rotate', 'gym'),
  c('ex-landmine-rotation', 'Landmine Rotation', 'rotate', 'gym'),
  c('ex-half-kneeling-chop', 'Half-Kneeling Chop', 'rotate', 'gym'),
  c('ex-russian-twist', 'Russian Twist', 'rotate', 'home'),
  c('ex-bird-dog', 'Bird Dog', 'rotate', 'home'),
  c('ex-dead-bug', 'Dead Bug', 'rotate', 'home'),
  c('ex-side-plank', 'Side Plank', 'rotate', 'home'),
  c('ex-hanging-knee-raise', 'Hanging Knee Raise', 'rotate', 'home'),

  /* carry */
  c('ex-farmer-s-carry', "Farmer's Carry", 'carry', 'home'),
  c('ex-suitcase-carry', 'Suitcase Carry', 'carry', 'home'),
  c('ex-front-rack-carry', 'Front Rack Carry', 'carry', 'home'),
  c('ex-overhead-carry', 'Overhead Carry', 'carry', 'home', 'shoulders'),
  c('ex-sled-push', 'Sled Push', 'carry', 'gym', 'legs'),
  c('ex-sled-drag', 'Sled Drag', 'carry', 'gym', 'legs'),
  c('ex-waiter-s-walk', "Waiter's Walk", 'carry', 'home', 'shoulders'),

  /* isolation */
  c('ex-lateral-raise', 'Lateral Raise', 'isolation', 'home', 'shoulders'),
  c('ex-cable-curl', 'Cable Curl', 'isolation', 'gym', 'arms'),
  c('ex-db-curl', 'DB Curl', 'isolation', 'home', 'arms'),
  c('ex-hammer-curl', 'Hammer Curl', 'isolation', 'home', 'arms'),
  c('ex-tricep-pushdown', 'Tricep Pushdown', 'isolation', 'gym', 'arms'),
  c('ex-overhead-tricep-extension', 'Overhead Tricep Extension', 'isolation', 'home', 'arms'),
  c('ex-leg-extension', 'Leg Extension', 'isolation', 'gym', 'legs'),
  c('ex-leg-curl', 'Leg Curl', 'isolation', 'gym', 'legs'),
  c('ex-calf-raise', 'Calf Raise', 'isolation', 'home', 'legs'),
  c('ex-cable-abduction', 'Cable Abduction', 'isolation', 'gym', 'glutes'),
  c('ex-glute-kickback', 'Glute Kickback', 'isolation', 'home', 'glutes'),
  c('ex-rear-delt-fly', 'Rear Delt Fly', 'isolation', 'home', 'shoulders', 'back'),
  c('ex-chest-fly', 'Chest Fly', 'isolation', 'home', 'chest'),
  c('ex-barbell-shrug', 'Barbell Shrug', 'isolation', 'gym', 'back'),
  c('ex-preacher-curl', 'Preacher Curl', 'isolation', 'gym', 'arms'),
  c('ex-skull-crusher', 'Skull Crusher', 'isolation', 'home', 'arms'),
  c('ex-seated-calf-raise', 'Seated Calf Raise', 'isolation', 'gym', 'legs'),
  /* conditioning — logged, never programmed. The movements a class is made
     of. Tagged `OFF_PLAN`, so the generator never puts one in a week and
     their place in this list cannot move anybody's generated week. */
  c('ex-power-clean', 'Power Clean', 'hinge', 'gym', OFF_PLAN),
  c('ex-power-snatch', 'Power Snatch', 'hinge', 'gym', OFF_PLAN),
  c('ex-clean-and-jerk', 'Clean and Jerk', 'hinge', 'gym', OFF_PLAN),
  c('ex-push-jerk', 'Push Jerk', 'push', 'gym', OFF_PLAN),
  c('ex-overhead-squat', 'Overhead Squat', 'squat', 'gym', OFF_PLAN),
  c('ex-front-rack-lunge', 'Front Rack Lunge', 'lunge', 'gym', OFF_PLAN),
  c('ex-thruster', 'Thruster', 'squat', 'gym', OFF_PLAN),
  c('ex-db-snatch', 'DB Snatch', 'hinge', 'home', OFF_PLAN),
  c('ex-devils-press', "Devil's Press", 'hinge', 'home', OFF_PLAN),
  c('ex-kettlebell-snatch', 'Kettlebell Snatch', 'hinge', 'home', OFF_PLAN),
  c('ex-wall-ball', 'Wall Ball', 'squat', 'home', OFF_PLAN),
  c('ex-box-jump', 'Box Jump', 'squat', 'home', OFF_PLAN),
  c('ex-chest-to-bar-pull-up', 'Chest-to-Bar Pull-Up', 'pull', 'home', OFF_PLAN),
  c('ex-ring-row', 'Ring Row', 'pull', 'home', OFF_PLAN),
  c('ex-handstand-push-up', 'Handstand Push-Up', 'push', 'home', OFF_PLAN),
  c('ex-ring-dip', 'Ring Dip', 'push', 'gym', OFF_PLAN),
  c('ex-toes-to-bar', 'Toes-to-Bar', 'rotate', 'home', OFF_PLAN),
  c('ex-ghd-sit-up', 'GHD Sit-Up', 'rotate', 'gym', OFF_PLAN),
  c('ex-turkish-get-up', 'Turkish Get-Up', 'carry', 'home', OFF_PLAN),
  c('ex-sandbag-carry', 'Sandbag Carry', 'carry', 'home', OFF_PLAN),
];

/** Every catalogue entry by id, retired ones included — history has to resolve. */
export const catalogueById: ReadonlyMap<string, CatalogueExercise> = new Map(
  CATALOGUE.map((e) => [e.id, e]),
);
