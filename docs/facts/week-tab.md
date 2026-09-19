---
id: week-tab
status: current
decided: "Confluence 934608916; f542589; GYM-77"
appears:
  repo: ["e2e/flows/03-weekly-coverage.md#expected", "e2e/flows/03-weekly-coverage.md#which-weeks-you-can-page-through", "e2e/flows/07-choosing-a-split.md#expected-1", "docs/training-model.md#how-far-into-the-library-a-week-reaches", "packages/domain/src/coach.ts", "packages/domain/src/model.ts"]
  copy: ["title.week", "common.thisWeek", "common.week", "week.noneYet", "week.complete.one", "week.complete.other", "week.oneGap", "week.gaps.one", "week.gaps.other", "week.explain", "week.explainSplit", "week.coverage", "week.yourWeek", "week.trainThis", "week.swap", "week.swapTitle", "week.swapBody", "picker.search", "picker.none", "plural.session.one", "plural.session.other"]
  tests: ["e2e/tests/coverage.spec.ts", "e2e/tests/splits.spec.ts", "packages/domain/test/coach.test.ts", "packages/domain/test/model.test.ts", "e2e/tests/exercise-detail.spec.ts"]
  confluence: ["934543418", "934608916", "934608935"]
---

The Week tab opens on this week and pages back to the week the account began, or to the first logged set if that is earlier; a new account can also page ahead through its first eight weeks. It shows the week's coverage in words, a tile per movement the split in force asks for and the session count, then the plan day by day. A swap (the same searchable picker as 'Log something else') keeps the movement in most slots, but a full-body day's big-lift slots and every finisher offer any lower, upper or core movement, so a swap there can change coverage.
