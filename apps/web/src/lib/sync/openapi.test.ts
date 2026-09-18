import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { z } from 'zod';
import { TABLES } from '@athletic/domain';
import { rowSchemas } from './rows';
import { SYNC_LIMIT } from './protocol';

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
 * appearing, disappearing, or being renamed.
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

/** Every property an `allOf` composition ends up with, `Synced` included. */
function documentedProps(name: string): string[] {
  const node = schemas[name];
  if (!node) throw new Error(`${name} is not in the spec`);
  const parts = (node.allOf as Record<string, unknown>[] | undefined) ?? [node];
  const out = new Set<string>();
  for (const part of parts) {
    const ref = part.$ref as string | undefined;
    if (ref) {
      for (const k of documentedProps(ref.replace('#/components/schemas/', ''))) out.add(k);
      continue;
    }
    for (const k of Object.keys((part.properties as object | undefined) ?? {})) out.add(k);
  }
  return [...out].sort();
}

describe('docs/openapi.yaml', () => {
  it('documents every synced table', () => {
    expect(Object.keys(SCHEMA_FOR).sort()).toEqual([...TABLES].sort());
    expect((schemas.TableName!.enum as string[]).slice().sort()).toEqual([...TABLES].sort());
  });

  for (const table of TABLES) {
    it(`describes exactly the fields the server accepts for ${table}`, () => {
      const zod = rowSchemas[table] as z.ZodObject<z.ZodRawShape>;
      expect(documentedProps(SCHEMA_FOR[table])).toEqual(Object.keys(zod.shape).sort());
    });
  }

  it('states the real page size', () => {
    // The one number a client has to agree with us about: get it wrong in the
    // docs and somebody writes a client that stops paging one row early.
    const mutations = schemas.PushRequest!.properties as { mutations: { maxItems: number } };
    expect(mutations.mutations.maxItems).toBe(SYNC_LIMIT);
  });

  it('documents every route that exists', () => {
    /* Read off the file tree rather than a list somebody has to remember to
       extend. The previous version named two routes by hand, which is precisely
       the shape of documentation that goes stale — seven route files were added
       in one afternoon and it would have gone on passing.

       Auth.js's catch-all is skipped: it is one file serving a dozen endpoints,
       and the spec lists the ones that matter individually. */
    const api = join(import.meta.dirname, '../../app/api');
    const found: string[] = [];

    const walk = (dir: string, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const at = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(at, `${prefix}/${entry.name}`);
        } else if (entry.name === 'route.ts' && !prefix.includes('[...')) {
          // Next spells a dynamic segment `[id]`; OpenAPI spells it `{id}`.
          found.push(`/api${prefix}`.replace(/\[(\w+)\]/g, '{$1}'));
        }
      }
    };
    walk(api, '');

    expect(found.length).toBeGreaterThan(5);
    for (const path of found) {
      expect(Object.keys(spec.paths)).toContain(path);
    }
  });
});
