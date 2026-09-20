/**
 * Creates the default content for a new account: the seven patterns, the slot
 * skeleton and an un-onboarded profile.
 *
 * **Not the exercise library.** That is the catalogue now, in code, and every
 * account reads it — so an exercise added to it reaches everybody on the next
 * release, which copying seventy rows into each new account never could.
 * Accounts created before this still have their copied rows; `index()` reads
 * them as aliases, and nothing here touches them.
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
 *
 * **And it is one transaction**, so a half-written one should no longer exist.
 * Written a statement at a time, a timeout between two of them left patterns
 * and no profile — permanently, because the repair looked for an account with
 * *nothing* in it (GYM-70). See `inOneTransaction`: Neon's HTTP driver has no
 * interactive transaction, so the statements are built first and sent as a
 * batch, which means nothing here may read a row it has just written.
 */

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { inOneTransaction } from '@/lib/db';
import { patterns, profiles, programEntries, slots, splitPeriods } from '@/lib/db/schema';
import { SEED_PATTERNS, buildSlots, findSplit } from '@athletic/domain';
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

  const profileRow = {
    id: userId,
    userId,
    updatedAt: now,
    deletedAt: null,
    seq: nextSeq,
    onboarded: isDemo,
    split: defaultSplit.key,
    days: defaultSplit.defaultDays,
    where: 'gym' as const,
    bias: 'none' as const,
    blockStart: startWeek,
    blockWeeks,
    unit: 'kg' as const,
    lang: 'en' as const,
    theme: 'system' as const,
    /* The demo needs these: without a sex and a bodyweight there is no
     * strength score to show, and the one screen it most needs to sell sits
     * there saying "add your bodyweight". A real account is asked instead. */
    heightCm: isDemo ? DEMO_HEIGHT_CM : null,
    sex: isDemo ? DEMO_SEX : ('unspecified' as const),
  };

  /* The demo's week, built by the real generator over the rows about to be
   * written — in memory, because nothing can be read back mid-transaction, and
   * because the generator only ever needed the rows themselves. So the demo's
   * week is one the app would actually have produced, and its coverage
   * guarantee holds for the same reason everyone else's does. */
  const entryRows = !isDemo
    ? []
    : demoWeek(userId, now, patternRows, slotRows, periodRow, defaultSplit.defaultDays);

  /**
   * All of it, or none of it.
   *
   * These four tables are what makes an account openable, and the profile is
   * the row the app waits for. Written one statement at a time, a timeout
   * between two of them left a real, permanent state: patterns and no profile,
   * which renders as a loading screen that never resolves and which the old
   * repair — "asked from zero and got nothing" — could never reach, because
   * the patterns came back and moved the cursor past zero (GYM-70).
   *
   * Still idempotent on every row, and that is still load-bearing: the seed
   * runs from Auth.js's `createUser` event *and* from the sync repair, so two
   * of them can overlap, and neither may produce a second library or reset a
   * profile somebody has since edited.
   */
  await inOneTransaction((on) => [
    on
      .insert(patterns)
      .values(patternRows.map((r) => ({ ...r, seq: nextSeq })))
      .onConflictDoNothing(),
    on
      .insert(splitPeriods)
      .values({ ...periodRow, seq: nextSeq })
      .onConflictDoNothing(),
    on
      .insert(slots)
      .values(slotRows.map((r) => ({ ...r, seq: nextSeq })))
      .onConflictDoNothing(),
    on
      .insert(profiles)
      .values(profileRow)
      // Never overwritten: a retry must not reset someone's settings, and the
      // profile is the row most likely to have been edited since.
      .onConflictDoNothing(),
    ...(entryRows.length
      ? [on.insert(programEntries).values(entryRows).onConflictDoNothing()]
      : []),
  ]);

  /* Outside the transaction on purpose: months of generated sets, and nothing
   * about the demo's history decides whether the account opens. */
  if (isDemo) await seedDemoHistory(userId);
}

/** The demo's opening week, as program entry rows. */
function demoWeek(
  userId: string,
  now: Date,
  patternRows: { updatedAt: Date; deletedAt: null }[],
  slotRows: { updatedAt: Date; deletedAt: null }[],
  periodRow: { updatedAt: Date; deletedAt: null },
  days: number,
) {
  const iso = now.toISOString();
  const snapshot: Snapshot = {
    patterns: patternRows.map((r) => ({ ...r, updatedAt: iso, deletedAt: null })) as never,
    // None: the library is the catalogue, which `index()` supplies.
    exercises: [],
    slots: slotRows.map((r) => ({ ...r, updatedAt: iso, deletedAt: null })) as never,
    splitPeriods: [{ ...periodRow, updatedAt: iso, deletedAt: null }] as never,
    entries: [],
    logs: [],
    bodyLogs: [],
    goals: [],
    profile: null,
  };

  const draft = buildProgram(index(snapshot), {
    days,
    where: 'gym',
    bias: 'none',
    /* Zero, deliberately, and not the account's own offset. The demo's history
       is authored against exactly this week — `demo-loads` names the lifts and
       `demo-history.test.ts` asserts which one stalled and which slid — so the
       demo has to get the pool's own order, not a per-account shuffle of it. */
    variety: 0,
  });

  return draft.map((d) => ({
    id: seedId(userId, 'entry', `${d.sessionIndex}:${d.slotId}`),
    userId,
    updatedAt: now,
    deletedAt: null,
    seq: nextSeq,
    ...d,
  }));
}
