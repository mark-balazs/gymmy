---
name: gymmy-implementation
description: Implementation on gymmy (Requirement Lifecycle step 10) — builds a GYM ticket, bugs and tasks included, by dextra's Implementation playbook with gymmy's tech refinement extension; where gymmy's own working rules and the playbook disagree, gymmy's win. Use for a GYM-* ticket to build, fix or implement, or a request to start building a gymmy story, bug or task. gymmy is private and in no DI registry, so the dextra-implementation skill stops on it; this skill is the way in.
---

# Implementation — gymmy

gymmy is Mark's private project. It follows dextra's Requirement Lifecycle with
dextra's own playbooks, but it is in none of their registries and nothing about
it is written on dextra's shared (DI) pages (Decision log D-025). This skill
stands in for the registry. Every GYM ticket is built this way, bugs and tasks
included (Mark, 31/10/2026).

## Load, fresh every session

Through the Atlassian connector, cloudId `5d8c32ca-6cbf-4ac3-b09b-7717b64295cf`,
never from memory:

1. **The playbook:** [Implementation — agent playbook](https://dextra.atlassian.net/wiki/spaces/DI/pages/1000636464/Implementation+agent+playbook),
   page `1000636464`. It is the process: follow it exactly, except for the
   points below.
2. **gymmy's extension:** [Tech refinement — gymmy extension](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/980975618/Tech+refinement+gymmy+extension),
   page `980975618`. The playbook has no extension of its own: it reads this
   one's E1, E4 and E5, as the extension the registry names would.

## Where gymmy differs from the playbook

Where gymmy's working rules (`CLAUDE.md`) and the playbook disagree, gymmy's
rules win (Mark, 31/10/2026). The points below are where they do; the rest of
`CLAUDE.md` holds as well, its tests and checks included.

1. **The chat is never renamed** (Mark, 31/10/2026: "Dont rename this
   thread"): skip the shared rules' step 1, *Name the chat*, and the chat half
   of the first line of their verification list; the loading half still
   applies.
2. **Resolving the project.** Skip the registry (section 2; Phase 0, step 2): a
   GYM key is gymmy, and its extension is the page above. Check its required
   slots as the playbook says.
3. **DI pages are read, never written.** A retro candidate whose destination is
   `playbook` or `shared`, an input failure included, goes into gymmy's
   learnings queue (E4) instead, its destination kept in the status line, for
   Mark to carry over to DI by hand, without gymmy's details, if he wants.
4. **No hints yet.** Tech refinement waits for the architecture docs
   ([GYM-106](https://dextra.atlassian.net/browse/GYM-106)), so until then a
   ticket has no implementation hints. Phase 1 says so, and the build works
   from the acceptance criteria and the test cases; the playbook names no stop
   for that.
5. **Branch:** the session's designated branch, which the environment sets, not
   `<type>/<KEY>` (Mark, 31/10/2026). Commit subjects start with the ticket key
   and a colon, as the playbook says, such as `GYM-196: Bring test design, …`;
   the attribution lines still close the message.
6. **Jira:** `CLAUDE.md`'s standing rules hold without a yes on each write
   (Mark, 31/10/2026): move the ticket as its work lands, comment the commit
   hash, and file what you find. The ticket walks `To Do` → `In Progress` →
   `IN REVIEW` → `Done` (Mark, 01/11/2026). It is `In Progress` while it is
   built, `IN REVIEW` while its pull request is open and in review, and `Done`
   once merged.
7. **Docs in the same change:** the repo docs, the facts and the Confluence
   pages `CLAUDE.md`'s table names change with the code, although the shared
   rules say settled pages are never edited during a session (Mark,
   31/10/2026).
8. **Reviews:** the plan and the whole change are scored by the
   `gymmy-independent-review` skill; below 8 the work is fixed and a new
   reviewer scores it again (Decision log D-026 and D-027). This takes the
   place of the playbook's plan review, its diff review and resolving each
   finding with Mark (Mark, 31/10/2026). Questions to Mark come one at a time,
   and one with options or a recommendation is scored the same way before he
   sees it (D-027).
   - A plan with more than one defensible direction is grilled with Mark
     before any code (`CLAUDE.md`, "Grill me").
   - Mark's OK on the plan before any code is written stays, as the playbook
     says (Phase 2, step 1): it is not one of these exceptions.
   - Work in progress may be pushed before its review if the commit says the
     review is still to come (`CLAUDE.md`; a working default awaiting
     [GYM-162](https://dextra.atlassian.net/browse/GYM-162)).
9. **Done:** the session merges the pull request once all of it has scored 8
   or more and every check is green (Mark, 11/10/2026). That merge, not Mark's
   word, ends the build and starts the retro, Phase 3 (Mark, 31/10/2026).

## Stop and tell Mark when

- The Atlassian connector is unavailable, or the playbook or the extension
  cannot be fetched.
- Any stop the playbook names applies.
