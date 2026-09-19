/** Flow 03 — see ../flows/03-weekly-coverage.md */

import { thisMonday } from '../fixtures/auth';
import { expect, logSet, openCard, signInAs, test } from '../fixtures/test';

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

  test('an account older than its first block still opens on this week', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The block is written once, when the account is made, and never moves on,
       and the tab used to page through that block alone. So an account ten
       weeks old — past its eight-week block, as every real account is from week
       nine — opened on its first week with no way forward to today. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 10, exercises: ['Goblet Squat'] },
    });
    await page.getByRole('link', { name: 'Week', exact: true }).click();
    await page.waitForURL('**/week');

    await expect(page.getByText('This week', { exact: true })).toBeVisible();
    await expect(page.getByText('Nothing logged this week yet.')).toBeVisible();
    // This week is the last page: eleven of them, the first ten weeks back.
    await expect(page.getByRole('button', { name: 'Week 12', exact: true })).toBeDisabled();

    // And every week back to the first is still a page, with its own sets.
    for (let i = 0; i < 10; i++)
      await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('Week 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
    const tiles = page.getByRole('list', { name: 'Movement coverage' });
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Squat' })).toContainText('✓');
  });

  test('a set logged before the account’s block began is still a page', async ({
    page,
    context,
    baseURL,
  }) => {
    /* GYM-77. The server writes the block start from its own clock, in UTC,
       so someone west of UTC who signs up on a Sunday evening gets the next
       Monday — and the set they logged that evening sits in the week before
       the block. (Train can also log a set on any past date.) The Week tab
       paged from the block start, so that week was never a page. The fixture
       writes exactly that: a block starting this Monday, and a squat logged
       the Sunday before. */
    const d = new Date(`${thisMonday()}T12:00:00`);
    d.setDate(d.getDate() - 1);
    const sunday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      sets: [{ date: sunday, exercise: 'Goblet Squat', weight: 40, reps: 8, rir: 2 }],
    });
    await page.getByRole('link', { name: 'Week', exact: true }).click();
    await page.waitForURL('**/week');
    await expect(page.getByText('This week', { exact: true })).toBeVisible();

    const back = page.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toBeEnabled();
    await back.click();
    await expect(page.getByText('Week 1', { exact: true })).toBeVisible();
    await expect(back).toBeDisabled();
    const tiles = page.getByRole('list', { name: 'Movement coverage' });
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Squat' })).toContainText('✓');
  });
});
