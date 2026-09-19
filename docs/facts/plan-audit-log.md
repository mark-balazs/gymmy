---
id: plan-audit-log
status: current
decided: "D-011"
appears:
  repo: ["docs/data.md#the-tables-that-are-not-synced"]
  copy: []
  tests: ["apps/web/src/lib/db/plans.test.ts", "apps/web/src/lib/db/delete-account.test.ts"]
  confluence: ["934543399", "934445118", "934445138"]
---

Everything done to a plan or group, deleting it included, is recorded in an append-only log (plan_events). It keeps the event and a copy of the name after the plan, group or person is deleted.
