---
id: load-classes
status: current
decided: "D-016; owner, week of 2026-09-14; D-022, owner 2026-09-19"
appears:
  repo: ["docs/training-model.md#what-the-weight-box-is-counting", "docs/training-model.md#mass-false-is-the-honest-half", "docs/training-model.md#strengthat--gymmys-own-index", "README.md#two-strength-numbers", "e2e/flows/09-load-convention.md#the-convention", "docs/architecture.md#the-layers-and-what-may-import-what", "packages/domain/src/load.ts", "packages/domain/src/strength.ts"]
  copy: ["load.barbell", "load.dumbbellPair", "load.dumbbellOne", "load.machine", "load.bodyweight", "load.partial", "prog.strengthNot"]
  tests: ["packages/domain/test/load.test.ts", "packages/domain/test/strength.test.ts", "e2e/tests/load-convention.spec.ts"]
  confluence: ["934608916", "934608935", "934543399", "934445118"]
---

Every exercise declares a load class: barbell, dumbbell pair, single dumbbell or kettlebell, machine (Smith machine included), bodyweight or partial load (landmine, sled). Machine, added-bodyweight and partial loads are not real masses: they are charted against themselves and reach neither strength number, except pull-ups, chin-ups and dips in the strength index, because they move near enough the whole body.
