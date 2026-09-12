/**
 * The wire contract, defined once and imported by both sides.
 *
 * Conflict policy: last-write-wins on `updatedAt`, per record.
 *
 * That is a deliberate choice rather than a shortcut. This is a single-user app
 * whose dominant write is a set log — an immutable fact appended once, from one
 * phone, in a gym. Genuine concurrent edits of the same record are close to
 * nonexistent, and a CRDT would add substantial machinery to solve a problem
 * this data shape does not have. Where it does apply (editing a plan on two
 * devices), losing the older edit is the behaviour a user would expect anyway.
 */

import { z } from 'zod';
import { TABLES } from '@athletic/domain';

export const tableName = z.enum(TABLES);

/** Rows are validated per table on the server; this is the envelope. */
export const mutation = z.object({
  table: tableName,
  /** Soft deletes travel as a `put` with `deletedAt` set, so a delete replicates
   *  like any other change. A hard delete could not reach an offline device. */
  op: z.literal('put'),
  row: z.record(z.string(), z.unknown()),
});
export type Mutation = z.infer<typeof mutation>;

export const pushRequest = z.object({
  /** Highest server sequence this client has already seen. */
  since: z.number().int().nonnegative().default(0),
  mutations: z.array(mutation).max(500),
});
export type PushRequest = z.infer<typeof pushRequest>;

export interface PullResponse {
  cursor: number;
  changes: Record<string, unknown[]>;
  /** Server time, so a client with a skewed clock can warn rather than corrupt. */
  serverTime: string;
}

export const SYNC_LIMIT = 500;
