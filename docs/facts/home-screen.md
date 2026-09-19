---
id: home-screen
status: current
decided: "f8b210c"
supersedes:
superseded_by:
appears:
  repo: []
  copy: ["title.home", "home.today", "home.resume", "home.start", "home.continue", "home.thisWeek", "home.seeWeek", "home.covered", "cal.title", "cal.sets", "cal.prevMonth", "cal.nextMonth", "cal.nothing", "cal.dayTrained", "cal.dayEmpty"]
  tests: ["e2e/tests/calendar.spec.ts", "packages/domain/test/days.test.ts"]
  confluence: ["934608916"]
---

Home shows today's session, the week's coverage so far and a Monday-first calendar. Tapping a trained day shows its sets, the strength index as it stood that week and bodyweight.
