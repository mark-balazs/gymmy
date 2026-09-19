---
id: plans-server-only
status: current
decided: "D-011"
supersedes:
superseded_by:
appears:
  repo: ["docs/architecture.md#plans-and-the-one-place-two-people-share-a-row", "docs/data.md#the-tables-that-are-not-synced", "docs/openapi.yaml#/tags"]
  copy: ["coach.offline"]
  tests: ["apps/web/src/lib/db/plans.test.ts", "apps/web/src/app/api/plans/route.test.ts"]
  confluence: ["934608916", "934543399", "934445118", "934445138", "934576129", "934445098", "934477845"]
---

Trainer plans, groups and shares live only on the server, outside the sync set, and are read over a small API that checks access on every request. They are the only training feature that needs a connection.
