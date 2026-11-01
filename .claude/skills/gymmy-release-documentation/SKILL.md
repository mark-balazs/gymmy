---
name: gymmy-release-documentation
description: Release documentation on gymmy (Requirement Lifecycle step 14) — keeps gymmy's current-state product pages and Product direction's "Where we are" true to what shipped, by dextra's Release documentation playbook with gymmy's extension, including the playbook's migration mode, already run for gymmy (GYM-97). Use for a request to document what shipped, run a release documentation pass or apply `current state` queue entries. gymmy is private and in no DI registry, so the dextra-release-docs skill stops on it; this skill is the way in.
---

# Release documentation — gymmy

gymmy is Mark's private project. It follows dextra's Requirement Lifecycle with
dextra's own playbooks, but it is in none of their registries and nothing about
it is written on dextra's shared (DI) pages (Decision log D-025). This skill
stands in for the registry.

## Load, fresh every session

Through the Atlassian connector, cloudId `5d8c32ca-6cbf-4ac3-b09b-7717b64295cf`,
never from memory:

1. **The playbook:** [Release documentation — agent playbook](https://dextra.atlassian.net/wiki/spaces/DI/pages/981532673/Release+documentation+agent+playbook),
   page `981532673`. It is the process: follow it exactly, except for the
   points below.
2. **gymmy's extension:** [Release documentation — gymmy extension](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/994672658/Release+documentation+gymmy+extension),
   page `994672658`. It fills the playbook's slots, as the extension the
   registry names would.

## Where gymmy differs from the playbook

1. **The chat is never renamed** (Mark, 31/10/2026: "Dont rename this
   thread"): skip the shared rules' step 1, *Name the chat*, and the chat half
   of the first line of their verification list; the loading half still
   applies.
2. **Resolving the project.** Skip the registry (section 2; Phase 0, step 2): a
   GYM key, a gymmy pass or a gymmy migration is gymmy, and its extension is
   the page above. Check its required slots as the playbook says.
3. **DI pages are read, never written.** A retro candidate whose destination is
   `playbook`, `standard`, `guide` or `shared` goes into gymmy's RE learnings queue (E4)
   instead, its destination kept in the status line, for Mark to carry over to
   DI by hand, without gymmy's details, if he wants.
4. **No fix versions.** Every merge to main deploys, so a pass's scope is the GYM
   tickets moved to Done since the last pass (E6). Until
   [GYM-163](https://dextra.atlassian.net/browse/GYM-163) settles what counts as
   a release, confirm each pass's scope with Mark before Phase 1.
5. **Scored before Mark sees it.** Before Mark sees a page plan, the pages a
   pass wrote or its record, run the `gymmy-independent-review` skill: a fresh
   agent scores the work from 1 to 10, and it is fixed until it scores 8, then
   reaches Mark with its score at the end (Decision log D-026 and D-027). The
   playbook's questions to Mark come one at a time, and one with options or a
   recommendation is scored the same way before he sees it (D-027).

## Stop and tell Mark when

- The Atlassian connector is unavailable, or the playbook or the extension
  cannot be fetched.
- The environment E5 names cannot be reached, or does not run main's commit.
- Any stop the playbook names applies.
