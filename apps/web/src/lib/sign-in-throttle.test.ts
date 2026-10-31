import { randomUUID } from 'node:crypto';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { and, eq, like, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { db, type schema } from '@/lib/db';
import { accounts, sessions, signInAttempts, users, verificationTokens } from '@/lib/db/schema';
import { MAX_ADDRESS_LENGTH } from './email-otp';
import { deleteCodesBefore, withCodeLimits } from './sign-in-codes';
import {
  admitCodeCheck,
  askLock,
  checkAndRecord,
  clientKey,
  connectionOf,
  fromAnotherSite,
  rowsOf,
} from './sign-in-throttle';

const clientOf = () => `throttle-${randomUUID()}`;
const addressOf = () => `throttle-${randomUUID().slice(0, 8)}@example.test`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

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
  const asksOn = async (who: SQL) =>
    (
      await db
        .select()
        .from(signInAttempts)
        .where(and(eq(signInAttempts.kind, 'send'), who))
    ).length;

  /**
   * An ask in flight: it holds one of an ask's locks, its row written but not
   * committed, until the function handed back commits it. Asks started
   * meanwhile count that row only if they waited for the lock.
   *
   * Through node-postgres, which the tests run on; Neon's HTTP driver has no
   * transaction to hold open.
   */
  const askInFlight = async (lock: string, row: { email: string; client: string }) => {
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    let commit!: () => void;
    const committed = new Promise<void>((resolve) => (commit = resolve));
    const done = (db as NodePgDatabase<typeof schema>).transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lock}))`);
      await tx.insert(signInAttempts).values({ ...row, kind: 'send' });
      locked();
      await committed;
    });
    await isLocked;
    return async () => {
      commit();
      await done;
    };
  };
  // Long enough for the asks to reach the lock or, with no lock to wait for, to be decided.
  const meanwhile = () => new Promise((resolve) => setTimeout(resolve, 300));

  afterAll(async () => {
    await db.delete(signInAttempts).where(like(signInAttempts.client, 'throttle-%'));
  });

  it('allows two codes to one address in five minutes, and refuses the third', async () => {
    /* Two, so that a refused ask always leaves the newest code, at most five
       minutes old, still working: a code lives ten. Anyone can ask for any
       address, so this budget is one a stranger can spend; at two in five
       minutes, spending it never leaves the owner without a live code. */
    const email = addressOf();
    expect(await checkAndRecord(email, clientOf())).toEqual({ allowed: true });
    expect(await checkAndRecord(email, clientOf())).toEqual({ allowed: true });
    expect(await checkAndRecord(email, clientOf())).toEqual({ allowed: false, reason: 'email' });
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

  it('forgets an ask once it is five minutes old', async () => {
    /* A rolling window, not a lifetime ban, and not a window of nothing either.
       Both sides, because a comparison the wrong way round passes whichever
       one is left out. */
    const stale = addressOf();
    const recent = addressOf();
    const client = clientOf();
    await db
      .insert(signInAttempts)
      .values([
        ...Array.from({ length: 2 }, () => ({ email: stale, client, createdAt: minutesAgo(6) })),
        ...Array.from({ length: 2 }, () => ({ email: recent, client, createdAt: minutesAgo(4) })),
      ]);
    expect(await checkAndRecord(stale, clientOf())).toEqual({ allowed: true });
    expect(await checkAndRecord(recent, clientOf())).toEqual({ allowed: false, reason: 'email' });
  });

  it('lets exactly two code requests of a burst through, and records no refused one', async () => {
    /* Asks are counted per address, so a refused ask must leave no trace: a
       row that other asks count, even for a moment, would let a stranger who
       keeps asks in flight refuse everybody's, the owner's included, and no
       code would be sent at all. Exactly two, not "at most": none getting
       through is that failure. */
    const email = addressOf();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkAndRecord(email, clientOf())),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(2);
    expect(await asksOn(eq(signInAttempts.email, email))).toBe(2);
  });

  it('decides an ask only after an ask in flight for the same address', async () => {
    /* One ask holds the address's lock, its row written but not committed, and
       two more start meanwhile. They wait for the lock, then count that row:
       one more goes through, not two. Without the lock both count past the
       uncommitted row, and both go through. The burst above cannot be trusted
       to show this: the race it needs comes only now and then. */
    const email = addressOf();
    const commit = await askInFlight(askLock.address(email), { email, client: clientOf() });
    const asks = [checkAndRecord(email, clientOf()), checkAndRecord(email, clientOf())];
    await meanwhile();
    await commit();
    expect((await Promise.all(asks)).filter((r) => r.allowed)).toHaveLength(1);
    expect(await asksOn(eq(signInAttempts.email, email))).toBe(2);
  });

  it('keeps one client to twenty asks when forty come at once, each to its own address', async () => {
    /* The client's lock, held the same way while forty asks from that client
       start at once. They wait for it, then count its row: nineteen go
       through, twenty in all. Locked on their addresses alone, they count past
       it, and twenty or more go through. A burst with nothing held overshoots
       only now and then (7 of 30 came to exactly twenty), so the held ask is
       what makes the race certain. */
    const client = clientOf();
    const commit = await askInFlight(askLock.client(client), { email: addressOf(), client });
    const burst = Array.from({ length: 40 }, () => checkAndRecord(addressOf(), client));
    await meanwhile();
    await commit();
    expect((await Promise.all(burst)).filter((r) => r.allowed)).toHaveLength(19);
    expect(await asksOn(eq(signInAttempts.client, client))).toBe(20);
  });

  it('tells a request sent by a page on another site', () => {
    // What the browser says on its own; a page cannot set this header.
    const from = (site?: string) =>
      fromAnotherSite(new Headers(site ? { 'sec-fetch-site': site } : {}));
    expect(from('cross-site')).toBe(true);
    expect(from('same-site')).toBe(true);
    expect(from('same-origin')).toBe(false);
    expect(from('none')).toBe(false);
    // A browser too old to say is let through.
    expect(from()).toBe(false);
  });

  it('keys a client by the first forwarded hop', () => {
    // Behind a proxy the leftmost hop is the caller; the rest are proxies, and
    // keying on one of those would put every visitor in one shared budget.
    expect(clientKey(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
    expect(clientKey(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientKey(new Headers())).toBe('unknown');
  });

  it('keys an IPv6 caller by its /48 block, and an IPv4 one written as IPv6 by its IPv4 address', () => {
    /* One phone or server holds at least a /64, and a free tunnel service
       hands anyone a /48: keyed by the full address, one machine would be as
       many connections as it liked. */
    expect(connectionOf('2001:db8:abcd:12:1:2:3:4')).toBe('2001:db8:abcd::/48');
    expect(connectionOf('2001:db8:abcd:ffff::99')).toBe('2001:db8:abcd::/48');
    expect(connectionOf('2001:DB8:ABCD::1')).toBe('2001:db8:abcd::/48');
    expect(connectionOf('2001:db8::1')).toBe('2001:db8:0::/48');
    expect(connectionOf('fe80::1%eth0')).toBe('fe80:0:0::/48');
    // A server that takes both kinds sees IPv4 callers this way; one block for
    // all of them would make every IPv4 caller one connection.
    expect(connectionOf('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(connectionOf('::ffff:cb00:7107')).toBe('203.0.113.7');
    // Anything else is kept as it is.
    expect(connectionOf('203.0.113.7')).toBe('203.0.113.7');
    expect(connectionOf('unknown')).toBe('unknown');
    expect(connectionOf('otp-1234')).toBe('otp-1234');
    expect(clientKey(new Headers({ 'x-forwarded-for': '2001:db8:abcd:12::1' }))).toBe(
      '2001:db8:abcd::/48',
    );
  });
});

/**
 * The limits on trying a code.
 *
 * Auth.js checks a code in its own callback and limited nothing, so anyone who
 * knew an address could try every code while one lived (GYM-124).
 * Counted per address and connection, per address and connection per day, and
 * per connection, each in its own case so a broken limit cannot hide behind
 * another one tripping first. Never per address alone: that is a budget a
 * stranger could spend to shut the owner out (GYM-154).
 */
describe('the limits on trying a sign-in code', () => {
  const pastChecks = (email: string, client: string, minutes: number, n: number) =>
    db.insert(signInAttempts).values(
      Array.from({ length: n }, () => ({
        email,
        client,
        kind: 'check' as const,
        createdAt: minutesAgo(minutes),
      })),
    );
  const checksOn = async (email: string) =>
    (
      await db
        .select()
        .from(signInAttempts)
        .where(and(eq(signInAttempts.email, email), eq(signInAttempts.kind, 'check')))
    ).length;
  const allowed = { allowed: true, attempt: expect.any(String) };

  afterAll(async () => {
    await db.delete(signInAttempts).where(like(signInAttempts.client, 'throttle-%'));
  });

  it('allows five checks on an address from one connection, refuses the sixth, and does not count it', async () => {
    const email = addressOf();
    const client = clientOf();
    for (let i = 1; i <= 5; i++) {
      expect(await admitCodeCheck(email, client), `check ${i}`).toEqual(allowed);
    }
    expect(await admitCodeCheck(email, client)).toEqual({
      allowed: false,
      reason: 'email-client',
    });
    expect(await admitCodeCheck(email, client)).toEqual({
      allowed: false,
      reason: 'email-client',
    });
    // Refused checks are taken back, so trying on never stretches the window.
    expect(await checksOn(email)).toBe(5);
  });

  it("never refuses the owner because of a stranger's tries from elsewhere", async () => {
    /* The whole point of counting per connection (GYM-154): a stranger who
       spends an address's tries, from as many connections as they like, shuts
       out only those connections. */
    const email = addressOf();
    await pastChecks(email, clientOf(), 1, 10);
    await pastChecks(email, clientOf(), 1, 10);
    expect(await admitCodeCheck(email, clientOf())).toEqual(allowed);
  });

  it('counts an address however it is typed', async () => {
    // Codes are stored under the normalised address, and only that one can
    // ever match, so " Someone@X " must spend the same budget as "someone@x".
    const email = addressOf();
    const client = clientOf();
    for (let i = 0; i < 5; i++) await admitCodeCheck(`  ${email.toUpperCase()} `, client);
    expect(await admitCodeCheck(email, client)).toEqual({
      allowed: false,
      reason: 'email-client',
    });
  });

  it('lets no more than five of a burst through', async () => {
    /* Twenty checks at once, as one burst of requests would send them.
       Counted before being written, every one of them would see none of the
       others and pass. */
    const email = addressOf();
    const client = clientOf();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => admitCodeCheck(email, client)),
    );
    expect(results.filter((r) => r.allowed).length).toBeLessThanOrEqual(5);
    expect(await checksOn(email)).toBeLessThanOrEqual(5);
  });

  it('allows ten checks on an address from one connection in a day, and refuses the eleventh', async () => {
    // The nine are older than fifteen minutes, so only the daily limit can trip.
    const email = addressOf();
    const client = clientOf();
    await pastChecks(email, client, 60, 9);
    expect(await admitCodeCheck(email, client)).toEqual(allowed);
    expect(await admitCodeCheck(email, client)).toEqual({
      allowed: false,
      reason: 'email-client-day',
    });
  });

  it('forgets a check after fifteen minutes for the short limit, and after a day for the long one', async () => {
    /* Both sides of both edges, because a comparison the wrong way round
       passes whichever side is left out. */
    const recent = addressOf();
    const recentClient = clientOf();
    await pastChecks(recent, recentClient, 14, 5);
    expect(await admitCodeCheck(recent, recentClient)).toEqual({
      allowed: false,
      reason: 'email-client',
    });

    const stale = addressOf();
    const staleClient = clientOf();
    await pastChecks(stale, staleClient, 16, 5);
    expect(await admitCodeCheck(stale, staleClient)).toEqual(allowed);

    const lastDay = addressOf();
    const lastDayClient = clientOf();
    await pastChecks(lastDay, lastDayClient, 23 * 60 + 59, 10);
    expect(await admitCodeCheck(lastDay, lastDayClient)).toEqual({
      allowed: false,
      reason: 'email-client-day',
    });

    const dayBefore = addressOf();
    const dayBeforeClient = clientOf();
    await pastChecks(dayBefore, dayBeforeClient, 24 * 60 + 1, 10);
    expect(await admitCodeCheck(dayBefore, dayBeforeClient)).toEqual(allowed);
  });

  it('allows thirty checks from one client, and refuses the thirty-first', async () => {
    // Thirty different addresses, so no per-address limit can trip first.
    const client = clientOf();
    for (let i = 1; i <= 30; i++) {
      expect(await admitCodeCheck(addressOf(), client), `check ${i}`).toEqual(allowed);
    }
    expect(await admitCodeCheck(addressOf(), client)).toEqual({
      allowed: false,
      reason: 'client',
    });
  });

  it('keeps checks and code requests in separate budgets', async () => {
    // Typing a code wrong must never stop someone asking for a new one, and
    // asking for codes must never use up the tries.
    const email = addressOf();
    const client = clientOf();
    for (let i = 0; i < 2; i++) await checkAndRecord(email, client);
    expect(await admitCodeCheck(email, client)).toEqual(allowed);

    const other = addressOf();
    for (let i = 0; i < 5; i++) await admitCodeCheck(other, client);
    expect(await checkAndRecord(other, client)).toEqual({ allowed: true });
  });
});

/**
 * The adapter Auth.js stores and checks codes through, with the limits in it.
 * Driven through the real Drizzle adapter, so what is checked is what Auth.js
 * would get back.
 */
describe('sign-in codes in the adapter', () => {
  const client = `throttle-${randomUUID()}`;
  const adapter = withCodeLimits(
    DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    async () => client,
  );
  const inTen = (ms = 0) => new Date(Date.now() + 10 * 60_000 + ms);
  const codesFor = async (email: string) =>
    (await db.select().from(verificationTokens).where(eq(verificationTokens.identifier, email)))
      .map((r) => r.token)
      .sort();
  const checksBy = async (email: string) =>
    (
      await db
        .select()
        .from(signInAttempts)
        .where(and(eq(signInAttempts.email, email), eq(signInAttempts.client, client)))
    ).length;

  afterAll(async () => {
    await db.delete(signInAttempts).where(like(signInAttempts.client, 'throttle-%'));
    await db
      .delete(verificationTokens)
      .where(like(verificationTokens.identifier, 'throttle-%@example.test'));
  });

  it('refuses a check whose address no ask accepts, and writes nothing', async () => {
    /* No code is ever stored under an address longer than an ask takes, and
       written down, one could run to kilobytes; past the index's limit the
       insert fails, and Auth.js shows its server-error page. */
    const email = `throttle-${'x'.repeat(MAX_ADDRESS_LENGTH)}@example.test`;
    expect(await adapter.useVerificationToken!({ identifier: email, token: 'any' })).toBeNull();
    expect(await checksBy(email)).toBe(0);
  });

  it('keeps only the newest code for an address', async () => {
    const email = addressOf();
    await adapter.createVerificationToken!({ identifier: email, token: 'old', expires: inTen() });
    await adapter.createVerificationToken!({ identifier: email, token: 'new', expires: inTen(1) });
    expect(await codesFor(email)).toEqual(['new']);
  });

  it('never leaves no code when two asks at once interleave', async () => {
    /* Storing a code is an insert and then a delete, two calls, so two asks at
       once can both insert before either deletes. Deleting every *other* code
       would then let each delete the other's and leave none: a gap a stranger
       could aim for. Both orders of the deletes, by hand. */
    for (const order of ['older first', 'newer first']) {
      const email = addressOf();
      const older = { identifier: email, token: 'older', expires: inTen() };
      const newer = { identifier: email, token: 'newer', expires: inTen(1) };
      await db.insert(verificationTokens).values([older, newer]);
      const deletes = order === 'older first' ? [older, newer] : [newer, older];
      for (const token of deletes) await deleteCodesBefore(token);
      expect(await codesFor(email), order).toEqual(['newer']);
    }

    // Stored in the same millisecond, the stored hash breaks the tie.
    const email = addressOf();
    const expires = inTen();
    const a = { identifier: email, token: 'aaa', expires };
    const b = { identifier: email, token: 'bbb', expires };
    await db.insert(verificationTokens).values([a, b]);
    await deleteCodesBefore(b);
    await deleteCodesBefore(a);
    expect(await codesFor(email)).toEqual(['bbb']);
  });

  it('uses a code checked within the limits, and gives the try back', async () => {
    // A right try never spends anyone's budget, so the demo account's public
    // inbox cannot shut out the connection that checks it.
    const email = addressOf();
    await adapter.createVerificationToken!({ identifier: email, token: 'right', expires: inTen() });
    const used = await adapter.useVerificationToken!({ identifier: email, token: 'right' });
    expect(used?.token).toBe('right');
    expect(await codesFor(email)).toEqual([]);
    expect(await checksBy(email)).toBe(0);
  });

  it('keeps a wrong try counted', async () => {
    const email = addressOf();
    await adapter.createVerificationToken!({ identifier: email, token: 'right', expires: inTen() });
    expect(await adapter.useVerificationToken!({ identifier: email, token: 'wrong' })).toBeNull();
    expect(await checksBy(email)).toBe(1);
  });

  it('answers a refused check with nothing, as a wrong code, and leaves the code', async () => {
    const email = addressOf();
    await adapter.createVerificationToken!({ identifier: email, token: 'right', expires: inTen() });
    for (let i = 0; i < 5; i++) {
      expect(await adapter.useVerificationToken!({ identifier: email, token: 'wrong' })).toBeNull();
    }
    // The sixth carries the right code and is refused all the same.
    expect(await adapter.useVerificationToken!({ identifier: email, token: 'right' })).toBeNull();
    expect(await codesFor(email)).toEqual(['right']);
  });

  it('counts a check with no address, and matches nothing with it', async () => {
    // A stored code with that very token survives: with no address, nothing
    // matches. And the check is still counted, under the empty address.
    const email = addressOf();
    await adapter.createVerificationToken!({
      identifier: email,
      token: 'anything',
      expires: inTen(),
    });
    const used = await adapter.useVerificationToken!({
      identifier: undefined as unknown as string,
      token: 'anything',
    });
    expect(used).toBeNull();
    expect(await codesFor(email)).toEqual(['anything']);
    expect(await checksBy('')).toBeGreaterThan(0);
  });
});

/**
 * The shape of a raw statement's result. Both drivers answer `{ rows }` today;
 * read as no rows, a changed shape would refuse every ask without a sound.
 */
describe('reading the rows a raw statement returned', () => {
  it('reads them as both drivers return them', () => {
    expect(rowsOf({ rows: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(rowsOf({ rows: [] })).toEqual([]);
  });

  it('throws rather than reading any other shape as no rows', () => {
    expect(() => rowsOf([{ id: 'a' }])).toThrow();
    expect(() => rowsOf({})).toThrow();
    expect(() => rowsOf(undefined)).toThrow();
  });
});
