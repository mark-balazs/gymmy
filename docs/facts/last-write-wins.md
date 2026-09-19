---
id: last-write-wins
status: current
decided: "D-002"
appears:
  repo: ["README.md#offline-first", "docs/data.md#sync-protocol", "docs/data.md#two-stores-one-shape", "docs/architecture.md#how-a-set-gets-saved", "docs/openapi.yaml#/info", "docs/openapi.yaml#/components/schemas/Synced"]
  copy: []
  tests: ["apps/web/src/app/api/sync/route.test.ts", "e2e/tests/logging.spec.ts", "e2e/tests/offline.spec.ts", "packages/domain/test/model.test.ts"]
  confluence: ["934543399", "934379522", "934445098", "934477826", "934445138", "934477845"]
---

When two devices change the same record, the most recent write wins, judged per record by updatedAt; there is no CRDT. Deletes are soft so they can reach a device that is offline.
