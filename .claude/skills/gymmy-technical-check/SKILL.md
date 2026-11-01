---
name: gymmy-technical-check
description: The technical check on gymmy (Requirement Lifecycle step 7) — briefs Mark, as technical lead, on a GYM ticket's implementation hints before anyone builds them, and records his verdict, by dextra's Technical check playbook with gymmy's tech refinement extension. Use for a GYM-* ticket in Tech check, or a request to check a gymmy ticket's hints. It runs once gymmy's architecture docs are moved (GYM-106) and stops until then. gymmy is private and in no DI registry, so the dextra-technical-check skill stops on it; this skill is the way in.
---

# Technical check — gymmy

gymmy is Mark's private project. It follows dextra's Requirement Lifecycle with
dextra's own playbooks, but it is in none of their registries and nothing about
it is written on dextra's shared (DI) pages (Decision log D-025). This skill
stands in for the registry. The check runs before building, from the
architecture docs move on (Mark, 31/10/2026).

## Load, fresh every session

Through the Atlassian connector, cloudId `5d8c32ca-6cbf-4ac3-b09b-7717b64295cf`,
never from memory:

1. **The playbook:** [Technical check — agent playbook](https://dextra.atlassian.net/wiki/spaces/DI/pages/1000636535/Technical+check+agent+playbook),
   page `1000636535`. It is the process: follow it exactly, except for the
   points below.
2. **gymmy's extension:** [Tech refinement — gymmy extension](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/980975618/Tech+refinement+gymmy+extension),
   page `980975618`. The playbook has no extension of its own: it reads this
   one's E1, E2, E4 and E5, as the extension the registry names would.

## Where gymmy differs from the playbook

1. **The chat is never renamed** (Mark, 31/10/2026: "Dont rename this
   thread"): skip the shared rules' step 1, *Name the chat*, and the chat half
   of the first line of their verification list; the loading half still
   applies.
2. **Resolving the project.** Skip the registry (section 2; Phase 0, step 2): a
   GYM key is gymmy, and its extension is the page above. Check its required
   slots as the playbook says.
3. **DI pages are read, never written.** A retro candidate whose destination is
   `playbook` or `shared` goes into gymmy's learnings queue (E4) instead, its
   destination kept in the status line, for Mark to carry over to DI by hand,
   without gymmy's details, if he wants.
4. **Not before the technical direction is written.** Until gymmy's
   architecture docs are on DI's Architecture documentation standard
   ([GYM-106](https://dextra.atlassian.net/browse/GYM-106) is Done), no
   component page has the *Technical direction* the check reads: say so and
   stop. Until then a story goes from `Test Design` straight to `To Do`.
5. **Mark is the reviewer**, as technical lead (E5), and reviews each check
   in one sitting (Mark, 31/10/2026). The verdict is his, recorded with his
   name and the date. Then suggest the move it implies: `To Do` when the hints
   passed as they are, `Tech refinement` when they must change first.
6. **Scored before Mark sees it.** Before Mark reads the briefing, run the
   `gymmy-independent-review` skill: a fresh agent scores it from 1 to 10, and
   it is fixed until it scores 8, then reaches Mark with its score at the end
   (Decision log D-026 and D-027). The walk-through puts its items to him one
   at a time, as the playbook's grill rules already say.
7. **The record holds a diagram.** The record `TC - {KEY}` sits under the
   ticket's `TR - {KEY}` draft (E4), and its change map is a Macro Pack
   diagram. So the record is read and changed in ADF only, by node edits that
   leave the diagram alone (Mark, 01/11/2026, GYM-102; `CLAUDE.md`, "Diagrams
   in Confluence").

## Stop and tell Mark when

- GYM-106 is not Done.
- The Atlassian connector is unavailable, or the playbook or the extension
  cannot be fetched.
- Any stop the playbook names applies, such as a ticket with no implementation
  hints.
