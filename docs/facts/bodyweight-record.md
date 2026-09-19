---
id: bodyweight-record
status: current
decided: "80b1d9b; D-015"
supersedes:
superseded_by:
appears:
  repo: ["README.md#two-strength-numbers", "docs/training-model.md#true-of-both", "docs/data.md#what-is-stored", "docs/openapi.yaml#/components/schemas/BodyLog"]
  copy: ["prog.bodyWeight", "prog.weightToday", "prog.needWeight", "onboard.q4.sub"]
  tests: ["packages/domain/test/strength.test.ts", "e2e/tests/first-run.spec.ts", "e2e/tests/bad-input.spec.ts"]
  confluence: ["934543418", "934608916", "934608935", "934543399", "934445138"]
---

Bodyweight is a dated record, one reading per day (a second one that day replaces the first). Each week's strength numbers use the latest weight up to the end of that week, and neither number exists without one.
