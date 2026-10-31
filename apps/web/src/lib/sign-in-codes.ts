import type { Adapter, VerificationToken } from '@auth/core/adapters';
import { and, eq, lt, or } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { verificationTokens } from '@/lib/db/schema';
import { MAX_ADDRESS_LENGTH, normaliseEmail } from '@/lib/email-otp';
import { admitCodeCheck, clientKey, giveBack } from '@/lib/sign-in-throttle';

/**
 * Auth.js's adapter, with sign-in codes kept in check where Auth.js stores and
 * looks them up.
 *
 * Every way of making a code ends in `createVerificationToken`, and every check
 * of one in `useVerificationToken`, whatever route, method or query brought it
 * there. So the limits sit here rather than in front of a route, where they
 * would have to parse each request again, and could parse it differently.
 *
 * - **Only the newest code works** (`deleteCodesBefore`). Auth.js stores a code
 *   beside sending it, so a send that fails still stores the new code, and the
 *   old one is gone.
 * - **Trying a code is limited** (`admitCodeCheck`). A refused check answers
 *   `null`, which Auth.js treats exactly as a wrong code — the same redirect to
 *   the same page — so a refusal shows nothing a wrong code would not, about
 *   the limit or about whether the address has an account. The code itself is
 *   left alone: deleting it would add no safety and would cost the person the
 *   code they just asked for.
 * - **A right try is given back** (`giveBack`), so signing in never spends
 *   anyone's tries.
 * - **An expired code goes at the next ask, or check that reaches Auth.js's
 *   lookup** (`deleteExpiredCodes`), whoever makes it. A right code typed after
 *   it expired is refused either way, but if it has been deleted by then, the
 *   try counts as a wrong one too.
 */
export function withCodeLimits(
  adapter: Adapter,
  clientOf: () => Promise<string> = requestClient,
): Adapter {
  const create = adapter.createVerificationToken!.bind(adapter);
  const consume = adapter.useVerificationToken!.bind(adapter);

  return {
    ...adapter,
    async createVerificationToken(token) {
      const created = await create(token);
      await deleteCodesBefore(token);
      await deleteExpiredCodes();
      return created;
    },
    async useVerificationToken(params) {
      // Auth.js passes the address straight from the query, so it can be
      // missing; such a check can never match a code, but it is still counted.
      // Nor can one longer than any ask accepts, and that one is answered
      // before anything is written: its row could run to kilobytes, and past
      // the index's limit the insert fails as a server error.
      const identifier = params.identifier ?? '';
      if (normaliseEmail(identifier).length > MAX_ADDRESS_LENGTH) return null;
      const gate = await admitCodeCheck(identifier, await clientOf());
      if (!gate.allowed) {
        console.warn(`[sign-in] code check refused by ${gate.reason}`);
        return null;
      }
      const used = await consume(params);
      if (used && gate.attempt) await giveBack(gate.attempt);
      await deleteExpiredCodes();
      return used;
    },
  };
}

/**
 * Deletes the address's codes made before this one, so only the newest works
 * and a guess has one target.
 *
 * "Before" is by expiry, then by the stored hash, so of two codes stored at
 * once the later one always survives. Storing is an insert and then this
 * delete, two calls, so two asks at once can interleave; deleting every *other*
 * code instead would let each delete the other's, and leave none — a gap a
 * stranger could aim for. This way there is never none, and rarely, for their
 * ten minutes, both.
 */
export async function deleteCodesBefore(token: VerificationToken): Promise<void> {
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, token.identifier),
        or(
          lt(verificationTokens.expires, token.expires),
          and(
            eq(verificationTokens.expires, token.expires),
            lt(verificationTokens.token, token.token),
          ),
        ),
      ),
    );
}

/**
 * Deletes every code that has expired, whoever it was for.
 *
 * A code holds the address it was sent to, and one never used would otherwise
 * stay for good: Auth.js deletes a code only when it is used, and
 * `deleteCodesBefore` only when the same address asks again. So a mistyped
 * address, or somebody who asked once and never came back, would be kept for
 * no purpose (GYM-175). There is no schedule to run this on, by design, so it
 * runs on every ask and every check that reaches Auth.js's lookup: an expired
 * code goes at the next one, by anyone. A failure costs nothing but the
 * delay, so it never fails the sign-in.
 */
export async function deleteExpiredCodes(): Promise<void> {
  try {
    await db.delete(verificationTokens).where(lt(verificationTokens.expires, new Date()));
  } catch (error) {
    console.warn('[sign-in] could not delete expired codes', error);
  }
}

/** The client behind the request being handled; outside one, nobody in particular. */
async function requestClient(): Promise<string> {
  try {
    return clientKey(await headers());
  } catch {
    return 'unknown';
  }
}
