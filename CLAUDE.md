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
- **A changed fact** means its file first, then every place under `appears`.
- A weekly check compares the register with Confluence and the code and opens
  one GYM issue per mismatch. It edits nothing.
- If the index grows much past ~7,500 tokens, propose trimming it — do not drop
  facts to make it fit.

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

**Extend the tests as you go, not afterwards.** A change without a test that
would have failed before it is not finished. The discipline that has actually
caught things here is stronger than "add a test": **break the fix and watch the
test fail.** If disabling your change leaves the suite green, the test is
decoration. Say so in the commit when you have done it.

Note which layer the test belongs in — `packages/domain` for logic, `apps/web`
for anything touching the database, `e2e` for what a person does. And remember
that a fixture starting from a session row can never cover a step that only
happens on the way in; that is what `e2e/flows/08` exists for.

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
| adds or removes a screen, or rearranges one | **Product → Feature reference** |
| changes what a feature *does* (not how it looks) | **Product → Feature reference** |
| touches a pattern, split, progression rule, the strength score, or a verdict threshold | **Product → How the training model works** |
| targets a new kind of user, or drops a use case | **Product → Who it is for** |
| changes the pitch, the promises, or what gymmy refuses to be | **Product → What gymmy is** |
| adds or drops an external system | **Architecture → C1** |
| adds a container, or moves a responsibility between client and server | **Architecture → C2** |
| gives a component a new responsibility | **Architecture → C3** |
| changes one of the load-bearing shapes, or adds a new shape mistake worth recording | **Architecture → C4** |
| adds a table, or changes what a column means | **Architecture → Data model** |
| changes a route, the sync envelope, a status code, or a rate limit | [`docs/openapi.yaml`](./docs/openapi.yaml) — **not** a Confluence table; see below |
| adds an environment variable, changes hosting, or changes a CI job | **Infrastructure** |
| changes a deploy, migration or support procedure — or you hit a failure that took real work to diagnose | **Runbooks** |
| settles a question that would be a project to reverse | **Decision log** (append; never edit an entry — mark it superseded) |

Every page ends with an **"update this page when"** note. If yours is not in the
table, that note is the tiebreak. If it is genuinely neither, it probably does
not need a Confluence change — say so rather than guessing.

### The API is the one exception

[`docs/openapi.yaml`](./docs/openapi.yaml) is the contract, and it is the only
documentation in this repository a build can check. `openapi.test.ts` reads it
back and holds every row schema against the Zod schemas in `lib/sync/rows.ts`,
so a field added there and not added to the spec fails `npm test`.

**Do not re-describe endpoints, fields or status codes on Confluence.** That is
what the spec is for, and two copies means one of them is wrong. The Confluence
API page carries the things a spec cannot: why there is one endpoint rather than
a REST resource per table, and what the held-back cursor is protecting against.
It links to the YAML for everything else.

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

The same goes for text in the app itself: explanations belong behind an ⓘ,
not in paragraphs on the screen.

### Diagrams in Confluence

**The entity relationship diagrams are generated — never hand-drawn.**
`npm run er:diagram -w @athletic/web -- --macro` rewrites `docs/data-model.mmd`
from `schema.ts` and prints the macro HTML for each of the three diagrams, ready
to paste onto **Architecture → Data model**. `er-diagram.test.ts` fails when the
committed diagram and the schema disagree, so a schema change cannot ship with a
stale picture — but the test cannot paste it, so that last step is yours. Do not
edit those diagrams in Confluence: the next regeneration throws the edit away.

Everything below is for diagrams that are genuinely hand-authored.

Mermaid renders through **Macro Pack**, which is a Forge extension rather than a
classic macro — so searching the macro browser for "mermaid" finds nothing and
looks like the app is missing. It is not. Author it as HTML:

```html
<div data-type="extension"
     data-extension-key="1ef074bf-c90d-4af8-9ea9-32d2e6ae9a90/2256cafd-362d-4b27-a796-139875a465b5/static/macro-pack"
     data-extension-type="com.atlassian.ecosystem"
     data-layout="default"
     data-parameters="…">Macro Pack</div>
```

`data-parameters` is
`{"layout":"extension","guestParams":{"input":"mermaid","source":{"text":"…","type":"text"},"version":1},"forgeEnvironment":"PRODUCTION","extensionId":"ari:cloud:ecosystem::extension/<the key above>","extensionTitle":"Macro Pack"}`,
JSON-stringified and then HTML-escaped whole.

Four traps, all silent:

- **Escape it programmatically.** A bare `"` inside the mermaid source ends the
  JSON string, Confluence drops the whole attribute, and the macro saves as an
  empty box with no error. Build the JSON, escape it, and assert it decodes back
  to the same source before publishing.
- **Line breaks in node labels are `\n`, not `<br/>`.** The renderer may have
  HTML labels disabled, in which case `<br/>` appears literally.
- **Never update a page that has a diagram with `contentFormat: "markdown"`.**
  The conversion drops extension nodes without a word, so a markdown update to a
  page with two diagrams saves it with none. Read the page as `adf` first: if
  its body contains an `extension` node, update in `html` and paste the macro
  back in. Markdown is fine for a page that has no macros.
- **The native <code>language-mermaid</code> fence is not an alternative.** It
  is a documented Confluence HTML pattern and it does save, but it renders as a
  *collapsed block of mermaid source* labelled "Diagram" — not a diagram. It was
  tried and reverted.

If a published diagram stops appearing, check for a purple banner at the top of
Confluence: Macro Pack periodically needs a **site admin** to accept a
permissions update under Manage apps → Macro Pack, and until somebody does,
every diagram in the space renders as nothing. The page content is intact — it
is a rendering failure, and reading the page as `adf` will show the extension
node still there.

Mermaid has no syntax check in CI on either side, so render the source before
publishing — serve a page that loads mermaid from cdnjs and call `mermaid.parse`
on each diagram. A diagram that fails to parse is an error box in Confluence and
on GitHub alike.

## Before you say it works

`npm run format && npm run lint && npm run typecheck && npm run build && npm test`

`npm test` runs the domain, web and e2e suites. The e2e suite serves the last
**production build**, so an untested UI change will silently test the previous
one — build first, always. It also reuses anything already listening on :3000,
so stop a dev server before running it.

And the part no command checks: **is the documentation current?** Both sets.

@AGENTS.md
