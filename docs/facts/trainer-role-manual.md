---
id: trainer-role-manual
status: current
decided: "Confluence 934379679; c81cb8a"
appears:
  repo: ["docs/openapi.yaml#/paths/~1api~1plans", "docs/architecture.md#the-layers-and-what-may-import-what", "apps/web/src/lib/api/plans.ts"]
  copy: []
  tests: ["apps/web/src/app/api/plans/route.test.ts", "e2e/tests/plans.spec.ts"]
  confluence: ["934379679", "934445118"]
---

Today the trainer role is set only by a manual database change (user.role = 'trainer'), with no self-service. Every trainer write re-reads the role, so removing it takes effect at once.
