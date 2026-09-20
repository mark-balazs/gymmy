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
const dev = vi.hoisted(() => ({
  outbox: [] as {
    seq: number;
    table: string;
    row: Record<string, unknown>;
    accountId: string | null;
  }[],
  meta: new Map<string, unknown>(),
  /** Everything a pull wrote into a table. */
  applied: [] as { table: string; rows: unknown[] }[],
}));

vi.mock('./db', () => {
  const sorted = () => dev.outbox.slice().sort((a, b) => a.seq - b.seq);
  return {
    DOMAIN_TABLES: ['logs'],
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
        },
        clear: async () => void (dev.outbox = []),
        toCollection: () => ({
          modify: async (patch: Record<string, unknown>) => {
            dev.outbox = dev.outbox.map((o) => ({ ...o, ...patch }));
          },
        }),
      },
      meta: { clear: async () => dev.meta.clear() },
      table: (name: string) => ({
        bulkPut: async (rows: unknown[]) => void dev.applied.push({ table: name, rows }),
        put: async () => undefined,
        clear: async () => undefined,
      }),
    },
    getMeta: async (key: string, fallback: unknown) =>
      dev.meta.has(key) ? dev.meta.get(key) : fallback,
    setMeta: async (key: string, value: unknown) => void dev.meta.set(key, value),
  };
});

/** `n` sets waiting to go, stamped with the account given. */
function queue(n: number, accountId: string | null = 'acct-1'): void {
  for (let i = 0; i < n; i++) {
    dev.outbox.push({ seq: dev.outbox.length + 1, table: 'logs', row: { id: `s${i}` }, accountId });
  }
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

beforeEach(async () => {
  vi.resetModules();
  dev.outbox = [];
  dev.applied = [];
  dev.meta = new Map();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', storage());
  sync = await import('./sync');
  seen = [];
  stop = sync.onSyncStatus((s) => seen.push(s));
});

afterEach(() => {
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
