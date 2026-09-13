/**
 * Creates the default content for a new account: the seven patterns, the slot
 * skeleton, the exercise library and an un-onboarded profile.
 *
 * Runs server-side on first sign-in so a brand-new device syncs down a usable
 * app rather than an empty one.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  exercises,
  patterns,
  profiles,
  programEntries,
  slots,
  splitPeriods,
} from '@/lib/db/schema';
import { SEED_EXERCISES, SEED_PATTERNS, buildSlots, findSplit } from '@athletic/domain';
import { buildProgram, index, mondayOf } from '@athletic/domain';
import type { Snapshot } from '@athletic/domain';
import { isDemoEmail, seedDemoHistory } from './seed-demo';

/** All seeded rows share one sequence value — they are one logical change. */
export const nextSeq = sql<number>`nextval('change_seq')`;

export async function seedNewUser(userId: string, email?: string | null): Promise<void> {
  const now = new Date();

  /* The demo account skips setup and arrives mid-block. Everything else about
   * it is an ordinary account — same tables, same sync, no special cases
   * downstream — which is the point: a demo that runs on a different code path
   * is a demo of something you do not ship. */
  const isDemo = isDemoEmail(email);

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
        description: x.description,
        images: x.images,
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
    onboarded: isDemo,
    split: defaultSplit.key,
    days: defaultSplit.defaultDays,
    where: 'gym',
    bias: 'none',
    blockStart: mondayOf(now),
    blockWeeks: 8,
    unit: 'kg',
    lang: 'en',
    theme: 'system',
  });

  if (!isDemo) return;

  /* Built with the real generator over the rows just written, so the demo's
   * week is one the app would actually have produced — and its coverage
   * guarantee holds for the same reason everyone else's does. */
  const snapshot: Snapshot = {
    patterns: patternRows.map((r) => ({ ...r, updatedAt: now.toISOString(), deletedAt: null })),
    exercises: exerciseRows.map((r) => ({ ...r, updatedAt: now.toISOString(), deletedAt: null })),
    slots: slotRows.map((r) => ({ ...r, updatedAt: now.toISOString(), deletedAt: null })),
    splitPeriods: [{ ...periodRow, updatedAt: now.toISOString(), deletedAt: null }],
    entries: [],
    logs: [],
    refSets: [],
    profile: null,
  };

  const draft = buildProgram(index(snapshot), {
    days: defaultSplit.defaultDays,
    where: 'gym',
    bias: 'none',
  });

  await db.insert(programEntries).values(
    draft.map((d) => ({
      id: crypto.randomUUID(),
      userId,
      updatedAt: now,
      deletedAt: null,
      seq: nextSeq,
      ...d,
    })),
  );

  await seedDemoHistory(userId);
}
