import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import yaml from 'js-yaml';
import { z } from 'zod';
import { TABLES } from '@athletic/domain';
import { groupInput, memberInput, planInput, shareInput } from '@/lib/api/plans';
import { rowSchemas } from './rows';
import { SYNC_LIMIT, pushRequest } from './protocol';

/* `lib/api/plans` keeps the plans API's body schemas beside its route guard,
   and the guard imports the Auth.js setup — which cannot load outside Next.
   Only the schemas are read here, so the session is stubbed out. */
vi.mock('@/lib/auth', () => ({ auth: async () => null }));

/**
 * The API documentation, checked rather than trusted.
 *
 * `docs/openapi.yaml` replaced a set of hand-maintained Confluence tables, and
 * it would rot exactly as they did — nothing in a build notices a document, and
 * nobody notices a wrong one for months. So the spec is read back here and held
 * against the Zod schemas the server actually validates with. Add a field to
 * `rows.ts` and forget the spec and this fails; that is the entire point of
 * having moved the documentation into the repository.
 *
 * It deliberately compares **names and structure, not types**. A JSON Schema
 * and a Zod schema disagree about how to spell a nullable integer in several
 * defensible ways, and a test that insisted on one would be a test of the
 * translation rather than of the contract. What actually goes stale is a field
 * appearing, disappearing, being renamed, or changing whether a client has to
 * send it.
 */

const spec = yaml.load(
  readFileSync(join(import.meta.dirname, '../../../../../docs/openapi.yaml'), 'utf8'),
) as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, Record<string, unknown>> };
};

const schemas = spec.components.schemas;

/** Which documented schema describes which synced table. */
const SCHEMA_FOR: Record<(typeof TABLES)[number], string> = {
  patterns: 'Pattern',
  exercises: 'Exercise',
  slots: 'Slot',
  splitPeriods: 'SplitPeriod',
  entries: 'ProgramEntry',
  logs: 'SetLog',
  bodyLogs: 'BodyLog',
  goals: 'Goal',
  profile: 'Profile',
};

/** Collects `pick` over every part of an `allOf` composition, following refs. */
function collect(name: string, pick: (part: Record<string, unknown>) => string[]): string[] {
  const node = schemas[name];
  if (!node) throw new Error(`${name} is not in the spec`);
  const parts = (node.allOf as Record<string, unknown>[] | undefined) ?? [node];
  const out = new Set<string>();
  for (const part of parts) {
    const ref = part.$ref as string | undefined;
    if (ref) {
      for (const k of collect(ref.replace('#/components/schemas/', ''), pick)) out.add(k);
      continue;
    }
    for (const k of pick(part)) out.add(k);
  }
  return [...out].sort();
}

/** Every property an `allOf` composition ends up with, `Synced` included. */
const documentedProps = (name: string): string[] =>
  collect(name, (part) => Object.keys((part.properties as object | undefined) ?? {}));

/** Every property the composition says a client must send. */
const documentedRequired = (name: string): string[] =>
  collect(name, (part) => (part.required as string[] | undefined) ?? []);

