import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The buzz on Train. What the phone feels cannot be tested here; what can is
 * that it is asked for only where the platform has it, never throws into the
 * logging path, and that the one pulse for a finished day is not cut short by
 * the set that finished it — which arrives before or after it, depending on
 * the database.
 */

let calls: unknown[];

async function fresh() {
  vi.resetModules();
  return (await import('./haptic')).haptic;
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal('navigator', {
    vibrate: (p: unknown) => {
      calls.push(p);
      return true;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('haptic', () => {
  it('buzzes briefly for a set and a little longer for a day', async () => {
    const haptic = await fresh();
    haptic('set');
    expect(calls).toEqual([10]);
    haptic('day');
    expect(calls).toEqual([10, 24]);
  });

  it('does nothing where the platform has no vibration', async () => {
    vi.stubGlobal('navigator', {});
    const haptic = await fresh();
    expect(() => haptic('set')).not.toThrow();
  });

  it('swallows a refusal rather than breaking the save it confirms', async () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    const haptic = await fresh();
    expect(() => haptic('day')).not.toThrow();
  });

  it('keeps the day pulse whole when the set that finished it arrives second', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'Date'] });
    const haptic = await fresh();
    haptic('day');
    haptic('set');
    expect(calls).toEqual([24]);
    // A rest later, the next set buzzes as usual.
    vi.advanceTimersByTime(60_000);
    haptic('set');
    expect(calls).toEqual([24, 10]);
  });
});
