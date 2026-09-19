---
id: store-what-happened
status: current
decided: "80b1d9b"
supersedes:
superseded_by:
appears:
  repo: ["docs/README.md#invariants", "docs/data.md#the-demo-account"]
  copy: []
  tests: ["apps/web/src/lib/db/demo-history.test.ts", "apps/web/src/lib/db/seed-demo.test.ts"]
  confluence: []
---

The database stores what happened, never what it means. A set holds weight, reps and reps in reserve; every derived number (estimates, charts, strength numbers, verdicts) is worked out when read.
