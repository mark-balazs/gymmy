---
id: checked-docs
status: current
decided: "D-010"
appears:
  repo: ["docs/README.md#the-map", "docs/data.md#two-stores-one-shape", "CLAUDE.md#the-api-is-the-one-exception", "CLAUDE.md#diagrams-in-confluence", "docs/openapi.yaml#/info"]
  copy: []
  tests: ["apps/web/src/lib/sync/openapi.test.ts", "apps/web/src/lib/db/er-diagram.test.ts"]
  confluence: ["934543399", "934576129", "934477845", "934576149", "934445138", "934445178"]
---

docs/openapi.yaml is the API contract and a test holds it to the server's row schemas, so Confluence never re-describes endpoints or fields. The database diagrams are generated from the schema, a test fails when they are stale, and nobody draws them by hand.
