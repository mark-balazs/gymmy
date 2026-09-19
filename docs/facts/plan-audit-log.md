---
id: plan-audit-log
status: current
decided: "D-011; GYM-68"
appears:
  repo: ["docs/data.md#the-tables-that-are-not-synced"]
  copy: []
  tests: ["apps/web/src/lib/db/plans.test.ts", "apps/web/src/lib/db/delete-account.test.ts"]
  confluence: ["934543399", "934445118", "934445138"]
---

Everything done to a plan or group, deleting it included, is recorded in an append-only log (plan_events). An event outlives the plan, group or person it is about, and keeps the plan's or group's name.
