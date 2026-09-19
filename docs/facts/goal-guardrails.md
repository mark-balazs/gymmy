---
id: goal-guardrails
status: current
decided: "D-012; 3f0416d; owner 2026-09-19 (GYM-64)"
appears:
  repo: ["docs/training-model.md#the-guardrails-and-what-the-evidence-does-not-say", "docs/openapi.yaml#/components/schemas/Goal", "packages/domain/src/goals.ts"]
  copy: ["goal.tooSmall", "goal.tooShort.one", "goal.tooShort.other", "goal.tooLong", "goal.tooMany", "goal.ambitious", "goal.noHistory", "goal.why", "goal.whyBody"]
  tests: ["packages/domain/test/goals.test.ts", "e2e/tests/goals.spec.ts", "apps/web/src/lib/db/demo-history.test.ts"]
  confluence: ["934608897", "934608916", "934608935", "934543399"]
---

A goal must be at least 5% above where the lift is now (retests vary about 4%), rest on at least three sessions in the last eight weeks, and run 8 to 52 weeks, with at most three running at once. A goal needing more than 1.5 times the lift's own pace over the last six months (or a published rate, without that history) gets a warning, never a refusal, and never for a target no higher than the one the form fills in.
