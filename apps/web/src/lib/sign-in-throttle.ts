import { isIPv6 } from 'node:net';
import { and, eq, gt, lt, sql, type SQL } from 'drizzle-orm';
import { db, inOneTransaction } from '@/lib/db';
import { signInAttempts } from '@/lib/db/schema';
import { normaliseEmail } from '@/lib/email-otp';

/**
 * The limits on sign-in codes: on asking for one, and on trying one.
 *
 * Asking takes an email address from anyone and sends mail. Unmetered, it is a
 * spam relay wearing our sending reputation — the damage lands on the Resend
 * domain, not on whoever abuses it, and that reputation is shared with every
 * other project sending from it.
 *
 * Trying is checked by Auth.js, which limits nothing. Unmetered, anyone who
 * knew an address could try codes for it as fast as they could send them
 * (GYM-124).
 *
 * A try is counted per address *and* connection, never per address alone. A
 * count per address is a budget anyone who knows the address can spend, which
 * shuts its owner out (GYM-154); counted per connection, a stranger's tries
 * shut out only the stranger's own connection. One office or household network
 * is one connection, so people trying codes from it share its budgets.
 *
 * This departs on purpose from NIST SP 800-63B-4, which caps consecutive
 * failed tries per account at 100 (section 3.2.2) and so lets anyone who knows
 * an address lock its owner out. The code's ten digits stand in for that cap,
 * what NIST calls a compensating control. Compared: NIST's cap allows at most
 * 100 guesses before switching sign-in off; these limits give a million
 * connections one lucky guess on an address in about 2.7 years. NIST does not
 * accept an emailed code as a way to sign in at all (section 3.1.3.1), so
 * gymmy's sign-in is outside it either way.
 *
 * What is left:
 * - Guessing from many connections. With a million, one lucky guess on a given
 *   address takes about 2.7 years; on any of N known addresses, about N times
 *   sooner.
 * - A stranger needs only one or two codes a day to spend every guess, and a
 *   code reaches its owner as an email only while sending works (GYM-166).
 * - A stranger can replace the owner's code every 2½ minutes, and each replaced
 *   code the owner then types costs the owner's connection a try.
 * - People on one connection share its budgets: an office or a household, and
 *   also a mobile network that puts many phones behind one address or one
 *   IPv6 /48 block.
 * - An IPv6 connection counts as its /48 block, and a /32 holds 65,536 of
 *   them: if the host takes IPv6, connections are far cheaper to come by.
 */
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Who a limit counts: one address, one connection, or the two together. */
type Scope = 'email' | 'client' | 'email-client';

export type LimitReason = 'email' | 'client' | 'email-client' | 'email-client-day';

interface Limit {
  scope: Scope;
  /** How far back attempts are counted, in milliseconds. */
  window: number;
  max: number;
  reason: LimitReason;
}

/**
 * Asking for a code: two per address in five minutes. A code lives ten, so
 * whenever the address's limit refuses an ask, the newest code, at most five
 * minutes old, still works: a stranger who keeps asking replaces the owner's
 * code but cannot stop codes coming. Looser per connection, because a household
 * or an office shares one; when that limit refuses an ask, the address may have
 * no live code.
 */
const SENDS: Limit[] = [
  { scope: 'email', window: 5 * MINUTE, max: 2, reason: 'email' },
  { scope: 'client', window: 15 * MINUTE, max: 20, reason: 'client' },
];

/**
 * Trying a code. Five tries is plenty for a typo; ten a day per address and
 * connection, against ten-digit codes, gives even 10,000 connections about one
 * lucky guess in 270 years on one address. Thirty in fifteen minutes per
 * connection, whatever the address.
 */
const CHECKS: Limit[] = [
  { scope: 'email-client', window: 15 * MINUTE, max: 5, reason: 'email-client' },
  { scope: 'email-client', window: DAY, max: 10, reason: 'email-client-day' },
  { scope: 'client', window: 15 * MINUTE, max: 30, reason: 'client' },
];

export interface ThrottleResult {
  allowed: boolean;
  /** Which limit tripped. For the log — never for the response. */
  reason?: LimitReason;
  /** The try, as recorded, so that a right one can be given back. */
  attempt?: string;
}

