import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  GROUPS,
  LINKS,
  adfFor,
  allDiagrams,
  allTables,
  renderFile,
  sourceFromAdf,
} from './er-diagram';

/**
 * The diagram cannot silently go stale.
 *
 * `docs/openapi.yaml` is described in CLAUDE.md as the only documentation in
 * this repository a build can check, and the reason it is worth having is that
 * everything else goes wrong quietly. An entity relationship diagram drawn by
 * hand on a wiki is the purest example: correct the day it is published, wrong
 * the first time somebody adds a column, and nobody finds out for months —
 * by which point people are reading a picture of an app we no longer ship.
 *
 * So the diagram is generated from `schema.ts` and this file holds the two
 * against each other. A table added without a home in a diagram fails here,
 * which is the point: the failure arrives at the person adding the table, in
 * the same change, rather than at a reader six months later.
 */

const DOCS = join(import.meta.dirname, '..', '..', '..', '..', '..', 'docs');
const FILE = join(DOCS, 'data-model.mmd');
const FACT = join(DOCS, 'facts', 'twenty-tables.md');
const committed = readFileSync(FILE, 'utf8');

describe('the committed diagram', () => {
  it('matches what the schema says today', () => {
    /* The whole mechanism in one assertion. Break it by adding a column to
       schema.ts and not regenerating: this fails with the diff. */
    expect(committed).toBe(renderFile());
  });

  it('tells the reader not to edit it by hand', () => {
    // Without this line the first person to find it fixes it in place, and the
    // next regeneration throws their work away.
    expect(committed).toContain('Do not edit by hand');
    expect(committed).toContain('er:diagram');
  });
});

