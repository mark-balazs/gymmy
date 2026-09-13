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
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
