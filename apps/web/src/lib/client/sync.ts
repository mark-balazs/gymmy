/**
 * The sync engine.
 *
 * One endpoint, one round trip: push whatever is queued, pull whatever is newer
 * than our cursor. Runs on a debounce after writes, on reconnect, on tab focus,
 * and on a slow interval as a backstop.
 *
 * The subtle part is ordering. Server changes are applied first, then anything
 * still sitting in the outbox is re-applied on top — otherwise a pull could
 * overwrite a set you logged while the request was in flight, and it would look
 * to you like the app simply lost it.
 */

import { local, ACCOUNT_KEY, DOMAIN_TABLES, getMeta, setMeta, type Outbox } from './db';
import type { PullResponse } from '@/lib/sync/protocol';
import type { TableName } from '@athletic/domain';

/**
 * Where the sync is. An `error` means the change is safe on this device but
 * has not reached the server yet — annoying, and it resolves itself.
 *
 * `foreign` does not resolve itself: this device holds one account's data and
 * somebody else is signed in. Nothing is sent and nothing is fetched until a
 * person decides, because either would mix two people's training.
 */
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'foreign';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
  /**
   * A write that never landed on this device, so the set the person believes
   * they logged does not exist anywhere. The message of the last one, or null.
   *
   * **Not a sync state, on purpose.** It used to be one, and the next sync —
   * `syncing`, then `idle`, seconds later — replaced it: somebody who looked
   * away never learned. It is a fact about a write, not about the sync, so no
   * sync outcome touches it. Only the person clears it (`dismissStorageFailure`),
   * or a sign-out wipe. A reload does not: see `FAILURE_KEY`.
   */
  storageFailure: string | null;
}

/**
 * Where a storage failure outlives the page.
 *
 * Held only in memory, a reload cleared it unseen — and reloads happen without
 * anybody asking: the service worker's self-update reloads the app while it is
 * out of view, and phones discard pages left in the background. So it is also
 * written to localStorage: not IndexedDB, which is the store that just failed.
 *
 * Best effort. localStorage is absent on the server, and a browser that blocks
 * site data throws on any touch of it; then the warning lasts until a reload,
 * as it always did, rather than the report itself failing.
 */
const FAILURE_KEY = 'gymmy.storageFailure';

function recallFailure(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(FAILURE_KEY);
  } catch {
    return null;
  }
}

function keepFailure(message: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (message === null) localStorage.removeItem(FAILURE_KEY);
    else localStorage.setItem(FAILURE_KEY, message);
  } catch {
    /* Blocked or full: it still shows until the page goes. */
  }
}

type Listener = (s: SyncStatus) => void;

const listeners = new Set<Listener>();
let status: SyncStatus = {
  state: 'idle',
  pending: 0,
  lastSyncedAt: null,
  error: null,
  // A warning the last page load left up, and nobody has dismissed.
  storageFailure: recallFailure(),
};
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let backstop: ReturnType<typeof setInterval> | null = null;
let started = false;

/**
 * How many times this device has been wiped.
 *
 * A sync that left before a wipe comes back after it, holding the account it
 * was reading a moment ago — and writing those rows, or clearing the outbox it
 * no longer describes, refills a phone somebody has just handed over (GYM-74).
 * Every run takes a copy of this number and does nothing with its answer if it
 * has moved.
 */
let epoch = 0;

/** Stopped for good: sign-out and deletion cancel the timers before they wipe,
 *  so nothing starts a sync into the gap. */
let stopped = false;

export function onSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

function emit(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

async function refreshPending(): Promise<void> {
  emit({ pending: await local.outbox.count() });
}

/**
 * Queue a change and schedule a push. Callers never await the network.
 *
 * Stamped with the account this device's data belongs to, so a change written
 * under one account is never pushed under another. `null` on a device whose
 * first sync has not answered yet; the first one that does adopts them.
 */
export async function enqueue(table: TableName, row: { id: string }): Promise<void> {
  await local.outbox.add({
    table,
    rowId: row.id,
    row: JSON.parse(JSON.stringify(row)) as Record<string, unknown>,
    queuedAt: new Date().toISOString(),
    accountId: await getMeta<string | null>(ACCOUNT_KEY, null),
  });
  await refreshPending();
  schedule();
}

/**
 * A write to the local database failed.
 *
 * This is worse than a failed sync and has to be said differently. A sync
 * failure means "saved here, not there yet"; this means the set was not saved
 * *anywhere* — the device is out of space, or in a private window, or the store
 * is corrupt. Staying quiet would leave someone believing they had logged a set
 * that does not exist.
 *
 * It stays reported until the person dismisses it, whatever the sync does
 * next, even if a later write succeeds, and across a reload: a later set being
 * saved does not bring back the one that was not.
 */
export function reportStorageFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  keepFailure(message);
  emit({ storageFailure: message });
}

/** The person has seen the storage warning and tapped it away. */
export function dismissStorageFailure(): void {
  keepFailure(null);
  emit({ storageFailure: null });
}

export function schedule(delay = 800): void {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
}

/** One round, whatever the triggers are doing. `flush` uses this after the
 *  timers have been cancelled, which is the whole point of cancelling them. */
async function kick(): Promise<void> {
  if (inFlight) return inFlight;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emit({ state: 'offline' });
    return;
  }
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function sync(): Promise<void> {
  if (stopped) return;
  return kick();
}

