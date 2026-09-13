import { describe, expect, it } from 'vitest';
import { EXERCISE_NAMES, exerciseName } from '../src/exercise-names';
import { SEED_EXERCISES } from '../src/seed';
import { LANG_CODES } from '../src/types';

/**
 * The exercise-name table is keyed by the canonical English name, which is a
 * cheap arrangement that breaks silently: rename an exercise in `seed.ts` and
 * every translation for it stops resolving, with no error anywhere — the app
 * simply shows English to a German user and nobody notices for months.
 *
 * These are the tests that turn that into a build failure.
 */
describe('exercise names', () => {
  const translated = LANG_CODES.filter((l) => l !== 'en');

  it('covers every seeded exercise', () => {
    const missing = SEED_EXERCISES.filter((x) => !EXERCISE_NAMES[x.name]).map((x) => x.name);
    expect(missing).toEqual([]);
  });

  it('has no entry for an exercise that does not exist', () => {
    // The other direction: a stale key is a translation nobody will ever see.
    const seeded = new Set(SEED_EXERCISES.map((x) => x.name));
    expect(Object.keys(EXERCISE_NAMES).filter((k) => !seeded.has(k))).toEqual([]);
  });

  it('gives every exercise a name in every language the app ships', () => {
    const holes: string[] = [];
    for (const x of SEED_EXERCISES) {
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
    // An exercise the user created themselves has no entry, and must still
    // render under its own name.
    expect(exerciseName('de', { name: 'Zottman Curl' })).toBe('Zottman Curl');
    expect(exerciseName('de', null)).toBe('');
  });

  it('leaves a name the user typed themselves alone', () => {
    /*
     * The table is a fallback for *unedited* rows. Someone who renamed their
     * squat to "Front squat (heels up)" has said what they want it called, and
     * switching language must not overrule them — there is no translation of
     * their wording to reach for anyway.
     */
    expect(exerciseName('hu', { name: 'Front squat (heels up)' })).toBe('Front squat (heels up)');
    // …while an untouched row does translate.
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
