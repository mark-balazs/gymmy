---
id: tabs
status: current
decided: "4038478; Confluence 934608916"
appears:
  repo: ["docs/architecture.md#moving-between-tabs", "docs/architecture.md#the-layers-and-what-may-import-what", "e2e/flows/06-language.md#expected", "apps/web/src/components/app-shell.tsx"]
  copy: ["tab.home", "tab.train", "tab.week", "tab.progress", "tab.settings", "coach.title", "coach.open"]
  tests: ["e2e/tests/navigation.spec.ts", "e2e/tests/plans.spec.ts"]
  confluence: ["934608916", "934445118"]
---

Five tabs in this order, swipeable: Home, Train, Week, Progress, Settings. Trainers reach a Coaching screen from Settings; it is not a sixth tab.
