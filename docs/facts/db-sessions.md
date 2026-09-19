---
id: db-sessions
status: current
decided: "D-005"
supersedes:
superseded_by:
appears:
  repo: ["README.md#stack", "docs/openapi.yaml#/components/securitySchemes/sessionCookie", "docs/openapi.yaml#/paths/~1api~1auth~1signout", "docs/openapi.yaml#/paths/~1api~1plans", "apps/web/src/lib/auth.ts"]
  copy: []
  tests: []
  confluence: ["934543399", "934379522", "934576129", "934576149", "934445138"]
---

Sign-in sessions are database rows, not JWTs, and last 90 days. Deleting the row signs that session out at once.
