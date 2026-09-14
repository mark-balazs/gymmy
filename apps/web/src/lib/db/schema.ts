/**
 * Database schema.
 *
 * Sync design: every row carries `seq`, drawn from one shared Postgres sequence.
 * That gives every change across every table a single total order, so a client
 * can ask "what changed after cursor N?" and get a complete, gap-free answer
 * without comparing wall clocks between devices.
 *
 * `updatedAt` is the client's clock and is used only for last-write-wins on a
 * conflicting edit. It is never used for ordering, because device clocks drift.
 */

import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';

/* ------------------------------------------------------------- auth.js -- */

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  /** Extensible rather than a boolean: reporting and auditing will want more
   *  than 'is a trainer', and a column is far cheaper to widen than a flag. */
  role: text('role').$type<UserRole>().notNull().default('athlete'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

/**
 * One row per sign-in code request, kept just long enough to rate limit.
 *
 * In Postgres rather than memory because the app runs on serverless functions:
 * an in-process counter is per-instance, so it caps nothing once there is more
 * than one instance — which there always is under the load that would matter.
 *
 * Both an email and a client key are recorded. The email alone would let one
 * attacker spray thousands of different addresses; the client alone would let a
 * distributed one bury a single victim's inbox.
 */
export const signInAttempts = pgTable(
  'sign_in_attempts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull(),
    client: text('client').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sign_in_attempts_email').on(t.email, t.createdAt),
    index('sign_in_attempts_client').on(t.client, t.createdAt),
  ],
);

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ------------------------------------------------------- synced records -- */

