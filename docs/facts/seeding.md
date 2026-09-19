---
id: seeding
status: current
decided: "f404fec; Confluence 934445138"
appears:
  repo: ["docs/data.md#seeding", "docs/data.md#the-exercise-library", "docs/architecture.md#offline-and-recovery", "README.md#the-demo-account", "e2e/flows/01-first-run.md#preconditions", "e2e/flows/08-a-full-journey.md#steps--signing-up-and-coming-back", "e2e/flows/08-a-full-journey.md#expected", "docs/openapi.yaml#/paths/~1api~1sync", "apps/web/src/lib/db/seed-user.ts"]
  copy: []
  tests: ["apps/web/src/lib/db/seed-user.test.ts", "e2e/tests/recovery.spec.ts", "e2e/tests/journey.spec.ts", "packages/domain/test/catalogue.test.ts"]
  confluence: ["934608916", "934543399", "934445118", "934477826", "934445138", "934477845", "934576168", "934445178", "934543437"]
---

A new account gets the seven patterns plus isolation, a seven-pattern 3-day week, an opening split period and a profile, but no exercise rows. Seeding runs only on an empty account, so new defaults reach new accounts only; existing users need a backfill.
