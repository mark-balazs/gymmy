---
id: goals-grant-permission
status: current
decided: "D-012"
supersedes:
superseded_by:
appears:
  repo: ["docs/README.md#invariants", "docs/training-model.md#goals-and-the-permission-they-grant", "docs/data.md#what-is-stored", "docs/openapi.yaml#/components/schemas/Goal"]
  copy: ["goal.explain", "goal.set", "prog.kregressed", "prog.kstalled", "prog.kdormant"]
  tests: ["packages/domain/test/goals.test.ts", "packages/domain/test/insights.test.ts", "e2e/tests/goals.spec.ts"]
  confluence: ["934445059", "934608897", "934543418", "934608916", "934608935", "934543399", "934445138", "934576168", "934379522"]
---

The app judges a lift's progress only where the person set a goal on it: one lift, a target estimated one-rep max and an end date, which expires and never renews. Without a goal the 'Down' and 'Not moving' verdicts are withheld; 'Not trained' needs no goal.
