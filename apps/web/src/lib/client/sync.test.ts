import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A write that never landed stays reported until the person dismisses it.
 *
 * It used to be a sync state, and the next sync replaced it — `syncing`, then
 * `idle`, seconds later — so somebody who looked away never learned that a set
 * was saved nowhere. These run the real sync engine against a stand-in for the
 * device's database and the server, and watch every status it emits.
 *
 * The browser half — the warning on screen, and the button that removes it —
 * is `write-failure.spec.ts`.
 */

/** The device's database, as far as the sync engine uses it. */
const dev = vi.hoisted(() => {
  const dev = {
    outbox: [] as {
      seq: number;
      table: string;
      row: Record<string, unknown>;
      accountId: string | null;
    }[],
    /** The outbox's last key. Like IndexedDB's, a wipe does not set it back. */
    seq: 0,
    meta: new Map<string, unknown>(),
    /** Everything a pull wrote into a table. */
    applied: [] as { table: string; rows: unknown[] }[],
    /**
     * Every write, a wipe's included, in the order it was made. IndexedDB runs
     * writes to a store in that order, so a write made before a wipe's clear
     * lands before it, and one made after it lands on the emptied phone.
     */
    writes: [] as string[],
    /** The step a test is holding open, to wipe the phone in the middle of it. */
    held: null as { step: string; reached: () => void; until: Promise<void> } | null,
    /** Lets a step through, or holds it there if a test asked to. */
    async pass(step: string): Promise<void> {
      const held = dev.held;
      if (held?.step !== step) return;
      dev.held = null;
      held.reached();
      await held.until;
    },
    /** A write: done and recorded the moment it is made, then let through. */
    async write(op: string): Promise<void> {
      dev.writes.push(op);
      await dev.pass(op);
    },
  };
  return dev;
});

vi.mock('./db', () => {
  const sorted = () => dev.outbox.slice().sort((a, b) => a.seq - b.seq);
  return {
    DOMAIN_TABLES: ['logs', 'profile'],
    ACCOUNT_KEY: 'account',
    local: {
      outbox: {
        count: async () => dev.outbox.length,
        orderBy: () => ({
          toArray: async () => sorted(),
          limit: (n: number) => ({ toArray: async () => sorted().slice(0, n) }),
        }),
        bulkDelete: async (seqs: number[]) => {
          dev.outbox = dev.outbox.filter((o) => !seqs.includes(o.seq));
          await dev.write('outbox.bulkDelete');
        },
        clear: async () => {
          dev.outbox = [];
          await dev.write('outbox.clear');
        },
        toCollection: () => ({
          modify: async (patch: Record<string, unknown>) => {
            dev.outbox = dev.outbox.map((o) => ({ ...o, ...patch }));
            await dev.write('outbox.modify');
          },
        }),
      },
      meta: {
        clear: async () => {
          dev.meta.clear();
          await dev.write('meta.clear');
        },
      },
      table: (name: string) => ({
        bulkPut: async (rows: unknown[]) => {
          dev.applied.push({ table: name, rows });
          await dev.write(`bulkPut:${name}`);
        },
        put: async () => dev.write(`put:${name}`),
        clear: async () => dev.write(`clear:${name}`),
      }),
    },
    getMeta: async (key: string, fallback: unknown) =>
      dev.meta.has(key) ? dev.meta.get(key) : fallback,
    setMeta: async (key: string, value: unknown) => {
      dev.meta.set(key, value);
      await dev.write(`meta.set:${key}`);
    },
  };
});

/** `n` sets waiting to go, stamped with the account given. */
function queue(n: number, accountId: string | null = 'acct-1'): void {
  for (let i = 0; i < n; i++) {
    dev.outbox.push({ seq: ++dev.seq, table: 'logs', row: { id: `s${i}` }, accountId });
  }
}

