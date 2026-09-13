/**
 * Creates the default content for a new account: the seven patterns, the slot
 * skeleton, the exercise library and an un-onboarded profile.
 *
 * Runs server-side on first sign-in so a brand-new device syncs down a usable
 * app rather than an empty one.
 *
 * **Safe to run more than once, and that is the point.** Auth.js fires its
 * `createUser` event exactly once per account, so a seeding failure there used
 * to be permanent: the user row existed, the event would never fire again, and
 * the account was left signed in and forever empty — which the app can only
 * render as a loading screen that never resolves. So every row here has an id
 * derived from the account and the thing it represents, and every insert
 * ignores conflicts. Running this twice writes the same library twice into the
 * same rows; running it over a half-written one completes it.
 */

import { createHash } from 'node:crypto';
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
import { addDays, buildProgram, index, mondayOf } from '@athletic/domain';
import type { Snapshot } from '@athletic/domain';
import { DEMO_HEIGHT_CM, DEMO_SEX, DEMO_WEEKS } from './demo-history';
import { isDemoEmail, seedDemoHistory } from './seed-demo';

/** All seeded rows share one sequence value — they are one logical change. */
export const nextSeq = sql<number>`nextval('change_seq')`;

/**
 * A stable id for a seeded row.
 *
 * Hashed rather than concatenated so every id has the same shape as the UUIDs
 * the client generates, and so an exercise name with a colon or an apostrophe
 * in it cannot collide with anything. The account is part of the input, so two
 * users never share an id.
 */
export const seedId = (userId: string, kind: string, key: string): string =>
  createHash('sha256').update(`${userId}\u0000${kind}\u0000${key}`).digest('hex').slice(0, 32);

export async function seedNewUser(userId: string, email?: string | null): Promise<void> {
  const now = new Date();

  /* The demo account skips setup and arrives mid-block. Everything else about
   * it is an ordinary account — same tables, same sync, no special cases
   * downstream — which is the point: a demo that runs on a different code path
   * is a demo of something you do not ship. */
  const isDemo = isDemoEmail(email);

  const patternRows = SEED_PATTERNS.map((p, i) => ({
    id: seedId(userId, 'pattern', p.key),
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
    id: seedId(userId, 'slot', `${s.sessionIndex}:${s.position}`),
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
        id: seedId(userId, 'exercise', x.name),
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

  /* The block a new account starts in. The demo arrives mid-block with months
   * of training behind it, so its block has to reach back far enough that the
   * Week tab can page into that history and the progress charts can plot it —
   * a block starting today would hide everything the demo exists to show. */
  const thisWeek = mondayOf(now);
  const startWeek = isDemo ? addDays(thisWeek, -7 * DEMO_WEEKS) : thisWeek;
  const blockWeeks = isDemo ? DEMO_WEEKS + 1 : 8;

  // The opening period. Every account has one from the start, so coverage is
  // never scored against a guess about what the user was training.
  const periodRow = {
    id: seedId(userId, 'period', startWeek),
    userId,
    updatedAt: now,
    deletedAt: null,
    seq: 0,
    split: defaultSplit.key,
    days: defaultSplit.defaultDays,
    startWeek,
    patternKeys: [...defaultSplit.covers],
  };

  await db
    .insert(patterns)
    .values(patternRows.map((r) => ({ ...r, seq: nextSeq })))
    .onConflictDoNothing();
  await db
    .insert(splitPeriods)
    .values({ ...periodRow, seq: nextSeq })
    .onConflictDoNothing();
  await db
    .insert(slots)
    .values(slotRows.map((r) => ({ ...r, seq: nextSeq })))
    .onConflictDoNothing();
  await db
    .insert(exercises)
    .values(exerciseRows.map((r) => ({ ...r, seq: nextSeq })))
    .onConflictDoNothing();
  await db
    .insert(profiles)
    .values({
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
      blockStart: startWeek,
      blockWeeks,
      unit: 'kg',
      lang: 'en',
      theme: 'system',
      /* The demo needs these: without a sex and a bodyweight there is no
       * strength score to show, and the one screen it most needs to sell sits
       * there saying "add your bodyweight". A real account is asked instead. */
      heightCm: isDemo ? DEMO_HEIGHT_CM : null,
      sex: isDemo ? DEMO_SEX : 'unspecified',
    })
    // Never overwritten: a retry must not reset someone's settings, and the
    // profile is the row most likely to have been edited since.
    .onConflictDoNothing();

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
    bodyLogs: [],
    profile: null,
  };

  const draft = buildProgram(index(snapshot), {
    days: defaultSplit.defaultDays,
    where: 'gym',
    bias: 'none',
  });

  await db
    .insert(programEntries)
    .values(
      draft.map((d) => ({
        id: seedId(userId, 'entry', `${d.sessionIndex}:${d.slotId}`),
        userId,
        updatedAt: now,
        deletedAt: null,
        seq: nextSeq,
        ...d,
      })),
    )
    .onConflictDoNothing();

  await seedDemoHistory(userId);
}
