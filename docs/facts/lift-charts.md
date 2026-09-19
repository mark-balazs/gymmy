---
id: lift-charts
status: current
decided: "D-019; D-013"
appears:
  repo: ["docs/training-model.md#it-refuses-to-estimate-above-10-reps-to-failure", "docs/testing.md#fragilities-worth-knowing"]
  copy: ["prog.overTime", "prog.overTimeWeight", "prog.lastTrained", "prog.bestSetLabel", "prog.bestSetValue", "prog.oneSession", "prog.chartKey"]
  tests: ["packages/domain/test/insights.test.ts", "e2e/tests/progress.spec.ts"]
  confluence: ["934608916", "934608935", "934543399"]
---

A loaded lift charts its best estimated one-rep max per session; a lift trained only for high reps, and every isolation lift, charts its heaviest set instead, and the label says which. 'Last trained' is the day the lift was logged, not the last day it added a point to a chart.