describe('every table has a home', () => {
  const placed = GROUPS.flatMap((g) => g.tables);

  it('draws every table in the schema', () => {
    /* The assertion that makes a new table impossible to forget. `goals` was
       added this month; without this, the diagram would still show nine tables
       and read as authoritative. */
    const missing = [...allTables().keys()].filter((t) => !placed.includes(t));
    expect(missing, `tables in schema.ts with no diagram: ${missing.join(', ')}`).toEqual([]);
  });

  it('draws nothing that is not in the schema', () => {
    const tables = allTables();
    const ghosts = placed.filter((t) => !tables.has(t));
    expect(ghosts, `diagram names tables that do not exist: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('holds the count the fact register gives', () => {
    /* docs/facts/twenty-tables.md says how many tables there are: all of
       them, the synced ones for a person's own training, the ones for
       trainer plans and the ones for sign-in (the user among them). Nothing
       else checks that sentence, and a count written in prose drifts: the
       header of er-diagram.ts said twenty-one when there were twenty. The
       numbers are read from the fact itself, so a new table fails here until
       the fact says so — and a fact edited to a wrong number fails too. */
    const fact = readFileSync(FACT, 'utf8');
    const said =
      /There are (\d+) tables: (\d+) synced ones for a person's own training \([^)]*\), (\d+) for trainer plans and (\d+) for sign-in\./.exec(
        fact,
      );
    expect(said, `${FACT} no longer states the counts in the shape this test reads`).not.toBeNull();
    const [all, training, plans, auth] = said!.slice(1).map(Number);

    const without = (g: string) =>
      GROUPS.find((x) => x.key === g)!.tables.filter((t) => t !== 'user').length;
    expect(
      {
        all: allTables().size,
        training: without('training'),
        plans: without('plans'),
        auth: without('auth') + 1,
      },
      'the schema and docs/facts/twenty-tables.md disagree; fix whichever is wrong',
    ).toEqual({ all, training, plans, auth });
  });

  it('puts each table in exactly one diagram, apart from the user', () => {
    // Every table on one canvas is a picture nobody reads, so they are split —
    // but a table in two diagrams is two places to keep right.
    const counts = new Map<string, number>();
    for (const t of placed) counts.set(t, (counts.get(t) ?? 0) + 1);
    const repeated = [...counts].filter(([t, n]) => n > 1 && t !== 'user').map(([t]) => t);
    expect(repeated).toEqual([]);
    expect(counts.get('user')).toBe(GROUPS.length);
  });

  it('never lists a table as both content and context', () => {
    for (const g of GROUPS) {
      for (const c of g.context ?? []) expect(g.tables).not.toContain(c);
    }
  });
});

describe('the hand-declared links', () => {
  /* The two arrows the schema cannot express — set_logs -> exercises and
     exercises -> patterns — are the most important on the page, and they are
     the ones a schema change can silently orphan. */
  it('names columns that still exist', () => {
    const tables = allTables();
    for (const link of LINKS) {
      const from = tables.get(link.from);
      expect(from, `link from a table that does not exist: ${link.from}`).toBeDefined();
      expect(tables.has(link.to), `link to a table that does not exist: ${link.to}`).toBe(true);

      const columns = getTableConfig(from!).columns.map((c) => c.name);
      expect(columns, `${link.from} has no column ${link.column}`).toContain(link.column);
    }
  });

  it('draws every link it declares', () => {
    // A link whose two ends sit in different diagrams renders nowhere, which
    // makes it dead configuration that reads as documentation.
    const all = allDiagrams()
      .map((d) => d.mermaid)
      .join('\n');
    for (const link of LINKS) {
      expect(all, `${link.from} -> ${link.to} is declared but drawn nowhere`).toContain(link.label);
    }
  });

  it('leaves the word programme to the Programmes feature', () => {
    /* program_entries is the generated week — which exercise fills which slot
       on which day — and has nothing to do with the planned Programmes
       feature, where a trainer runs somebody's training. The table name cannot
       change without a migration, but the words on the lines can, and a line
       reading "programmes" tells a reader the feature already exists. So does
       the American spelling: /program/ catches "program", "programs" and
       "programmed" as well as "programme". */
    const labels = allDiagrams().flatMap(({ mermaid }) =>
      [...mermaid.matchAll(/ : "([^"]*)"$/gm)].map((m) => m[1] ?? ''),
    );
    expect(labels.length, 'no relationship labels found; the pattern is stale').toBeGreaterThan(0);
    expect(labels.filter((l) => /program/i.test(l))).toEqual([]);
  });

  it('draws the applied plan as a snapshot, not a link', () => {
    /* Decision log D-011: applying a plan copies it, and nothing downstream
       reads the plan again. A solid line here would state the opposite of the
       decision the whole plans layer is built on. */
    const plans = allDiagrams().find((d) => d.group.key === 'plans')!.mermaid;
    expect(plans).toContain('}o..o| profiles : "applied a copy of"');
    expect(plans).not.toContain('||--o{ profiles : "applied a copy of"');
  });
});

describe('the generated mermaid', () => {
  it('gives every entity its columns, with keys marked', () => {
    const training = allDiagrams().find((d) => d.group.key === 'training')!.mermaid;
    expect(training).toContain('text user_id PK');
    expect(training).toContain('text exercise_id FK');
    // Nullability is on the column, because "which of these can be absent" is
    // the question a reader actually brings to an ER diagram.
    expect(training).toContain('timestamp deleted_at "nullable"');
  });

  it('says a profile is one per account', () => {
    const training = allDiagrams().find((d) => d.group.key === 'training')!.mermaid;
    expect(training).toContain('user ||--o| profiles');
  });

  it('is stable when schema.ts is reordered', () => {
    // Relationships are sorted, so moving a table in the schema file is not a
    // diff in the diagram — otherwise the check becomes noise and gets ignored.
    for (const { group, mermaid } of allDiagrams()) {
      const rels = mermaid.split('\n').filter((l) => l.includes('--') || l.includes('..'));
      expect([...rels], `${group.key} relationships are not sorted`).toEqual([...rels].sort());
    }
  });
});

describe('the Confluence node', () => {
  /* CLAUDE.md, "Diagrams in Confluence": a page that holds a diagram is changed
     in ADF only, so each diagram is published as an ADF extension node. The
     mermaid source rides inside it as a JSON string, where a quote, a backslash
     or a line break handled wrongly breaks the node or quietly changes the
     diagram, so the source has to come back out exactly as it went in. */
  it('gives back a source full of quotes, backslashes, &<> and line breaks', () => {
    const nasty =
      'erDiagram\n  a ||--o{ b : "he said \\"hi\\" & <left>"\n' +
      '  %% C:\\new\\table, a \\n typed by hand, a tab\there, </div>\r\n';
    expect(sourceFromAdf(adfFor(nasty))).toBe(nasty);
  });

  it('round-trips every diagram we actually publish', () => {
    for (const { mermaid } of allDiagrams()) {
      expect(sourceFromAdf(adfFor(mermaid))).toBe(mermaid);
    }
  });

  it('is the node Confluence holds, apart from the source', () => {
    /* Copied from the three diagrams on Architecture → Data model (page
       934445138, version 18), read on 01/11/2026 through the Atlassian
       connector, whose HTML gives each ADF attribute one for one:
       data-extension-type is extensionType, data-parameters is parameters, and
       the label "Macro Pack" is text. All three have this shape. Only localId
       is left out, because Confluence gives every placed node its own. The
       whole key matters: one wrong character saves a node for an app that is
       not installed, and it renders nothing. */
    const KEY =
      '1ef074bf-c90d-4af8-9ea9-32d2e6ae9a90/2256cafd-362d-4b27-a796-139875a465b5/static/macro-pack';
    const published = (text: string) => ({
      type: 'extension',
      attrs: {
        extensionType: 'com.atlassian.ecosystem',
        extensionKey: KEY,
        parameters: {
          layout: 'extension',
          guestParams: { input: 'mermaid', source: { text, type: 'text' }, version: 1 },
          forgeEnvironment: 'PRODUCTION',
          extensionId: `ari:cloud:ecosystem::extension/${KEY}`,
          extensionTitle: 'Macro Pack',
        },
        layout: 'default',
        text: 'Macro Pack',
      },
    });

    for (const { mermaid } of allDiagrams()) {
      expect(JSON.parse(adfFor(mermaid))).toStrictEqual(published(mermaid));
    }
  });
});
