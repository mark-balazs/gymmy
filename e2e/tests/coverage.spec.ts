/** Flow 03 — see ../flows/03-weekly-coverage.md */

import { expect, logSet, test } from '../fixtures/test';

test.describe('Weekly coverage', () => {
  test('an empty week reports gaps, not silence', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await expect(app.getByText('Nothing logged this week yet.')).toBeVisible();
  });

  test('one logged pattern ticks exactly one box', async ({ onboardedApp: app }) => {
    // Day 1 slot 1 is always a lower-body pattern, so this fills exactly one tile.
    await logSet(app, 0, 60, 8);

    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');

    // Six of seven still missing — the summary must say so rather than
    // congratulating a single session.
    await expect(app.getByText(/gaps:/)).toBeVisible();

    // Exactly one tile ticked. The rest still read as gaps, which is the whole
    // point: one good session is not a covered week.
    await expect(app.getByText('✓', { exact: true })).toHaveCount(1);
  });

  test('isolation work never fills a coverage box', async ({ onboardedApp: app }) => {
    // The rule the method rests on: accessories sit on top of the patterns,
    // never instead of them. A week of curls is not a covered week.
    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');

    const isolationRow = app.getByText(
      /Lateral Raise|Cable Curl|DB Curl|Hammer Curl|Glute Kickback|Rear Delt Fly/,
    );
    await expect(isolationRow.first()).toBeVisible();

    // Isolation is not one of the seven tiles.
    await expect(app.getByText('Isolation', { exact: true })).toHaveCount(0);
  });
});
