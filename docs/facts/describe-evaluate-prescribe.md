---
id: describe-evaluate-prescribe
status: current
decided: "D-014; owner, week of 2026-09-14"
appears:
  repo: ["docs/README.md#invariants", "docs/training-model.md#goals-and-the-permission-they-grant", "docs/training-model.md#what-the-train-card-offers-you", "e2e/flows/04-progression.md#flow-04--what-the-card-offers-you", "e2e/flows/04-progression.md#expected--the-advice-is-gone", "e2e/flows/README.md#end-to-end-user-flows", "e2e/flows/02-logging-a-session.md#steps", "legacy/README.md#the-design-rule"]
  copy: ["goal.explain"]
  tests: ["packages/domain/test/insights.test.ts", "e2e/tests/goals.spec.ts", "e2e/tests/progression.spec.ts"]
  confluence: ["934445059", "934608897", "934543418", "934608916", "934608935", "934543399", "934445118", "934379522"]
---

The app always describes, judges only where the person asked it to (a goal), and never prescribes: no suggested weight or reps, no 'add a rep' or 'ready for more weight' card, and no warning that a set looked too easy. Only a human trainer prescribes, through a plan shared in gymmy.

Rep ranges and set counts stay on plans, because they are the shape of the week, not advice to add weight.
