# The weekly fact check

What the scheduled check does, once a week, so the fact register, the code and
Confluence stay in step. It runs unattended as a Claude Code routine whose saved
prompt is only: *"Follow docs/fact-check.md in the gymmy repository."* Change
the procedure here, in a commit, not in the routine.

**Status: written, not yet scheduled.** A routine can only reach Jira and
Confluence through a connector on the owner's claude.ai account, and the
Atlassian connection used so far is a local one (GYM-29).

**It finds and files. It never fixes.** The owner decided (D-020) that when a
fact and anything else disagree, nobody picks a winner: the owner is asked. So
the check edits nothing — not the repo, not Confluence, not the facts — and
turns each disagreement into one GYM issue.

## Inputs

- The register: [`docs/facts/README.md`](./facts/README.md) and every fact
  file. Each fact lists where it is stated under `appears`.
- Confluence (cloudId `5d8c32ca-6cbf-4ac3-b09b-7717b64295cf`): every page
  under the root `934445059`, plus the strategy and spec pages outside it
  (`934838274` and its children, `934379628`, `949354507`, `949551107`,
  `949649424`, and the BGF pages). Read them as markdown; never write.
- The code, for facts about behaviour: the files and tests a fact points at.
- Jira project **GYM**, epic **Knowledge base**.

## Scope of one run

1. Find the last run: the newest comment on the GYM issue titled "Weekly
   check of Confluence against the fact register" that starts with `Run`.
   No such comment means this is the first run: check everything.
2. Otherwise check only what changed since then:
   - facts whose file changed (`git log --since=<last run> -- docs/facts`);
   - facts whose `appears.repo` or `appears.tests` files changed;
   - Confluence pages modified since the last run (CQL `lastmodified >`);
   - and every fact those pages or files state.

## What counts as a mismatch

A statement, anywhere in scope, that **contradicts a current or planned
fact** — says something false about it, or describes as built what the
register calls planned. Not a mismatch:

- wording that differs but means the same;
- a page that leaves a fact out (silence is not a contradiction);
- a superseded fact still described on the Decision log (that is history).

For a fact about behaviour, also read the code it points at. If the code does
something else, that is a mismatch too — between the fact and the code.

## Filing

For each mismatch, first search GYM for an open issue with the same fact id
and the same place (`summary ~ "<fact-id>"`). If one exists, add a comment
only if something new was found. Otherwise create a **Task** under the
Knowledge base epic:

- **Summary:** `Mismatch: <fact-id> — <page title or path>`
- **Description:** the fact, quoted; the contradicting text, quoted, with its
  page link or `path:line`; and, in one line each, what would change if the
  fact is right and what would change if the other side is.

No assignee, no priority beyond the default, no notifications, no invites.

## Finish

Add one comment to the weekly-check issue: `Run <date>: <n> facts and <m>
pages checked, <k> new issues (<keys>)`. That comment is also how the next
run knows where to start.
