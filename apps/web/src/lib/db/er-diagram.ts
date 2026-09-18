/**
 * The entity relationship diagram, derived from the schema rather than drawn.
 *
 * A hand-drawn ER diagram on a wiki is the most reliably wrong artefact in any
 * project: it is correct on the day it is published and nobody notices the day
 * it stops being. The API contract already has the answer to this — the spec is
 * in the repository and a test holds it against the code — so the diagram gets
 * the same treatment. **The mermaid source is generated from `schema.ts`, and
 * `er-diagram.test.ts` fails when the committed diagram and the schema
 * disagree.** Publishing to Confluence is then a copy, not an authoring step.
 *
 * Two things cannot be derived and are declared here instead:
 *
 *  - **The logical links.** `set_logs.exercise_id` and `exercises.pattern_id`
 *    are plain text columns with no foreign key, because every synced table is
 *    keyed on `(user_id, id)` and a composite FK per relationship would buy
 *    nothing a local-first client can rely on anyway. They are the two most
 *    important arrows on the diagram, so they are written down in `LINKS` and
 *    the test checks that both ends still exist.
 *  - **Which diagram a table belongs to.** Twenty-one entities with their
 *    columns on one canvas is a picture nobody reads. They are split the way
 *    `docs/data.md` already splits them in prose, and a table in no group fails
 *    the test — which is what makes a new table impossible to forget.
 */

import { getTableName, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/* ------------------------------------------------------------- the model */

/** Every `pgTable` in the schema, by its SQL name. */
export function allTables(): Map<string, PgTable> {
  const out = new Map<string, PgTable>();
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) out.set(getTableName(value), value);
  }
  return out;
}

export interface Group {
  key: string;
  title: string;
  /** What this diagram is for, in one sentence, shown above it. */
  blurb: string;
  tables: string[];
  /**
   * Entities drawn as bare boxes so a relationship that crosses into another
   * diagram still has somewhere to land. Their columns belong to the diagram
   * that owns them; repeating them here would be two places to read.
   */
  context?: string[];
}

/**
 * The three pictures, and every table is in exactly one.
 *
 * `user` appears in all three because it is what the other two are hung from;
 * the test allows that one repetition and no other.
 */
export const GROUPS: Group[] = [
  {
    key: 'training',
    title: 'A person’s own training',
    blurb:
      'The replicated set: every row belongs to exactly one account, cascades from it, and is held in full on the device. The exercise library is the catalogue in code, not a table: exercises holds only pre-catalogue rows, read as aliases, so the lines into it are dotted.',
    tables: [
      'user',
      'patterns',
      'exercises',
      'slots',
      'split_periods',
      'program_entries',
      'set_logs',
      'ref_sets',
      'body_logs',
      'goals',
      'profiles',
    ],
  },
  {
    key: 'plans',
    title: 'Plans and sharing',
    blurb:
      'Deliberately outside the replicated set — the only rows in the system written by one person and read by another.',
    tables: [
      'user',
      'plans',
      'plan_slots',
      'user_groups',
      'group_members',
      'plan_shares',
      'plan_events',
    ],
    // The one arrow that crosses between the two halves of the system, and the
    // one the decision log is most emphatic about: a profile records which plan
    // it applied a *copy* of.
    context: ['profiles'],
  },
  {
    key: 'auth',
    title: 'Authentication',
    blurb:
      'Auth.js tables plus the sign-in throttle. A session is a row, which is what makes revocation a delete.',
    tables: ['user', 'account', 'session', 'verificationToken', 'sign_in_attempts'],
  },
];

/** `user` is the spine of all three pictures; nothing else may be repeated. */
const SHARED = 'user';

/** One row per account. Drawn `||--o|`, because that is the whole reason every
 *  other screen may assume a profile exists. */
const ONE_TO_ONE = new Set(['profiles']);

export interface Link {
  from: string;
  column: string;
  to: string;
  label: string;
  /**
   * A dotted line. Used for a reference that is deliberately **not** a link —
   * `profiles.plan_id` records which plan was applied so a newer edition can be
   * offered, and nothing downstream reads the plan again (Decision log D-011).
   * Drawing it solid would state the opposite of the decision.
   */
  snapshot?: boolean;
}

