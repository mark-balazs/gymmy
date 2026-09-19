---
id: verdict-thresholds
status: current
decided: "Confluence 934608935; f31e53a"
appears:
  repo: ["docs/training-model.md#the-triage", "docs/training-model.md#goals-and-the-permission-they-grant", "docs/README.md#invariants", "packages/domain/src/insights.ts"]
  copy: ["prog.vRegressed", "prog.vStalled", "prog.vDormant", "prog.kregressed", "prog.kstalled", "prog.kdormant"]
  tests: ["packages/domain/test/insights.test.ts", "e2e/tests/goals.spec.ts", "apps/web/src/lib/db/demo-history.test.ts"]
  confluence: ["934608935", "934543399"]
---

Down: the best of the last three sessions is 5% or more below the lift's best, and that best is not recent. Not moving: no new best in 8 weeks across at least 6 sessions. Not trained: still in the week but untrained for 3 weeks, checked before Not moving; a month at one weight is not a stall.
