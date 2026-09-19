---
id: goal-entry-point
status: current
decided: "D-012; Confluence 934608916"
appears:
  repo: ["apps/web/src/components/goal.tsx"]
  copy: ["goal.set", "goal.target", "goal.weeks", "goal.weeksN", "goal.nowAt", "goal.save"]
  tests: ["e2e/tests/goals.spec.ts", "packages/domain/test/goals.test.ts"]
  confluence: ["934608916", "934543399"]
---

A goal can be set only from one lift's detail sheet ('Push this lift'), and nothing in the app advertises goals. The form offers 8, 12, 16, 24 or 52 weeks and prefills a target that passes every check; a trainer can never set a goal on somebody else's lift.