/**
 * Relationships the schema cannot declare, because the target is keyed on
 * `(user_id, id)` and the referencing column carries only the id half.
 *
 * The four `exercise_id` lines are dotted. Since the library moved into code,
 * that column usually holds a catalogue id — `ex-barbell-back-squat` — which is
 * no row in any table; only an account's pre-catalogue sets point at an
 * `exercises` row, and `index()` reads even those as the catalogue's. A solid
 * line would say every set joins to a row, which is now the exception.
 */
export const LINKS: Link[] = [
  { from: 'exercises', column: 'pattern_id', to: 'patterns', label: 'is classified by' },
  { from: 'program_entries', column: 'slot_id', to: 'slots', label: 'fills' },
  {
    from: 'program_entries',
    column: 'exercise_id',
    to: 'exercises',
    label: 'programmes',
    snapshot: true,
  },
  { from: 'set_logs', column: 'exercise_id', to: 'exercises', label: 'records', snapshot: true },
  { from: 'ref_sets', column: 'exercise_id', to: 'exercises', label: 'records', snapshot: true },
  { from: 'goals', column: 'exercise_id', to: 'exercises', label: 'is set on', snapshot: true },
  {
    from: 'profiles',
    column: 'plan_id',
    to: 'plans',
    label: 'applied a copy of',
    snapshot: true,
  },
];

/* ------------------------------------------------------------- rendering */

/** Mermaid will not take a dotted identifier, and our names have none. */
const entity = (name: string): string => name;

/**
 * A column's type, shortened.
 *
 * Mermaid wants a bare word, and `PgDoublePrecision` on twenty rows is noise
 * standing where the column name should be read.
 */
const typeOf = (columnType: string): string =>
  ({
    PgText: 'text',
    PgInteger: 'int',
    PgBigInt53: 'bigint',
    PgBoolean: 'bool',
    PgDoublePrecision: 'float',
    PgTimestamp: 'timestamp',
    PgJsonb: 'jsonb',
  })[columnType] ?? columnType.replace(/^Pg/, '').toLowerCase();

interface Attr {
  type: string;
  name: string;
  key: '' | 'PK' | 'FK';
  comment: string;
}

function attributesOf(table: PgTable): Attr[] {
  const config = getTableConfig(table);
  const pk = new Set<string>([
    ...config.primaryKeys.flatMap((p) => p.columns.map((c) => c.name)),
    ...config.columns.filter((c) => c.primary).map((c) => c.name),
  ]);
  const fk = new Set<string>(
    config.foreignKeys.flatMap((f) => f.reference().columns.map((c) => c.name)),
  );
  const linked = new Set<string>(LINKS.filter((l) => l.from === config.name).map((l) => l.column));

  return config.columns.map((c) => ({
    type: typeOf(c.columnType),
    name: c.name,
    key: pk.has(c.name) ? 'PK' : fk.has(c.name) || linked.has(c.name) ? 'FK' : '',
    comment: c.notNull ? '' : 'nullable',
  }));
}

/**
 * The mermaid source for one group.
 *
 * Relationships are emitted only when both ends are in the group, so the
 * "Plans and sharing" picture does not sprout an orphan `exercises` box.
 */
