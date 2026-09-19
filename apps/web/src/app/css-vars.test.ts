import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every CSS variable the app uses is defined somewhere.
 *
 * An undefined variable fails silently: `bg-[var(--color-accent-bg)]` is a
 * valid class, the browser drops the declaration, and the in-effect plan
 * simply had no highlight (GYM-23). Nothing in a browser or a type says so,
 * which is why this reads the source.
 *
 * Defined means: declared in a stylesheet under src, set in a style object or
 * with `setProperty` in the code, or one of Tailwind's own theme variables.
 * `--tw-*` are Tailwind's internals and are left alone.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const TAILWIND = fileURLToPath(
  new URL('../../../../node_modules/tailwindcss/theme.css', import.meta.url),
);

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

describe('CSS variables', () => {
  it('every one used is defined', () => {
    const used = new Map<string, string>();
    const defined = new Set<string>();
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      const where = relative(SRC, file).replaceAll('\\', '/');
      // var(--x), and Tailwind's shorthand for it: duration-(--dur-fast).
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) used.set(m[1]!, where);
      for (const m of text.matchAll(/-\((--[\w-]+)\)/g)) used.set(m[1]!, where);
      // --x: in a stylesheet; '--x': in a style object; setProperty('--x', …).
      for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]!);
      for (const m of text.matchAll(/['"](--[\w-]+)['"]\s*[\]:,)]/g)) defined.add(m[1]!);
    }
    for (const m of readFileSync(TAILWIND, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]!);

    const missing = [...used]
      .filter(([name]) => !defined.has(name) && !name.startsWith('--tw-'))
      .map(([name, where]) => `${name} (${where})`);
    expect(missing).toEqual([]);
  });
});
