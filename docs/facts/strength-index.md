---
id: strength-index
status: current
decided: "D-015; owner, week of 2026-09-14; GYM-46, owner 2026-09-19; D-022, owner 2026-09-19; owner 2026-09-19 (older pull-ups left out)"
appears:
  repo: ["README.md#two-strength-numbers", "docs/training-model.md#strengthat--gymmys-own-index", "docs/training-model.md#true-of-both", "docs/training-model.md#what-fills-a-slot", "packages/domain/src/strength.ts", "packages/domain/src/load.ts"]
  copy: ["prog.strength", "prog.strengthWhat", "prog.strengthBody", "prog.strengthNot", "prog.needWeight", "prog.needLifts", "prog.scoreOverTime", "prog.score"]
  tests: ["packages/domain/test/strength.test.ts", "packages/domain/test/coach.test.ts", "e2e/tests/first-run.spec.ts", "e2e/tests/progress.spec.ts"]
  confluence: ["934608916", "934608935", "934543399", "934576168"]
---

The strength index adds the best estimated one-rep max in squat, hinge, lunge, push and pull over the last eight weeks and divides by bodyweight to the power 2/3; a pattern never trained counts as zero, and it is only ever compared with the same person's past. Only barbell, dumbbell and kettlebell lifts count, plus pull-ups, chin-ups and dips at that week's bodyweight plus what was added (those logged before 2026-09-17 are left out); machines, partial loads and other bodyweight moves never do.

Counting untrained patterns as zero is the coverage thesis in number form. The consequence: a movement trained only on machines counts as zero, so a generated week gives each scored movement's first slot a lift that counts.
