---
id: load-classes
status: current
decided: "D-016; owner, week of 2026-09-14"
appears:
  repo: ["docs/training-model.md#what-the-weight-box-is-counting", "docs/training-model.md#mass-false-is-the-honest-half", "e2e/flows/09-load-convention.md#the-convention", "docs/architecture.md#the-layers-and-what-may-import-what", "packages/domain/src/load.ts", "packages/domain/src/strength.ts"]
  copy: ["load.barbell", "load.dumbbellPair", "load.dumbbellOne", "load.machine", "load.bodyweight", "load.partial"]
  tests: ["packages/domain/test/load.test.ts", "packages/domain/test/strength.test.ts", "e2e/tests/load-convention.spec.ts"]
  confluence: ["934608916", "934608935", "934543399", "934445118"]
---

Every exercise declares a load class: barbell, dumbbell pair, single dumbbell, machine (Smith machine included), bodyweight or partial load (landmine, sled). Machine, added-bodyweight and partial loads are not real masses: they are charted against themselves and never reach DOTS, though the strength index still takes a pattern's best from them. Decided, not built yet (GYM-12): the index stops taking them, except pull-ups, chin-ups and dips, counted at bodyweight plus what was added.
