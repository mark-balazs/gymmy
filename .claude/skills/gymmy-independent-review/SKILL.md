---
name: gymmy-independent-review
description: The independent review everything made for gymmy passes before it reaches Mark — a fresh agent that did not do the work scores it from 1 to 10 against the rules that govern it, the work is revised and re-scored until it reaches 8, and it reaches him with its score at the end. Also how decisions reach him — one at a time, from a queue. Use before presenting Mark any idea, proposal, mockup, epic or story, implementation hints, documentation pass, migration, fix, retro, report, decision or other deliverable or recommendation.
---

# Independent review — gymmy

Mark's rules (owner, 11/10/2026; Decision log D-026 and D-027): everything made
for gymmy reaches him, and only once it scores 8 or more out of 10 in an
independent review. Work below 8 is fixed and reviewed again, never shown and
never quietly kept from him. Decisions reach him one at a time.

## When it applies

Before Mark sees any of these:

- an idea or a proposal and its mockups (product discovery);
- an epic and its stories (non-tech refinement);
- implementation hints (tech refinement);
- a release documentation pass or a migration: its pages and its record;
- a fix, a retro or a report on work done;
- every decision put to him (see *Decisions, one at a time*);
- any other deliverable, plan or recommendation.

It does not apply to a factual question with no options or recommendation, or to
a one-line status saying what was done and where. The work that status points
to is reviewed like everything else. A grill's questions are not reviewed one by
one either, since the grill is his request.

Reaching Mark means being shown, sent or asked. Work in progress may be pushed to
the working branch, or written where its playbook writes it, before the review,
as long as the commit or the record says the review is still to come; the score
goes on the next commit or into the record.

These exemptions and the work-in-progress rule are working defaults awaiting
Mark's answer (GYM-162).

## How

1. **Freeze the work** as Mark would see it: the pages, files or text, with
   their locations.
2. **Start a new reviewer**: a fresh agent (the Agent tool, general-purpose), never
   the one that did the work, and never told the author's reasoning. Give it only:
   - the work's locations;
   - the rules that govern it: the DI playbook, standard and templates for that
     step, gymmy's extension and writing guide, the fact register
     (`docs/facts/`) and `CLAUDE.md`;
   - the rubric below, with the dimensions that fit the work.
   The reviewer is read-only.
3. **It scores** each dimension from 1 to 10, then gives an overall score, which is
   its judgement and not an average:
   - 10: a DI owner would accept the work without a single change; for a
     decision, Mark could answer it without asking anything.
   - 8: minor fixes only.
   - 6: real gaps.
   It lists its findings ranked by how much each costs the score, each with the
   exact fix, and writes the full report to a file.
4. **Below 8:** fix every finding that costs the score. Then start another new
   reviewer with the same brief. Never ask a reviewer to re-score its own
   findings. Repeat until the score reaches 8.
5. **At 8 or more:** present the work to Mark, ending with:
   - the overall score and the score for each dimension;
   - the minor findings still open;
   - the report, sent as a file he can open or linked where he can read it.
6. **Held below 8 by something only Mark can decide:** ask him that one question,
   as a decision (below). Say what it blocks and the score so far. Show him the
   work only once it scores 8.
7. **Record every round** (date, score, where the report is) where the work
   lives: the proposal, the drafts page, the pass record, the ticket or the
   commit message.

## Decisions, one at a time

Mark decides one thing at a time (D-027), and the same holds for anything only he
can do.

- **The queue** is GYM's open *Decide* and *Mismatch* tickets, and tickets titled
  `For Mark: …` for an action only he can take, saying what he does and why. Each
  is linked in Jira to what it blocks. A question asked and answered in the
  session, as in a grill, is not filed (a working default awaiting Mark's
  answer); one left open is.
- **One decision each.** A new ticket holds one decision. A ticket that already
  holds several is asked one decision at a time, each reviewed on its own. A
  *Mismatch* ticket gets a recommendation and what it unblocks before it is
  asked.
- **Order,** a working default until Mark answers (GYM-162): what harms people
  first; then what blocks the work in hand; then what blocks the most other
  work; then the oldest. Each still waits for the one he is answering.
- **One per question.** Put the next decision only once he has answered the one
  before. Never list several, in a question, a reply, a retro or a report; say
  how many wait behind it instead, unless he asks to see the queue.
- **Short and plain, with its context**, so he can answer without opening
  anything, in this order:
  1. what to decide, in one sentence;
  2. what it is about and why it comes up, in two or three plain sentences;
  3. the options, two to four, your recommendation first, a line each;
  4. what the answer unblocks;
  5. the review score, at the end, then the ticket as a reference.
- **No bare numbers.** A ticket, page or decision number never stands in for
  what it is: say what it is, and give the number only after, as a reference.
- **Reviewed first,** like any work, with the *Decision* dimension below. Below
  8, fix it and start a new reviewer. At 8 or more it goes to him with its
  overall score, and the report attached.
- **Asked in a message,** so work goes on while it waits; the question tool holds
  everything until he answers, so use it only when nothing else can move.
- **Once he answers:** write the decision down where CLAUDE.md says (the fact
  file, and the Decision log when it would be a project to reverse), quote the
  sentence back, move or close the ticket, then put the next one.

## Rubric

Pick the dimensions that fit the work, and name them in the brief.

- **Process fidelity.** The governing playbook's steps were followed, every
  approval it needs is recorded, and nothing was written that the step may not
  write. Nothing about gymmy was written on DI pages (D-025).
- **Fit to the standard and template.** Every mandatory section is there, in
  order; the structure, levels and placement follow the standard.
- **Content.** Plain, short words; business rules, not field-level detail; no
  history or plan wording on current-state pages; one vocabulary (Terminology);
  each fact on exactly one page.
- **Truth.** The reviewer checks at least 20 concrete claims against the code,
  the running product and the fact register, each with its evidence.
  Disagreements are listed, never settled by picking a side.
- **Completeness.** Nothing the work had to carry is lost or left out.
- **Value** (for ideas and proposals). The problem is real and evidenced; the
  options were weighed; the proposal fits Product direction's principles and
  non-goals; the mockups show what a person would do.
- **Readiness** (for stories and hints). The acceptance criteria are numbered and
  testable; the story's Feature pages line names the pages it changes; the hints
  follow the architecture docs and the technical direction.
- **Decision** (for a decision put to Mark). It is one decision; it carries its
  context, so he can answer without opening anything, and no number stands in
  for what it is; the options are real, fair and few; the recommendation
  follows from the evidence; the words are short and plain; it names what it
  unblocks and, as a reference, its ticket.
