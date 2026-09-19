---
id: age-allowance
status: current
decided: "D-015; owner, week of 2026-09-14"
supersedes:
superseded_by:
appears:
  repo: ["README.md#two-strength-numbers", "docs/training-model.md#dotsat--a-real-dots", "docs/training-model.md#strengthat--gymmys-own-index", "docs/openapi.yaml#/components/schemas/Profile"]
  copy: ["set.birthYearWhy"]
  tests: ["packages/domain/test/strength.test.ts", "e2e/tests/profile.spec.ts"]
  confluence: ["934543418", "934608916", "934608935", "934543399"]
---

The strength index gets an age allowance from 40 (about ×1.13 at 50, ×1.34 at 60, ×1.65 at 70, straight lines between), using the person's age that week from their birth year. There is none below 40, and DOTS never has one.
