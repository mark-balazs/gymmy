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
  profile: profiles,
} as const;

export type SyncTableName = keyof typeof SYNC_TABLES;
