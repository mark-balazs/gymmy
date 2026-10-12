---
id: working-mode
status: current
decided: "D-023; D-024; D-025; owner 2026-10-11; local copy for checks until GYM-38: owner 2026-10-11; such checks count for the docs move: owner 2026-10-12 (D-028, GYM-146)"
appears:
  repo: ["CLAUDE.md#how-to-work-here", "CLAUDE.md#2-confluence--for-everyone-else", ".claude/skills/gymmy-product-discovery/SKILL.md#where-gymmy-differs-from-the-playbook", ".claude/skills/gymmy-nontech-refinement/SKILL.md#where-gymmy-differs-from-the-playbook", ".claude/skills/gymmy-tech-refinement/SKILL.md#where-gymmy-differs-from-the-playbook", ".claude/skills/gymmy-release-documentation/SKILL.md#where-gymmy-differs-from-the-playbook"]
  copy: []
  tests: []
  confluence: ["980549636", "934543399", "980975618", "980713505", "994541593", "994410530", "994312199", "980713485", "994410547", "994574373", "994672658"]
---

gymmy follows dextra's Requirement Lifecycle and playbooks but stays off dextra's records: it is in no DI registry and nothing about it is written on DI pages, so skills in the repository load each playbook with gymmy's extension. Topics are ideas in the Jira Product Discovery space gymmy-roadmap (GR), each GYM epic implements one, and GYM uses 123datei's delivery statuses. Once the product docs are moved (GYM-97), one pass ranks every open idea (GYM-107); discovery and non-tech refinement then start, and tech refinement waits for the architecture docs (GYM-106).

Product discovery reads GR's statuses as 123datei reads its roadmap's (new is Backlog, drafting Ideation, with the client Planning / Refinement, accepted Ready for implementation, delivered Done, dropped archived), and the client is Mark, who holds every PO, PM, RE and TL role. A learning about a process stays in gymmy's own queue, for Mark to carry over by hand. Behaviour checks run on production with the demo account, which Mark signs in to; until production has one (GYM-38), they run on a local copy of production's version, and count as checked, the docs move's included (D-028). Each idea has a type (Feature, Business or Maintenance); a second space for technical health was rejected. What is not set up yet sits under the epic GYM-96.
