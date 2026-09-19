---
id: strength-index
status: current
decided: "D-015; owner, week of 2026-09-14; GYM-46, owner 2026-09-19"
appears:
  repo: ["README.md#two-strength-numbers", "docs/training-model.md#strengthat--gymmys-own-index", "docs/training-model.md#true-of-both", "packages/domain/src/strength.ts"]
  copy: ["prog.strength", "prog.strengthWhat", "prog.strengthBody", "prog.strengthNot", "prog.needWeight", "prog.needLifts", "prog.scoreOverTime", "prog.score"]
  tests: ["packages/domain/test/strength.test.ts", "e2e/tests/first-run.spec.ts"]
  confluence: ["934608916", "934608935", "934543399", "934576168"]
---

The strength index adds the best estimated one-rep max in squat, hinge, lunge, push and pull over the last eight weeks and divides by bodyweight to the power 2/3; a pattern never trained counts as zero, and it is only ever compared with the same person's past. Today it takes each pattern's best from any exercise, machines included. Decided, not built yet (GYM-12): only barbell and dumbbell lifts plus pull-ups, chin-ups and dips counted at bodyweight plus added.

Counting untrained patterns as zero is the coverage thesis in number form.
