import {
  collapsedExercises,
  expect,
  finishDay,
  finishOpenExercise,
  logSuggested,
  openCard,
  openExercise,
  test,
} from '../fixtures/test';

/**
 * One exercise open at a time.
 *
 * Every card used to be expanded at once, each carrying two steppers, a
 * four-way effort control, a log button and a row of set dots — five of those
 * is a screen you scroll to use, for an activity where you are holding the
 * phone in one hand between sets.
 *
 * A session is done one exercise at a time: three sets, ticked off, on to the
 * next. So the screen is shaped like that.
 */
test.describe('Train shows one exercise at a time', () => {
  test('opens the first exercise and collapses the rest', async ({ onboardedApp: app }) => {
    const first = await openExercise(app);

    // The open one has its name as a heading and its inputs on the page.
    await expect(app.getByRole('heading', { name: first, exact: true })).toBeVisible();
    await expect(app.getByLabel('weight', { exact: true })).toHaveCount(1);
    await expect(app.getByRole('button', { name: /^Log set/ })).toHaveCount(1);

    // The others are rows you can tap, and nothing more.
    const collapsed = app.getByRole('button', { expanded: false });
    expect(await collapsed.count()).toBeGreaterThan(0);
  });

  test('tapping a collapsed exercise opens it and closes the other', async ({
    onboardedApp: app,
  }) => {
    const first = await openExercise(app);
    const second = (await collapsedExercises(app))[0]!;

    await openCard(app, second);

    await expect(app.getByRole('heading', { name: second, exact: true })).toBeVisible();
    await expect(app.getByRole('heading', { name: first, exact: true })).toHaveCount(0);
    // Still exactly one set of inputs, which is the whole point.
    await expect(app.getByLabel('weight', { exact: true })).toHaveCount(1);
  });

  test('keeps a weight you typed but have not logged across a collapse', async ({
    onboardedApp: app,
  }) => {
    /* The card is hidden, never unmounted. Unmounting would throw away what you
       typed and then re-seed from history on the way back — silently changing
       the number under somebody mid-session, which is the one thing a logging
       screen must never do. */
    const first = await openExercise(app);
    const second = (await collapsedExercises(app))[0]!;

    await app.getByLabel('weight', { exact: true }).fill('77.5');
    await openCard(app, second);
    await openCard(app, first);

    await expect(app.getByLabel('weight', { exact: true })).toHaveValue('77.5');
  });

  test('finishing an exercise collapses it and opens the next', async ({ onboardedApp: app }) => {
    const second = (await collapsedExercises(app))[0]!;

    // Folds away when its last set lands, and the next one is ready.
    await finishOpenExercise(app);
    await expect(app.getByRole('heading', { name: second, exact: true })).toBeVisible();
  });

  test('a finished exercise is marked as done and can still be reopened', async ({
    onboardedApp: app,
  }) => {
    const first = await finishOpenExercise(app);

    // Reopening a finished one offers a fourth set rather than a first —
    // people do add one, and auto-advancing must not take that away.
    await openCard(app, first);
    await expect(app.getByRole('button', { name: 'Add another set' })).toBeVisible();

    // And it stays open: logging that fourth set does not change which exercise
    // is first-unfinished, so nothing yanks the screen away mid-set.
    await logSuggested(app);
    await expect(app.getByRole('heading', { name: first, exact: true })).toBeVisible();
  });
});

test.describe('The day tabs tick off what is done', () => {
  test('a finished day is ticked, an unfinished one is not', async ({ onboardedApp: app }) => {
    const dayA = app.getByRole('button', { name: /^Day A/ });
    const dayB = app.getByRole('button', { name: /^Day B/ });

    // Nothing logged: nothing ticked. An empty day is not a finished one.
    await expect(dayA).not.toContainText('✓');
    await expect(dayB).not.toContainText('✓');

    // Finish every exercise of Day A.
    const finished = await finishDay(app);
    expect(finished.length).toBeGreaterThan(0);

    await expect(dayA).toContainText('✓');
    await expect(dayB).not.toContainText('✓');
  });
});
