/**
 * Default content for a new account.
 *
 * Every pattern has at least one `home` exercise, so a home program can still
 * cover all seven. If that ever stops being true the coverage guarantee quietly
 * breaks for home users — `seed.test.ts` asserts it.
 */

import { CATALOGUE } from './catalogue';
import { EXERCISE_DETAILS } from './details';
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
  description: string;
  images: string[];
}

/**
 * The catalogue, in the shape the older seeding code and fixtures expect.
 *
 * A view, not a second list. It used to *be* the library — seventy entries typed
 * out here and copied into every new account — which is what made adding an
 * exercise reach nobody who already had one. The library is `CATALOGUE` now, and
 * this derives from it so the two cannot disagree. Retired entries are left out:
 * nothing new should ever be built against one.
 *
 * Details are joined in from their own file purely for length — a paragraph and
 * two image paths inline would bury the pattern and equipment. `seed.test.ts`
 * asserts every exercise has an entry.
 */
export const SEED_EXERCISES: SeedExercise[] = CATALOGUE.filter((x) => !x.retired).map((x) => ({
  name: x.name,
  pattern: x.pattern,
  where: x.where,
  tags: [...x.tags],
  description: EXERCISE_DETAILS[x.name]?.description ?? '',
  images: EXERCISE_DETAILS[x.name]?.images ?? [],
}));
