---
id: plan-sharing-today
status: current
decided: "9e2ea1f; D-011"
appears:
  repo: ["docs/data.md#the-tables-that-are-not-synced", "docs/architecture.md#plans-and-the-one-place-two-people-share-a-row", "docs/openapi.yaml#/paths/~1api~1plans~1{id}~1shares", "docs/openapi.yaml#/paths/~1api~1plans~1{id}"]
  copy: ["coach.openBody", "coach.sharedWith", "coach.nobody", "coach.shareEmail", "coach.shareGroup", "coach.emailHint", "coach.groups", "coach.newGroup", "coach.noGroups", "coach.members.one", "coach.members.other", "coach.addMember", "coach.remove"]
  tests: ["apps/web/src/lib/db/plans.test.ts", "e2e/tests/plans.spec.ts"]
  confluence: ["934608897", "934543418", "934608916", "934445138", "934379679"]
---

Today a trainer shares a published plan with one person by email or with a group; shares are revoked, never deleted. Sharing with an address that has no account succeeds silently, and a plan you cannot see answers exactly like one that does not exist.