/** Holds the sync at one step until `open()`: the moment a test wipes the phone. */
function holdAt(step: string): { reached: Promise<void>; open: () => void } {
  let reached!: () => void;
  let open!: () => void;
  const at = new Promise<void>((r) => (reached = r));
  dev.held = { step, reached, until: new Promise<void>((r) => (open = r)) };
  return { reached: at, open };
}

/** The timers the sync engine schedules with, and only those, so a test can
 *  run them on a fake clock while everything else runs as it would. */
const TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] as const;

/** A browser, as far as `startSync` uses one: it adds handlers for the signal
 *  coming back and for the app being looked at again. Returns a way to fire
 *  them. */
function browser(): { fire: (event: 'online' | 'visibilitychange') => void } {
  const handlers = new Map<string, () => void>();
  const target = {
    addEventListener: (event: string, fn: () => void) => void handlers.set(event, fn),
    removeEventListener: (event: string) => void handlers.delete(event),
  };
  vi.stubGlobal('window', target);
  vi.stubGlobal('document', { ...target, visibilityState: 'visible' });
  return { fire: (event) => handlers.get(event)?.() };
}

/** A device that has synced before and knows whose it is. */
function signedInAs(accountId: string): void {
  dev.meta.set('account', accountId);
}

type Sync = typeof import('./sync');
type Status = Parameters<Parameters<Sync['onSyncStatus']>[0]>[0];

let sync: Sync;
let seen: Status[];
let stop: () => void;

/** The browser's localStorage, as far as the sync engine uses it. One per
 *  test, and it outlives a re-import of the module — as the real one outlives
 *  a reload. */
function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const kept = new Map<string, string>();
  return {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => void kept.set(k, String(v)),
    removeItem: (k) => void kept.delete(k),
  };
}

/** What a reload does to the sync engine: the module starts again from nothing
 *  but what the browser kept. Returns the first status a new page would see. */
async function reload(): Promise<Status> {
  stop();
  vi.resetModules();
  sync = await import('./sync');
  seen = [];
  stop = sync.onSyncStatus((s) => seen.push(s));
  return seen[0]!;
}

const answer = (status: number) =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          cursor: 1,
          changes: {},
          accountId: 'acct-1',
          serverTime: new Date().toISOString(),
          hasMore: false,
        }),
        { status, headers: { 'content-type': 'application/json' } },
      ),
  );

