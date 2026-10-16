import {
  planInEffect,
  planOwnedBy,
  planRow,
  publishNewVersion,
  serverSets,
  shareAPlanWith,
} from '../fixtures/auth';
import {
  confirmSheet,
  expect,
  logSet,
  signInAs,
  test,
  waitForServiceWorker,
} from '../fixtures/test';

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
    /* The one consequence that matters stays on the sheet, before the button:
       it replaces the week they train now. That it is then their own copy is
       one tap away. */
    await expect(sheet.getByText(/^This replaces the week you train now\./)).toBeVisible();
    await sheet.getByRole('button', { name: 'How your copy works' }).click();
    await expect(page.getByRole('note', { name: 'How your copy works' })).toContainText(
      'works offline',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
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

  test('a trainer is told what matters, and the rest is one tap away', async ({
    page,
    context,
    baseURL,
  }) => {
    /* A trainer's screens explained themselves in paragraphs: a card whose
       whole content was one sentence, repeated from the card before it, and two
       grey paragraphs in the plan editor. What stays on the screen is what
       stops a mistake — a draft is shared with nobody — and the how-it-works is
       behind an ⓘ. */
    await signInAs(page, context, baseURL!, { onboarded: true, role: 'trainer' });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'More on Coaching' }).click();
    await expect(page.getByRole('note', { name: 'More on Coaching' })).toContainText(
      'share it with one person or a whole group',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Plans you write' }).click();
    await page.waitForURL('**/coach');

    await expect(page.getByRole('heading', { name: 'Your plans' })).toBeVisible();
    await expect(page.getByText(/share it with one person or a whole group/)).toHaveCount(0);

    await page.getByRole('button', { name: 'New plan' }).click();
    const sheet = page.getByRole('dialog');
    await expect(
      sheet.getByText('People you share it with only see it once it is published.'),
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'How later edits reach people' }).click();
    await expect(page.getByRole('note', { name: 'How later edits reach people' })).toContainText(
      'never changes the week they are in',
    );
  });
});

