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
  /**
   * The account this device believes its data belongs to, or `null` before its
   * first sync ever answered.
   *
   * Data on a phone used to belong to nobody in particular, so a queue left
   * behind by a failed sign-out wipe went up under whoever signed in next
   * (GYM-74). Stating it lets the server refuse: `409` for another account.
   */
  accountId: z.string().max(64).nullable().default(null),
  mutations: z.array(mutation).max(500),
});
export type PushRequest = z.infer<typeof pushRequest>;

export interface PullResponse {
  cursor: number;
  changes: Record<string, unknown[]>;
  /** Whose data this is. The device stamps itself and every queued change with
   *  it, and never sends one account's changes under another. */
  accountId: string;
  /** Server time, so a client with a skewed clock can warn rather than corrupt. */
  serverTime: string;
  /** At least one table filled its page, so the cursor was held back and there
   *  is more to fetch. The client must come straight back for it. */
  hasMore: boolean;
}

export const SYNC_LIMIT = 500;
