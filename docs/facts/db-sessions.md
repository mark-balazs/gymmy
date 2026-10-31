---
id: db-sessions
status: current
decided: "D-005; until 90 days without syncing, every sync renewing it: the owner's answer on 2026-10-31, 'From the last use' (GYM-155, built in GYM-143)"
appears:
  repo: ["README.md#stack", "docs/openapi.yaml#/components/securitySchemes/sessionCookie", "docs/openapi.yaml#/paths/~1api~1sync", "docs/openapi.yaml#/paths/~1api~1auth~1signout", "docs/openapi.yaml#/paths/~1api~1plans", "apps/web/src/lib/auth.ts", "apps/web/src/app/api/sync/route.ts"]
  copy: []
  tests: ["e2e/tests/staying-signed-in.spec.ts"]
  confluence: ["934543399", "934379522", "934576129", "934576149", "934445138", "994672734"]
---

Sign-in sessions are database rows, not JWTs. A phone stays signed in until it goes 90 days without syncing: every sync renews it. Deleting the row signs that session out at once. The cost is accepted: a lost phone that someone keeps using stays signed in, and only deleting the account signs it out from another phone.
