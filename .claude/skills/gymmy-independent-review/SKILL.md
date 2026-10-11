---
name: gymmy-independent-review
description: The independent review every piece of gymmy work passes before Mark sees it — a fresh agent that did not do the work scores it from 1 to 10 against the rules that govern it, and the work is revised and re-scored until it reaches 8. Use before presenting Mark any idea, proposal, mockup, epic or story, implementation hints, documentation pass, migration or other deliverable or recommendation for his review or decision.
---

# Independent review — gymmy

Mark's rule (owner, 11/10/2026; Decision log D-026): he is involved only once the
work already scores 8 or more out of 10 in an independent review. Work below 8 is
not shown to him; it is fixed and reviewed again.

## When it applies

Before Mark sees any of these, for a decision, a review or an approval:

- an idea or a proposal and its mockups (product discovery);
- an epic and its stories (non-tech refinement);
- implementation hints (tech refinement);
- a release documentation pass or a migration: its pages and its record;
- any other deliverable, plan or recommendation put to him.

It does not apply to a factual question only Mark can answer, or to a status
update. A question that carries options or a recommendation is reviewed together
with the work it belongs to.

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
   - 10: a DI owner would accept the work without a single change.
   - 8: minor fixes only.
   - 6: real gaps.
   It lists its findings ranked by how much each costs the score, each with the
   exact fix, and writes the full report to a file.
4. **Below 8:** fix every finding that costs the score. Then start another new
   reviewer with the same brief. Never ask a reviewer to re-score its own
   findings. Repeat until the score reaches 8.
5. **At 8 or more:** present the work to Mark with:
   - the overall score and the score for each dimension;
   - the minor findings still open;
   - where the report is.
6. **Held below 8 by something only Mark can decide:** ask him that one question.
   Say what it blocks and the score so far. Show him the work only once it
   scores 8.
7. **Record every round** (date, score, where the report is) where the work
   lives: the proposal, the drafts page, the pass record or the commit message.

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
