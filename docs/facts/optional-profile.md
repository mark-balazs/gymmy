---
id: optional-profile
status: current
decided: "6f8cd02; Confluence 934608916"
supersedes:
superseded_by:
appears:
  repo: ["docs/training-model.md#true-of-both", "docs/openapi.yaml#/components/schemas/Profile"]
  copy: ["set.you", "set.aboutYou", "set.name", "set.namePlaceholder", "set.birthYear", "set.birthYearPlaceholder", "set.birthYearWhy", "set.yearBad", "set.picAdd", "set.picChange", "set.picRemove", "set.picHint", "set.picRemoved", "set.picUndo", "set.picBad", "set.picTooBig", "set.sex", "set.sexWhy", "sex.unspecified", "sex.female", "sex.male", "set.height"]
  tests: ["e2e/tests/profile.spec.ts", "apps/web/src/lib/db/seed-user.test.ts", "e2e/tests/bad-input.spec.ts"]
  confluence: ["934543418", "934608916", "934445078", "934379542", "934608974"]
---

Every profile field (picture, name, year of birth, sex, height) is optional and never invented; an empty name stays empty. Sex is used only for DOTS, year of birth only for the age allowance, and height by nothing yet; the picture is cropped square and stored in the profile row.
