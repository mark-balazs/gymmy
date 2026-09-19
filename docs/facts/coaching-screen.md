---
id: coaching-screen
status: current
decided: "c81cb8a; Confluence 934608916"
appears:
  repo: ["docs/data.md#the-tables-that-are-not-synced", "docs/openapi.yaml#/paths/~1api~1plans", "docs/openapi.yaml#/paths/~1api~1plans~1{id}~1publish"]
  copy: ["coach.title", "coach.open", "coach.openBody", "coach.plans", "coach.newPlan", "coach.noPlans", "coach.draft", "coach.published", "coach.publish", "coach.publishBody", "coach.name", "coach.description", "coach.shape", "coach.exercises", "coach.anyExercise", "coach.saved", "coach.deletePlan"]
  tests: ["apps/web/src/lib/db/plans.test.ts", "packages/domain/test/plans.test.ts"]
  confluence: ["934543418", "934608916"]
---

On the Coaching screen a trainer builds a plan from a shape and a day count, and for each slot names a catalogue exercise or leaves it to the app. A draft is private; once published, each edit makes a new version.
