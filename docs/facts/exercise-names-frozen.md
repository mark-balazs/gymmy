---
id: exercise-names-frozen
status: current
decided: "D-017"
supersedes:
superseded_by:
appears:
  repo: ["docs/data.md#rollout-windows-what-a-device-one-build-behind-sees", "packages/domain/src/catalogue.ts"]
  copy: []
  tests: ["packages/domain/test/exercise-names.test.ts", "packages/domain/test/load.test.ts", "packages/domain/test/seed.test.ts", "apps/web/src/lib/exercise-photos.test.ts"]
  confluence: ["934543399", "934445138"]
---

Catalogue exercise names are frozen in English for now, because descriptions, photos, load classes and translations are keyed by them. Renaming one fails the tests.
