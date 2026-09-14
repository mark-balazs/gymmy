/**
 * The guard and the wire schema for everything under `/api/plans` and
 * `/api/groups`.
 *
 * Two rules, both enforced here rather than remembered in seven route files:
 *
 *  - **Reading a plan needs a session; writing one needs a trainer.** The
 *    difference matters: every account can be shared a plan, and only some
 *    accounts can write one.
 *  - **A body is validated before it reaches a query.** Same discipline as
 *    `lib/sync/rows.ts` — the client is not trusted, and a plan is now a thing
 *    one person writes and another reads, which raises the cost of getting that
 *    wrong rather than lowering it.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { DAY_KEYS, PATTERN_KEYS, SLOT_KEYS, SLOT_ROLES } from '@athletic/domain';

export const unauthorized = (): NextResponse =>
  NextResponse.json({ error: 'unauthorized' }, { status: 401 });

/** Deliberately the same answer as "no such plan" — see `planShapeFor`. */
export const notFound = (): NextResponse =>
  NextResponse.json({ error: 'not found' }, { status: 404 });

export const badRequest = (issues?: unknown): NextResponse =>
  NextResponse.json({ error: 'invalid request', issues }, { status: 400 });

/** The signed-in account, or null. */
export async function sessionUser(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * The signed-in account, if it is allowed to author plans.
 *
 * Read from the database rather than the session: a role is the kind of thing
 * that gets revoked, and a session outliving that revocation by a week is
 * exactly the failure this check exists to prevent. The app makes very few
 * requests, so the row read costs nothing worth saving.
 */
export async function trainerUser(): Promise<string | null> {
  const userId = await sessionUser();
  if (!userId) return null;
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return row?.role === 'trainer' ? userId : null;
}

const planSlot = z.object({
  sessionIndex: z.number().int().min(0).max(13),
  position: z.number().int().min(0).max(50),
  key: z.enum(SLOT_KEYS).nullable().default(null),
  name: z.string().min(1).max(60),
  requiredRole: z.enum(SLOT_ROLES),
  patternKeys: z.array(z.enum(PATTERN_KEYS)).max(8).nullable().default(null),
  dayKey: z.enum(DAY_KEYS).nullable().default(null),
  /** A name, never an id. An exercise id is derived from a user id and means
   *  nothing in the account this plan is destined for. */
  exerciseName: z.string().max(80).nullable().default(null),
  sets: z.number().int().min(0).max(50),
  repRange: z.string().max(40),
});

export const planInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(600).default(''),
  days: z.number().int().min(1).max(7),
  where: z.enum(['gym', 'home']),
  // Enough for four days of a dozen slots, and a bound rather than none.
  slots: z.array(planSlot).max(100),
});

export const groupInput = z.object({ name: z.string().min(1).max(60) });

export const memberInput = z.object({ email: z.string().email().max(320) });

export const shareInput = z
  .object({
    userEmail: z.string().email().max(320).optional(),
    groupId: z.string().min(1).max(64).optional(),
  })
  /* One target or the other. Both has no meaning anybody could agree on, and
     neither is a share into the void — so the request is refused rather than
     guessed at. */
  .refine((v) => !!v.userEmail !== !!v.groupId, 'name exactly one target');

/** Parses a JSON body, answering `null` rather than throwing on anything odd. */
export async function bodyOf<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
