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

import { local, DOMAIN_TABLES, getMeta, setMeta, type Outbox } from './db';
import type { PullResponse } from '@/lib/sync/protocol';
import type { TableName } from '@athletic/domain';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
}

type Listener = (s: SyncStatus) => void;

const listeners = new Set<Listener>();
let status: SyncStatus = { state: 'idle', pending: 0, lastSyncedAt: null, error: null };
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

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

/** Queue a change and schedule a push. Callers never await the network. */
export async function enqueue(table: TableName, row: { id: string }): Promise<void> {
  await local.outbox.add({
    table,
    rowId: row.id,
    row: JSON.parse(JSON.stringify(row)) as Record<string, unknown>,
    queuedAt: new Date().toISOString(),
  });
  await refreshPending();
  schedule();
}

export function schedule(delay = 800): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
}

export async function sync(): Promise<void> {
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

async function run(): Promise<void> {
  emit({ state: 'syncing', error: null });

  try {
    const since = await getMeta<number>('cursor', 0);
    const queued = await local.outbox.orderBy('seq').limit(200).toArray();

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        since,
        mutations: queued.map((q) => ({ table: q.table, op: 'put' as const, row: q.row })),
      }),
    });

    if (res.status === 401) {
      // Not signed in. Local data is untouched and still fully usable.
      emit({ state: 'offline', error: null });
      return;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`sync failed (${res.status}) ${detail.slice(0, 200)}`);
    }

    const payload = (await res.json()) as PullResponse;

    await applyChanges(payload.changes);

    // Only clear what we actually sent; anything queued since stays put.
    const sentIds = queued.map((q) => q.seq).filter((s): s is number => typeof s === 'number');
    if (sentIds.length) await local.outbox.bulkDelete(sentIds);

    // Re-apply the still-queued rows so an in-flight pull cannot clobber them.
    await reapplyOutbox();

    await setMeta('cursor', payload.cursor);
    await refreshPending();
    emit({ state: 'idle', lastSyncedAt: new Date().toISOString(), error: null });
  } catch (err) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    emit({
      state: offline ? 'offline' : 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
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

  // Backstop for a tab left open all day.
  setInterval(() => void sync(), 5 * 60 * 1000);

  void refreshPending();
  schedule(300);
}

/** Full reset — used on sign-out so the next account does not inherit a cache. */
export async function wipeLocal(): Promise<void> {
  await Promise.all([
    ...DOMAIN_TABLES.map((t) => local.table(t).clear()),
    local.outbox.clear(),
    local.meta.clear(),
  ]);
  emit({ state: 'idle', pending: 0, lastSyncedAt: null, error: null });
}

export type { Outbox };
