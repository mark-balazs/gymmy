---
id: account-deletion
status: current
decided: "D-008"
appears:
  repo: ["docs/data.md#deleting-an-account", "docs/data.md#what-is-stored", "docs/openapi.yaml#/components/securitySchemes/sessionCookie", "README.md#known-gaps"]
  copy: ["set.deleteTitle", "set.deleteGo", "set.deleteQ", "set.deleteWhat", "set.deleteSets.one", "set.deleteSets.other", "set.deleteWeeks.one", "set.deleteWeeks.other", "set.deleteForever", "set.deleteConfirm", "set.deleteFailed", "set.leaveOffline"]
  tests: ["apps/web/src/lib/db/delete-account.test.ts", "e2e/tests/delete-account.spec.ts"]
  confluence: ["934543418", "934608916", "934543399", "934445138", "934576149", "934608974"]
---

'Delete your account' in Settings says how many sets and weeks will go, and how many changes never reached the server, then really deletes: nothing is pushed first, sign-in codes and attempts for the address go first, and one delete cascades from the user. The device is wiped only once the server confirms, and the whole thing is refused offline, so a deletion that fails leaves the phone's training where it was. It cannot be undone; soft deletes exist only so a delete reaches offline devices.
