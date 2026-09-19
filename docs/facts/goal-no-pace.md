---
id: goal-no-pace
status: current
decided: "D-012"
appears:
  repo: ["docs/training-model.md#the-guardrails-and-what-the-evidence-does-not-say", "docs/README.md#invariants"]
  copy: ["goal.of", "goal.daysLeft", "goal.whyBody"]
  tests: ["packages/domain/test/goals.test.ts"]
  confluence: ["934608897", "934608935", "934543399"]
---

A goal shows no expected pace and no 'behind by' line, only whether the lift has moved beyond retest noise.

A domain test locks the goal-progress fields so a pace cannot quietly come back.
