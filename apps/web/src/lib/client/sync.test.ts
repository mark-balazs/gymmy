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

vi.mock('./db', () => {
  const none = { toArray: async () => [] };
  return {
    DOMAIN_TABLES: [],
    local: {
      outbox: {
        count: async () => 0,
        orderBy: () => ({ ...none, limit: () => none }),
        bulkDelete: async () => undefined,
      },
      table: () => ({ bulkPut: async () => undefined, put: async () => undefined }),
    },
    getMeta: async (_key: string, fallback: unknown) => fallback,
    setMeta: async () => undefined,
  };
});

type Sync = typeof import('./sync');
type Status = Parameters<Parameters<Sync['onSyncStatus']>[0]>[0];

let sync: Sync;
let seen: Status[];
let stop: () => void;

const answer = (status: number) =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          cursor: 1,
          changes: {},
          serverTime: new Date().toISOString(),
          hasMore: false,
        }),
        { status, headers: { 'content-type': 'application/json' } },
      ),
  );

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
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
