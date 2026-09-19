import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXERCISE_DETAILS, detailSlug } from '@athletic/domain';

/**
 * The exercise photographs are files in this app, not URLs somebody else
 * serves — vendored into `public/exercises/<slug>/` so the service worker can
 * cache them for a gym with no signal.
 *
 * The domain suite pins the *path* each detail entry points at, and cannot
 * see a file: it has no filesystem, by design. A path with nothing behind it
 * is two broken boxes on the exercise sheet, and the likeliest way to get one
 * is to add an exercise and forget the `false` that says it has no photograph.
 * The one e2e check opens a single exercise's sheet. So every path is held to
 * a file here, where Node can look.
 */

const pub = fileURLToPath(new URL('../../public', import.meta.url));

describe('vendored exercise photographs', () => {
  it('has a file behind every photograph path', () => {
    const missing = Object.entries(EXERCISE_DETAILS).flatMap(([name, d]) =>
      d.images.filter((src) => !existsSync(join(pub, src))).map((src) => `${name}: ${src}`),
    );
    expect(missing).toEqual([]);
  });

  it('vendors no folder that nothing points at', () => {
    // The other direction: a renamed exercise leaves its old folder behind,
    // shipped to every phone and cached forever, and nothing ever shows it.
    const used = new Set(
      Object.entries(EXERCISE_DETAILS)
        .filter(([, d]) => d.images.length > 0)
        .map(([name]) => detailSlug(name)),
    );
    const orphans = readdirSync(join(pub, 'exercises')).filter((dir) => !used.has(dir));
    expect(orphans).toEqual([]);
  });
});
