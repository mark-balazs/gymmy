# Working on gymmy

Start with [`docs/README.md`](./docs/README.md) — the architecture map, the
invariants that must not be broken, and where each thing lives.

## What is true: the fact register

[`docs/facts/`](./docs/facts/README.md) is the one list of what is true about
gymmy — product rules, behaviour, decisions, boundaries, plans and prices, one
file per fact. Its index is loaded below, whole, into every session. Start from
it, not from memory.

- **Disagreement is a question for the owner.** When a fact and the code, a
  doc, the copy or a Confluence page disagree, neither side wins. Ask, and
  change nothing until the owner answers.
- **Write a decision down when it is made.** When the owner decides something,
  write or change the fact file in the same change and quote the sentence back
  in your reply, so a wrong one can be vetoed.
- **Curated, never add-only.** Every update reviews the register as a whole:
  merge facts that overlap, rewrite the ones the change touches, and delete
  what no longer holds or no longer earns its place. A replaced fact is
  deleted, not kept — git and the Decision log hold the history. It should get
  sharper over time, not longer; if the index still grows past ~7,500 tokens,
  say so.
- **A changed fact** means its file first, then every place under `appears`.
- A weekly check ([`docs/fact-check.md`](./docs/fact-check.md)) compares the
  register with Confluence and the code and opens one GYM issue per mismatch.
  It edits nothing.

@docs/facts/README.md

## How to work here

**Plan before you implement.** Say what the solution is and which direction you
are taking technically — where the change belongs, what it touches, what it
rules out — before writing code. Most of the expensive mistakes in this codebase
have been shape mistakes rather than typos: seeding put somewhere it could only
run once, loads keyed on the wrong thing, a form posting where the framework was
reading from somewhere else. None of those were caught by writing the code more
carefully; they were caught by thinking about the shape first.

**Grill me when the decision is not settled yet.** There is a `grill-me` skill
available — use it to interview me about a technical decision or the scope of a
change, before any code exists, rather than guessing at what I meant and
building the wrong shape. "Grill me about X", "let's spec out X" or "poke holes
in this" are all requests for it, and it is the right move whenever a plan has
more than one defensible direction in it.

**Score before you show.** Everything you make for gymmy reaches Mark, and only
once an independent review scores it 8 or more out of 10 (D-026, D-027).
Nothing is done quietly and kept from him. That covers an idea, a proposal or
mockup, a refinement, implementation hints, a documentation pass, a fix, a retro
or report, every decision put to him, and any other deliverable or
recommendation; only a plain question with no options, a one-line status, or a
grill's questions skip the review. A fresh agent that did not do the work scores
it against the rules that govern it; the work is fixed and scored again by a new
reviewer until it reaches 8. Reaching him means being shown, sent or asked: work
in progress may be pushed to the working branch, or written where its playbook
writes it, before the review, as long as the commit or the record says the
review is still to come. (Those exemptions and the work-in-progress rule are
working defaults until Mark answers.) Show him the work with its score at the
end and a report he can open. If something only he can decide holds the work
below 8, ask him that one question instead of showing the work. How: the
`gymmy-independent-review` skill.

**One decision at a time** (D-027). Never put several decisions to Mark at once,
in a question, a message, a retro or a report. Decisions, and anything only he
can do (filed as a ticket saying what he does and why), wait in a queue of GYM
tickets, in this order (a working default until Mark answers): what harms people
first; then what blocks the work in hand; then what blocks the most other work;
then the oldest. The next comes only once he has answered the one before;
meanwhile, carry on with whatever the answer does not block. A new ticket holds
one decision; one that already holds several is asked one decision at a time,
each reviewed on its own. Ask each in short, plain words
with its context, so he can answer without opening anything: what to decide,
what it is about and why it comes up, the options with your recommendation
first, what the answer unblocks, and its review score at the end. A ticket or
decision number never stands in for what it is. Ask it with the question tool,
not as text in a reply, where it gets missed: everything in the question, each
option a label of five words at most with a one-line description, the review
report sent as a file just before it, and whatever work does not wait on the
answer started in the background first. A question asked and answered in the
session, as in a grill, is not filed (a working default until Mark answers); one
left open is. How: the same skill, *Decisions, one at a time*.

