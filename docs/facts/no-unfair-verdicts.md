---
id: no-unfair-verdicts
status: current
decided: "f31e53a; Confluence 934608935"
appears:
  repo: ["docs/README.md#invariants", "packages/domain/src/insights.ts"]
  copy: ["prog.unrated"]
  tests: ["packages/domain/test/insights.test.ts", "packages/domain/test/model.test.ts"]
  confluence: ["934608897", "934608935"]
---

The app says only what it can stand behind. If one end of a comparison has effort recorded and the other does not (an unrated set reads about 5% lower), it gives no verdict rather than a softened one.
