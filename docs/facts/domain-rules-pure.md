---
id: domain-rules-pure
status: current
decided: "D-003"
appears:
  repo: ["README.md#layout", "docs/README.md#the-shape-in-one-paragraph", "docs/architecture.md#the-layers-and-what-may-import-what", "docs/testing.md#three-layers-and-which-one-a-change-belongs-in"]
  copy: []
  tests: []
  confluence: ["934543399", "934445098", "934445118", "934379562"]
---

All training rules live in packages/domain as pure functions with no runtime dependencies, so the same rules run on the phone, on the server and in scripts. The build enforces this.
