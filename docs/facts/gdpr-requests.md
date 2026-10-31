---
id: gdpr-requests
status: current
decided: "Confluence 934608974; how long an address without an account is kept: GYM-175"
appears:
  repo: ["docs/data.md#deleting-an-account"]
  copy: ["set.deleteTitle"]
  tests: ["apps/web/src/lib/db/delete-account.test.ts", "e2e/tests/delete-account.spec.ts", "apps/web/src/lib/sign-in-throttle.test.ts"]
  confluence: ["934608974", "994574338", "994312349", "934445138"]
---

GDPR requests are answered within one month, and erasure goes through Settings → Delete your account. After a backup restore, erasures made since the restore point must be done again. An email address that never signs in is not kept for good: an unused sign-in code goes once it has expired, and a record of a sign-in attempt once it is a day old, the next time anyone asks for or types in a code (nothing runs on a schedule).
