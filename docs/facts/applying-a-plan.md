---
id: applying-a-plan
status: current
decided: "D-011"
appears:
  repo: ["docs/architecture.md#plans-and-the-one-place-two-people-share-a-row", "docs/data.md#the-tables-that-are-not-synced", "docs/openapi.yaml#/paths/~1api~1plans~1{id}", "docs/openapi.yaml#/components/schemas/Profile"]
  copy: ["plan.shared", "plan.by.one", "plan.by.other", "plan.days.one", "plan.days.other", "plan.apply", "plan.applyBody", "plan.applyWhy", "plan.applyFailed", "plan.missing", "coach.deleteBody"]
  tests: ["packages/domain/test/plans.test.ts", "apps/web/src/lib/db/plans.test.ts", "e2e/tests/plans.spec.ts"]
  confluence: ["934543418", "934608916", "934543399", "934379522", "934445118", "934445138", "934379679"]
---

Applying a shared plan copies it into the athlete's own account as slots, a new split period and a generated week; after that nothing knows a trainer was involved and it works offline. Exercises travel by name, so a missing one costs that exercise, not the session, and an athlete loses nothing if the trainer leaves or revokes the share.
