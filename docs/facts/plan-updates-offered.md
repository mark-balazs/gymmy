---
id: plan-updates-offered
status: current
decided: "D-011"
appears:
  repo: ["docs/architecture.md#plans-and-the-one-place-two-people-share-a-row", "docs/openapi.yaml#/components/schemas/Profile"]
  copy: ["plan.newVersion", "plan.reapply", "coach.publishWhy"]
  tests: ["e2e/tests/plans.spec.ts", "packages/domain/test/plans.test.ts", "apps/web/src/lib/db/plans.test.ts"]
  confluence: ["934543418", "934608916", "934543399", "934379522", "934445138"]
---

When a trainer publishes a newer version of a shared plan, the athlete is offered it, labelled 'Updated', and it is never applied for them. A trainer's edit never rewrites a week somebody is in.
