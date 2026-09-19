---
id: fact-register
status: current
decided: "D-020"
supersedes:
superseded_by:
appears:
  repo: ["docs/facts/README.md", "docs/README.md#why-this-is-markdown-and-not-a-graph", "CLAUDE.md#what-is-true-the-fact-register"]
  copy: []
  tests: ["apps/web/src/lib/facts.test.ts"]
  confluence: ["934543399"]
---

What is true about gymmy is written once, in docs/facts/, one file per fact saying where else it is stated; its index is loaded into every AI session. A decision the owner makes in conversation is written as a fact in the same change and quoted back to them. A test fails when a fact points at something missing, and a weekly check opens one GYM issue per mismatch with Confluence or the code, editing nothing.
