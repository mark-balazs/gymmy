import { expect, numberButton, test, typeNumber } from '../fixtures/test';

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
