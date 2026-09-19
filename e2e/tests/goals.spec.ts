import { expect, historyStart, signInAs, test } from '../fixtures/test';

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

    /* What a goal does is behind the ⓘ beside the button — three sentences in
       every lift's sheet, read once — and Escape closes the tip, not the sheet
       it sits in. */
    await expect(sheet.getByText(/tells you if this lift stops moving/)).toBeHidden();
    await sheet.getByRole('button', { name: 'What a goal does' }).click();
    const tip = page.getByRole('note', { name: 'What a goal does' });
    await expect(tip).toContainText('tells you if this lift stops moving');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await expect(sheet.getByRole('heading', { name: 'Goblet Squat' })).toBeVisible();

    await sheet.getByRole('button', { name: 'Push this lift' }).click();

    /* The form opens on a target that would pass every check, so the first
       thing on screen is a workable goal rather than an empty box the app then
       finds fault with. */
    const target = sheet.getByLabel(/^Target, for a single rep/);
    await expect(target).not.toHaveValue('');
    const offered = Number(await target.inputValue());
    expect(offered).toBeGreaterThan(0);
    // Where the lift is now, read off the form rather than assumed.
    const now = Number((await sheet.getByText(/^Now at /).innerText()).match(/[\d.]+/)?.[0] ?? '0');
    expect(now).toBeGreaterThan(0);

    await sheet.getByRole('button', { name: 'Set the goal' }).click();

    /* Saving closes the sheet, because the acknowledgement is the card behind
       it — a form that empties itself while the sheet stays put reads as
       nothing having happened. */
    await expect(page.getByRole('dialog')).toHaveCount(0);

    /* Now the app is holding something, and the bar says how much of it: where
       the lift stands, out of the target that was set. Nothing has been lifted
       since the goal started, so it stands exactly at its baseline. "Any
       number of any number" also passed on a goal saved with no baseline, or
       with the baseline as its target. */
    await expect(page.getByRole('heading', { name: 'What you are pushing' })).toBeVisible();
    await expect(page.getByRole('img', { name: `${now} of ${offered} kg` })).toBeVisible();
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

    /* The reason behind the limit is in the form's ⓘ — a tip now, not a sheet
       stacked on this one — and the refusal keeps only the rule and the way
       out. */
    await sheet.getByRole('button', { name: 'Where these limits come from' }).click();
    await expect(page.getByRole('note', { name: 'Where these limits come from' })).toContainText(
      'about 4% from one day to the next',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(1);

    // The number it offered clears the noise, so the refusal goes away.
    expect(offered).toBeGreaterThanOrEqual(now * 1.05);
    await target.fill(String(offered));
    await expect(sheet.getByRole('button', { name: 'Set the goal' })).toBeEnabled();
  });

  test('never warns about the target it fills in, only about a higher one', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The owner: "The target the app fills in never shows the warning. If you
       change it to something higher yourself, the warning still appears." A
       light lift is where it bit: 9.75 kg for 8 with two in reserve estimates
       13, and the offer, rounded up to the sheet's 0.5 step, is 14 — 7.7% up,
       past the 7.5% at which a lift this new to the app is warned. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: {
        split: 'sevenPattern',
        weeksBack: 3,
        exercises: ['Goblet Squat'],
        sessions: 3,
        weights: [9.75, 9.75, 9.75],
      },
    });
    await page.goto('/progress');

    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Push this lift' }).click();

    const target = sheet.getByLabel(/^Target, for a single rep/);
    await expect(sheet.getByText('Now at 13 kg')).toBeVisible();
    await expect(target).toHaveValue('14');
    // Nothing under the form: nothing to warn about, and the explanation of
    // goals is the ⓘ that was tapped past to get here.
    await expect(sheet.getByText(/^About [\d.]+% a week/)).toHaveCount(0);
    await expect(sheet.locator('#goal-note')).toHaveCount(0);

    // One step higher is the person's own number, and gets the usual check:
    // a warning, and still a goal they can set.
    await target.fill('14.5');
    await expect(sheet.getByText(/^About [\d.]+% a week/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Set the goal' })).toBeEnabled();
  });

  test('fills in its offer for the horizon picked, until you type your own', async ({
    page,
    context,
    baseURL,
  }) => {
    /* The same rule, across horizons. The sheet filled in the twelve-week
       offer once; tapping 8 weeks without typing then checked that number
       against eight weeks, and warned about a target the app had filled in
       itself. Six weekly sessions, 40 kg then 50 kg for 8 with two in reserve:
       now at 66.7, with its own pace of 25% in six months — the offer is 74.5
       over twelve weeks, and 72 over eight, where 74.5 is warned about. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: {
        split: 'sevenPattern',
        weeksBack: 6,
        exercises: ['Goblet Squat'],
        sessions: 6,
        weights: [40, 40, 40, 50, 50, 50],
      },
    });
    await page.goto('/progress');

    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Push this lift' }).click();

    const target = sheet.getByLabel(/^Target, for a single rep/);
    const warning = sheet.getByText(/^About [\d.]+% a week/);
    const note = sheet.locator('#goal-note');
    await expect(sheet.getByText('Now at 66.7 kg')).toBeVisible();
    await expect(sheet.getByRole('button', { name: '12 weeks' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(target).toHaveValue('74.5');

    // Eight weeks, nothing typed: the eight-week offer, and no warning.
    await sheet.getByRole('button', { name: '8 weeks' }).click();
    await expect(target).toHaveValue('72');
    await expect(note).toHaveCount(0);
    await expect(warning).toHaveCount(0);

    // A higher number of their own gets the ordinary check, and stays theirs
    // whatever horizon they pick next.
    await target.fill('80');
    await expect(warning).toBeVisible();
    await sheet.getByRole('button', { name: '12 weeks' }).click();
    await expect(target).toHaveValue('80');
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
    await expect(sheet.getByText('Log a few sessions of this to set a goal.')).toBeVisible();
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

  test('grades a lift only once asked, and stops when told', async ({ page, context, baseURL }) => {
    /* The permission itself, and not just its paperwork. Every other account in
       this file has nothing to flag, so setting a goal only ever showed
       "Nothing to flag." — which a page that had quietly stopped grading
       anything would show too. This lift has gone backwards: 60, 60, then
       three sessions at 50, so recent form sits 17% under its best. Unasked,
       the page says nothing about it; asked, it says exactly that. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: {
        split: 'sevenPattern',
        weeksBack: 5,
        exercises: ['Goblet Squat'],
        sessions: 5,
        weights: [60, 60, 50, 50, 50],
      },
    });
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Every lift' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Show Goblet Squat' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Push this lift' }).click();
    await sheet.getByRole('button', { name: 'Set the goal' }).click();

    const down = page.getByRole('listitem').filter({ hasText: 'Down' });
    await expect(down).toContainText('17% under your best');

    await page.getByRole('button', { name: 'Stop pushing this' }).click();
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toHaveCount(0);
  });
});

test.describe('The goal card says what happened, once', () => {
  /** A date `n` days from today, as the app stores it. */
  const inDays = (n: number): string => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  test('an ended goal is a state and a gain; a live one that moved says so on its number', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Two goals from the same start, on the same five sessions: 40 kg twice,
       then 50 (for 8, two in reserve — 53.3 up to 66.7 estimated). One ended
       yesterday short of its target; one runs for another month.

       The ended one used to say "This goal has ended. Came up short, and still
       added 13.4 kg." — a sentence for a state, and a judgement ahead of the
       gain. Now the state is a chip where the days left were, and the line is
       the gain. The live one said "Now at 66.7 kg" under "66.7 of 90 kg": the
       same number twice. Now the number itself carries the arrow. */
    const start = historyStart(5);
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: {
        split: 'sevenPattern',
        weeksBack: 5,
        exercises: ['Goblet Squat', 'Barbell Bench Press'],
        sessions: 5,
        weights: [40, 40, 50, 50, 50],
      },
      goals: [
        {
          exercise: 'Goblet Squat',
          target: 80,
          baseline: 53.3,
          startedOn: start,
          targetDate: inDays(-1),
        },
        {
          exercise: 'Barbell Bench Press',
          target: 90,
          baseline: 53.3,
          startedOn: start,
          targetDate: inDays(30),
        },
      ],
    });
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'What you are pushing' })).toBeVisible();

    const row = (name: string) =>
      page.getByRole('button', { name, exact: true }).locator('xpath=../..');

    const ended = row('Goblet Squat');
    await expect(ended.getByText('Ended', { exact: true })).toBeVisible();
    await expect(ended).toContainText('+13.4 kg since you started');
    await expect(ended).not.toContainText('days left');
    await expect(ended).not.toContainText('Came up short');

    const live = row('Barbell Bench Press');
    await expect(live).toContainText('66.7 of 90 kg');
    await expect(live).toContainText('days left');
    // The arrow on the number, and no second line repeating it.
    await expect(live.getByText('66.7 of 90 kg').locator('svg')).toHaveCount(1);
    await expect(page.getByText(/^Now at /)).toHaveCount(0);
  });
});

test.describe('What the app says without being asked', () => {
  test('says, unasked, that a lift in your week has not been trained', async ({
    page,
    context,
    baseURL,
  }) => {
    /* Dormancy is the one verdict with no goal behind it: not a judgement of
       the training but an observation about the plan the person chose — a lift
       in their own week that they have not done for three weeks. So it shows
       on an account that has asked for nothing. One set each, 27 to 33 days
       ago; Push-Up is not in this week's plan, so it is history and not a
       lapse, and it is not listed. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 4, exercises: ['Goblet Squat', 'Push-Up'] },
    });
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Every lift' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Worth knowing' })).toBeVisible();

    const rows = page.getByRole('list').getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAccessibleName('Show Goblet Squat');
    await expect(rows.first()).toContainText('Not trained');
    await expect(rows.first()).toContainText('still in your week');
    // And no goal card: nothing was asked for.
    await expect(page.getByRole('heading', { name: 'What you are pushing' })).toHaveCount(0);
  });
});
