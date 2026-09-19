---
id: exercise-catalogue
status: current
decided: "D-017; owner, week of 2026-09-14; d567678; b9ff287"
appears:
  repo: ["docs/data.md#the-exercise-library", "docs/data.md#what-is-stored", "docs/data.md#deleting-an-account", "docs/architecture.md#the-layers-and-what-may-import-what", "docs/training-model.md#movements-the-app-records-but-never-prescribes", "docs/training-model.md#how-far-into-the-library-a-week-reaches", "e2e/flows/01-first-run.md#preconditions", "e2e/flows/08-a-full-journey.md#expected", "e2e/flows/10-something-else.md#why-this-flow-exists", "e2e/flows/06-language.md#not-translated-deliberately", "packages/domain/src/catalogue.ts", "packages/domain/src/details.ts"]
  copy: ["ex.start", "ex.finish", "ex.about", "ex.noDetail", "ex.noPhotos", "ex.enlarge"]
  tests: ["packages/domain/test/catalogue.test.ts", "packages/domain/test/seed.test.ts", "packages/domain/test/exercise-names.test.ts", "packages/domain/test/coach.test.ts", "apps/web/src/lib/db/seed-user.test.ts", "apps/web/src/lib/exercise-photos.test.ts", "e2e/tests/exercise-detail.spec.ts", "e2e/tests/one-off.spec.ts"]
  confluence: ["934608916", "934608935", "934543399", "934445118", "934477826", "934445138", "934576168", "934608974"]
---

The exercise library is one catalogue in code, shared by every account; people cannot add their own, and a new entry reaches everybody on the next deploy with no migration. It holds 105 exercises (85 the generator can program, 20 off-plan), each with a short English-only description (names are translated), and 57 have two public-domain photos stored with the app.