test.describe('The plans a trainer writes', () => {
  test('with no signal, says so rather than claiming there are none', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Plans are the one thing in gymmy that needs a connection, and the screen
       read a failed request as an empty answer: a trainer with plans was shown
       "No plans yet." — which is not a delay, it is a wrong fact about their
       own work (GYM-89). */
    const trainer = await signInAs(page, context, baseURL!, { onboarded: true, role: 'trainer' });
    await planOwnedBy(trainer.id, { name: 'Winter block' });

    await page.goto('/coach');
    await expect(page.getByText('Winter block')).toBeVisible({ timeout: 15_000 });

    /* The shell has to be in the worker's cache before the network goes, or the
       reload below never reaches the app at all and the assertion would pass
       against a blank page. */
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await page.reload();

    await expect(
      page.getByText('Plans need a connection. Try again when you have signal.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No plans yet.')).toHaveCount(0);

    await context.setOffline(false);
  });

  test('publishes what is on the screen, not what was last saved', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Publish sent the plan as it was last saved and closed the editor, so an
       edit made since Save was thrown away without a word, and the people it
       is shared with got the older version (GYM-117). */
    const trainer = await signInAs(page, context, baseURL!, { onboarded: true, role: 'trainer' });
    const { planId } = await planOwnedBy(trainer.id, { name: 'Winter block', published: false });

    await page.goto('/coach');
    await page.getByText('Winter block').click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Name').fill('Winter block, week 2');
    await sheet.getByRole('button', { name: 'Publish' }).click();
    /* Closing, not yet gone: `getByRole` stops finding a sheet as its exit
       starts. Its title is the new name too, so the list is read with a role
       locator, which cannot see a closing sheet; `getByText` still could. */
    await expect(sheet).toHaveCount(0);

    // The list is read back from the server once the editor closes.
    await expect(page.getByRole('button', { name: /^Winter block, week 2/ })).toBeVisible();
    expect(await planRow(planId)).toEqual({
      name: 'Winter block, week 2',
      version: 1,
      published: true,
    });
  });

  test('publishing a plan nobody changed offers nobody an update', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Saving a published plan raises its version, and a higher version is what
       offers its people an update. So Publish saves first only when something
       changed: tapped on an unchanged plan, it leaves the version alone. */
    const trainer = await signInAs(page, context, baseURL!, { onboarded: true, role: 'trainer' });
    const { planId } = await planOwnedBy(trainer.id, { name: 'Summer block' });

    await page.goto('/coach');
    await page.getByText('Summer block').click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Publish' }).click();
    await expect(sheet).toHaveCount(0);

    expect(await planRow(planId)).toEqual({ name: 'Summer block', version: 1, published: true });
  });

  test('keeps the editor open, and publishes nothing, when the save fails', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Publish saves first, and publishes only once that save has worked. If it
       went on anyway, a save that failed would publish the older plan and
       close the editor without a word: the edits lost, and the people it is
       shared with given the older version, which is GYM-117 again. */
    const trainer = await signInAs(page, context, baseURL!, { onboarded: true, role: 'trainer' });
    const { planId } = await planOwnedBy(trainer.id, { name: 'Winter block', published: false });

    await page.goto('/coach');
    await page.getByText('Winter block').click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Name').fill('Winter block, week 2');
    await context.route(`**/api/plans/${planId}`, (route) =>
      route.request().method() === 'PUT' ? route.abort() : route.continue(),
    );
    const save = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes(planId));
    await sheet.getByRole('button', { name: 'Publish' }).click();
    await save;

    // The edits are still there to try again, and the older plan did not go out.
    await expect(sheet.getByRole('button', { name: 'Publish' })).toBeEnabled();
    await expect(sheet.getByLabel('Name')).toHaveValue('Winter block, week 2');
    expect(await planRow(planId)).toEqual({ name: 'Winter block', version: 1, published: false });
  });

  test('keeps the editor open when the publish fails, and a retry only publishes', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The other half: the save works and the publish does not. The editor
       stays open, and Publish again must not save a second time: saving a
       published plan raises its version, so anybody who took the first update
       would be offered another with nothing in it (GYM-117). So this plan is
       published already; a draft's version never moves on a save. */
    const trainer = await signInAs(page, context, baseURL!, { onboarded: true, role: 'trainer' });
    const { planId } = await planOwnedBy(trainer.id, { name: 'Spring block' });

    await page.goto('/coach');
    await page.getByText('Spring block').click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Name').fill('Spring block, week 2');
    const publishUrl = `**/api/plans/${planId}/publish`;
    await context.route(publishUrl, (route) => route.abort());
    const publishing = page.waitForRequest((r) => r.url().endsWith(`/${planId}/publish`));
    await sheet.getByRole('button', { name: 'Publish' }).click();
    await publishing;

    // Still open with the edits, and saved under the new name: one new version.
    await expect(sheet.getByRole('button', { name: 'Publish' })).toBeEnabled();
    await expect(sheet.getByLabel('Name')).toHaveValue('Spring block, week 2');
    const savedOnce = { name: 'Spring block, week 2', version: 2, published: true };
    expect(await planRow(planId)).toEqual(savedOnce);

    // Let it through: the retry publishes, and the version stays where the save left it.
    await context.unroute(publishUrl);
    await sheet.getByRole('button', { name: 'Publish' }).click();
    await expect(sheet).toHaveCount(0);
    expect(await planRow(planId)).toEqual(savedOnce);
  });

  test('labels a plan by the days the athlete will get, not the numbers stored', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Applying a plan renumbers its days densely, so days 0, 0 and 2 install as
       Day A and Day B. The editor labelled them from the stored number, so the
       trainer wrote "C" and their athlete trained "B" (GYM-83). Only a direct
       POST or PUT can make such a plan, which is why the fixture writes it. */
    const trainer = await signInAs(page, context, baseURL!, { onboarded: true, role: 'trainer' });
    await planOwnedBy(trainer.id, { name: 'Gapped block', slotDays: [0, 0, 2] });

    await page.goto('/coach');
    await page.getByText('Gapped block').click();
    const sheet = page.getByRole('dialog');

    // Two days, and the second is B.
    await expect(sheet.getByText('A', { exact: true })).toHaveCount(1);
    await expect(sheet.getByText('B', { exact: true })).toHaveCount(1);
    await expect(sheet.getByText('C', { exact: true })).toHaveCount(0);

    // And the day's own slot sits under that letter: two on A, one on B.
    await expect(sheet.getByRole('combobox', { name: 'A 1' })).toBeVisible();
    await expect(sheet.getByRole('combobox', { name: 'A 2' })).toBeVisible();
    await expect(sheet.getByRole('combobox', { name: 'B 1' })).toBeVisible();
  });
});
