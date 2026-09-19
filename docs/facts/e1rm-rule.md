---
id: e1rm-rule
status: current
decided: "D-019; owner, week of 2026-09-14"
appears:
  repo: ["docs/training-model.md#it-refuses-to-estimate-above-10-reps-to-failure", "README.md#two-strength-numbers", "packages/domain/src/model.ts"]
  copy: ["prog.strengthNot", "prog.dotsBody"]
  tests: ["packages/domain/test/model.test.ts", "packages/domain/test/strength.test.ts", "e2e/tests/progress.spec.ts"]
  confluence: ["934608916", "934608935", "934543399"]
---

The estimated one-rep max (Epley, adjusted for reps in reserve) is worked out only when reps plus reps in reserve are ten or fewer; past that it is blank, not zero. The cost was accepted: at the default answer only sets of 8 reps or fewer give an estimate (demo account: 77% of sets down to 39%).

Ten is where the published formulas stop holding.
