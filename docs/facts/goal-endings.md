---
id: goal-endings
status: current
decided: "D-012"
appears:
  repo: ["docs/training-model.md#how-a-goal-ends", "docs/training-model.md#goals-and-the-permission-they-grant", "docs/openapi.yaml#/components/schemas/Goal"]
  copy: ["goal.ended", "goal.achieved", "goal.partly", "goal.flat", "goal.again", "goal.stop"]
  tests: ["packages/domain/test/goals.test.ts", "e2e/tests/goals.spec.ts"]
  confluence: ["934608916", "934608935", "934445138"]
---

A goal ends as reached, part of the way (showing what was added) or flat, never as 'failed'. Decided, not built yet (GYM-47): 'part of the way' only when the lift moved beyond day-to-day noise (about 4%); less than that ends as flat. An ended goal stays on Progress for three weeks with 'Set another', and 'Stop pushing this' ends one at once, keeping it as retired rather than deleted.
