---
id: describe-evaluate-prescribe
status: current
decided: "D-014; owner, week of 2026-09-14"
supersedes:
superseded_by:
appears:
  repo: ["docs/README.md#invariants", "docs/training-model.md#goals-and-the-permission-they-grant", "docs/training-model.md#what-the-train-card-offers-you"]
  copy: ["goal.explain"]
  tests: ["packages/domain/test/insights.test.ts", "e2e/tests/goals.spec.ts", "e2e/tests/progression.spec.ts"]
  confluence: ["934608897", "934608916", "934608935", "934543399"]
---

The app always describes, judges only where the person asked it to (a goal), and never prescribes. Only a human trainer prescribes, through a plan shared in gymmy.
