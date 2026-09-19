import { planInEffect, publishNewVersion, serverSets, shareAPlanWith } from '../fixtures/auth';
import { confirmSheet, expect, logSet, signInAs, test } from '../fixtures/test';

/**
 * Training on somebody else's plan.
 *
 * The claim being tested is the one the whole design rests on: **applying a
 * plan is a copy, taken once.** Everything that makes gymmy work — reading from
 * the device, a history that does not rewrite itself, last-write-wins between
 * your own two phones — was built for an account nobody else can reach into.
 * A plan that stayed linked would have quietly undone all of it.
 *
 * So the assertions are: the plan arrives, applying it changes the week, the
 * training already logged is untouched, and a trainer publishing a new edition
 * *offers* rather than takes.
 */
test.describe('A plan somebody shared with you', () => {
  test('arrives, and applying it does not disturb what you already logged', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 2, exercises: ['Goblet Squat'] },
    });

    // Something of their own, logged before any of this.
    await logSet(page, 72.5, 6);
    await expect(page.getByText('72.5 kg × 6').first()).toBeVisible();

    await shareAPlanWith(user.id, { name: 'Coach block', exerciseName: 'Barbell Bench Press' });

    await page.goto('/settings');
    const card = page.getByRole('region', { name: 'Plans shared with you' });
    await expect(card.getByText('Coach block')).toBeVisible({ timeout: 15_000 });
    // Attribution matters: a plan from nobody is one nobody trusts.
    await expect(card.getByText(/By Coach Ann/)).toBeVisible();

    await card.getByText('Coach block').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(/copies the plan into your own week/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Use this plan' }).click();
    /* Waited for, not assumed. Installing a week is a dozen writes and the
       profile is the last of them, so navigating the moment the button is
       clicked tears the page down mid-sequence — which is how this test
       failed first time round, against an app that was working. */
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

    /* The week is now the plan's, and the trainer's choice landed in the slot
       it was written for — Day A, first — not merely somewhere in the week.
       The bench press is already in this account's own week, further down Day
       A, so "on the page" held even for a plan that installed nothing. */
    await page.goto('/week');
    await expect(page.getByRole('button', { name: /^About / }).first()).toHaveAttribute(
      'aria-label',
      'About Barbell Bench Press',
      { timeout: 15_000 },
    );

    /* And the part that would be catastrophic to get wrong. Sets reference the
       exercise, never the plan, so installing a week cannot reach a logged set
       — but this is the first time a *stranger's* week has been installed, and
       the assertion is worth having explicitly. Two sets on the lift: the one
       seeded two weeks ago and the one logged just now. Its name alone was
       there on the strength of the seeded one. */
    await page.goto('/progress');
    await expect(page.getByRole('button', { name: 'Show Goblet Squat' })).toContainText('2 sets', {
      timeout: 15_000,
    });
    await expect
      .poll(
        async () => (await serverSets(user.id)).some((s) => s.weight === 72.5 && s.reps === 6),
        { timeout: 15_000 },
      )
      .toBe(true);

    /* Polled, not read once: the write lands in IndexedDB immediately and
       reaches the server on the sync debounce, so a single read here races it.
       That is the app working as designed, not a delay worth removing. */
    await expect
      .poll(async () => (await planInEffect(user.id)).planVersion, { timeout: 15_000 })
      .toBe(1);
  });

  test('reaches everybody in a group', async ({ page, context, baseURL }) => {
    // A group of one and a share to an individual are the same thing wearing a
    // different hat, which is exactly what makes the entity worth having.
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await shareAPlanWith(user.id, { name: 'Squad block', viaGroup: true });

    await page.goto('/settings');
    await expect(
      page.getByRole('region', { name: 'Plans shared with you' }).getByText('Squad block'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('a newer edition is offered, never taken', async ({ page, context, baseURL }) => {
    /* The whole reason a version is stored. A trainer editing their plan must
       not rewrite a week somebody is standing in — least of all one they are
       part-way through in a gym with no signal. */
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    const { planId } = await shareAPlanWith(user.id, { name: 'Living block' });

    await page.goto('/settings');
    const card = page.getByRole('region', { name: 'Plans shared with you' });
    await expect(card.getByText('Living block')).toBeVisible({ timeout: 15_000 });
    await card.getByText('Living block').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Use this plan' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Settled on the server before the trainer moves, so the reload below is
    // not racing the sync that records what was applied.
    await expect
      .poll(async () => (await planInEffect(user.id)).planVersion, { timeout: 15_000 })
      .toBe(1);

    await publishNewVersion(planId);
    await page.reload();

    // Said out loud, and still on version 1 until somebody chooses otherwise.
    await expect(card.getByText('Updated')).toBeVisible({ timeout: 15_000 });
    // Still on the old edition: offered, not taken.
    expect((await planInEffect(user.id)).planVersion).toBe(1);

    await card.getByText('Living block').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Update to the latest' }).click();
    await expect
      .poll(async () => (await planInEffect(user.id)).planVersion, { timeout: 15_000 })
      .toBe(2);
  });

  test('choosing your own split takes you off the plan', async ({ page, context, baseURL }) => {
    /* `patchProfile` rebuilds the row field by field rather than merging, so
       this is the assertion that the plan is *cleared* rather than merely not
       set — otherwise the app goes on claiming you train your coach's block
       long after you stopped. */
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await shareAPlanWith(user.id, { name: 'Left behind' });

    await page.goto('/settings');
    const card = page.getByRole('region', { name: 'Plans shared with you' });
    await expect(card.getByText('Left behind')).toBeVisible({ timeout: 15_000 });
    await card.getByText('Left behind').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Use this plan' }).click();
    await expect
      .poll(async () => (await planInEffect(user.id)).planId, { timeout: 15_000 })
      .not.toBeNull();

    await page.getByRole('button').filter({ hasText: 'Upper / Lower' }).first().click();
    await page.getByRole('button', { name: 'Rebuild my week' }).click();
    await confirmSheet(page);

    await expect
      .poll(async () => (await planInEffect(user.id)).planId, { timeout: 15_000 })
      .toBeNull();
  });

  test('shows nothing at all to somebody nobody coaches', async ({ page, context, baseURL }) => {
    // An empty section explaining a feature you are not part of is clutter.
    await signInAs(page, context, baseURL!, { onboarded: true });
    /* Waited for: the card draws nothing until the list of plans has come back
       from the server, and the Split heading is drawn from the device long
       before. Checked then, every version of the card shows nothing — the one
       that draws an empty section too. So the answer, its body, and one render
       after it; and a count, so an empty zero-height section also fails. */
    const listed = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/plans' && r.request().method() === 'GET',
    );
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Split', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const res = await listed;
    await res.finished();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    await expect(page.getByRole('region', { name: 'Plans shared with you' })).toHaveCount(0);
  });

  test('the coach area is closed to an ordinary account', async ({ page, context, baseURL }) => {
    /* The role gate is a redirect on the server, not a hidden link: somebody
       typing the URL gets the same answer as somebody who never saw it. */
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/coach');
    await page.waitForURL('**/settings');
    await expect(page.getByRole('heading', { name: 'Split', exact: true })).toBeVisible();
  });
});
