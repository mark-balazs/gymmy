/**
 * Local sign-in without Google.
 *
 * Setting up OAuth credentials just to click through your own app is friction
 * with no payoff, so this creates a real user and a real database session and
 * sets the real cookie — the same three rows the Google flow produces. Nothing
 * downstream can tell the difference, which is the point: testing against a
 * fake session would be testing something the app never actually does.
 *
 * ## Why this cannot ship
 *
 * It is a sign-in that asks for nothing, so the only thing standing between it
 * and a total auth bypass is the guard below. That guard requires three
 * independent conditions, any one of which is enough to disable it:
 *
 *   1. `AUTH_DEV_BYPASS=1` must be set explicitly — off unless asked for.
 *   2. `NODE_ENV` must not be `production` — `next build` sets it, so a
 *      production bundle is out regardless of what else is configured.
 *   3. `VERCEL` must be unset — covers a deploy that somehow gets NODE_ENV
 *      wrong, since Vercel sets this on every deployment.
 *
 * Callers treat a disabled bypass as *not found* rather than forbidden, so a
 * probe cannot distinguish this build from one without the feature at all.
 */

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema';
import { seedNewUser } from '@/lib/db/seed-user';

export const DEV_AUTH =
  process.env.AUTH_DEV_BYPASS === '1' &&
  process.env.NODE_ENV !== 'production' &&
  !process.env.VERCEL;

/** Fixed, so repeated sign-ins return to the same training history. */
const DEV_EMAIL = 'dev@localhost';

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

/**
 * Signs in as the local dev user, creating the account on first use.
 *
 * Throws rather than returning quietly when the bypass is off: reaching here in
 * a build where it is disabled means a caller skipped the `DEV_AUTH` check, and
 * that is a bug worth surfacing rather than a condition to tolerate.
 */
export async function devSignIn(): Promise<void> {
  if (!DEV_AUTH) throw new Error('devSignIn called while the dev bypass is disabled');

  const existing = await db.select().from(users).where(eq(users.email, DEV_EMAIL)).limit(1);
  let userId = existing[0]?.id;

  if (!userId) {
    userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      name: 'Dev',
      email: DEV_EMAIL,
      emailVerified: new Date(),
    });
    // The Google flow gets this from Auth.js's createUser event, which a manual
    // insert never fires — without it the account syncs down empty.
    await seedNewUser(userId);
  }

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + NINETY_DAYS);
  await db.insert(sessions).values({ sessionToken, userId, expires });

  // Over plain http Auth.js reads the unprefixed name; the `__Secure-` variant
  // is only used on https, which the bypass never runs on.
  (await cookies()).set('authjs.session-token', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    expires,
  });
}