export function mermaidFor(group: Group): string {
  const tables = allTables();
  const context = group.context ?? [];
  const inGroup = new Set([...group.tables, ...context]);
  const lines: string[] = ['erDiagram'];

  for (const name of group.tables) {
    const table = tables.get(name);
    if (!table)
      throw new Error(`er-diagram: ${group.key} names a table that does not exist: ${name}`);
    lines.push(`  ${entity(name)} {`);
    for (const a of attributesOf(table)) {
      const key = a.key ? ` ${a.key}` : '';
      const comment = a.comment ? ` "${a.comment}"` : '';
      lines.push(`    ${a.type} ${a.name}${key}${comment}`);
    }
    lines.push('  }');
  }

  // Context entities get a bare box. Their columns are listed in the diagram
  // that owns them, and repeating them here would be two places to read.
  for (const name of context) {
    if (!tables.has(name)) {
      throw new Error(`er-diagram: ${group.key} names context ${name}, which does not exist`);
    }
    lines.push(`  ${entity(name)} {`, '  }');
  }

  const rels: string[] = [];
  for (const name of group.tables) {
    const table = tables.get(name)!;
    const config = getTableConfig(table);
    for (const f of config.foreignKeys) {
      const ref = f.reference();
      const target = getTableName(ref.foreignTable);
      if (!inGroup.has(target) || target === name) continue;
      // A cascade is the fact worth putting on the line: it is why erasing an
      // account is a single statement.
      const how =
        f.onDelete === 'cascade'
          ? 'owns'
          : f.onDelete === 'set null'
            ? 'is named by'
            : 'references';
      rels.push(
        `  ${entity(target)} ${ONE_TO_ONE.has(name) ? '||--o|' : '||--o{'} ${entity(name)} : "${how}"`,
      );
    }
  }
  for (const l of LINKS) {
    if (!inGroup.has(l.from) || !inGroup.has(l.to)) continue;
    const arrow = l.snapshot ? '}o..o|' : '||--o{';
    rels.push(`  ${entity(l.to)} ${arrow} ${entity(l.from)} : "${l.label}"`);
  }

  // Deduplicated and sorted, so a reordering of schema.ts is not a diff.
  lines.push('', ...[...new Set(rels)].sort());
  return lines.join('\n');
}

/** Every diagram, in the order they are published. */
export function allDiagrams(): { group: Group; mermaid: string }[] {
  return GROUPS.map((group) => ({ group, mermaid: mermaidFor(group) }));
}

/**
 * The whole file as it is committed to `docs/data-model.mmd`.
 *
 * One file rather than three, so the test is a single comparison and a reviewer
 * sees every diagram that moved in one hunk.
 */
export function renderFile(): string {
  const header = [
    '# Generated by `npm run er:diagram -w @athletic/web`. Do not edit by hand.',
    '#',
    '# The source of truth is apps/web/src/lib/db/schema.ts. `er-diagram.test.ts`',
    '# fails when this file and the schema disagree, so a new table cannot ship',
    '# without appearing here — and Confluence is published from this file.',
    '',
  ];
  const blocks = allDiagrams().map(
    ({ group, mermaid }) => `## ${group.key} — ${group.title}\n# ${group.blurb}\n\n${mermaid}\n`,
  );
  return `${header.join('\n')}\n${blocks.join('\n')}`;
}

export { SHARED };

/* ------------------------------------------------------------ publishing */

const MACRO_PACK =
  '1ef074bf-c90d-4af8-9ea9-32d2e6ae9a90/2256cafd-362d-4b27-a796-139875a465b5/static/macro-pack';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const unescapeHtml = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * One Macro Pack mermaid node as Confluence HTML.
 *
 * Built here, never by hand, and never by a shell heredoc. A bare quote inside
 * the mermaid source ends the JSON string, Confluence drops the whole attribute
 * and the macro saves as an empty box **with no error anywhere** — so the
 * round trip is asserted before the string is returned, and `er-diagram.test.ts`
 * asserts it again against a source full of quotes and angle brackets.
 */
export function macroFor(source: string): string {
  const parameters = {
    layout: 'extension',
    guestParams: { input: 'mermaid', source: { text: source, type: 'text' }, version: 1 },
    forgeEnvironment: 'PRODUCTION',
    extensionId: `ari:cloud:ecosystem::extension/${MACRO_PACK}`,
    extensionTitle: 'Macro Pack',
  };
  const attr = escapeHtml(JSON.stringify(parameters));

  const back = JSON.parse(unescapeHtml(attr)) as typeof parameters;
  if (back.guestParams.source.text !== source) {
    throw new Error('the escaped macro does not decode back to the same mermaid source');
  }

  return (
    `<div data-type="extension" data-extension-key="${MACRO_PACK}" ` +
    `data-extension-type="com.atlassian.ecosystem" data-layout="default" ` +
    `data-parameters="${attr}">Macro Pack</div>`
  );
}

/** Reads the mermaid source back out of a macro node, for a test to check. */
export function sourceFromMacro(html: string): string {
  const attr = html.match(/data-parameters="([^"]*)"/)?.[1];
  if (!attr) throw new Error('no data-parameters on that macro');
  return JSON.parse(unescapeHtml(attr)).guestParams.source.text as string;
}
