import { describe, expect, it } from 'vitest';
import { CATALOGUE, OFF_PLAN } from '../src/catalogue';
import { EXERCISE_DETAILS, detailSlug } from '../src/details';
import { SEED_EXERCISES, SEED_PATTERNS } from '../src/seed';

describe('the seeded library', () => {
  it('gives every counted pattern a programmable home option', () => {
    // The coverage guarantee is made for home users too. Without this, a
    // home program silently cannot reach some patterns and the promise breaks
    // for exactly the people least able to work around it. Programmable, not
    // merely present: an off-plan movement is never picked, so a Turkish
    // get-up at home does not give a home week its carry.
    const counted = SEED_PATTERNS.filter((p) => p.counts);
    const atHome = new Set(
      SEED_EXERCISES.filter((e) => e.where === 'home' && !e.tags.includes(OFF_PLAN)).map(
        (e) => e.pattern,
      ),
    );
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

  it('derives image paths from the exercise name', () => {
    /* Exactly this pair or nothing. A pair, because one photograph of a
       two-position movement is worse than none: the pair is what shows the
       start and the finish. Same-origin, because an absolute URL would be a
       third party the app silently depends on, and one the service worker
       would refuse to cache for offline use. */
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
    // the orphaned detail invisible. Held to the catalogue rather than the
    // seeded view of it: a retired entry still resolves, with its description,
    // so it keeps its detail — held to the seeded list, the first legal
    // retirement would have pushed somebody to delete it.
    const names = new Set(CATALOGUE.map((c) => c.name));
    expect(Object.keys(EXERCISE_DETAILS).filter((n) => !names.has(n))).toEqual([]);
  });
});
