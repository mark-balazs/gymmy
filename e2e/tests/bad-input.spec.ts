import { expect, test } from '../fixtures/test';

/**
 * A typo must not stop a device syncing for good.
 *
 * The steppers clamp their − and + buttons, not what is typed. A row the server
 * rejects is not rejected on its own: the push answers 400 for the whole batch,
 * the outbox is only cleared after a successful sync, and the bad row sits at
 * the head of every retry. From then on that device never pushes or pulls again,
 * and the only way out is a sign-out that throws away everything still queued.
 *
 * Found by review, older than the feature that surfaced it: "8.5" reps off a
 * decimal keypad did it. This asserts against the server, not the badge — an
 * empty queue reads "All saved" whether the set arrived or was lost.
 */
test('a typed fraction or negative still syncs, as the nearest valid set', async ({
  page,
  context,
  baseURL,
}) => {
  const { createUser, serverSets, sessionCookie } = await import('../fixtures/auth');
  const user = await createUser({ onboarded: true });
  await context.addCookies([sessionCookie(user, baseURL!)]);

  await page.goto('/train');
  await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();

  await page.getByLabel('weight', { exact: true }).fill('-20');
  await page.getByLabel('reps', { exact: true }).fill('8.5');
  await page.getByRole('button', { name: /^Log set/ }).click();

  // Reached the server, as the nearest set the server accepts: reps rounded,
  // weight clamped at zero.
  await expect
    .poll(async () => (await serverSets(user.id)).map((s) => [s.weight, s.reps]), {
      timeout: 30_000,
    })
    .toEqual([[0, 9]]);

  // And the device is still syncing afterwards — the part that used to break
  // for good. A second, ordinary set arrives too.
  await page.getByLabel('weight', { exact: true }).fill('40');
  await page.getByLabel('reps', { exact: true }).fill('8');
  await page.getByRole('button', { name: /^Log set/ }).click();
  await expect.poll(async () => (await serverSets(user.id)).length, { timeout: 30_000 }).toBe(2);
});
