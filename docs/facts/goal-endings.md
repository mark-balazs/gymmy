---
id: goal-endings
status: current
decided: "D-012; GYM-47"
appears:
  repo: ["docs/training-model.md#how-a-goal-ends", "docs/training-model.md#goals-and-the-permission-they-grant", "docs/training-model.md#the-guardrails-and-what-the-evidence-does-not-say", "docs/README.md#invariants", "docs/openapi.yaml#/components/schemas/Goal"]
  copy: ["goal.of", "goal.daysLeft.one", "goal.daysLeft.other", "goal.nowAt", "goal.whyBody", "goal.ended", "goal.achieved", "goal.partly", "goal.flat", "goal.again", "goal.stop"]
  tests: ["packages/domain/test/goals.test.ts", "e2e/tests/goals.spec.ts"]
  confluence: ["934608897", "934608916", "934608935", "934543399", "934445138"]
---

A goal ends as reached, part of the way (showing what was added) or flat, never as 'failed'; part of the way needs the lift to have moved more than day-to-day noise (about 4%). While it runs it shows no expected pace and no 'behind by' line, only whether the lift has moved that far. An ended goal stays on Progress for three weeks with 'Set another', and 'Stop pushing this' ends one at once, keeping it as retired rather than deleted.

A domain test locks the goal-progress fields so a pace cannot quietly come back.
