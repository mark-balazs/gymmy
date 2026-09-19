import { describe, expect, it } from 'vitest';
import { rowSchemas } from './rows';

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
});
