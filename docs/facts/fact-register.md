---
id: fact-register
status: current
decided: "D-020; D-021"
appears:
  repo: ["docs/facts/README.md", "docs/README.md#why-this-is-markdown-and-not-a-graph", "docs/README.md#the-other-half-of-the-documentation", "CLAUDE.md#what-is-true-the-fact-register", "CLAUDE.md#1-docs--for-whoever-next-edits-the-code", "CLAUDE.md#2-confluence--for-everyone-else"]
  copy: []
  tests: ["apps/web/src/lib/facts.test.ts"]
  confluence: ["934543399", "934445059"]
---

What is true about gymmy is written once, in docs/facts/: one file per fact saying where else it is stated, kept by the rules at the top of the index that every AI session loads. Other docs live in the repo (for whoever edits the code) and on Confluence (for everyone else), where the Decision log is only appended to and old entries are marked superseded. When any of these, the code or the register disagree, nobody picks a winner: the owner is asked.

Those rules: curated, never add-only; a decision is written down in the same change it is made and quoted back to the owner; a test fails when a fact points at something missing; and a weekly check (docs/fact-check.md) opens one GYM issue per mismatch, editing nothing.
