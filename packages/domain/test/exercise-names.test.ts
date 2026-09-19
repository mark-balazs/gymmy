import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../src/catalogue';
import { EXERCISE_NAMES, exerciseName } from '../src/exercise-names';
import { LANG_CODES } from '../src/types';

/**
 * The exercise-name table is keyed by the canonical English name, which is a
 * cheap arrangement that breaks silently: rename an exercise in `catalogue.ts`
 * and every translation for it stops resolving, with no error anywhere — the
 * app simply shows English to a German user and nobody notices for months.
 *
 * These are the tests that turn that into a build failure.
 */
describe('exercise names', () => {
  const translated = LANG_CODES.filter((l) => l !== 'en');

  it('covers every catalogue exercise, retired ones included', () => {
    // A retired lift's history still shows its name, so it keeps its
    // translation. Held to the seeded list instead, the first legal retirement
    // would have pushed somebody to delete it, and that history would read in
    // English from then on.
    const missing = CATALOGUE.filter((x) => !EXERCISE_NAMES[x.name]).map((x) => x.name);
    expect(missing).toEqual([]);
  });

  it('has no entry for an exercise that does not exist', () => {
    // The other direction: a stale key is a translation nobody will ever see.
    const catalogued = new Set(CATALOGUE.map((x) => x.name));
    expect(Object.keys(EXERCISE_NAMES).filter((k) => !catalogued.has(k))).toEqual([]);
  });

  it('gives every exercise a name in every language the app ships', () => {
    const holes: string[] = [];
    for (const x of CATALOGUE) {
      for (const lang of translated) {
        const name = EXERCISE_NAMES[x.name]?.[lang];
        if (!name?.trim()) holes.push(`${x.name}/${lang}`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('keeps them short enough for a list row on a phone', () => {
    const long = Object.entries(EXERCISE_NAMES).flatMap(([key, names]) =>
      Object.entries(names)
        .filter(([, v]) => v.length > 40)
        .map(([lang, v]) => `${key}/${lang}: ${v.length}`),
    );
    expect(long).toEqual([]);
  });

  it('falls back to English rather than showing nothing', () => {
    // A pre-catalogue row the catalogue does not know (index() keeps it as an
    // exercise of its own) has no entry, and must still render under its
    // stored name.
    expect(exerciseName('de', { name: 'Zottman Curl' })).toBe('Zottman Curl');
    expect(exerciseName('de', null)).toBe('');
  });

  it('translates a catalogue name into the chosen language', () => {
    // The only assertion that proves the table is read at all.
    expect(exerciseName('hu', { name: 'Barbell Bench Press' })).toBe('Fekvenyomás');
  });

  it('never translates into English, because the key already is English', () => {
    expect(exerciseName('en', { name: 'Barbell Bench Press' })).toBe('Barbell Bench Press');
    const withEn = Object.entries(EXERCISE_NAMES).filter(
      ([, names]) => 'en' in (names as Record<string, unknown>),
    );
    expect(withEn.map(([k]) => k)).toEqual([]);
  });
});
