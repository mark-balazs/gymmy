---
id: off-plan-movements
status: current
decided: "D-013"
appears:
  repo: ["docs/training-model.md#movements-the-app-records-but-never-prescribes", "e2e/flows/10-something-else.md#what-the-person-does", "packages/domain/src/catalogue.ts"]
  copy: []
  tests: ["packages/domain/test/coach.test.ts", "packages/domain/test/plans.test.ts", "packages/domain/test/seed.test.ts", "e2e/tests/one-off.spec.ts"]
  confluence: ["934608916", "934608935", "934543399"]
---

20 conditioning movements (Olympic lifts, thrusters, wall balls, box jumps, ring and bar gymnastics, Turkish get-ups, sandbag carries) can be logged and a trainer may name one, but the generator never programs them and they are never offered as swaps. Everything logged counts the same way.
