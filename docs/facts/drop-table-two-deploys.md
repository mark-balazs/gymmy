---
id: drop-table-two-deploys
status: current
decided: "c0723f9; owner, week of 2026-09-14"
appears:
  repo: ["docs/data.md#dropping-a-table-takes-two-deploys", "e2e/flows/10-something-else.md#deliberately-not-covered-here"]
  copy: []
  tests: ["e2e/tests/device-upgrade.spec.ts"]
  confluence: ["934543399", "934477826", "934445138", "934608954", "934543380"]
---

Dropping a table takes two deploys: stop using it, then drop it after counting its rows in production.
