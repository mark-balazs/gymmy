---
id: goal-entry-point
status: current
decided: "D-012; Confluence 934608916; owner 2026-09-19 (GYM-64: the filled-in target follows the horizon)"
appears:
  repo: ["apps/web/src/components/goal.tsx", "packages/domain/src/goals.ts", "docs/training-model.md#the-guardrails-and-what-the-evidence-does-not-say"]
  copy: ["goal.set", "goal.target", "goal.weeks", "goal.weeksN.one", "goal.weeksN.other", "goal.nowAt", "goal.save"]
  tests: ["e2e/tests/goals.spec.ts", "packages/domain/test/goals.test.ts", "apps/web/src/lib/db/demo-history.test.ts"]
  confluence: ["934608916", "934543399"]
---

A goal can be set only from one lift's detail sheet ('Push this lift'), and nothing in the app advertises goals. The form offers 8, 12, 16, 24 or 52 weeks and fills in a target that passes every check; until the person types their own number, that target follows the horizon they pick. A trainer can never set a goal on somebody else's lift.
