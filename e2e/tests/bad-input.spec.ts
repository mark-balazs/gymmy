import { expect, logSet, numberButton, signInAs, test, typeNumber } from '../fixtures/test';

/**
 * A typo must not stop a device syncing for good.
 *
 * A row the server rejects is not rejected on its own: the push answers 400 for
 * the whole batch, the outbox is only cleared after a successful sync, and the
 * bad row sits at the head of every retry. From then on that device never
 * pushes or pulls again, and the only way out is a sign-out that throws away
 * everything still queued.
 *
 * Found by review, older than the feature that surfaced it: "8.5" reps off a
 * decimal keypad did it, and so did a weight typed as "-20". Neither can be
 * typed any more — the card has no number inputs, and gymmy's own keypad has no
 * minus key and no point for reps — and the first test here holds that. What
 * the keypad *can* still type is four digits, which is past what the server
 * accepts for reps and for a weight, so the second test types the largest
 * number it allows and watches the set reach the server anyway.
 *
 * The write layer's bounds are unit-tested against the server's own validator
 * in `apps/web/src/lib/client/mutations.test.ts`, including the values no
 * control can produce today. This file is the half a unit test cannot show:
 * that the card's numbers go through that door.
 */

test('the keypad cannot type a negative number or part of a rep', async ({ onboardedApp: app }) => {
  await numberButton(app, 'reps').click();
  const reps = app.getByRole('dialog', { name: 'Reps' });
  await expect(reps).toBeVisible();
  const shown = reps.locator('output');

  // No minus key at all, and the point is there but cannot be pressed.
  await expect(reps.getByRole('button', { name: /^[-−]$/ })).toHaveCount(0);
  await expect(reps.getByRole('button', { name: '.', exact: true })).toBeDisabled();

  // A hardware keyboard gets no further: the point, the comma that is the
  // point on most European keyboards, and the minus all leave the number be.
  await reps.getByRole('button', { name: '8', exact: true }).click();
  for (const key of ['.', ',', '-', 'NumpadSubtract']) await app.keyboard.press(key);
  await app.keyboard.press('5');
  await expect(shown).toHaveText('85');
  await reps.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(reps).toHaveCount(0);

  // The weight takes a point — a 1.25 kg plate is real — but still no minus.
  await numberButton(app, 'weight').click();
  const weight = app.getByRole('dialog', { name: 'Weight' });
  await expect(weight.getByRole('button', { name: '.', exact: true })).toBeEnabled();
  await expect(weight.getByRole('button', { name: /^[-−]$/ })).toHaveCount(0);
  await app.keyboard.press('-');
  await weight.getByRole('button', { name: '2', exact: true }).click();
  await expect(weight.locator('output')).toHaveText(/^2\s*kg$/);
  await weight.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('the largest number the keypad takes still syncs, as the nearest valid set', async ({
  page,
  context,
  baseURL,
}) => {
  const { createUser, serverSets, sessionCookie } = await import('../fixtures/auth');
  const user = await createUser({ onboarded: true });
  await context.addCookies([sessionCookie(user, baseURL!)]);

  await page.goto('/train');
  await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();

  // Four digits is the keypad's limit, and past the server's on both numbers:
  // 2000 for a weight, 1000 reps.
  await typeNumber(page, 'weight', 9999);
  await typeNumber(page, 'reps', 9999);
  await page.getByRole('button', { name: /^Log set/ }).click();

  // Reached the server, as the nearest set the server accepts.
  await expect
    .poll(async () => (await serverSets(user.id)).map((s) => [s.weight, s.reps]), {
      timeout: 30_000,
    })
    .toEqual([[2000, 1000]]);

  // And the device is still syncing afterwards — the part that used to break
  // for good. A second, ordinary set arrives too.
  await typeNumber(page, 'weight', 40);
  await typeNumber(page, 'reps', 8);
  await page.getByRole('button', { name: /^Log set/ }).click();
  await expect.poll(async () => (await serverSets(user.id)).length, { timeout: 30_000 }).toBe(2);
});

/*
 * The same hazard through the two other number fields a person types into, and
 * both are open today. Every change is its own row in the queue, so a field
 * that writes on every keystroke queues each prefix of what is being typed —
 * and the first prefix outside the server's bounds stops the device for good,
 * with the sets behind it. Each test logs a set afterwards and asks the server
 * whether it arrived.
 *
 * Expected to fail until those fields are held to the server's bounds before
 * anything is queued — the height committed on blur and checked like the year
 * of birth, a bodyweight outside 20–700 refused with a message — and the write
 * layer refuses them too, as it does a set. Remove the markers with the fix;
 * the bounds then want unit tests in `mutations.test.ts` beside `boundSet`'s.
 */
test('a height typed key by key does not stop the device syncing', async ({
  page,
  context,
  baseURL,
}) => {
  test.fail(true, 'the height field queues "1" and "18" on the way to 180, below the 80 cm floor');
  const { profileHeight, serverSets } = await import('../fixtures/auth');
  const user = await signInAs(page, context, baseURL!, { onboarded: true });

  await page.goto('/settings');
  await page.getByLabel('Height').pressSequentially('180');
  await page.getByLabel('Height').blur();

  await page.getByRole('link', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
  await logSet(page, 60, 8);

  await expect.poll(async () => (await serverSets(user.id)).length, { timeout: 30_000 }).toBe(1);
  expect(await profileHeight(user.id)).toBe(180);
});

test('an impossible bodyweight does not stop the device syncing', async ({
  page,
  context,
  baseURL,
}) => {
  test.fail(true, 'a bodyweight of 7 is queued, and the server accepts 20 to 700');
  const { rowCount, serverSets } = await import('../fixtures/auth');
  // Some training, so Progress draws the bodyweight form rather than its
  // empty state.
  const user = await signInAs(page, context, baseURL!, {
    onboarded: true,
    history: { split: 'sevenPattern', weeksBack: 2, exercises: ['Goblet Squat'] },
  });

  // A dropped digit: 7 for 70-something.
  await page.goto('/progress');
  await page.getByLabel('Today (kg)').fill('7');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByRole('link', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();
  await logSet(page, 60, 8);

  // Today's set, beside the one the fixture logged two weeks ago.
  await expect
    .poll(async () => (await serverSets(user.id)).some((s) => s.weight === 60 && s.reps === 8), {
      timeout: 30_000,
    })
    .toBe(true);
  expect(await rowCount('body_logs', user.id)).toBe(0);
});
