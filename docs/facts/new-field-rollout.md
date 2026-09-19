---
id: new-field-rollout
status: current
decided: "7ddf6b1; Confluence 934445138"
supersedes:
superseded_by:
appears:
  repo: ["docs/data.md#adding-a-field-to-an-existing-table", "docs/data.md#rollout-windows-what-a-device-one-build-behind-sees", "docs/architecture.md#plans-and-the-one-place-two-people-share-a-row", "docs/architecture.md#things-that-will-surprise-you"]
  copy: []
  tests: ["packages/domain/test/model.test.ts", "packages/domain/test/prefs.test.ts", "packages/domain/test/plans.test.ts", "apps/web/src/lib/sync/rows.test.ts", "e2e/tests/device-upgrade.spec.ts"]
  confluence: ["934543399", "934445118", "934477826", "934445138", "934608954", "934445158"]
---

A new column or synced table does not reach devices already synced or one build behind. New fields need a default where rows are read (prefs() for settings), and code that reads a field ships one release before code that writes it.
