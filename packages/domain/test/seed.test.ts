import { describe, expect, it } from 'vitest';
import { EXERCISE_DETAILS, detailSlug } from '../src/details';
import { SEED_EXERCISES, SEED_PATTERNS } from '../src/seed';

describe('the seeded library', () => {
  it('gives every counted pattern a home option', () => {
    // The coverage guarantee is made for home users too. Without this, a
    // home program silently cannot reach some patterns and the promise breaks
    // for exactly the people least able to work around it.
    const counted = SEED_PATTERNS.filter((p) => p.counts);
    const atHome = new Set(SEED_EXERCISES.filter((e) => e.where === 'home').map((e) => e.pattern));
    expect(counted.filter((p) => !atHome.has(p.key)).map((p) => p.key)).toEqual([]);
  });

  it('describes every exercise', () => {
    const undescribed = SEED_EXERCISES.filter((e) => e.description.trim() === '');
    expect(undescribed.map((e) => e.name)).toEqual([]);
  });

  it('keeps descriptions short enough to read mid-set', () => {
    // The wire schema caps this at 600 characters; the point of the cue is that
    // it fits on a phone between sets, so the seeded ones stay far under.
    const tooLong = SEED_EXERCISES.filter((e) => e.description.length > 240);
    expect(tooLong.map((e) => `${e.name} (${e.description.length})`)).toEqual([]);
  });

  it('has either a full pair of photographs or none', () => {
    // One photograph of a two-position movement is worse than none: the pair is
    // what shows the start and the finish.
    const odd = SEED_EXERCISES.filter((e) => e.images.length !== 0 && e.images.length !== 2);
    expect(odd.map((e) => `${e.name}: ${e.images.length}`)).toEqual([]);
  });

  it('points at same-origin image paths', () => {
    // An absolute URL here would be a third party the app silently depends on,
    // and one the service worker would refuse to cache for offline use.
    const bad = SEED_EXERCISES.flatMap((e) => e.images).filter(
      (src) => !src.startsWith('/exercises/'),
    );
    expect(bad).toEqual([]);
  });

  it('derives image paths from the exercise name', () => {
    for (const e of SEED_EXERCISES) {
      if (!e.images.length) continue;
      expect(e.images).toEqual([
        `/exercises/${detailSlug(e.name)}/0.jpg`,
        `/exercises/${detailSlug(e.name)}/1.jpg`,
      ]);
    }
  });

  it('has no detail entry for an exercise that does not exist', () => {
    // A typo in a name would otherwise leave the real exercise undescribed and
    // the orphaned detail invisible.
    const names = new Set(SEED_EXERCISES.map((e) => e.name));
    expect(Object.keys(EXERCISE_DETAILS).filter((n) => !names.has(n))).toEqual([]);
  });
});
