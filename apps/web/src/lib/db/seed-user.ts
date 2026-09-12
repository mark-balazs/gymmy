/**
 * Creates the default content for a new account: the seven patterns, the slot
 * skeleton, the exercise library and an un-onboarded profile.
 *
 * Runs server-side on first sign-in so a brand-new device syncs down a usable
 * app rather than an empty one.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exercises, patterns, profiles, slots, splitPeriods } from '@/lib/db/schema';
import { SEED_EXERCISES, SEED_PATTERNS, buildSlots, findSplit } from '@athletic/domain';
import { mondayOf } from '@athletic/domain';

/** All seeded rows share one sequence value — they are one logical change. */
export const nextSeq = sql<number>`nextval('change_seq')`;

export async function seedNewUser(userId: string): Promise<void> {
  const now = new Date();

  const patternRows = SEED_PATTERNS.map((p, i) => ({
    id: crypto.randomUUID(),
    userId,
    updatedAt: now,
    deletedAt: null,
    seq: 0,
    key: p.key,
    name: p.key,
    role: p.role,
    counts: p.counts,
    position: i,
  }));
  const patternIdByKey = new Map(patternRows.map((p) => [p.key, p.id]));

  // Seeded with the default split at its default length. Onboarding replaces
  // these the moment the user picks a split, so this only has to be valid.
  const defaultSplit = findSplit('sevenPattern')!;
  const slotRows = buildSlots(defaultSplit, defaultSplit.defaultDays).map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    userId,
    updatedAt: now,
    deletedAt: null,
    seq: 0,
  }));

  const exerciseRows = SEED_EXERCISES.flatMap((x) => {
    const patternId = patternIdByKey.get(x.pattern);
    if (!patternId) return [];
    return [
      {
        id: crypto.randomUUID(),
        userId,
        updatedAt: now,
        deletedAt: null,
        seq: 0,
        name: x.name,
        patternId,
        where: x.where,
        tags: x.tags,
      },
    ];
  });

  // The opening period. Every account has one from the start, so coverage is
  // never scored against a guess about what the user was training.
  const periodRow = {
    id: crypto.randomUUID(),
    userId,
    updatedAt: now,
    deletedAt: null,
    seq: 0,
    split: defaultSplit.key,
    days: defaultSplit.defaultDays,
    startWeek: mondayOf(now),
    patternKeys: [...defaultSplit.covers],
  };

  await db.insert(patterns).values(patternRows.map((r) => ({ ...r, seq: nextSeq })));
  await db.insert(splitPeriods).values({ ...periodRow, seq: nextSeq });
  await db.insert(slots).values(slotRows.map((r) => ({ ...r, seq: nextSeq })));
  await db.insert(exercises).values(exerciseRows.map((r) => ({ ...r, seq: nextSeq })));
  await db.insert(profiles).values({
    id: userId,
    userId,
    updatedAt: now,
    deletedAt: null,
    seq: nextSeq,
    onboarded: false,
    split: defaultSplit.key,
    days: defaultSplit.defaultDays,
    where: 'gym',
    bias: 'none',
    blockStart: mondayOf(now),
    blockWeeks: 8,
    unit: 'kg',
    lang: 'en',
  });
}
