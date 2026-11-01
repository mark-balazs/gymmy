---
name: gymmy-test-design
description: Test design on gymmy (Requirement Lifecycle step 5) — checks that a refined GYM story can be tested and writes its numbered test cases, with Claude Code as QA. dextra has no test design playbook yet, so this skill holds the process itself, modelled on 123datei's test designs. Use for a GYM story in Test Design, or a request to write, check or change a gymmy story's test cases. Bugs and tasks get no test design.
---

# Test design — gymmy

gymmy is Mark's private project. It follows dextra's Requirement Lifecycle, but
it is in none of dextra's registries and nothing about it is written on
dextra's shared (DI) pages (Decision log D-025). Test design runs for stories
(Mark, 31/10/2026), and Claude Code is QA.

## Load, fresh every session

Through the Atlassian connector, cloudId `5d8c32ca-6cbf-4ac3-b09b-7717b64295cf`,
never from memory:

1. **The step:** [5. Test Design](https://dextra.atlassian.net/wiki/spaces/DI/pages/938147841),
   page `938147841`: check that the story can be tested, and write the test
   cases that step 13, Testing, runs.
2. **The shared rules:** [Agent playbooks — shared rules](https://dextra.atlassian.net/wiki/spaces/DI/pages/1000177672/Agent+playbooks+shared+rules),
   page `1000177672`, for how to ask (section 3), how to write to the ticket
   (section 5) and the retro (sections 7.1 and 7.2).
3. **gymmy's extension:** [Non-tech refinement — gymmy extension](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/994410530/Non-tech+refinement+gymmy+extension),
   page `994410530`, for where the story drafts and the RE learnings queue are
   (E4).

## Where gymmy differs from the playbook

1. **No playbook yet.** dextra has no test design playbook on Confluence.
   123datei's test design is a skill, `skills/123datei-test-design.md` in
   GitHub `dextra-software/common-agent-resources`, which gymmy sessions cannot
   open. So the process below stands in, modelled on 123datei's `TD - {KEY}`
   pages until a session can read that skill (Mark, 31/10/2026), then on the
   skill itself. TD - DATEIN-643 (page `1046642753`) is such a page.
   Once dextra publishes a test design playbook, this skill loads it instead,
   as the others do.
2. **The chat is never renamed** (Mark, 31/10/2026: "Dont rename this
   thread").
3. **DI pages are read, never written.** A retro candidate meant for a DI page
   goes into gymmy's RE learnings queue instead, its destination kept in the
   status line, for Mark to carry over to DI by hand, without gymmy's details,
   if he wants.
4. **Scored before Mark sees it.** Before Mark sees the test cases, run the
   `gymmy-independent-review` skill against this skill, `docs/testing.md` and
   the story: a fresh agent scores them from 1 to 10, and they are fixed until
   they score 8, then reach Mark with their score at the end (Decision log
   D-026 and D-027). Questions to Mark come one at a time, and one with options
   or a recommendation is scored the same way before he sees it (D-027).
5. **Stories only.** Bugs and tasks get no test design: a bug keeps "a test
   that fails without the fix" (`CLAUDE.md`).

## The process

1. **Read** the story with every layer: its context, its acceptance criteria
   (ACs), and its *Feature pages* and *Facts* lines. Read its epic, the epic
   draft's *Cross-story decisions*, its story draft `NR - {KEY}` (under the
   drafts parent, E4), and `docs/testing.md` for the layers.
2. **Check it can be tested.** An AC that no test can check sends the story
   back, as the step page says, in one question to Mark: to non-tech
   refinement (the RE) when the refinement is the problem, to discovery (the
   PM) when the proposal is. Write no test cases until he answers.
   - The story stays in `Test Design` while an AC is clarified: a change to
     the ACs is a non-tech refinement clarification
     (`gymmy-nontech-refinement`, Phase 4).
   - When test design applies an RE answer to the ACs itself, it records the
     answer as one *Clarifications after hand-off* line and one *Decision log*
     line on the story draft (DI Product writing guide, page `980975794`, 3.7
     *Clarification entries*).
3. **Write the test cases** in the ticket's `## Test cases` section, below the
   ACs and the closing lines, by the shared rules' write mechanics: re-read the
   description first, and leave the rest of it as it is. Their shape:
   - one line saying which version of the ticket they were written against:
     "Written against {KEY} as updated on DD/MM/YYYY at HH:MM.";
   - the assumptions every test shares;
   - a *Test data* table: `ID | Dataset`;
   - the tests, as tables `# | Layer | Data | Flow | Expected`, each citing the
     AC it checks. A test that goes on from another's end state starts its
     flow with "After #N".
4. **Give each test its layer** (`docs/testing.md`):
   - `Domain`: logic, in `packages/domain`, with no IO;
   - `Web`: anything that touches the database, in `apps/web`, on real
     Postgres;
   - `Browser`: what a person does, in `e2e`, with Playwright on a production
     build. A step that only happens on the way in, such as signing up, cannot
     start from a fixture's session row (flow 08);
   - `By hand`: a behaviour check on production or the local copy, for what the
     suites can't reach, such as Google sign-in or the code email.
5. **Numbers never change.** A dropped test is struck through and keeps its
   number. A new test takes the next number.
6. **Too long for the ticket?** A Jira description holds 32,767 characters.
   Test cases that outgrow it go on a `TD - {KEY}` page under *Test designs —
   gymmy*, a child of *gymmy — how we work*, created when first needed, and
   the `## Test cases` section links it.
7. **Review** them as *Scored before Mark sees it* says, and put each round's
   score on the ticket. They may sit on the ticket before their review only if
   it says the review is still to come.
8. **Move the story** to `Tech refinement`. While tech refinement waits for the
   architecture docs ([GYM-106](https://dextra.atlassian.net/browse/GYM-106)),
   move it straight to `To Do` instead, saying so in a comment.
9. **Retro**, by the shared rules (sections 7.1 and 7.2), from what happened
   this session only: did the story fail test design (an AC no test could
   check, or one that had to change), and did this process fail? Most sessions
   have nothing. A kept candidate goes into the RE learnings queue,
   [Non-tech refinement learnings — gymmy](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/994574373)
   (E4).

## Stop and tell Mark when

- The ticket is not a story: bugs and tasks get no test design.
- An AC cannot be tested (step 2): ask him that one question and write nothing
  until he answers.
- The Atlassian connector is unavailable, or a page above cannot be fetched.
