import { expect, signInAs, test } from '../fixtures/test';

/**
 * Goals, and the silence that is their absence.
 *
 * The app used to open Progress with a heading reading "Needs a look" and, on a
 * good week, "nothing needs a look — everything you train is moving". Both were
 * the app grading somebody's training against a standard it had invented, and
 * the failure mode is not a wrong number: it is a person reading that their
 * bench press has let them down and training less as a result.
 *
 * So the product rule is that **the app evaluates progression only where it has
 * been asked to**, one lift at a time, until a date. That rule is invisible in a
 * unit test of `attention()` — what a person actually experiences is a page that
 * says nothing until they ask it to, and then does. This file walks that.
 */
test.describe('The app pushes only where it was asked to', () => {
  /* Three weekly sessions on three lifts. `sessions: 3` is the point rather
     than decoration: a goal will not offer a baseline built on fewer, because
     one set carries the whole retest variation and a target 5% above it could
     sit inside the error bar of its own starting point. */
  const seeded = {
    onboarded: true,
    history: {
      split: 'sevenPattern',
      weeksBack: 3,
      exercises: ['Goblet Squat', 'Push-Up', 'Inverted Row'],
      sessions: 3,
    },
  } as const;

  test('says nothing about growth on an account that never asked', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(page, context, baseURL!, seeded);
    await page.goto('/progress');

    // The charts are all there — the page still describes.
    await expect(page.getByRole('heading', { name: 'Every lift' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show Goblet Squat' })).toBeVisible();

    /* And the verdict card is simply not on the page. Not empty, not reassuring:
       absent. An empty card headed with a judgement is still a judgement, and
       "nothing needs a look" is a claim about what somebody was trying to do. */
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toHaveCount(0);
    await expect(page.getByText('Everything you train is moving')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'What you are pushing' })).toHaveCount(0);
  });

  test('sets a goal, and only then has something to watch', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, seeded);
    await page.goto('/progress');

    // A goal is set where its baseline already is: the per-lift sheet.
    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Push this lift' }).click();

    /* The form opens on a target that would pass every check, so the first
       thing on screen is a workable goal rather than an empty box the app then
       finds fault with. */
    const target = sheet.getByLabel(/^Target, for a single rep/);
    await expect(target).not.toHaveValue('');
    const offered = Number(await target.inputValue());
    expect(offered).toBeGreaterThan(0);

    await sheet.getByRole('button', { name: 'Set the goal' }).click();

    /* Saving closes the sheet, because the acknowledgement is the card behind
       it — a form that empties itself while the sheet stays put reads as
       nothing having happened. */
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Now the app is holding something, and the bar says how much of it.
    await expect(page.getByRole('heading', { name: 'What you are pushing' })).toBeVisible();
    await expect(page.getByRole('img', { name: /^\d+(\.\d+)? of \d+(\.\d+)? kg$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop pushing this' })).toBeVisible();

    // And the verdict card now exists, with nothing to report — which is the
    // app answering the question it was asked rather than volunteering one.
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toBeVisible();
    await expect(page.getByText('Nothing to flag.')).toBeVisible();
  });

  test('refuses a target too small to tell from noise, and offers one that is not', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The guardrail with a number behind it: a retested one-rep max varies by
       about 4.2% on its own, so a 1% goal would be reached or missed by
       measurement error. The app says so in those terms and does not save. */
    await signInAs(page, context, baseURL!, seeded);
    await page.goto('/progress');

    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Push this lift' }).click();

    const target = sheet.getByLabel(/^Target, for a single rep/);
    const offered = Number(await target.inputValue());

    /* Where the lift is now, read off the form rather than assumed — which
       exercise the generator picks and what it lands on both depend on the
       split. */
    const now = Number((await sheet.getByText(/^Now at /).innerText()).match(/[\d.]+/)?.[0] ?? '0');
    expect(now).toBeGreaterThan(0);

    /* Two percent up: a real increase, and still inside the band a retest of
       the same lift wanders across on its own. It has to be *above* the
       baseline to test the threshold — a target below it would be refused by
       any threshold at all, including none, which is how a version of this
       test passed while the guardrail was switched off. */
    await target.fill((now * 1.02).toFixed(1));
    await expect(sheet.getByText(/Too small to measure/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Set the goal' })).toBeDisabled();

    // The number it offered clears the noise, so the refusal goes away.
    expect(offered).toBeGreaterThanOrEqual(now * 1.05);
    await target.fill(String(offered));
    await expect(sheet.getByRole('button', { name: 'Set the goal' })).toBeEnabled();
  });

  test('will not build a goal on a single set', async ({ page, context, baseURL }) => {
    /* The other end of the same argument. One session is a data point, and a
       goal set 5% above it can have its target inside the error bar of its own
       baseline — so the app asks for a few more sessions instead of offering a
       number it would then hold somebody to. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 3, exercises: ['Goblet Squat'] },
    });
    await page.goto('/progress');

    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(/Log a few sessions of this first/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Push this lift' })).toHaveCount(0);
  });

  test('takes the permission back in one tap', async ({ page, context, baseURL }) => {
    // A consent you cannot easily withdraw is not one, so this control is on
    // the card itself rather than in a settings screen.
    await signInAs(page, context, baseURL!, seeded);
    await page.goto('/progress');

    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Push this lift' }).click();
    await sheet.getByRole('button', { name: 'Set the goal' }).click();
    await expect(page.getByRole('heading', { name: 'What you are pushing' })).toBeVisible();

    await page.getByRole('button', { name: 'Stop pushing this' }).click();

    // Back to silence — both cards gone, not just the goal.
    await expect(page.getByRole('heading', { name: 'What you are pushing' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toHaveCount(0);
  });
});
