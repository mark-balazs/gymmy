---
id: five-languages
status: current
decided: "ed4067a"
appears:
  repo: ["docs/README.md#invariants", "e2e/flows/06-language.md#flow-06--language", "e2e/flows/06-language.md#expected", "e2e/flows/06-language.md#not-translated-deliberately", "docs/openapi.yaml#/components/schemas/Profile", "legacy/README.md#languages"]
  copy: ["set.language"]
  tests: ["packages/domain/test/exercise-names.test.ts", "e2e/tests/language.spec.ts"]
  confluence: ["934608897", "934608916", "934445118"]
---

The app is in English, Magyar, Deutsch, Français and Español, exercise names included (English kept where lifters say it, like Face Pull). The language follows the account, switches without a reload, and a missing translation fails the build.