/** Columns every replicated table shares. */
const synced = {
  id: text('id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  seq: bigint('seq', { mode: 'number' }).notNull(),
};

export const patterns = pgTable(
  'patterns',
  {
    ...synced,
    key: text('key'),
    name: text('name').notNull(),
    role: text('role').notNull(),
    counts: boolean('counts').notNull().default(true),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('patterns_seq').on(t.userId, t.seq)],
);

export const exercises = pgTable(
  'exercises',
  {
    ...synced,
    name: text('name').notNull(),
    patternId: text('pattern_id').notNull(),
    where: text('where').notNull().default('gym'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    description: text('description').notNull().default(''),
    images: jsonb('images').$type<string[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('exercises_seq').on(t.userId, t.seq)],
);

export const slots = pgTable(
  'slots',
  {
    ...synced,
    key: text('key'),
    name: text('name').notNull(),
    requiredRole: text('required_role').notNull().default('Any'),
    position: integer('position').notNull().default(0),
    /** Null means the slot applies to every session (a full-body split). */
    sessionIndex: integer('session_index'),
    /** Narrower than the role constraint when set — a push day's main lift. */
    patternKeys: jsonb('pattern_keys').$type<string[] | null>(),
    dayKey: text('day_key'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('slots_seq').on(t.userId, t.seq)],
);

/**
 * Append-only history of which split was in force when.
 *
 * Coverage is a property of the split, so scoring an old week correctly means
 * knowing what the goal was at the time. Rows are never rewritten on a switch —
 * a new one is inserted and the old ones keep their meaning.
 */
export const splitPeriods = pgTable(
  'split_periods',
  {
    ...synced,
    split: text('split').notNull(),
    days: integer('days').notNull().default(3),
    /** Monday of the week the split took effect. */
    startWeek: text('start_week').notNull(),
    /** Frozen copy of the coverage goal, so history survives preset changes. */
    patternKeys: jsonb('pattern_keys').$type<string[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('split_periods_seq').on(t.userId, t.seq),
    index('split_periods_start').on(t.userId, t.startWeek),
  ],
);

export const programEntries = pgTable(
  'program_entries',
  {
    ...synced,
    sessionIndex: integer('session_index').notNull(),
    slotId: text('slot_id').notNull(),
    exerciseId: text('exercise_id'),
    sets: integer('sets').notNull().default(3),
    repRange: text('rep_range').notNull().default(''),
    startWeight: doublePrecision('start_weight'),
    note: text('note').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('entries_seq').on(t.userId, t.seq),
    // One entry per slot per session — the grid is generated, not accumulated.
    uniqueIndex('entries_slot').on(t.userId, t.sessionIndex, t.slotId),
  ],
);

export const setLogs = pgTable(
  'set_logs',
  {
    ...synced,
    date: text('date').notNull(),
    session: text('session').notNull(),
    exerciseId: text('exercise_id').notNull(),
    setNo: integer('set_no').notNull().default(1),
    weight: doublePrecision('weight'),
    reps: integer('reps'),
    rir: integer('rir'),
    note: text('note').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('logs_seq').on(t.userId, t.seq),
    index('logs_date').on(t.userId, t.date),
  ],
);

export const refSets = pgTable(
  'ref_sets',
  {
    ...synced,
    date: text('date').notNull(),
    exerciseId: text('exercise_id').notNull(),
    weight: doublePrecision('weight'),
    reps: integer('reps'),
    note: text('note').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('refsets_seq').on(t.userId, t.seq)],
);

/**
 * Bodyweight over time.
 *
 * A record with a date rather than a field on the profile: the strength score
 * divides by what you weighed *that week*, and a single current value would
 * silently rewrite what every past week meant every time you stepped on a
 * scale.
 */
export const bodyLogs = pgTable(
  'body_logs',
  {
    ...synced,
    date: text('date').notNull(),
    weight: doublePrecision('weight').notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('bodylogs_seq').on(t.userId, t.seq)],
);

/** One row per user; `id` equals `userId`. */
export const profiles = pgTable(
  'profiles',
  {
    ...synced,
    onboarded: boolean('onboarded').notNull().default(false),
    split: text('split').notNull().default('sevenPattern'),
    days: integer('days').notNull().default(3),
    where: text('where').notNull().default('gym'),
    bias: text('bias').notNull().default('none'),
    blockStart: text('block_start').notNull(),
    blockWeeks: integer('block_weeks').notNull().default(8),
    unit: text('unit').notNull().default('kg'),
    lang: text('lang').notNull().default('en'),
    theme: text('theme').notNull().default('system'),
    heightCm: integer('height_cm'),
    sex: text('sex').notNull().default('unspecified'),
    name: text('name').notNull().default(''),
    birthYear: integer('birth_year'),
    /** A small square image inline as a data URL — see the note on the domain
     *  type for why it lives in the row rather than in object storage. */
    avatar: text('avatar'),
    /* The shared plan in effect, and the version applied. Null for a week
       the user chose or built themselves. A snapshot, never a link. */
    planId: text('plan_id'),
    planVersion: integer('plan_version'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('profiles_seq').on(t.userId, t.seq)],
);

export const SYNC_TABLES = {
  patterns,
  exercises,
  slots,
  splitPeriods,
  entries: programEntries,
  logs: setLogs,
  refSets,
  bodyLogs,
  profile: profiles,
} as const;

export type SyncTableName = keyof typeof SYNC_TABLES;

/* ------------------------------------------------ trainers and plans -- */

/**
 * Everything below this line is **deliberately not in `SYNC_TABLES`**, and that
 * is the load-bearing decision rather than an oversight.
 *
 * Every replicated table is `primaryKey(userId, id)` and cascades from `user`,
 * which encodes an assumption that has held since the first commit: a row
 * belongs to exactly one person, who is the only one who edits it. A plan
 * breaks both halves — it is owned by a trainer and read by everybody they
 * shared it with. Putting it in the sync set would mean a trainer closing their
 * account destroyed plans other people were training on, and it would hand
 * last-write-wins the job of arbitrating between two people editing one row,
 * which the decision log names as the exact condition for revisiting it.
 *
 * So plans live here, server-side, reached over a small read API. What crosses
 * into an athlete's replicated data is not the plan but its *effect*: ordinary
 * `slots`, an appended `splitPeriods` row and generated `entries`, written by
 * the same `installSkeleton` a preset goes through. After that moment nothing
 * downstream knows a trainer was involved.
 */

/** Extensible on purpose: reporting and auditing will want more than a flag. */
export const USER_ROLES = ['athlete', 'trainer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const plans = pgTable(
  'plans',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** Cadence: sessions a week this plan is written for. */
    days: integer('days').notNull().default(3),
    where: text('where').$type<'gym' | 'home'>().notNull().default('gym'),
    /**
     * Bumped on every publish of an already-published plan.
     *
     * A plan is applied as a snapshot, so this is how an athlete already
     * training on version 3 learns that a version 4 exists — an offer, never a
     * rewrite of the week they are standing in.
     */
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('plans_owner').on(t.ownerId)],
);

export const planSlots = pgTable(
  'plan_slots',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    sessionIndex: integer('session_index').notNull(),
    position: integer('position').notNull(),
    key: text('key'),
    name: text('name').notNull(),
    requiredRole: text('required_role').notNull().default('Any'),
    patternKeys: jsonb('pattern_keys').$type<string[] | null>(),
    dayKey: text('day_key'),
    /** By NAME, never by id: an exercise id is `sha256(userId, …)` and means
     *  nothing outside the account that produced it. Resolved on apply. */
    exerciseName: text('exercise_name'),
    sets: integer('sets').notNull().default(3),
    repRange: text('rep_range').notNull().default(''),
  },
  (t) => [uniqueIndex('plan_slots_pos').on(t.planId, t.sessionIndex, t.position)],
);

/**
 * A group of people, which is allowed to contain one person.
 *
 * Nothing distinguishes "a group of one" from a share aimed at an individual
 * except which column the share fills in, and that is deliberate: a trainer who
 * starts with one client and gains a second should not have to restructure
 * anything they already set up.
 */
export const userGroups = pgTable(
  'user_groups',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('user_groups_owner').on(t.ownerId)],
);

/** Plain many-to-many: a group holds many people, a person is in many groups. */
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => userGroups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user').on(t.userId)],
);

/**
 * Who a plan has been given to: one person, or one group.
 *
 * Revoked rather than deleted, because "this was shared and then taken back" is
 * a different fact from "this was never shared", and only one of them can be
 * answered by a missing row. Revoking does not reach into anybody's week — a
 * plan already applied is already theirs.
 */
export const planShares = pgTable(
  'plan_shares',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => userGroups.id, { onDelete: 'cascade' }),
    sharedAt: timestamp('shared_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('plan_shares_plan').on(t.planId),
    index('plan_shares_user').on(t.targetUserId),
    index('plan_shares_group').on(t.groupId),
  ],
);

/**
 * Append-only: what was done to a plan, by whom, and when.
 *
 * Here from the first commit rather than added later, because an audit trail
 * retrofitted only ever covers what happened after it was added — and the
 * questions people ask of one are always about the period before.
 *
 * Note what does **not** cascade. Deleting a plan, a group, or the person who
 * acted nulls the reference and keeps the event, with the name it had at the
 * time copied alongside. Erasure has to remove the person; it does not have to
 * remove the fact that some plan was shared with forty people in March.
 */
export const planEvents = pgTable(
  'plan_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    planId: text('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    /** The name as it read at the time, so the row still says something once
     *  the plan it refers to is gone. */
    planName: text('plan_name'),
    groupId: text('group_id').references(() => userGroups.id, { onDelete: 'set null' }),
    groupName: text('group_name'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
  },
  (t) => [index('plan_events_plan').on(t.planId), index('plan_events_at').on(t.at)],
);
