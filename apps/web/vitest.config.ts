import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the app's own pure helpers.
 *
 * Most logic belongs in `@athletic/domain` and is tested there. What lands here
 * is the code that cannot: things touching Node builtins or the wire format,
 * which the domain package deliberately has no access to.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // The seeding test talks to Postgres; the default 5s is not enough for a
    // few hundred inserts on a cold connection.
    testTimeout: 30_000,
    // And the seeding itself runs in `beforeAll`, which vitest times against
    // `hookTimeout` (10s by default), not `testTimeout` — so without this the
    // headroom above never reached the one step it was added for.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
