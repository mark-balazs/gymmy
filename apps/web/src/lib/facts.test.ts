import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { en } from '@/lib/i18n/locales/en';

/**
 * The fact register holds together.
 *
 * `docs/facts/` is the one list of what is true about gymmy, and every fact
 * says where else it is stated — doc sections, copy keys, tests, Confluence
 * pages — so that changing a fact means visiting each of those places. That
 * only works while the pointers point at something. A heading renamed, a copy
 * key deleted, a test file moved, and the fact quietly stops leading anywhere:
 * the next person changes the fact and misses the place that still says the
 * old thing.
 *
 * This cannot check that a sentence is TRUE — that is a question for the owner
 * whenever the register and the code disagree. It checks that the register is
 * well-formed and that every pointer resolves.
 */

const ROOT = join(import.meta.dirname, '../../../..');
const DIR = join(ROOT, 'docs/facts');

type Fact = {
  file: string;
  id: string;
  status: string;
  decided: unknown;
  supersedes: string[];
  supersededBy: string[];
  appears: { repo: string[]; copy: string[]; tests: string[]; confluence: string[] };
};

const list = (v: unknown): string[] =>
  v == null || v === '' ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const facts: Fact[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((file) => {
    const text = readFileSync(join(DIR, file), 'utf8');
    const head = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    if (!head) throw new Error(`${file}: no front matter`);
    const m = yaml.load(head[1]) as Record<string, unknown>;
    const a = (m.appears ?? {}) as Record<string, unknown>;
    return {
      file,
      id: String(m.id),
      status: String(m.status),
      decided: m.decided,
      supersedes: list(m.supersedes),
      supersededBy: list(m.superseded_by),
      appears: {
        repo: list(a.repo),
        copy: list(a.copy),
        tests: list(a.tests),
        confluence: list(a.confluence),
      },
    };
  });

const byId = new Map(facts.map((f) => [f.id, f]));

/** GitHub's heading anchors: lower case, punctuation gone, each space a hyphen, repeats numbered. */
function anchorsOf(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const h = !fenced && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const base = h[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

/** A JSON pointer (`#/paths/~1api~1sync`) into a YAML file. */
function resolvesInYaml(file: string, pointer: string): boolean {
  let node: unknown = yaml.load(readFileSync(join(ROOT, file), 'utf8'));
  for (const raw of pointer.replace(/^\//, '').split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object' || !(key in node)) return false;
    node = (node as Record<string, unknown>)[key];
  }
  return true;
}

function resolves(pointer: string): boolean {
  const [path, anchor] = pointer.split('#', 2);
  if (!existsSync(join(ROOT, path))) return false;
  if (anchor === undefined) return true;
  if (/\.ya?ml$/.test(path)) return resolvesInYaml(path, anchor);
  if (path.endsWith('.md')) return anchorsOf(readFileSync(join(ROOT, path), 'utf8')).has(anchor);
  return false;
}

describe('the fact register', () => {
  it('has facts to check', () => {
    // A broken glob or a moved folder would otherwise make every test below
    // pass over nothing.
    expect(facts.length).toBeGreaterThan(50);
  });

  it('names every file after its id, with a status and where it was decided', () => {
    const bad = facts.flatMap((f) => [
      ...(f.file === `${f.id}.md` ? [] : [`${f.file}: id is ${f.id}`]),
      ...(['current', 'planned', 'superseded'].includes(f.status)
        ? []
        : [`${f.file}: status ${f.status}`]),
      ...(list(f.decided).join('').trim() ? [] : [`${f.file}: no decided`]),
    ]);
    expect(bad).toEqual([]);
  });

  it('links a superseded fact to what replaced it, both ways', () => {
    /* The old fact stays so the reasoning survives; a reader landing on it
       has to be able to find what is true now, and the new one has to say
       what it replaced. */
    const bad = facts.flatMap((f) => {
      const out: string[] = [];
      if (f.status === 'superseded' && f.supersededBy.length === 0)
        out.push(`${f.id}: superseded by nothing`);
      for (const next of f.supersededBy) {
        const n = byId.get(next);
        if (!n) out.push(`${f.id}: superseded_by ${next}, which does not exist`);
        else if (!n.supersedes.includes(f.id))
          out.push(`${next}: does not say it supersedes ${f.id}`);
      }
      for (const old of f.supersedes) {
        const o = byId.get(old);
        if (!o) out.push(`${f.id}: supersedes ${old}, which does not exist`);
        else if (!o.supersededBy.includes(f.id))
          out.push(`${old}: does not say it was superseded by ${f.id}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  it('points only at doc sections, files and places in the spec that exist', () => {
    const bad = facts.flatMap((f) =>
      [...f.appears.repo, ...f.appears.tests]
        .filter((p) => !resolves(p))
        .map((p) => `${f.id}: ${p}`),
    );
    expect(bad).toEqual([]);
  });

  it('points only at copy keys that exist', () => {
    const bad = facts.flatMap((f) =>
      f.appears.copy.filter((k) => !(k in en)).map((k) => `${f.id}: ${k}`),
    );
    expect(bad).toEqual([]);
  });

  it('points at Confluence by page id', () => {
    // Pages are renamed freely; their ids never change. A title here would go
    // stale the first time somebody tidied a heading.
    const bad = facts.flatMap((f) =>
      f.appears.confluence.filter((p) => !/^\d{6,}$/.test(p)).map((p) => `${f.id}: ${p}`),
    );
    expect(bad).toEqual([]);
  });

  it('indexes every fact, and nothing that is not one', () => {
    /* The index is what an AI session actually loads. A fact missing from it
       is a fact nobody starts from. */
    const index = readFileSync(join(DIR, 'README.md'), 'utf8');
    const linked = new Set([...index.matchAll(/\]\(([^)#\s]+)\.md\)/g)].map((m) => m[1]));
    expect(facts.filter((f) => !linked.has(f.id)).map((f) => f.id)).toEqual([]);
    expect([...linked].filter((id) => !byId.has(id))).toEqual([]);
  });
});

describe('anchorsOf', () => {
  it('slugs headings the way GitHub links them', () => {
    const a = anchorsOf(
      '# Deleting an account\n## `ref_sets` — retired\n```\n# not a heading\n```\n## Deleting an account\n',
    );
    expect([...a]).toEqual(['deleting-an-account', 'ref_sets--retired', 'deleting-an-account-1']);
  });
});
