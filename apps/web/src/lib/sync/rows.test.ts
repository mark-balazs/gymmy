import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_PREFS, TABLES } from '@athletic/domain';
import { SYNC_TABLES } from '@/lib/db/schema';
import { rowSchemas, type TableKey } from './rows';

/**
 * The profile row as clients of different ages send it.
 *
 * A phone runs whatever build it last loaded, so the server hears from clients
 * that predate a column for as long as somebody leaves the app open. One push
 * with a refused row is refused whole — and the same queue is sent again next
 * time — so a column added without a default here stops those phones syncing
 * anything at all, sets included.
 */
describe('rowSchemas.profile', () => {
  const profile = {
    id: 'user-1',
    updatedAt: '2026-09-18T08:00:00.000Z',
    deletedAt: null,
    onboarded: true,
    split: 'sevenPattern',
    days: 3,
    where: 'gym',
    bias: 'none',
    blockStart: '2026-09-14',
    blockWeeks: 8,
    unit: 'kg',
    lang: 'en',
  };

  it('accepts a profile from a client that has never heard of entry modes', () => {
    const row = rowSchemas.profile.parse(profile);
    expect(row.entryMode).toBe('buttons');
    expect(row.plateLoader).toBe(true);
  });

  it('keeps what a newer client sent', () => {
    const row = rowSchemas.profile.parse({ ...profile, entryMode: 'ruler', plateLoader: false });
    expect(row.entryMode).toBe('ruler');
    expect(row.plateLoader).toBe(false);
  });

  it('refuses an entry mode the app does not have', () => {
    expect(rowSchemas.profile.safeParse({ ...profile, entryMode: 'dial' }).success).toBe(false);
    expect(rowSchemas.profile.safeParse({ ...profile, plateLoader: 'yes' }).success).toBe(false);
  });

  it('defaults every setting the way the client does', () => {
    /* A setting missing from a push means "never chosen", and the client reads
       "never chosen" as `DEFAULT_PREFS`. The wire's defaults in `rows.ts` are a
       hand copy of that, eight settings of it, and nothing held the copies to
       the original: change a default in prefs and the server would go on
       writing the old answer for every phone that predates the field. */
    const shape = rowSchemas.profile.shape as Record<string, z.ZodType>;
    const defaulted = (Object.keys(DEFAULT_PREFS) as (keyof typeof DEFAULT_PREFS)[]).filter(
      (k) => k in shape && shape[k]!.safeParse(undefined).success,
    );
    expect(defaulted.length).toBeGreaterThan(5);
    for (const k of defaulted) expect(shape[k]!.parse(undefined), k).toEqual(DEFAULT_PREFS[k]);
  });
});

/**
 * Every synced table, as the server takes it off the wire.
 */
describe('rowSchemas', () => {
  const synced = { id: 'row-1', updatedAt: '2026-09-18T08:00:00.000Z', deletedAt: null };

  /** The least each table accepts. */
  const minimal: Record<TableKey, Record<string, unknown>> = {
    patterns: { ...synced, name: 'squat', role: 'Lower', counts: true, position: 0 },
    exercises: { ...synced, name: 'Goblet Squat', patternId: 'p-1', where: 'gym', tags: [] },
    slots: { ...synced, name: 'main', requiredRole: 'Any', position: 0 },
    splitPeriods: {
      ...synced,
      split: 'sevenPattern',
      days: 3,
      startWeek: '2026-09-14',
      patternKeys: ['squat'],
    },
    entries: { ...synced, sessionIndex: 0, slotId: 'slot-1', sets: 3, repRange: '5-8', note: '' },
    logs: {
      ...synced,
      date: '2026-09-18',
      session: 'A',
      exerciseId: 'ex-1',
      setNo: 1,
      note: '',
    },
    bodyLogs: { ...synced, date: '2026-09-18', weight: 80 },
    goals: {
      ...synced,
      exerciseId: 'ex-1',
      target: 100,
      baseline: 90,
      startedOn: '2026-09-14',
      targetDate: '2026-11-09',
    },
    profile: {
      ...synced,
      onboarded: true,
      days: 3,
      where: 'gym',
      bias: 'none',
      blockStart: '2026-09-14',
      blockWeeks: 8,
      unit: 'kg',
      lang: 'en',
    },
  };

  it('never takes userId or seq from the wire', () => {
    /* Two things stand between a client and somebody else's account: these
       schemas dropping keys they do not name, and the sync route setting its
       own userId after spreading the row. Either alone still holds, so losing
       one breaks nothing anybody would see — until the other goes too. So
       this one is held on its own, for every table. */
    expect(Object.keys(minimal).sort()).toEqual([...TABLES].sort());
    for (const table of TABLES) {
      const row = rowSchemas[table].parse({ ...minimal[table], userId: 'someone-else', seq: 1 });
      expect(Object.keys(row), table).not.toContain('userId');
      expect(Object.keys(row), table).not.toContain('seq');
    }
  });

  it('treats every column added after launch as optional', () => {
    /* The header above, for every table rather than the one it was written
       about. A column that arrived by ALTER TABLE is one some phone predates,
       so the wire has to take a row without it — a required one refuses every
       push from that phone and wedges its outbox. Read off the migrations, so
       a new column is checked without anybody listing it. `openapi.test.ts`
       cannot catch this: the spec and the schema could call the new field
       required together and agree perfectly. */
    const dir = fileURLToPath(new URL('../../../drizzle', import.meta.url));
    const bySqlName = new Map<string, { key: TableKey; table: (typeof SYNC_TABLES)[TableKey] }>(
      (Object.entries(SYNC_TABLES) as [TableKey, (typeof SYNC_TABLES)[TableKey]][]).map(
        ([key, table]) => [getTableName(table), { key, table }],
      ),
    );

    let checked = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const added = readFileSync(join(dir, file), 'utf8').matchAll(
        /ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/g,
      );
      for (const [, sqlTable, sqlColumn] of added) {
        // Not replicated: no phone pushes it, old or new.
        const target = bySqlName.get(sqlTable!);
        if (!target) continue;
        // Dropped since, so there is nothing left to be optional.
        const column = Object.entries(getTableColumns(target.table)).find(
          ([, c]) => c.name === sqlColumn,
        );
        if (!column) continue;

        const shape = rowSchemas[target.key].shape as Record<string, z.ZodType>;
        const label = `${target.key}.${column[0]} (${file})`;
        expect(shape[column[0]], label).toBeDefined();
        expect(shape[column[0]]!.safeParse(undefined).success, label).toBe(true);
        checked++;
      }
    }
    // Sixteen today; fewer means the pattern stopped matching, not that the
    // columns went away.
    expect(checked).toBeGreaterThanOrEqual(16);
  });
});
