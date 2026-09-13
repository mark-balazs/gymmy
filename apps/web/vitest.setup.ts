/**
 * Loads the same env files the app and drizzle-kit read.
 *
 * `@/env` validates on import and throws with the offending variable named, so
 * a test that touches the database must have these in place *before* any app
 * module is imported.
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: `${root}.env` });
config({ path: `${root}apps/web/.env.local`, override: true });
