---
id: worth-knowing
status: current
decided: "D-012"
supersedes: needs-a-look
superseded_by:
appears:
  repo: ["docs/training-model.md#the-triage", "apps/web/src/app/(app)/progress/page.tsx"]
  copy: ["prog.needsLook", "prog.allClear", "prog.kregressed", "prog.kstalled", "prog.kdormant"]
  tests: ["packages/domain/test/insights.test.ts", "e2e/tests/goals.spec.ts"]
  confluence: ["934543418", "934608916", "934608935", "934576168"]
---

Progress opens with 'Worth knowing': at most three lifts, taking one of each verdict in turn (Down, Not moving, Not trained). The card is absent when there is nothing to say and no goal is set; with a live goal and nothing to say it reads 'Nothing to flag.'
