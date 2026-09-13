/**
 * Erasing an account, for real.
 *
 * The right to erasure is not "stop showing it to them" — it is the data being
 * gone. So this deletes rather than flagging, and it is deliberately the one
 * place that knows what an account consists of.
 *
 * Most of it falls out of the schema: every replicated table takes its
 * `user_id` from `user` with `ON DELETE CASCADE`, so removing that one row
 * takes the profile, the library, the plan, the split periods, every logged set
 * and every weigh-in with it — and takes them atomically, which is what makes a
 * half-deleted account impossible.
 *
 * Two tables do not hang off `user` and would otherwise be left holding an
 * email address:
 *
 *  - `verificationToken` is keyed on the address itself, because a sign-in code
 *    is issued before anyone knows whether there is an account behind it;
 *  - `sign_in_attempts` records the address to rate-limit code requests, for
 *    the same reason.
 *
 * They are cleared first, so the irreversible step is last: if the cascade
 * fails the account is still intact, and the worst that has happened is that
 * somebody's sign-in throttle was reset. The other order would leave a deleted
 * account's address sitting in two tables with nothing left to find it by.
 *
 * No transaction wrapping the three. Production runs on Neon's HTTP driver,
 * which has no interactive transactions, and the ordering above is what makes
 * that safe rather than merely tolerable.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { signInAttempts, users, verificationTokens } from '@/lib/db/schema';

export async function deleteAccount(userId: string, email?: string | null): Promise<void> {
  const address = (email ?? '').trim().toLowerCase();

  if (address) {
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, address));
    await db.delete(signInAttempts).where(eq(signInAttempts.email, address));
  }

  await db.delete(users).where(eq(users.id, userId));
}