/** A server that accepts everything it is sent, and records each request. */
function server(): {
  fetch: ReturnType<typeof vi.fn>;
  sent: { accountId: string | null; rows: string[] }[];
} {
  const sent: { accountId: string | null; rows: string[] }[] = [];
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as {
      accountId: string | null;
      mutations: { row: { id: string } }[];
    };
    sent.push({ accountId: body.accountId, rows: body.mutations.map((m) => m.row.id) });
    return new Response(
      JSON.stringify({
        cursor: 1,
        changes: {},
        accountId: 'acct-1',
        serverTime: new Date().toISOString(),
        hasMore: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  return { fetch: fetchMock, sent };
}

/** The server answering for whoever this phone held: rows in both tables and
 *  a cursor. Two more sets are logged while the request is out, so the round
 *  has something of theirs to put back afterwards. */
function previousPerson(): ReturnType<typeof vi.fn> {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const { accountId } = JSON.parse(init.body) as { accountId: string | null };
    queue(2, accountId);
    await dev.pass('request');
    return new Response(
      JSON.stringify({
        cursor: 99,
        changes: { logs: [{ id: 'their-set' }], profile: [{ id: 'their-profile' }] },
        accountId: 'acct-1',
        serverTime: new Date().toISOString(),
        hasMore: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
}

beforeEach(async () => {
  vi.resetModules();
  dev.outbox = [];
  dev.seq = 0;
  dev.applied = [];
  dev.writes = [];
  dev.held = null;
  dev.meta = new Map();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', storage());
  sync = await import('./sync');
  seen = [];
  stop = sync.onSyncStatus((s) => seen.push(s));
});

afterEach(() => {
  // A round a test left scheduled must not fire into the next one, whether the
  // test passed or failed: they share the stand-in database and `fetch`.
  sync.stopSync();
  vi.useRealTimers();
  stop();
  vi.unstubAllGlobals();
});

describe('a storage failure', () => {
  it('is reported apart from the sync state', () => {
    sync.reportStorageFailure(new Error('quota exceeded'));
    const last = seen.at(-1)!;
    expect(last.storageFailure).toBe('quota exceeded');
    // Where the sync is has not changed: nothing about the server is known.
    expect(last.state).toBe('idle');
  });

  it('survives a sync that succeeds, and every status on the way', async () => {
    vi.stubGlobal('fetch', answer(200));
    sync.reportStorageFailure(new Error('quota exceeded'));
    const from = seen.length;

    await sync.sync();

    const after = seen.slice(from);
    expect(after.map((s) => s.state)).toEqual(expect.arrayContaining(['syncing', 'idle']));
    expect(after.at(-1)!.lastSyncedAt).not.toBeNull();
    expect(after.every((s) => s.storageFailure === 'quota exceeded')).toBe(true);
  });

  it('survives a sync that fails, and a device that goes offline', async () => {
    vi.stubGlobal('fetch', answer(500));
    sync.reportStorageFailure(new Error('quota exceeded'));
    await sync.sync();
    expect(seen.at(-1)!.state).toBe('error');
    expect(seen.at(-1)!.storageFailure).toBe('quota exceeded');

    vi.stubGlobal('navigator', { onLine: false });
    await sync.sync();
    expect(seen.at(-1)!.state).toBe('offline');
    expect(seen.at(-1)!.storageFailure).toBe('quota exceeded');
  });

  it('is cleared only by the person dismissing it', async () => {
    vi.stubGlobal('fetch', answer(200));
    sync.reportStorageFailure(new Error('quota exceeded'));
    await sync.sync();
    expect(seen.at(-1)!.storageFailure).toBe('quota exceeded');

    sync.dismissStorageFailure();
    expect(seen.at(-1)!.storageFailure).toBeNull();
    expect(seen.at(-1)!.state).toBe('idle');
  });
});

describe('a storage failure across a reload', () => {
  /* Kept only in memory, a reload cleared it before anybody saw it — and the
     reloads come unasked: the service worker's self-update reloads the app
     while it is hidden, and phones discard pages left in the background. */
  it('is still there', async () => {
    sync.reportStorageFailure(new Error('quota exceeded'));
    expect((await reload()).storageFailure).toBe('quota exceeded');
  });

  it('is gone once the person dismissed it', async () => {
    sync.reportStorageFailure(new Error('quota exceeded'));
    sync.dismissStorageFailure();
    expect((await reload()).storageFailure).toBeNull();
  });

  it('is gone after a sign-out, with everything else the next person must not inherit', async () => {
    sync.reportStorageFailure(new Error('quota exceeded'));
    await sync.wipeLocal();
    expect((await reload()).storageFailure).toBeNull();
  });

  it('is still reported where the browser refuses to keep it', async () => {
    /* A browser blocking site data throws on any touch of localStorage. The
       warning must still go up; it just cannot outlive the page. */
    const refuse = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse, removeItem: refuse });
    expect((await reload()).storageFailure).toBeNull();

    sync.reportStorageFailure(new Error('quota exceeded'));
    expect(seen.at(-1)!.storageFailure).toBe('quota exceeded');
    sync.dismissStorageFailure();
    expect(seen.at(-1)!.storageFailure).toBeNull();
  });
});

/**
 * Stop, send, then wipe (GYM-74).
 *
 * Signing out used to be one `sync()` and then a wipe regardless. That push is
 * capped at 200 changes, and it joins whatever is already travelling rather
 * than starting a round of its own — so a long offline session, or a set logged
 * while a push was in flight, was wiped without ever being sent.
 *
 * The browser half — the button, the sheet that counts what would go, and the
 * refusal offline — is `journey.spec.ts` and `delete-account.spec.ts`.
 */
describe('the last push before a wipe', () => {
  it('sends everything queued, not just the first page', async () => {
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    signedInAs('acct-1');
    queue(250);

    expect(await sync.flush()).toBe(0);

    expect(dev.outbox).toHaveLength(0);
    expect(srv.sent.map((r) => r.rows.length)).toEqual([200, 50]);
  });

  it('keeps going after the timers have been cancelled', async () => {
    /* The timers are cancelled first, so nothing fires into the gap between
       the last push and the wipe — but the last push itself must still run. */
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    signedInAs('acct-1');
    queue(3);

    sync.stopSync();
    await sync.sync();
    expect(srv.sent).toHaveLength(0);

    expect(await sync.flush()).toBe(0);
    expect(dev.outbox).toHaveLength(0);
  });

  it('starts again for a person who stays signed in', async () => {
    /* Sign-out and deletion stop the sync before they wipe. When the person
       stays instead, nothing else ever started it again, so the phone sent
       nothing until it was reloaded (GYM-125). */
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    signedInAs('acct-1');
    queue(2);

    sync.stopSync();
    await sync.sync();
    expect(srv.sent).toHaveLength(0);

    sync.resumeSync();
    await sync.sync();
    expect(srv.sent.map((r) => r.rows)).toEqual([['s0', 's1']]);
    expect(dev.outbox).toHaveLength(0);
  });

  it('starts its own rounds again: one 300 ms later, and one backstop however often it is resumed', async () => {
    /* A person who stays may not log another set for hours, so the phone has
       to start again by itself. The handlers `startSync` added outlive the
       stop; the round it scheduled and the five-minute backstop do not, so
       resuming puts both back. A second resume must not add a second
       backstop, which would double what a tab left open all day sends. */
    vi.useFakeTimers({ toFake: [...TIMERS] });
    browser();
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    signedInAs('acct-1');
    queue(2);

    sync.startSync();
    sync.stopSync();
    sync.resumeSync();
    sync.resumeSync();

    await vi.advanceTimersByTimeAsync(300);
    expect(srv.sent.map((r) => r.rows)).toEqual([['s0', 's1']]);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(srv.sent.map((r) => r.rows)).toEqual([['s0', 's1'], []]);
  });

  it('says how many are left when it cannot send them', async () => {
    vi.stubGlobal('fetch', answer(500));
    signedInAs('acct-1');
    queue(4);
    expect(await sync.flush()).toBe(4);
    expect(dev.outbox).toHaveLength(4);
  });
});

describe('a sync that comes back after a wipe', () => {
  it('writes nothing, and clears nothing', async () => {
    /* The request left under one account and lands on a phone somebody has
       just handed over. Applying its rows refills the device for the next
       person, and clearing the outbox clears changes it never carried. */
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate;
        return new Response(
          JSON.stringify({
            cursor: 99,
            changes: { logs: [{ id: 'from-the-server' }] },
            accountId: 'acct-1',
            serverTime: new Date().toISOString(),
            hasMore: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    signedInAs('acct-1');
    queue(2);
    const travelling = sync.sync();
    await sync.wipeLocal();
    // A set the next person logs, after the wipe and before the answer.
    queue(1, null);
    release();
    await travelling;

    expect(dev.applied).toEqual([]);
    expect(dev.meta.get('cursor')).toBeUndefined();
    expect(dev.outbox).toHaveLength(1);
  });
});

/**
 * A wipe that lands while a sync is writing (GYM-125).
 *
 * Sign-out's sheet starts the sync again while it asks, so "Sign out and lose
 * them" can wipe the phone halfway through a round. The round used to look at
 * the epoch once, before its first write, and then write the rest anyway: the
 * last person's rows in every table after the one it was on, their cursor, and
 * whose phone it was. The next person then sees the last one's training, or
 * their first sync asks from the wrong place and their own history never comes.
 */
describe('a wipe that lands while a sync is writing', () => {
  it.each([
    // The moment the wipe comes, the step held open for it, whose phone it was.
    ['its first answer is on the way', 'request', null],
    ['it records whose phone this is', 'meta.set:account', null],
    ['it writes the first table', 'bulkPut:logs', 'acct-1'],
    ['it puts back the sets logged while it travelled', 'put:logs', 'acct-1'],
  ] as const)('leaves nothing behind when it comes while %s', async (_, step, account) => {
    vi.stubGlobal('fetch', previousPerson());
    if (account) signedInAs(account);
    queue(2, account);
    const held = holdAt(step);

    const round = sync.sync();
    await held.reached;
    await sync.wipeLocal();
    const wiped = dev.writes.length;
    // The next person's first set, logged before the round has finished.
    queue(1, null);
    held.open();
    await round;

    // Not one write after the wipe: no rows, no cursor, nobody's account.
    expect(dev.writes.slice(wiped)).toEqual([]);
    expect([...dev.meta.keys()]).toEqual([]);
    // And the next person's set is still theirs to send.
    expect(dev.outbox.map((o) => o.accountId)).toEqual([null]);
  });
});

describe('a phone that has been wiped', () => {
  it('starts no sync afterwards, whatever fires', async () => {
    /* Sign-out and deletion, the wipe's only callers, are both leaving. A
       round started between the wipe and the end of the session asks from
       cursor 0 with a session that still works, and pulls the whole account
       back onto the emptied phone; and sign-out's sheet starts the sync again
       while it asks. So the wipe stops it itself, rather than trust every
       caller to. */
    vi.useFakeTimers({ toFake: [...TIMERS] });
    const { fire } = browser();
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    signedInAs('acct-1');

    // The app starts it, sign-out stops it to push, and the sheet starts it again.
    sync.startSync();
    sync.stopSync();
    sync.resumeSync();

    await sync.wipeLocal();
    queue(1, null);
    sync.schedule(0);
    fire('online');
    fire('visibilitychange');
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(srv.sent).toEqual([]);
  });

  it('starts no sync while the wipe is still clearing', async () => {
    /* The sheet's resume leaves a round due in 300 ms and the backstop
       running. A wipe that stopped them only once its clears were done would
       let either fire in between, read the emptied phone as cursor 0 and pull
       the whole account back with the session that still works. */
    vi.useFakeTimers({ toFake: [...TIMERS] });
    browser();
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    signedInAs('acct-1');

    sync.startSync();
    sync.stopSync();
    sync.resumeSync();

    const held = holdAt('clear:logs');
    const wipe = sync.wipeLocal();
    await held.reached;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    held.open();
    await wipe;

    expect(srv.sent).toEqual([]);
  });
});

describe('data that knows its account', () => {
  it('adopts the account the first sync names, and stamps what was queued', async () => {
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    queue(2, null);

    await sync.sync();

    expect(dev.meta.get('account')).toBe('acct-1');
    expect(srv.sent[0]!.accountId).toBeNull();
    // Whatever is queued from here on says whose it is.
    queue(1, null);
    await sync.sync();
    expect(srv.sent[1]!.accountId).toBe('acct-1');
  });

  it('never sends one account’s changes under another', async () => {
    const srv = server();
    vi.stubGlobal('fetch', srv.fetch);
    signedInAs('acct-1');
    queue(2, 'acct-1');
    queue(2, 'someone-else');

    await sync.sync();

    expect(srv.sent[0]!.rows).toEqual(['s0', 's1']);
    // The other account's changes are still on the phone, untouched.
    expect(dev.outbox.map((o) => o.accountId)).toEqual(['someone-else', 'someone-else']);
  });

  it('stops dead when the server says another account is signed in', async () => {
    vi.stubGlobal('fetch', answer(409));
    signedInAs('acct-1');
    queue(2);

    await sync.sync();

    expect(seen.at(-1)!.state).toBe('foreign');
    // Nothing went up, nothing came down, nothing was dropped.
    expect(dev.applied).toEqual([]);
    expect(dev.outbox).toHaveLength(2);
  });
});
