---
id: exercise-ids-permanent
status: current
decided: "D-017; owner, week of 2026-09-14"
supersedes:
superseded_by:
appears:
  repo: ["docs/data.md#the-exercise-library", "docs/data.md#what-is-stored", "docs/architecture.md#plans-and-the-one-place-two-people-share-a-row", "packages/domain/src/catalogue-ids.ts"]
  copy: []
  tests: ["packages/domain/test/catalogue.test.ts", "packages/domain/test/days.test.ts"]
  confluence: ["934543399", "934445118", "934477826", "934445138"]
---

Catalogue ids are written out (ex-barbell-back-squat), never computed, and every id ever published keeps working. No stored id is ever rewritten: older accounts' own exercise rows are read as aliases of catalogue entries, matched by name, and an exercise is retired rather than deleted, keeping its name and chart in history.
