/**
 * Stamps the service worker with a build id and writes it to `public/sw.js`.
 *
 * This exists because of one rule: a browser adopts a new service worker only
 * when the bytes at its URL differ from the ones it already has. A hand-written
 * `public/sw.js` is byte-identical on every deploy, so however carefully the
 * worker is written, the browser never re-registers it and an installed PWA
 * keeps running last month's code indefinitely.
 *
 * The URL has to stay `/sw.js` for this to work. Versioning it as `/sw.js?v=x`
 * looks equivalent and is not: a long-lived app is running *old* JavaScript, so
 * it would ask for the old query string and find exactly what it already had —
 * which is precisely the case this needs to cover.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'sw-src.js');
const out = join(here, '..', 'public', 'sw.js');

/** The commit on Vercel; a timestamp locally, so repeated dev builds differ. */
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? String(Date.now());

const source = await readFile(src, 'utf8');
if (!source.includes('__BUILD_ID__')) {
  throw new Error(`${src} has no __BUILD_ID__ placeholder — the worker would never update.`);
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, source.replaceAll('__BUILD_ID__', buildId));

console.log(`sw.js built (${buildId})`);
