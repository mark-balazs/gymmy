/**
 * Default content for a new account.
 *
 * Every pattern has at least one `home` exercise, so a home program can still
 * cover all seven. If that ever stops being true the coverage guarantee quietly
 * breaks for home users — `seed.test.ts` asserts it.
 */

import type { PatternKey, Role, SlotKey, SlotRole, Where } from './types';

export interface SeedPattern {
  key: PatternKey;
  role: Role;
  counts: boolean;
}

export const SEED_PATTERNS: SeedPattern[] = [
  { key: 'squat', role: 'Lower', counts: true },
  { key: 'hinge', role: 'Lower', counts: true },
  { key: 'lunge', role: 'Lower', counts: true },
  { key: 'push', role: 'Upper', counts: true },
  { key: 'pull', role: 'Upper', counts: true },
  { key: 'rotate', role: 'Midline', counts: true },
  { key: 'carry', role: 'Midline', counts: true },
  // Taggable, never a coverage box: accessories sit on top of the patterns.
  { key: 'isolation', role: 'Accessory', counts: false },
];

export interface SeedSlot {
  key: SlotKey;
  requiredRole: SlotRole;
}

export const SEED_SLOTS: SeedSlot[] = [
  { key: 'bigLower', requiredRole: 'Lower' },
  { key: 'bigUpper', requiredRole: 'Upper' },
  { key: 'accessory', requiredRole: 'Any' },
  { key: 'isolation', requiredRole: 'Any' },
  { key: 'finisher', requiredRole: 'Midline' },
];

export interface SeedExercise {
  name: string;
  pattern: PatternKey;
  where: Where;
  tags: string[];
}

const e = (name: string, pattern: PatternKey, where: Where, ...tags: string[]): SeedExercise => ({
  name,
  pattern,
  where,
  tags,
});

export const SEED_EXERCISES: SeedExercise[] = [
  e('Goblet Squat', 'squat', 'home', 'legs'),
  e('Leg Press', 'squat', 'gym', 'legs'),
  e('Barbell Back Squat', 'squat', 'gym', 'legs'),
  e('Barbell Front Squat', 'squat', 'gym', 'legs'),
  e('Hack Squat', 'squat', 'gym', 'legs'),
  e('Zercher Squat', 'squat', 'gym', 'legs'),
  e('Box Squat', 'squat', 'gym', 'legs'),
  e('Smith Machine Squat', 'squat', 'gym', 'legs'),

  e('Romanian Deadlift', 'hinge', 'home', 'glutes', 'legs'),
  e('Conventional Deadlift', 'hinge', 'gym', 'back'),
  e('Trap Bar Deadlift', 'hinge', 'gym', 'legs'),
  e('Hip Thrust', 'hinge', 'home', 'glutes'),
  e('Good Morning', 'hinge', 'gym', 'glutes'),
  e('Back Extension', 'hinge', 'gym', 'back'),
  e('Kettlebell Swing', 'hinge', 'home', 'glutes'),
  e('Single-Leg RDL', 'hinge', 'home', 'glutes'),
  e('Cable Pull-Through', 'hinge', 'gym', 'glutes'),

  e('Walking Lunge', 'lunge', 'home', 'legs', 'glutes'),
  e('Reverse Lunge', 'lunge', 'home', 'legs'),
  e('Bulgarian Split Squat', 'lunge', 'home', 'legs', 'glutes'),
  e('Step-Up', 'lunge', 'home', 'legs'),
  e('Split Squat', 'lunge', 'home', 'legs'),
  e('Curtsy Lunge', 'lunge', 'home', 'glutes'),
  e('Lateral Lunge', 'lunge', 'home', 'legs'),

  e('DB Bench Press', 'push', 'home', 'chest'),
  e('Barbell Bench Press', 'push', 'gym', 'chest'),
  e('Overhead Press', 'push', 'gym', 'shoulders'),
  e('DB Shoulder Press', 'push', 'home', 'shoulders'),
  e('Incline DB Press', 'push', 'home', 'chest'),
  e('Push-Up', 'push', 'home', 'chest'),
  e('Dip', 'push', 'gym', 'chest', 'arms'),
  e('Machine Chest Press', 'push', 'gym', 'chest'),
  e('Landmine Press', 'push', 'gym', 'shoulders'),

  e('Lat Pulldown', 'pull', 'gym', 'back'),
  e('Pull-Up', 'pull', 'home', 'back'),
  e('Chin-Up', 'pull', 'home', 'back', 'arms'),
  e('Seated Cable Row', 'pull', 'gym', 'back'),
  e('Barbell Row', 'pull', 'gym', 'back'),
  e('DB Row', 'pull', 'home', 'back'),
  e('Chest-Supported Row', 'pull', 'gym', 'back'),
  e('Face Pull', 'pull', 'gym', 'shoulders', 'back'),
  e('Inverted Row', 'pull', 'home', 'back'),

  e('Pallof Press', 'rotate', 'gym'),
  e('Cable Woodchop', 'rotate', 'gym'),
  e('Landmine Rotation', 'rotate', 'gym'),
  e('Half-Kneeling Chop', 'rotate', 'gym'),
  e('Russian Twist', 'rotate', 'home'),
  e('Bird Dog', 'rotate', 'home'),
  e('Dead Bug', 'rotate', 'home'),
  e('Side Plank', 'rotate', 'home'),

  e("Farmer's Carry", 'carry', 'home'),
  e('Suitcase Carry', 'carry', 'home'),
  e('Front Rack Carry', 'carry', 'home'),
  e('Overhead Carry', 'carry', 'home', 'shoulders'),
  e('Sled Push', 'carry', 'gym', 'legs'),
  e('Sled Drag', 'carry', 'gym', 'legs'),
  e("Waiter's Walk", 'carry', 'home', 'shoulders'),

  e('Lateral Raise', 'isolation', 'home', 'shoulders'),
  e('Cable Curl', 'isolation', 'gym', 'arms'),
  e('DB Curl', 'isolation', 'home', 'arms'),
  e('Hammer Curl', 'isolation', 'home', 'arms'),
  e('Tricep Pushdown', 'isolation', 'gym', 'arms'),
  e('Overhead Tricep Extension', 'isolation', 'home', 'arms'),
  e('Leg Extension', 'isolation', 'gym', 'legs'),
  e('Leg Curl', 'isolation', 'gym', 'legs'),
  e('Calf Raise', 'isolation', 'home', 'legs'),
  e('Cable Abduction', 'isolation', 'gym', 'glutes'),
  e('Glute Kickback', 'isolation', 'home', 'glutes'),
  e('Rear Delt Fly', 'isolation', 'home', 'shoulders', 'back'),
  e('Chest Fly', 'isolation', 'home', 'chest'),
];
