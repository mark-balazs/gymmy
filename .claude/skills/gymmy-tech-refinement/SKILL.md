---
name: gymmy-tech-refinement
description: Tech refinement on gymmy (Requirement Lifecycle step 6) — writes a GYM ticket's implementation hints, the technical decisions it is built by, through dextra's Tech refinement playbook with gymmy's extension. Use for a GYM-* ticket that needs implementation hints, or a request to tech-refine or plan the build of a gymmy story. gymmy is private and in no DI registry, so the dextra-tech-refinement skill stops on it; this skill is the way in.
---

# Tech refinement — gymmy

gymmy is Mark's private project. It follows dextra's Requirement Lifecycle with
dextra's own playbooks, but it is in none of their registries and nothing about
it is written on dextra's shared (DI) pages (Decision log D-025). This skill
stands in for the registry.

## Load, fresh every session

Through the Atlassian connector, cloudId `5d8c32ca-6cbf-4ac3-b09b-7717b64295cf`,
never from memory:

1. **The playbook:** [Tech refinement — agent playbook](https://dextra.atlassian.net/wiki/spaces/DI/pages/960823309/Tech+refinement+agent+playbook),
   page `960823309`. It is the process: follow it exactly, except for the three
   points below.
2. **gymmy's extension:** [Tech refinement — gymmy extension](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/980975618/Tech+refinement+gymmy+extension),
   page `980975618`. It fills the playbook's slots, as the extension the
   registry names would.

## Where gymmy differs from the playbook

1. **Resolving the project.** Skip the registry (section 2; Phase 0, step 2): a
   GYM key is gymmy, and its extension is the page above. Check its required
   slots as the playbook says.
2. **DI pages are read, never written.** A retro candidate whose destination is
   `playbook` goes into gymmy's learnings queue (E4) instead, its destination
   kept in the status line, for Mark to carry over to DI by hand, without
   gymmy's details, if he wants.
3. **Not before the technical direction is written.** Until gymmy's
   architecture docs are on DI's Architecture documentation standard
   ([GYM-106](https://dextra.atlassian.net/browse/GYM-106) is Done), hints
   would rest on no agreed technical direction: say so and stop.

## Stop and tell Mark when

- GYM-106 is not Done.
- The Atlassian connector is unavailable, or the playbook or the extension
  cannot be fetched.
- Any stop the playbook names applies.