async function run(): Promise<void> {
  emit({ state: 'syncing', error: null });
  const mine = epoch;

  try {
    const since = await getMeta<number>('cursor', 0);
    const account = await getMeta<string | null>(ACCOUNT_KEY, null);
    const all = await local.outbox.orderBy('seq').limit(200).toArray();
    /* Only this account's changes, and the ones written before this device had
       an answer, which this sync is about to adopt. Anything stamped with
       another account stays where it is until a person says what to do with
       it: sending it would file one person's training under another. */
    const queued = all.filter((q) => (q.accountId ?? account) === account);

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        since,
        accountId: account,
        mutations: queued.map((q) => ({ table: q.table, op: 'put' as const, row: q.row })),
      }),
    });

    if (res.status === 401) {
      // Not signed in. Local data is untouched and still fully usable.
      emit({ state: 'offline', error: null });
      return;
    }
    if (res.status === 409) {
      /* Somebody else is signed in on a phone still holding this account's
         training. Nothing goes up and nothing comes down; the app shows the
         count and asks. */
      emit({ state: 'foreign', error: 'another account' });
      return;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`sync failed (${res.status}) ${detail.slice(0, 200)}`);
    }

    const payload = (await res.json()) as PullResponse;

    /* The device was wiped while this was travelling — a sign-out, a deletion,
       a reset. Everything below describes an account this phone no longer
       holds, so writing any of it hands the next person the last one's
       training, and clearing the outbox clears changes this request never
       carried. */
    if (epoch !== mine) return;

    if (account === null) {
      // First answer this device has ever had: it, and everything queued
      // before it, belong to this account from now on.
      await setMeta(ACCOUNT_KEY, payload.accountId);
      await local.outbox.toCollection().modify({ accountId: payload.accountId });
    }

    await applyChanges(payload.changes);

    // Only clear what we actually sent; anything queued since stays put.
    const sentIds = queued.map((q) => q.seq).filter((s): s is number => typeof s === 'number');
    if (sentIds.length) await local.outbox.bulkDelete(sentIds);

    // Re-apply the still-queued rows so an in-flight pull cannot clobber them.
    await reapplyOutbox();

    await setMeta('cursor', payload.cursor);
    await refreshPending();

    // The server held the cursor back because a table filled its page. Come
    // straight back rather than waiting for the next trigger — otherwise a
    // device with a lot of history would trickle it in over hours.
    if (payload.hasMore) schedule(50);

    // The push is capped per round, so a long offline session leaves more
    // behind. Without this it drains 200 at a time on the five-minute backstop.
    else if (status.pending > 0) schedule(200);
    emit({ state: 'idle', lastSyncedAt: new Date().toISOString(), error: null });
  } catch (err) {
    if (epoch !== mine) return;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    emit({
      state: offline ? 'offline' : 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Push until there is nothing left to push, and say what is still waiting.
 *
 * Sign-out's last push used to be one `sync()` — capped at 200 changes, and
 * joining whatever was already in flight rather than starting a round of its
 * own, so a set logged while that one travelled was never sent and the wipe
 * that followed took it (GYM-74). This waits out the request in flight, then
 * keeps going while the queue is shrinking.
 *
 * It stops on the first round that sends nothing: offline, a refused row, a
 * server that is down. The caller then has a number to show rather than a wipe
 * to regret.
 */
export async function flush(): Promise<number> {
  for (let round = 0; round < 40; round++) {
    // Whatever is already travelling first — its rows are only cleared when it
    // lands, and a round started now would send them twice.
    if (inFlight) await inFlight;
    const before = await local.outbox.count();
    if (before === 0) return 0;
    await kick();
    const after = await local.outbox.count();
    if (after >= before) return after;
  }
  return local.outbox.count();
}

/**
 * Cancels every trigger, for good.
 *
 * Called before a wipe: the debounce, the five-minute backstop and the
 * reconnect and focus handlers all fire into an app that is being taken apart,
 * and a sync started in that gap is how a wiped phone refilled itself.
 */
export function stopSync(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
  if (backstop) clearInterval(backstop);
  backstop = null;
}

async function applyChanges(changes: Record<string, unknown[]>): Promise<void> {
  for (const name of DOMAIN_TABLES) {
    const rows = changes[name];
    if (!rows?.length) continue;
    const table = local.table(name);
    await table.bulkPut(rows as never[]);
  }
}

async function reapplyOutbox(): Promise<void> {
  const remaining = await local.outbox.orderBy('seq').toArray();
  for (const item of remaining) {
    await local.table(item.table).put(item.row as never);
  }
}

/** Wire up the triggers. Safe to call more than once. */
export function startSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('online', () => {
    emit({ state: 'idle' });
    schedule(200);
  });
  window.addEventListener('offline', () => emit({ state: 'offline' }));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(400);
  });

  // Backstop for a tab left open all day. Kept so `stopSync` can cancel it.
  backstop = setInterval(() => void sync(), 5 * 60 * 1000);

  void refreshPending();
  schedule(300);
}

/**
 * Full reset — used on sign-out so the next account does not inherit a cache.
 *
 * The epoch moves *first*, so a request already travelling cannot come back and
 * write the account this is erasing. Callers that are about to end the session
 * call `stopSync()` before this; a reset that keeps the app running (the
 * recovery screen) does not, and relies on the epoch alone.
 */
export async function wipeLocal(): Promise<void> {
  epoch += 1;
  await Promise.all([
    ...DOMAIN_TABLES.map((t) => local.table(t).clear()),
    local.outbox.clear(),
    local.meta.clear(),
  ]);
  // The next person on this phone inherits nothing, a warning included.
  keepFailure(null);
  emit({ state: 'idle', pending: 0, lastSyncedAt: null, error: null, storageFailure: null });
}

export type { Outbox };