describe('docs/openapi.yaml', () => {
  it('documents every synced table', () => {
    expect(Object.keys(SCHEMA_FOR).sort()).toEqual([...TABLES].sort());
    expect((schemas.TableName!.enum as string[]).slice().sort()).toEqual([...TABLES].sort());
  });

  for (const table of TABLES) {
    it(`describes exactly the fields the server accepts for ${table}`, () => {
      const zod = rowSchemas[table] as z.ZodObject<z.ZodRawShape>;
      expect(documentedProps(SCHEMA_FOR[table])).toEqual(Object.keys(zod.shape).sort());

      /* And which of them a client has to send — the half a names-only check
         misses. A default dropped here makes a field every older phone's push
         is refused over, while the spec goes on calling it optional. Read off
         the schema itself: whatever parses when absent is optional. */
      const shape = zod.shape as Record<string, z.ZodType>;
      const required = Object.keys(shape)
        .filter((k) => !shape[k]!.safeParse(undefined).success)
        .sort();
      expect(documentedRequired(SCHEMA_FOR[table])).toEqual(required);
    });
  }

  it('describes exactly the fields the plans API accepts', () => {
    /* The synced rows are not the only bodies a client sends. A trainer's plan,
       a share, a member and a group are validated by `lib/api/plans.ts`, and a
       field added there and not here is one no client author knows exists. */
    expect(documentedProps('PlanInput')).toEqual(Object.keys(planInput.shape).sort());
    expect(documentedProps('PlanSlot')).toEqual(
      Object.keys(planInput.shape.slots.element.shape).sort(),
    );

    type Operation = {
      requestBody: { content: Record<string, { schema: { properties: object } }> };
    };
    const bodyOf = (path: string, method: string) =>
      Object.keys(
        (spec.paths[path] as Record<string, Operation>)[method]!.requestBody.content[
          'application/json'
        ]!.schema.properties,
      ).sort();
    expect(bodyOf('/api/plans/{id}/shares', 'post')).toEqual(Object.keys(shareInput.shape).sort());
    expect(bodyOf('/api/groups/{id}/members', 'post')).toEqual(
      Object.keys(memberInput.shape).sort(),
    );
    expect(bodyOf('/api/groups', 'post')).toEqual(Object.keys(groupInput.shape).sort());
    expect(bodyOf('/api/groups/{id}', 'put')).toEqual(Object.keys(groupInput.shape).sort());
  });

  it('states the real push batch limit', () => {
    /* Held against the server's own envelope rather than a constant: a client
       written from the spec that sends the documented number must be taken,
       and one more must be refused. This used to compare the push cap with the
       pull page size — a different number that happens to be 500 too — and the
       real cap in `protocol.ts` was compared with nothing. */
    const { mutations } = schemas.PushRequest!.properties as { mutations: { maxItems: number } };
    const m = { table: 'logs', op: 'put', row: {} };
    const batch = (n: number) => pushRequest.safeParse({ mutations: Array(n).fill(m) }).success;
    expect(batch(mutations.maxItems)).toBe(true);
    expect(batch(mutations.maxItems + 1)).toBe(false);
  });

  it('states the real pull page size', () => {
    // The one number a client has to agree with us about: get it wrong in the
    // docs and somebody writes a client that stops paging one row early.
    const sync = spec.paths['/api/sync'] as { post: { description: string } };
    expect(sync.post.description).toMatch(new RegExp(`at ${SYNC_LIMIT} rows each`));
  });

  it('documents every route that exists', () => {
    /* Read off the file tree rather than a list somebody has to remember to
       extend. The previous version named two routes by hand, which is precisely
       the shape of documentation that goes stale — seven route files were added
       in one afternoon and it would have gone on passing.

       Auth.js's catch-all is skipped: it is one file serving a dozen endpoints,
       and the spec lists the ones that matter individually.

       Method by method, not just path by path: a PATCH added to a documented
       route is as undocumented as a new route, and a path-only check passed
       it. */
    const api = join(import.meta.dirname, '../../app/api');
    const found: [path: string, methods: string[]][] = [];

    const walk = (dir: string, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const at = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(at, `${prefix}/${entry.name}`);
        } else if (entry.name === 'route.ts' && !prefix.includes('[...')) {
          const methods = [
            ...readFileSync(at, 'utf8').matchAll(
              /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
            ),
          ]
            .map((m) => m[1]!.toLowerCase())
            .sort();
          // Next spells a dynamic segment `[id]`; OpenAPI spells it `{id}`.
          found.push([`/api${prefix}`.replace(/\[(\w+)\]/g, '{$1}'), methods]);
        }
      }
    };
    walk(api, '');

    expect(found.length).toBeGreaterThan(5);
    for (const [path, methods] of found) {
      expect(Object.keys(spec.paths)).toContain(path);
      expect(Object.keys(spec.paths[path] as object).sort(), path).toEqual(methods);
    }
  });
});
