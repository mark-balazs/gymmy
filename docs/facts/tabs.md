---
id: tabs
status: current
decided: "4038478; Confluence 934608916; owner, week of 2026-09-14"
appears:
  repo: ["docs/architecture.md#moving-between-tabs", "docs/architecture.md#the-layers-and-what-may-import-what", "e2e/flows/06-language.md#expected", "e2e/flows/12-moving-around.md#what-the-person-does", "apps/web/src/components/tabs.ts"]
  copy: ["tab.home", "tab.train", "tab.week", "tab.progress", "tab.settings", "coach.title", "coach.open"]
  tests: ["e2e/tests/navigation.spec.ts", "e2e/tests/plans.spec.ts", "apps/web/src/components/tabs.test.ts", "apps/web/src/components/swipe.test.ts"]
  confluence: ["934608916", "934445118"]
---

Five tabs in this order: Home, Train, Week, Progress, Settings. A swipe drags the page with the finger and moves on past a third of the screen or with a flick. Switching tabs never adds to Back: Back leaves a screen opened from a tab (Build your own, Coaching), then the app. Trainers reach a Coaching screen from Settings; it is not a sixth tab.
