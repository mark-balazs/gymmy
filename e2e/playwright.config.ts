import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// The fixtures connect to Postgres directly, so they need the same DATABASE_URL
// the app uses. Playwright does not read .env on its own.
loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  // Local-first means most assertions resolve instantly from IndexedDB; the
  // slow paths are sync round trips, which still finish well inside this.
  timeout: 45_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  // A .only left behind should fail the pipeline, not silently skip everything.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mobile-chrome',
      // This is a phone app used one-handed in a gym; testing it at desktop
      // width would exercise a layout nobody actually uses.
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    // A production build, not `next dev` — dev-mode recompilation makes
    // timing-sensitive assertions (especially the offline ones) flaky.
    command: 'npm run start -w @athletic/web',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: '..',
    env: {
      PORT: String(PORT),
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://athletic:athletic@localhost:5432/athletic',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-32ch',
      AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? 'e2e-client-id',
      AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? 'e2e-client-secret',
      AUTH_URL: baseURL,
    },
  },
});
