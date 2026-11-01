/**
 * Regenerates `docs/data-model.mmd`, and prints each diagram's Confluence node.
 *
 *   npm run er:diagram -w @athletic/web            # rewrite the committed file
 *   npm run er:diagram -w @athletic/web -- --macro # also print the ADF nodes
 *
 * The `--macro` output is what goes on **Architecture → Data model**: one ADF
 * extension node per diagram, each taking the place of the diagram under its
 * heading by a node edit, never by rewriting the page (CLAUDE.md, "Diagrams in
 * Confluence"). The node is built in `lib/db/er-diagram.ts` and asserted to
 * read back to the same mermaid source, because a quote, a backslash or a line
 * break handled by hand breaks the JSON or quietly changes the diagram.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adfFor, allDiagrams, renderFile } from '../src/lib/db/er-diagram';

const here = dirname(fileURLToPath(import.meta.url));
const DIAGRAM_FILE = join(here, '..', '..', '..', 'docs', 'data-model.mmd');

const next = renderFile();
const current = (() => {
  try {
    return readFileSync(DIAGRAM_FILE, 'utf8');
  } catch {
    return null;
  }
})();

if (current === next) {
  console.log('docs/data-model.mmd is already current.');
} else {
  writeFileSync(DIAGRAM_FILE, next);
  console.log(current === null ? 'Wrote docs/data-model.mmd.' : 'Updated docs/data-model.mmd.');
}

const diagrams = allDiagrams();
console.log(`\n${diagrams.length} diagrams:`);
for (const { group, mermaid } of diagrams) {
  const entities = mermaid.split('\n').filter((l) => l.endsWith(' {')).length;
  const rels = mermaid.split('\n').filter((l) => l.includes('--') || l.includes('..')).length;
  console.log(
    `  ${group.key.padEnd(9)} ${String(entities).padStart(2)} entities, ${rels} relationships`,
  );
}

if (process.argv.includes('--macro')) {
  console.log('\n--- ADF nodes; each replaces the diagram node under its heading ---');
  for (const { group, mermaid } of diagrams) {
    console.log(`\n### ${group.title}\n`);
    console.log(adfFor(mermaid));
  }
} else {
  console.log('\nRun again with --macro to print each diagram as its Confluence ADF node.');
}
