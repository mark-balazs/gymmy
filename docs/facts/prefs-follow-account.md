---
id: prefs-follow-account
status: current
decided: "owner, week of 2026-09-14; 31a6519"
supersedes:
superseded_by:
appears:
  repo: ["docs/data.md#what-is-stored", "docs/data.md#adding-a-field-to-an-existing-table", "docs/data.md#rollout-windows-what-a-device-one-build-behind-sees", "docs/architecture.md#things-that-will-surprise-you", "e2e/flows/06-language.md#expected", "e2e/flows/11-entering-a-set.md#what-these-tests-hold", "docs/openapi.yaml#/components/schemas/Profile", "README.md#stack"]
  copy: ["set.theme", "theme.system", "theme.dark", "theme.light", "set.language", "set.units", "set.entryTitle", "set.plateLoader"]
  tests: ["packages/domain/test/prefs.test.ts", "apps/web/src/lib/sync/rows.test.ts", "e2e/tests/entry-modes.spec.ts", "e2e/tests/language.spec.ts", "e2e/tests/offline.spec.ts"]
  confluence: ["934608916", "934445118", "934445138"]
---

Settings preferences (language, theme, kg or lb, entry mode, Load the bar) belong to the account and follow the person to another phone, read through prefs() with defaults. The one exception is the bar weight chosen on a card; theme defaults to following the device.
