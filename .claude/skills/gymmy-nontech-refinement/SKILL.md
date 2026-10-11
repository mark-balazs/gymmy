---
name: gymmy-nontech-refinement
description: Non-tech refinement on gymmy (Requirement Lifecycle step 4) — turns an accepted gymmy proposal into an epic split into stories with numbered acceptance criteria, by dextra's Non-tech refinement playbook with gymmy's extension. Use for a GYM epic or story to refine or clarify, or an accepted GR idea entering refinement. gymmy is private and in no DI registry, so the dextra-nontech-refinement skill stops on it; this skill is the way in.
---

# Non-tech refinement — gymmy

gymmy is Mark's private project. It follows dextra's Requirement Lifecycle with
dextra's own playbooks, but it is in none of their registries and nothing about
it is written on dextra's shared (DI) pages (Decision log D-025). This skill
stands in for the registry.

## Load, fresh every session

Through the Atlassian connector, cloudId `5d8c32ca-6cbf-4ac3-b09b-7717b64295cf`,
never from memory:

1. **The playbook:** [Non-tech refinement — agent playbook](https://dextra.atlassian.net/wiki/spaces/DI/pages/981499905/Non-tech+refinement+agent+playbook),
   page `981499905`. It is the process: follow it exactly, except for the four
   points below.
2. **gymmy's extension:** [Non-tech refinement — gymmy extension](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/994410530/Non-tech+refinement+gymmy+extension),
   page `994410530`. It fills the playbook's slots, as the extension the
   registry names would.

## Where gymmy differs from the playbook

1. **Resolving the project.** Skip the registry (section 2; Phase 0, step 2): a
   GYM key, or a GR key for an accepted idea entering refinement, is gymmy, and
   its extension is the page above. Check its required slots as the playbook
   says.
2. **DI pages are read, never written.** A retro candidate whose destination is
   `playbook`, `guide` or `standard` goes into gymmy's RE learnings queue (E4)
   instead, its destination kept in the status line, for Mark to carry over to
   DI by hand, without gymmy's details, if he wants.
3. **Not before the migration.** Until gymmy's product docs are on DI's Product
   documentation standard ([GYM-97](https://dextra.atlassian.net/browse/GYM-97)
   is Done), the pages the playbook trusts are not ready: say so and stop.
4. **Scored before Mark sees it.** Before Mark sees an epic, its stories or a
   draft of them, run the `gymmy-independent-review` skill: a fresh agent scores
   the work from 1 to 10, and it reaches Mark only at 8 or more, with its score
   at the end (Decision log D-026). The playbook's questions to Mark come one at
   a time, and one with options or a recommendation is scored the same way
   before he sees it (D-027).

## Stop and tell Mark when

- GYM-97 is not Done.
- The Atlassian connector is unavailable, or the playbook or the extension
  cannot be fetched.
- Any stop the playbook names applies.
