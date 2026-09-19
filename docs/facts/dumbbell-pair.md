---
id: dumbbell-pair
status: current
decided: "D-016; owner, week of 2026-09-14"
supersedes:
superseded_by:
appears:
  repo: ["docs/training-model.md#what-the-weight-box-is-counting", "docs/training-model.md#history-before-the-convention", "e2e/flows/09-load-convention.md#the-convention", "e2e/flows/09-load-convention.md#what-the-person-does", "e2e/flows/09-load-convention.md#deliberately-not-covered-here"]
  copy: ["load.dumbbellPair", "prog.conventionChanged"]
  tests: ["packages/domain/test/load.test.ts", "e2e/tests/load-convention.spec.ts", "apps/web/src/lib/db/demo-history.test.ts"]
  confluence: ["934543418", "934608916", "934608935", "934543399", "934445118"]
---

For a dumbbell pair you enter one dumbbell and the pair is stored (enter 20, 40 kg is recorded); only Train's weight box converts, and every other screen shows the stored figure. This started on 2026-09-17, older logs are never rewritten, and a chart notes the date only where the lift really jumps (1.5× or more).
