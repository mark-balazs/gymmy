---
id: one-sync-endpoint
status: current
decided: "D-001; 0782e80"
appears:
  repo: ["README.md#offline-first", "docs/architecture.md#how-a-set-gets-saved", "docs/architecture.md#the-cursor-is-the-subtle-part", "docs/data.md#sync-protocol", "docs/data.md#two-stores-one-shape", "docs/openapi.yaml#/info", "docs/openapi.yaml#/paths/~1api~1sync"]
  copy: []
  tests: ["apps/web/src/app/api/sync/route.test.ts", "e2e/tests/sync-paging.spec.ts", "apps/web/src/lib/sync/openapi.test.ts", "apps/web/src/lib/client/sync.test.ts"]
  confluence: ["934543399", "934445098", "934445118", "934477826", "934445138", "934576129", "934477845"]
---

All training data moves through one endpoint, POST /api/sync, which sends local changes and fetches newer ones in one round trip. There is no REST route per table, and changes are ordered by one Postgres sequence, not by clocks. The device and every change it has queued carry the account the sync named, and a push claiming a different one is refused with 409, so one person's training can never go up under another's name.
