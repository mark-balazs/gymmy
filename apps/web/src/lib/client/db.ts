/**
 * The local database — and the source of truth while you are using the app.
 *
 * Reads never touch the network. Writes land here first and are queued for the
 * server, so logging a set in a basement with no signal behaves exactly like
 * logging one at home. The server is a replica that catches up, not a gatekeeper.
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
  Exercise,
  Pattern,
  ProgramEntry,
  Profile,
  RefSet,
  SetLog,
  Slot,
  SplitPeriod,
  Snapshot,
  TableName,
} from '@athletic/domain';

/** A queued change waiting to reach the server. */
export interface Outbox {
  seq?: number;
  table: TableName;
  rowId: string;
  /** Serialised at enqueue time so a later local edit cannot rewrite history. */
  row: Record<string, unknown>;
  queuedAt: string;
}

export interface Meta {
  key: string;
  value: unknown;
}

class AppDb extends Dexie {
  patterns!: EntityTable<Pattern, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  slots!: EntityTable<Slot, 'id'>;
  splitPeriods!: EntityTable<SplitPeriod, 'id'>;
  entries!: EntityTable<ProgramEntry, 'id'>;
  logs!: EntityTable<SetLog, 'id'>;
  refSets!: EntityTable<RefSet, 'id'>;
  profile!: EntityTable<Profile, 'id'>;
  outbox!: EntityTable<Outbox, 'seq'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor() {
    super('athletic-tracker');
    this.version(1).stores({
      patterns: 'id, position',
      exercises: 'id, patternId, name',
      slots: 'id, position',
      entries: 'id, [sessionIndex+slotId]',
      logs: 'id, date, exerciseId, [date+session]',
      refSets: 'id, date',
      profile: 'id',
      outbox: '++seq, table, rowId',
      meta: 'key',
    });

    // Adding a store needs a version bump; Dexie carries the existing stores
    // forward untouched, so nothing already on the device is lost.
    this.version(2).stores({
      splitPeriods: 'id, startWeek',
    });
  }
}

export const local = new AppDb();

export const DOMAIN_TABLES: TableName[] = [
  'patterns',
  'exercises',
  'slots',
  'splitPeriods',
  'entries',
  'logs',
  'refSets',
  'profile',
];

/* -------------------------------------------------------------- helpers */

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await local.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await local.meta.put({ key, value });
}

/** Everything the domain layer needs, read in one pass. */
export async function snapshot(): Promise<Snapshot> {
  const [patterns, exercises, slots, splitPeriods, entries, logs, refSets, profiles] =
    await Promise.all([
      local.patterns.toArray(),
      local.exercises.toArray(),
      local.slots.toArray(),
      local.splitPeriods.toArray(),
      local.entries.toArray(),
      local.logs.toArray(),
      local.refSets.toArray(),
      local.profile.toArray(),
    ]);
  return {
    patterns,
    exercises,
    slots,
    splitPeriods,
    entries,
    logs,
    refSets,
    profile: profiles[0] ?? null,
  };
}
