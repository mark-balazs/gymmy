---
id: library-per-account
status: superseded
decided: "before D-017"
supersedes:
superseded_by: exercise-catalogue
appears:
  repo: ["docs/data.md#the-exercise-library", "docs/data.md#the-tables-that-are-not-synced", "docs/training-model.md#how-far-into-the-library-a-week-reaches"]
  copy: []
  tests: ["packages/domain/test/catalogue.test.ts", "apps/web/src/lib/db/seed-user.test.ts"]
  confluence: ["934543399", "934445138"]
---

The library used to be copied into each account at sign-up (about 70 rows with ids derived from the user id), so an exercise added later reached nobody who already had an account.
