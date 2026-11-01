/**
 * Regenerates `docs/data-model.mmd`, and prints the Confluence macro for it.
 *
 *   npm run er:diagram -w @athletic/web            # rewrite the committed file
 *   npm run er:diagram -w @athletic/web -- --macro # also print the macro HTML
 *
 * The `--macro` output is what goes on **Architecture → Data model**. The
 * escaping is done in `lib/db/er-diagram.ts` and asserted to round-trip, for
 * the reason CLAUDE.md gives: a bare quote inside the mermaid source ends the
 * JSON string, Confluence drops the attribute, and the macro saves as an empty
 * box with no error at all.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allDiagrams, macroFor, renderFile } from '../src/lib/db/er-diagram';

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
  console.log('\n--- Confluence macros; paste each under its heading ---');
  for (const { group, mermaid } of diagrams) {
    console.log(`\n### ${group.title}\n`);
    console.log(macroFor(mermaid));
  }
} else {
  console.log('\nRun again with --macro to print the Confluence macro HTML.');
}