/**
 * The names of the two locks an ask is decided under: its address's and its
 * connection's. Exported so that a test can hold one.
 */
export const askLock = {
  address: (email: string) => `sign-in ask ${email}`,
  client: (client: string) => `sign-in ask client ${client}`,
};

/**
 * Asking for a code, before it is sent.
 *
 * Decided in one transaction under two locks, the address's and the
 * connection's, so asks at once that share either are decided one after the
 * other, each counting the ones before. Under the address's alone, a burst from
 * one connection to many addresses would be counted all at once, and more than
 * the connection's limit would go through.
 *
 * A refused ask writes nothing. Tries can be recorded first and counted after
 * (`admit`), because they are counted per connection; asks are counted per
 * address, and there a refused ask's row, counted by every other ask until it
 * is taken back, would let a stranger who keeps asks in flight refuse
 * everyone's, the owner's included.
 *
 * The locks rely on READ COMMITTED, Postgres's default, which neither driver
 * changes: the insert counts what was committed when it starts, after the wait
 * for the locks. Under REPEATABLE READ it would count only what was committed
 * before the wait, and miss the asks decided during it.
 */
export async function checkAndRecord(email: string, client: string): Promise<ThrottleResult> {
  const now = Date.now();
  const [byEmail, byClient] = SENDS as [Limit, Limit];
  const since = (limit: Limit) => new Date(now - limit.window);
  const recent = (limit: Limit, who: SQL) =>
    sql`(select count(*) from ${signInAttempts} where ${signInAttempts.kind} = 'send' and ${who} and ${signInAttempts.createdAt} > ${since(limit)})`;

  const [, inserted] = await inOneTransaction((on) => [
    // Both in one statement, in the order of their keys, so every ask takes them
    // in the same order and two asks never each hold the one the other waits for.
    on.execute(sql`select pg_advisory_xact_lock(k) from (values
      (hashtext(${askLock.address(email)})), (hashtext(${askLock.client(client)}))
    ) as l(k) order by k`),
    on.execute(sql`
      insert into ${signInAttempts} (id, email, client, kind)
      select ${crypto.randomUUID()}, ${email}, ${client}, 'send'
      where ${recent(byEmail, eq(signInAttempts.email, email))} < ${byEmail.max}
        and ${recent(byClient, eq(signInAttempts.client, client))} < ${byClient.max}
      returning id`),
  ]);
  sweep();
  if (rowsOf(inserted).length > 0) return { allowed: true };

  // Refused. Which limit, for the log only, counted after the fact.
  const emailCount = await count('send', eq(signInAttempts.email, email), since(byEmail));
  return { allowed: false, reason: emailCount >= byEmail.max ? byEmail.reason : byClient.reason };
}

/**
 * The rows a raw statement returned. Both drivers hand back `{ rows }` today;
 * if an upgrade changed that, reading it as no rows would refuse every ask
 * without a sound, so a missing `rows` throws instead.
 */
export function rowsOf(result: unknown): unknown[] {
  const rows = (result as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) throw new Error('A raw statement returned no rows array');
  return rows;
}

/**
 * Trying a code, before Auth.js looks it up. Counted under the address the way
 * codes are stored, so " Someone@X " spends the same budget as "someone@x".
 */
export async function admitCodeCheck(email: string, client: string): Promise<ThrottleResult> {
  const { allowed, reason, id } = await admit('check', normaliseEmail(email), client, CHECKS);
  return allowed ? { allowed, attempt: id } : { allowed, reason };
}

/**
 * Takes back a try that turned out to be right, so signing in never spends
 * anyone's budget: the demo account's inbox is public, and the people checking
 * it would otherwise shut their own connection out after ten sign-ins a day.
 */
export async function giveBack(attempt: string): Promise<void> {
  await db.delete(signInAttempts).where(eq(signInAttempts.id, attempt));
}

/**
 * Records an attempt, counts it together with every other one in its windows,
 * and takes it back if that puts a count over its limit.
 *
 * Recorded first and counted after, never the other way round: counted first, a
 * burst of simultaneous attempts would all count before any was written, and
 * all pass. This way the k-th attempt to land sees at least k rows. A refused
 * attempt is taken back, so someone who keeps trying does not keep extending
 * the window they are shut out of.
 */
