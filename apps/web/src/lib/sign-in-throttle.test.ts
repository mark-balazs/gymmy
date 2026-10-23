import { randomUUID } from 'node:crypto';
import { like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { signInAttempts } from '@/lib/db/schema';
import { checkAndRecord, clientKey } from './sign-in-throttle';

/**
 * The caps on asking for a sign-in code.
 *
 * The endpoint takes an address from anyone and sends mail, so these limits
 * are all that stands between it and a spam relay on our sending domain. And
 * nothing else trips them: the e2e suite only ever resets the throttle, or
 * tolerates a 429 it did not cause. An off-by-one, a comparison the wrong way
 * round on the window, or an attempt that is never written would all ship with
 * the endpoint looking fine — it would just stop limiting anything.
 *
 * Runs against the real database, because the limits are counts over rows and
 * a time window, which is SQL. Every case uses its own client key and its own
 * addresses, so the cases cannot spend each other's budget.
 */
describe('the sign-in code throttle', () => {
  const clientOf = () => `throttle-${randomUUID()}`;
  const addressOf = () => `throttle-${randomUUID().slice(0, 8)}@example.test`;

  afterAll(async () => {
    await db.delete(signInAttempts).where(like(signInAttempts.client, 'throttle-%'));
  });

  it('allows five codes to one address, and refuses the sixth', async () => {
    const email = addressOf();
    const client = clientOf();
    for (let i = 1; i <= 5; i++) {
      expect(await checkAndRecord(email, client), `attempt ${i}`).toEqual({ allowed: true });
    }
    expect(await checkAndRecord(email, client)).toEqual({ allowed: false, reason: 'email' });
  });

  it('allows twenty addresses from one client, and refuses the twenty-first', async () => {
    // Looser than the address limit, because a household or an office shares
    // one connection — but still a limit, or one client could mail anybody.
    const client = clientOf();
    for (let i = 1; i <= 20; i++) {
      expect(await checkAndRecord(addressOf(), client), `address ${i}`).toEqual({
        allowed: true,
      });
    }
    expect(await checkAndRecord(addressOf(), client)).toEqual({
      allowed: false,
      reason: 'client',
    });
  });

  it('forgets an attempt once it is fifteen minutes old', async () => {
    /* A rolling window, not a lifetime ban: somebody who mistyped five times
       yesterday can sign in today. And not a window of nothing either — five
       attempts from fourteen minutes ago still count. Both sides, because a
       comparison the wrong way round passes whichever one is left out. */
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    const stale = addressOf();
    const recent = addressOf();
    const client = clientOf();
    await db
      .insert(signInAttempts)
      .values([
        ...Array.from({ length: 5 }, () => ({ email: stale, client, createdAt: minutesAgo(16) })),
        ...Array.from({ length: 5 }, () => ({ email: recent, client, createdAt: minutesAgo(14) })),
      ]);
    expect(await checkAndRecord(stale, clientOf())).toEqual({ allowed: true });
    expect(await checkAndRecord(recent, clientOf())).toEqual({ allowed: false, reason: 'email' });
  });

  it('keys a client by the first forwarded hop', () => {
    // Behind a proxy the leftmost hop is the caller; the rest are proxies, and
    // keying on one of those would put every visitor in one shared budget.
    expect(clientKey(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
    expect(clientKey(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientKey(new Headers())).toBe('unknown');
  });
});
