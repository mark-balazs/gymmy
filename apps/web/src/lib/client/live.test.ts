import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINGER_MS, shared, type Source } from './live';

/**
 * The one read every screen shares (GYM-13).
 *
 * The bug it fixes lived in the gap between a screen mounting and its data
 * arriving: each screen started its own read, so its first render — the one a
 * navigation slides in, and the one Train picks its day from — was empty.
 * These pin the three things that close the gap: one read however many
 * listen, its result there synchronously for a screen that arrives later, and
 * the read kept open across the moment one screen hands over to the next.
 */

/** A source the test drives by hand, counting how many reads it was asked for. */
function fakeSource<T>() {
  const runs: { next: (v: T) => void; fail: (e: unknown) => void; stopped: boolean }[] = [];
  const source: Source<T> = (next, fail) => {
    const run = { next, fail, stopped: false };
    runs.push(run);
    return () => {
      run.stopped = true;
    };
  };
  return { source, runs, live: () => runs.filter((r) => !r.stopped) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('one shared read', () => {
  it('starts one read however many screens listen', () => {
    const { source, runs } = fakeSource<number>();
    const store = shared(source);
    store.subscribe(() => {});
    store.subscribe(() => {});
    store.subscribe(() => {});
    expect(runs).toHaveLength(1);
  });

  it('gives a screen that arrives later the result at once', () => {
    const { source, runs } = fakeSource<string>();
    const store = shared(source);
    store.subscribe(() => {}); // the layout, open for as long as the app is
    runs[0]!.next('the week');

    /* A tab mounted by a navigation: its first render reads this, before it
       has subscribed to anything. Empty here is the bug. */
    expect(store.get().value).toBe('the week');
  });

  it('tells every listener about a new result, with a new state object', () => {
    const { source, runs } = fakeSource<number>();
    const store = shared(source);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    const before = store.get();
    runs[0]!.next(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(store.get()).not.toBe(before);
    // Unchanged between results: `useSyncExternalStore` compares by identity.
    expect(store.get()).toBe(store.get());
  });

  it('keeps the read open while one screen hands over to the next', () => {
    const { source, runs, live } = fakeSource<number>();
    const store = shared(source);
    const leaving = store.subscribe(() => {});
    runs[0]!.next(7);

    // React runs the old screen's cleanup before the new screen subscribes.
    leaving();
    store.subscribe(() => {});

    expect(runs).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(store.get().value).toBe(7);
  });

  it('stops, and forgets, once nobody has listened for a while', () => {
    const { source, runs, live } = fakeSource<number>();
    const store = shared(source);
    const off = store.subscribe(() => {});
    runs[0]!.next(7);
    off();

    vi.advanceTimersByTime(LINGER_MS - 1);
    expect(live()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(live()).toHaveLength(0);
    /* Forgotten rather than kept: nothing keeps it true any more, and after a
       sign-out the next account must not see this one's week. */
    expect(store.get().value).toBeUndefined();

    store.subscribe(() => {});
    expect(runs).toHaveLength(2);
  });
});

describe('a read that fails', () => {
  it('reports the error and keeps the last result', () => {
    const { source, runs } = fakeSource<number>();
    const store = shared(source);
    store.subscribe(() => {});
    runs[0]!.next(3);
    const boom = new Error('store will not open');
    runs[0]!.fail(boom);
    expect(store.get()).toEqual({ value: 3, error: boom });
  });

  it('starts a fresh read on retry, and a result clears the error', () => {
    const { source, runs } = fakeSource<number>();
    const store = shared(source);
    store.subscribe(() => {});
    runs[0]!.fail(new Error('no'));

    store.retry();
    expect(runs).toHaveLength(2);
    store.retry(); // one at a time
    expect(runs).toHaveLength(2);

    runs[1]!.next(4);
    expect(store.get()).toEqual({ value: 4, error: null });
  });

  it('ignores a stopped read that reports late', () => {
    const { source, runs } = fakeSource<number>();
    const store = shared(source);
    store.subscribe(() => {})();
    vi.advanceTimersByTime(LINGER_MS);
    runs[0]!.next(99);
    expect(store.get().value).toBeUndefined();
  });
});