async function admit(
  kind: 'send' | 'check',
  email: string,
  client: string,
  limits: Limit[],
): Promise<{ allowed: boolean; reason?: LimitReason; id: string }> {
  const id = crypto.randomUUID();
  await db.insert(signInAttempts).values({ id, email, client, kind });

  const now = Date.now();
  const counts = await Promise.all(
    limits.map((limit) =>
      count(kind, who(limit.scope, email, client), new Date(now - limit.window)),
    ),
  );
  const tripped = limits.find((limit, i) => counts[i]! > limit.max);

  if (tripped) await db.delete(signInAttempts).where(eq(signInAttempts.id, id));
  sweep();

  return tripped ? { allowed: false, reason: tripped.reason, id } : { allowed: true, id };
}

function who(scope: Scope, email: string, client: string): SQL {
  const byEmail = eq(signInAttempts.email, email);
  const byClient = eq(signInAttempts.client, client);
  return scope === 'email' ? byEmail : scope === 'client' ? byClient : and(byEmail, byClient)!;
}

async function count(kind: 'send' | 'check', who: SQL, since: Date): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(signInAttempts)
    .where(and(eq(signInAttempts.kind, kind), who, gt(signInAttempts.createdAt, since)));
  return rows[0]?.n ?? 0;
}

/**
 * Swept here rather than on a schedule: there is no cron in this deployment,
 * and nothing is counted over more than a day. Failure is harmless — every
 * count is bounded by time, not by table size.
 */
function sweep(): void {
  void db
    .delete(signInAttempts)
    .where(lt(signInAttempts.createdAt, new Date(Date.now() - DAY)))
    .catch(() => undefined);
}

/**
 * Whether a page on another site made the browser send this request.
 *
 * A code check or an ask never rightly comes from one: the code email has no
 * link, and the only form is on this site. A page elsewhere that made a
 * visitor's browser send them (an image tag with a wrong code in it, a form
 * posted out of sight) would spend that visitor's budgets on the visitor's own
 * connection, so such a request is refused before anything is counted.
 * Browsers too old to say are let through.
 */
export function fromAnotherSite(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  return site === 'cross-site' || site === 'same-site';
}

/**
 * The connection a request comes from: the leftmost `x-forwarded-for` hop,
 * else `x-real-ip`.
 *
 * On Vercel, where production runs, the platform overwrites both with the
 * caller's own address, so a caller cannot fake them. Behind any other proxy
 * the leftmost hop is whatever the caller sent, and these limits are only as
 * good as that proxy.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return connectionOf(forwarded || headers.get('x-real-ip') || 'unknown');
}

/**
 * The connection an address stands for.
 *
 * An IPv6 address stands for its /48 block: one phone or server is handed at
 * least a /64, and a free tunnel service hands anyone a /48, so keyed by the
 * full address one machine would be endless connections. An IPv4 address
 * written as IPv6 (`::ffff:1.2.3.4`) is that IPv4 client, or a server taking
 * both kinds would put every IPv4 caller in one block. Anything else is kept as
 * it is.
 */
export function connectionOf(address: string): string {
  // A zone ("%eth0") names a network interface, not a machine.
  const bare = address.replace(/%.*$/, '');
  if (!isIPv6(bare)) return address;

  const groups = ipv6Groups(bare);
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi, lo] = [groups[6]!, groups[7]!];
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  }
  return `${groups
    .slice(0, 3)
    .map((g) => g.toString(16))
    .join(':')}::/48`;
}

/** The eight 16-bit groups of a valid IPv6 address, `::` and an IPv4 tail expanded. */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase();
  const ipv4Tail = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Tail) {
    const [a, b, c, d] = ipv4Tail.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, ipv4Tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::') as [string, string | undefined];
  const front = head ? head.split(':') : [];
  const back = tail === undefined ? [] : tail ? tail.split(':') : [];
  const gap = tail === undefined ? [] : Array<string>(8 - front.length - back.length).fill('0');
  return [...front, ...gap, ...back].map((g) => parseInt(g, 16));
}
