/** Flow 03 — see ../flows/03-weekly-coverage.md */

import { expect, logSet, openCard, test } from '../fixtures/test';

test.describe('Weekly coverage', () => {
  test('an empty week reports gaps, not silence', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await expect(app.getByText('Nothing logged this week yet.')).toBeVisible();

    /* The gaps themselves: seven tiles, each saying it is empty. The summary
       line alone was what this checked, and a tile that drew nothing at all
       for an untrained pattern — silence, which is what the name forbids —
       passed it. */
    const tiles = app.getByRole('list', { name: 'Movement coverage' });
    await expect(tiles.getByRole('listitem')).toHaveCount(7);
    await expect(tiles.getByText('–', { exact: true })).toHaveCount(7);
    await expect(tiles.getByText('✓', { exact: true })).toHaveCount(0);
  });

  test('one logged pattern ticks exactly one box', async ({ onboardedApp: app }) => {
    // Day A opens on Goblet Squat (the fixture's week is built at variety 0),
    // so this is one squat set and should fill the squat tile and no other.
    await logSet(app, 60, 8);

    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');

    // Six of seven still missing — the summary must say so, and say which,
    // rather than congratulating a single session.
    await expect(app.getByText('6 gaps: hinge, lunge, push, pull, rotate, carry.')).toBeVisible();

    // Exactly one tile ticked, and the right one. The rest still read as gaps,
    // which is the whole point: one good session is not a covered week.
    await expect(app.getByText('✓', { exact: true })).toHaveCount(1);
    const tiles = app.getByRole('list', { name: 'Movement coverage' });
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Squat' })).toContainText('✓');
  });

  test('isolation work never fills a coverage box', async ({ onboardedApp: app }) => {
    /* The rule the method rests on: accessories sit on top of the patterns,
       never instead of them. A week of curls is not a covered week.

       So a curl is logged, and the week read back. Checking only that there is
       no "Isolation" tile never logged anything — and the seven-tile count is
       held by `splits.spec.ts` already — so a curl wired to a pattern, or
       tagged with the wrong one in the catalogue, passed. Hammer Curl is Day
       A's isolation slot. */
    await openCard(app, 'Hammer Curl');
    await logSet(app, 12, 12);

    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');
    const tiles = app.getByRole('list', { name: 'Movement coverage' });
    await expect(
      app.getByText('7 gaps: squat, hinge, lunge, push, pull, rotate, carry.'),
    ).toBeVisible();
    await expect(tiles.getByText('✓', { exact: true })).toHaveCount(0);
  });
});
