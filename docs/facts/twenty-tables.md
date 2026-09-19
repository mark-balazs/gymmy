---
id: twenty-tables
status: current
decided: "Confluence 934445138; schema.ts"
appears:
  repo: ["docs/data.md#what-is-stored", "docs/data.md#two-stores-one-shape", "docs/data.md#the-tables-that-are-not-synced", "docs/data.md#sync-protocol", "docs/data-model.mmd", "docs/openapi.yaml#/components/schemas/Synced", "apps/web/src/lib/db/schema.ts"]
  copy: []
  tests: ["apps/web/src/lib/db/er-diagram.test.ts", "apps/web/src/lib/sync/openapi.test.ts", "apps/web/src/lib/sync/rows.test.ts", "apps/web/src/app/api/sync/route.test.ts"]
  confluence: ["934445138", "934477826"]
---

There are 20 tables: 9 synced ones for a person's own training (patterns, legacy exercises, slots, split periods, program entries, set logs, body logs, goals, profile), 6 for trainer plans and 5 for sign-in. Every synced row carries a last-changed time, a soft-delete marker and a change number that only the server sets.

er-diagram.test.ts reads the four numbers from the first sentence and holds them to schema.ts, so keep that sentence's shape: reworded, the test fails and says so.