**Extend the tests as you go, not afterwards.** A change without a test that
would have failed before it is not finished. The discipline that has actually
caught things here is stronger than "add a test": **break the fix and watch the
test fail.** If disabling your change leaves the suite green, the test is
decoration. Say so in the commit when you have done it.

Note which layer the test belongs in — `packages/domain` for logic, `apps/web`
for anything touching the database, `e2e` for what a person does. And remember
that a fixture starting from a session row can never cover a step that only
happens on the way in; that is what `e2e/flows/08` exists for.

**The queue lives in Jira, not in anyone's memory.** Open work is project
**GYM** ([board](https://dextra.atlassian.net/jira/software/projects/GYM/boards/647)).
Look there before starting. File what you find instead of carrying it in a
session, written to *Write a ticket — gymmy*: a bug as a bug, a question only
the owner can settle as "Decide: …", an action only the owner can take as
"For Mark: …". Move an issue as its work lands, and comment the commit hash.

**Work moves through dextra's Requirement Lifecycle** (D-023 to D-025).
[gymmy — how we work](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/980549636)
says who holds each role, where each step's output lives and the order of work.
gymmy is the owner's private project, so it is in no DI registry and **nothing
about it is ever written on dextra's DI pages**, learnings about a process
included. Seven skills in `.claude/skills/` run the steps, in lifecycle order:
`gymmy-product-discovery`, `gymmy-nontech-refinement`, `gymmy-test-design`,
`gymmy-tech-refinement`, `gymmy-technical-check`, `gymmy-implementation` and
`gymmy-release-documentation`. Each loads its DI playbook with gymmy's extension
(test design has no playbook yet, so its skill holds the process); dextra's own
skills stop on a gymmy key. Tech refinement and the technical check wait for the
architecture docs ([GYM-106](https://dextra.atlassian.net/browse/GYM-106)), so
until then a story goes from test design straight to `To Do`. A ticket moves as
its step changes (Mark, 01/11/2026). A story goes `Non-tech refinement` →
`Test Design` → `Tech refinement` → `Tech check` → `To Do` → `In Progress` →
`IN REVIEW` (its pull request open) → `Done`; a bug or task starts at `To Do`.
Topics are ideas in the Jira Product Discovery space **gymmy-roadmap**
([GR](https://dextra.atlassian.net/jira/polaris/projects/GR/ideas)), ranked top
first as Mark ranked them on 31/10/2026
([GYM-107](https://dextra.atlassian.net/browse/GYM-107)); each GYM epic
implements its GR idea.

**Sweep between features.** The owner asked for housekeeping without being
prompted: between landed features, look through the tree for bugs, stale docs,
dead code and tests that pass for the wrong reason. The bar is a concrete
failure, not a smell. Fix what is safe and in scope; file the rest.

**Update the documentation after you implement.** There are two sets and they
are not duplicates. Both are part of the change, not a follow-up.

### 1. `docs/` — for whoever next edits the code

The map later sessions read before touching anything. A change that moves a
boundary, adds a table, or breaks an assumption written down there has not
landed until the map says so. The README's "Known gaps" section is part of this
— an entry that is no longer true is worse than no entry.

### 2. Confluence — for everyone else

[gymmy — documentation](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/934445059)
is the product, architecture, infrastructure, operations and decision
documentation, read by people who will never open this repository.

**It goes stale silently.** Nothing in CI can check it, and nobody notices for
months — by which point somebody has acted on a page that describes an app we no
longer ship. So it is a step in the work, in the same commit, every time.

Use this table to find the page. If your change is in the left column, the right
column is not optional:

| If your change… | Update |
| --- | --- |
| changes a product rule, a behaviour, a boundary, a plan or a price | [`docs/facts/`](./docs/facts/README.md) first, then everything under that fact's `appears` |
| adds, removes or rearranges a screen, or changes what a feature *does* | **Product**: the release documentation pass (`gymmy-release-documentation` skill) writes the page that [Product's page index](https://dextra.atlassian.net/wiki/spaces/~712020296b34b54b84454489d16860c808e925/pages/934510594) names, once the change is on main |
| touches a pattern, split, progression rule, the strength score, or a verdict threshold | The same pass, on the owning page in **The week** or **Progress**; **Terminology** when a term changes |
| targets a new kind of user, or drops a use case | **Product direction** (segments, non-goals) and **Terminology** (personas), as a direction change Mark confirms |
| changes the pitch, the promises, or what gymmy refuses to be | **Product direction**, as a direction change Mark confirms |
| adds or drops an external system | **Architecture → C1** |
| adds a container, or moves a responsibility between client and server | **Architecture → C2** |
| gives a component a new responsibility | **Architecture → C3** |
| changes one of the load-bearing shapes, or adds a new shape mistake worth recording | **Architecture → C4** |
| adds a table, or changes what a column means | **Architecture → Data model** |
| changes a route, the sync envelope, a status code, or a rate limit | [`docs/openapi.yaml`](./docs/openapi.yaml) — **not** a Confluence table; see below |
| adds an environment variable, changes hosting, or changes a CI job | **Infrastructure** |
| changes a deploy, migration or support procedure — or you hit a failure that took real work to diagnose | **Runbooks** |
| changes how work moves — a role, a status, or where a step's output lives | **gymmy — how we work** |
| settles a question that would be a project to reverse | **Decision log** (append; never edit an entry — mark it superseded) |

Every page in this table outside **Product** and **Product direction** ends with
an **"update this page when"** note; Product pages have none, because the
release documentation pass keeps them. If
yours is not in the table, that note is the tiebreak. If it is genuinely neither, it probably does
not need a Confluence change — say so rather than guessing.

### The API is the one exception

[`docs/openapi.yaml`](./docs/openapi.yaml) is the contract, and it is the only
documentation in this repository a build can check. `openapi.test.ts` reads it
back and holds every row schema against the Zod schemas in `lib/sync/rows.ts`,
so a field added there and not added to the spec fails `npm test`.

**Do not re-describe endpoints, fields or status codes on Confluence.** That is
what the spec is for, and two copies means one of them is wrong. The Confluence
API pages (**API** and its child **POST /api/sync**) carry the things a spec
cannot: why training data goes through one endpoint rather than a REST resource
per table, and what the held-down cursor is protecting against. They link to
the YAML for everything else.

**Prose, not a changelog.** These pages say what is true now and why, in the
same voice as the rest. Do not append "as of March we also…"; rewrite the
sentence that is now wrong.

**Compact and plain — people have to be able to follow it.** The pages grew
verbose; the owner's rule is that they are written for a busy reader, in
everyday words:

- Open with the answer: one or two sentences saying what this is and what to do.
- Short sentences, short paragraphs. Bullets and tables over long prose.
- Plain words. Avoid jargon; when a technical term is needed, say what it means
  in a few words the first time. No code names on Product pages; on
  Architecture and Runbook pages only where the reader must find the thing.
- The "why" in one sentence, not the history of how we got there. Backstory
  belongs in the Decision log, if anywhere.
- Keep every rule, number, link and warning someone would act on; cut the rest.
  If a page cannot lose half its words, ask whether it is two pages.

The same goes for text in the app itself — explanations belong behind an ⓘ,
not in paragraphs on the screen — and for replies to the owner: the answer
first, in plain words, saying what a ticket or page is about rather than only
giving its number.

### Diagrams in Confluence

**A page that holds a diagram is read and changed in ADF only, by node edits
that leave the diagram alone** (Mark, 01/11/2026, GYM-102), as dextra's shared
rules say (section 5.7). Never send such a page whole: not in markdown, and not
in HTML with the diagram pasted back.

- **Read it as nodes.** ADF (Atlassian Document Format) is the page as a tree of
  nodes. The Atlassian connector reads no ADF as such, but its HTML read shows
  each node with its local ID (`data-local-id`): use it to find nodes, never to
  write the page back. An extension node (`data-type="extension"`) means the
  page holds a diagram or another macro, and the same rule applies.
- **Edit only the nodes that change**, by local ID, after a dry run; a
  diagram's own node only when the diagram changes.
- **Read the page back:** every diagram node still there, unchanged.

**The entity relationship diagrams are generated — never hand-drawn.**
`npm run er:diagram -w @athletic/web -- --macro` rewrites `docs/data-model.mmd`
from `schema.ts` and prints, for each of the three diagrams, its ADF node, ready
to replace the diagram node under its heading on **Architecture → Data model**.
`er-diagram.test.ts` fails when the committed diagram and the schema disagree,
so a schema change cannot ship with a stale picture — but the test cannot
publish it, so that last step is yours. Do not edit those diagrams in
Confluence: the next regeneration throws the edit away.

Everything below is for diagrams that are genuinely hand-authored.

Mermaid renders through **Macro Pack**, which is a Forge extension rather than a
classic macro — so searching the macro browser for "mermaid" finds nothing and
looks like the app is missing. It is not. A diagram is this ADF node, which
`adfFor` in `apps/web/src/lib/db/er-diagram.ts` builds from any mermaid source:

```json
{
  "type": "extension",
  "attrs": {
    "extensionType": "com.atlassian.ecosystem",
    "extensionKey": "1ef074bf-c90d-4af8-9ea9-32d2e6ae9a90/2256cafd-362d-4b27-a796-139875a465b5/static/macro-pack",
    "parameters": {
      "layout": "extension",
      "guestParams": { "input": "mermaid", "source": { "text": "…", "type": "text" }, "version": 1 },
      "forgeEnvironment": "PRODUCTION",
      "extensionId": "ari:cloud:ecosystem::extension/<the key above>",
      "extensionTitle": "Macro Pack"
    },
    "layout": "default",
    "text": "Macro Pack"
  }
}
```

Four traps, all silent:

- **Build the node in code, never by hand.** The mermaid source sits in the node
  as a JSON string, so every quote, backslash and line break in it must be
  escaped exactly: a label's `\n` typed into the JSON by hand becomes a real
  line break, for one. Build it with `JSON.stringify`, as `adfFor` does, and
  check it reads back to the same source before publishing.
- **Line breaks in node labels are `\n`, not `<br/>`.** The renderer may have
  HTML labels disabled, in which case `<br/>` appears literally.
- **Markdown drops the diagram.** A markdown update converts the whole page and
  drops extension nodes without a word, so a page with two diagrams saves with
  none. Markdown is fine for a page that has no macros.
- **The native <code>language-mermaid</code> fence is not an alternative.** It
  is a documented Confluence pattern and it does save, but it renders as a
  *collapsed block of mermaid source* labelled "Diagram" — not a diagram. It was
  tried and reverted.

If a published diagram stops appearing, check for a purple banner at the top of
Confluence: Macro Pack periodically needs a **site admin** to accept a
permissions update under Manage apps → Macro Pack, and until somebody does,
every diagram in the space renders as nothing. The page content is intact — it
is a rendering failure, and reading the page shows the extension node still
there.

Mermaid has no syntax check in CI on either side, so render the source before
publishing — serve a page that loads mermaid from cdnjs and call `mermaid.parse`
on each diagram. A diagram that fails to parse is an error box in Confluence and
on GitHub alike.

## Before you say it works

`npm run format && npm run lint && npm run typecheck && npm run build && npm test`

`npm test` runs the domain, web and e2e suites. The e2e suite serves the last
**production build**, so an untested UI change will silently test the previous
one — build first, always. It also reuses anything already listening on its
port (3000 by default), so stop your own dev server first. Other projects on
this machine may hold 3000 and 3100 — never stop those; run with `E2E_PORT`
set to a free port instead. A 404 page in a failure snapshot means the suite
reached the wrong server, not that the app broke.

And the part no command checks: **is the documentation current?** Both sets.

**Done means pushed.** Commit, then push, once per landed piece of work — not
batched at the end of a session. Every commit subject starts with its ticket key
and a colon, as dextra's commit standard says:
`GYM-196: Bring test design, the technical check and implementation into gymmy's process`.
The owner follows the work from GitHub and other devices. Work pushed before its
independent review says so in the commit, and the review's score goes on the
next one (a working default, see *Score before you show*). You may merge a pull
request yourself once all of it has scored 8 or more and all its checks are
green (Mark, 11/10/2026). If you cannot see CI, say what you verified locally
rather than calling it green.

@AGENTS.md
