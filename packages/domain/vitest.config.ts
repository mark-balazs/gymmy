import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Dates here are local by design, and a local-versus-UTC bug cannot show in
    // UTC, which is where CI runs. Pinned away from it so it can.
    env: { TZ: 'America/New_York' },
  },
});
