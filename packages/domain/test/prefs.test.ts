import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, prefs } from '../src/prefs';
import type { Profile } from '../src/types';
import { seedSnapshot } from './fixture';

/**
 * `prefs()` is what stands between a profile row and a screen.
 *
 * The case that matters is the row that predates a column. The server only
 * re-sends a row whose `seq` moved, and adding a column does not move it — so a
 * phone that synced last month holds a profile with no `entryMode` key at all,
 * and will go on holding it until something else about the profile changes.
 * Whatever the Train card does with `undefined` is what those people get.
 */
describe('prefs', () => {
  const full = seedSnapshot().profile!;

  /** The same row, as a device that synced before these keys existed holds it. */
  const predating = (): Profile => {
    const row: Partial<Profile> = { ...full };
    delete row.entryMode;
    delete row.plateLoader;
    return row as Profile;
  };

  it('falls back to buttons and the plate loader for a row that predates them', () => {
    const p = prefs(predating());
    expect(p.entryMode).toBe('buttons');
    expect(p.plateLoader).toBe(true);
  });

  it('gives the same answer before the profile has loaded', () => {
    expect(prefs(null).entryMode).toBe('buttons');
    expect(prefs(undefined).plateLoader).toBe(true);
    expect(DEFAULT_PREFS.entryMode).toBe('buttons');
    expect(DEFAULT_PREFS.plateLoader).toBe(true);
  });

  it('keeps a plate loader somebody turned off', () => {
    // `false` is an answer, not an absence — a `||` here would quietly turn it
    // back on for everyone who had switched it off.
    expect(prefs({ ...full, plateLoader: false }).plateLoader).toBe(false);
  });

  it('keeps the ruler for somebody who chose it', () => {
    expect(prefs({ ...full, entryMode: 'ruler' }).entryMode).toBe('ruler');
  });
});
