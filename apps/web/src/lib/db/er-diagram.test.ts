import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  GROUPS,
  LINKS,
  allDiagrams,
  allTables,
  macroFor,
  renderFile,
  sourceFromMacro,
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

const FILE = join(import.meta.dirname, '..', '..', '..', '..', '..', 'docs', 'data-model.mmd');
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
    /* docs/facts/twenty-tables.md: 20 tables — 9 synced ones for a person's
       own training, 6 for trainer plans and 5 for sign-in (the user among
       them). Nothing else checks that sentence, and a count written in prose
       drifts: the header of er-diagram.ts said twenty-one when there were
       twenty. A new table fails here until the fact says so. */
    const without = (g: string) =>
      GROUPS.find((x) => x.key === g)!.tables.filter((t) => t !== 'user').length;
    const counts = {
      all: allTables().size,
      training: without('training'),
      plans: without('plans'),
      auth: without('auth') + 1,
    };
    expect(counts, 'update docs/facts/twenty-tables.md, then this count').toEqual({
      all: 20,
      training: 9,
      plans: 6,
      auth: 5,
    });
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
       reading "programmes" tells a reader the feature already exists. */
    const labels = allDiagrams().flatMap(({ mermaid }) =>
      [...mermaid.matchAll(/ : "([^"]*)"$/gm)].map((m) => m[1] ?? ''),
    );
    expect(labels.length, 'no relationship labels found; the pattern is stale').toBeGreaterThan(0);
    expect(labels.filter((l) => /programme/i.test(l))).toEqual([]);
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

describe('the Confluence macro', () => {
  /* CLAUDE.md: a bare quote inside the mermaid source ends the JSON string,
     Confluence drops the whole attribute, and the macro saves as an empty box
     with no error anywhere. That failure is invisible, so it is tested. */
  it('survives quotes, angle brackets and ampersands', () => {
    const nasty = 'erDiagram\n  a ||--o{ b : "he said \\"hi\\" & <left>"';
    expect(sourceFromMacro(macroFor(nasty))).toBe(nasty);
  });

  it('round-trips every diagram we actually publish', () => {
    for (const { mermaid } of allDiagrams()) {
      expect(sourceFromMacro(macroFor(mermaid))).toBe(mermaid);
    }
  });

  it('leaves no raw quote inside the attribute', () => {
    /* The specific failure: an unescaped " terminates data-parameters early and
       Confluence silently discards everything after it. Stated over the whole
       element — the first quote after the attribute opens has to be the one
       that closes it, right before the element ends. Capturing the attribute
       with [^"]* first and then looking inside it for a quote could never
       fail: the capture stops at the first quote by construction. */
    for (const { mermaid } of allDiagrams()) {
      expect(macroFor(mermaid)).toMatch(/ data-parameters="[^"]*">Macro Pack<\/div>$/);
    }
  });

  it('carries the Macro Pack extension key, not a classic macro', () => {
    // Searching the macro browser for "mermaid" finds nothing; it is a Forge
    // extension, and authoring it any other way saves a collapsed code block.
    // The whole key, as CLAUDE.md records it: one wrong digit in the app id
    // saves a macro for an app that is not installed, and renders nothing.
    expect(macroFor('erDiagram')).toContain('data-extension-type="com.atlassian.ecosystem"');
    expect(macroFor('erDiagram')).toContain(
      'data-extension-key="1ef074bf-c90d-4af8-9ea9-32d2e6ae9a90/2256cafd-362d-4b27-a796-139875a465b5/static/macro-pack"',
    );
  });
});
