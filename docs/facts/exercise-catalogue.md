---
id: exercise-catalogue
status: current
decided: "D-017; owner, week of 2026-09-14"
supersedes: library-per-account
superseded_by:
appears:
  repo: ["docs/data.md#the-exercise-library", "docs/data.md#what-is-stored", "docs/data.md#deleting-an-account", "docs/architecture.md#the-layers-and-what-may-import-what", "docs/training-model.md#movements-the-app-records-but-never-prescribes", "e2e/flows/01-first-run.md#preconditions", "e2e/flows/08-a-full-journey.md#expected", "packages/domain/src/catalogue.ts"]
  copy: []
  tests: ["packages/domain/test/catalogue.test.ts", "apps/web/src/lib/db/seed-user.test.ts"]
  confluence: ["934608916", "934543399", "934445118", "934477826", "934445138", "934576168", "934608974"]
---

The exercise library is one catalogue in code, shared by every account. An exercise added to it reaches everybody on the next deploy, with no migration.
