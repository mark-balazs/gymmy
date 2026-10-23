import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { signInAttempts } from '@/lib/db/schema';

/**
 * Caps on requesting a sign-in code.
 *
 * This endpoint takes an email address from anyone and sends mail. Unmetered,
 * it is a spam relay wearing our sending reputation — the damage lands on the
 * Resend domain, not on whoever abuses it, and that reputation is shared with
 * every other project sending from it.
 */
const WINDOW_MINUTES = 15;
/** Enough to mistype an address and try again; not enough to flood an inbox. */
const PER_EMAIL = 5;
/** Looser, because a household or an office shares one address. */
const PER_CLIENT = 20;

export interface ThrottleResult {
  allowed: boolean;
  /** Which limit tripped. For the log — never for the response. */
  reason?: 'email' | 'client';
}

export async function checkAndRecord(email: string, client: string): Promise<ThrottleResult> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const [byEmail, byClient] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(signInAttempts)
      .where(and(eq(signInAttempts.email, email), gt(signInAttempts.createdAt, since))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(signInAttempts)
      .where(and(eq(signInAttempts.client, client), gt(signInAttempts.createdAt, since))),
  ]);

  if ((byEmail[0]?.n ?? 0) >= PER_EMAIL) return { allowed: false, reason: 'email' };
  if ((byClient[0]?.n ?? 0) >= PER_CLIENT) return { allowed: false, reason: 'client' };

  await db.insert(signInAttempts).values({ email, client });

  // Swept here rather than on a schedule: there is no cron in this deployment,
  // and the table only matters inside the window. Failure is harmless — the
  // counting query is bounded by time, not by table size.
  void db
    .delete(signInAttempts)
    .where(lt(signInAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60_000)))
    .catch(() => undefined);

  return { allowed: true };
}

/**
 * Who is asking, as well as we can tell behind a proxy.
 *
 * Only the leftmost hop of `x-forwarded-for` is meaningful and even that is
 * client-controlled; this is a speed bump, not identity. The email limit is the
 * one that actually protects an inbox.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || 'unknown';
}
