/**
 * One live read, shared by every screen that asks for it.
 *
 * `useLiveQuery` gives each component a query of its own, and a fresh query
 * has no value on its first render. So every tab mounted empty and filled in a
 * moment later — and a tab's first render is the one a navigation slides in,
 * so the slide carried an empty state ("Log a few sessions…", "Loading…") and
 * the real page popped in after it. Train chose its day from that empty render
 * and kept it, so after a reload it always opened on Day A (GYM-13).
 *
 * Here there is one read, kept alive by whoever is listening, and every screen
 * reads its latest result synchronously. The `(app)` layout listens for as long
 * as the app is on screen and waits for the first result before it draws
 * anything, so no page ever renders from nothing and a tab mounted by a
 * navigation already holds its data.
 *
 * Pure plumbing with the source passed in, so `live.test.ts` can drive it
 * without IndexedDB. `hooks.ts` connects it to Dexie.
 */

import { liveQuery } from 'dexie';

/** Starts a read that reports each new result, and returns how to stop it. */
export type Source<T> = (next: (value: T) => void, fail: (error: unknown) => void) => () => void;

/** What a listener sees: the latest result (undefined before the first one)
 *  and the error the read last failed with. A new object on every change, the
 *  same one otherwise — `useSyncExternalStore` compares by identity. */
export interface LiveState<T> {
  value: T | undefined;
  error: unknown;
}

export interface Shared<T> {
  subscribe: (listener: () => void) => () => void;
  get: () => LiveState<T>;
  /** Starts a fresh read after one failed; does nothing while one is running. */
  retry: () => void;
}

/**
 * How long the read outlives its last listener. A navigation unmounts one
 * screen and mounts the next in the same commit, and React runs the cleanup
 * before the new subscription — without a moment's grace the read would stop
 * and restart between the two, and the new screen would start empty again.
 */
export const LINGER_MS = 1000;

export function shared<T>(source: Source<T>, linger = LINGER_MS): Shared<T> {
  const EMPTY: LiveState<T> = { value: undefined, error: null };
  let state = EMPTY;
  /** The read in progress, or null when there is none (never started, stopped
   *  or failed). A stale read's late report is ignored by comparing with it. */
  let running: { stop: (() => void) | null } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: LiveState<T>) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const start = () => {
    const run: { stop: (() => void) | null } = { stop: null };
    running = run;
    run.stop = source(
      (value) => {
        if (running === run) set({ value, error: null });
      },
      (error) => {
        if (running !== run) return;
        /* A failed read is over: the source will not report again. Dropping
           it is what lets `retry` start a fresh one. The last result is kept,
           and so is the error, until that fresh read lands. */
        running = null;
        set({ value: state.value, error });
      },
    );
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!running) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size || timer) return;
        timer = setTimeout(() => {
          timer = null;
          if (listeners.size) return;
          running?.stop?.();
          running = null;
          /* Forgotten, not kept: with nobody listening nothing keeps it true,
             and the next account on this phone must not see this one's
             training for even a frame. */
          state = EMPTY;
        }, linger);
      };
    },
    get: () => state,
    retry() {
      if (!running && listeners.size) start();
    },
  };
}

/** A Dexie live query as a source: it re-reads whenever what it read changes,
 *  including changes the sync engine writes. */
export function fromLiveQuery<T>(query: () => Promise<T>): Source<T> {
  return (next, fail) => {
    const subscription = liveQuery(query).subscribe({ next, error: fail });
    return () => subscription.unsubscribe();
  };
}
