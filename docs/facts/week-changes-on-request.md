---
id: week-changes-on-request
status: current
decided: "8053cfc; Confluence 934608935"
appears:
  repo: ["docs/training-model.md#how-far-into-the-library-a-week-reaches", "docs/data.md#what-is-stored", "e2e/flows/07-choosing-a-split.md#expected-1", "docs/openapi.yaml#/components/schemas/ProgramEntry"]
  copy: ["set.rebuild", "set.rebuildQ", "set.rebuildBody", "set.pending", "split.saveBody"]
  tests: ["e2e/tests/splits.spec.ts", "e2e/tests/calendar.spec.ts", "e2e/tests/settings.spec.ts", "e2e/tests/plans.spec.ts"]
  confluence: ["934543418", "934608916", "934608935", "934445138"]
---

A week is generated only on joining, 'Rebuild my week', changing split or applying a plan, never on its own, and rebuilding never touches a logged set. Rotating in exercises you have not done lately is deliberately not built, because a rebuild could drop a lift someone has a goal on.
