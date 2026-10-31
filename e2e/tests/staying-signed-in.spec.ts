import { endSession, serverSets, sessionCookie, sessionEnd, setSessionEnd } from '../fixtures/auth';
import { expect, logSet, queuedChanges, signInAs, test } from '../fixtures/test';

const DAY = 24 * 3600 * 1000;

/** When the phone's sign-in cookie runs out, in milliseconds, or `null` without one. */
async function cookieEnd(
  context: import('@playwright/test').BrowserContext,
): Promise<number | null> {
  const cookie = (await context.cookies()).find((c) => c.name === 'authjs.session-token');
  return cookie ? cookie.expires * 1000 : null;
}

/**
 * A phone that syncs stays signed in (GYM-143; the owner's answer on GYM-155:
 * a sign-in lasts until the phone goes 90 days without syncing).
 *
 * A sign-in ends twice: the session row on the server and the cookie on the
 * phone. Reading the session moved the row's end on, but the sync dropped the
 * cookie Auth.js sends with it, so the cookie ran out 90 days after signing
 * in, however often the phone synced, and the phone was signed out with its
 * newest sets still on it. The cookie is the phone's to keep, so only a
 * browser can show whether it moved.
 */
test.describe('Staying signed in', () => {
  test("a sync moves the phone's sign-in 90 days on, and the server's", async ({
    page,
    context,
    baseURL,
  }) => {
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await expect(page.getByText('All saved')).toBeVisible();

    // As if this sign-in were 83 days old: a week left, on the phone and on
    // the server alike.
    const weekLeft = new Date(Date.now() + 7 * DAY);
    await setSessionEnd(user, weekLeft);
    await context.addCookies([sessionCookie(user, baseURL!)]);
    expect(await cookieEnd(context)).toBeLessThan(Date.now() + 8 * DAY);

    await logSet(page, 60, 8);
    await expect.poll(() => serverSets(user.id), { timeout: 15_000 }).toHaveLength(1);

    // Both ends are now 90 days off, counted from this sync.
    await expect
      .poll(() => cookieEnd(context), { timeout: 15_000 })
      .toBeGreaterThan(Date.now() + 89 * DAY);
    expect(await cookieEnd(context)).toBeLessThan(Date.now() + 91 * DAY);
    expect((await sessionEnd(user))!.getTime()).toBeGreaterThan(Date.now() + 89 * DAY);
  });

  /**
   * The other side of the same answer: a cookie naming a sign-in that has
   * ended (signed out elsewhere, the account deleted on another phone) comes
   * back cleared, as it does from Auth.js's own session route. The phone must
   * still say what to do and keep what it holds, exactly as when the cookie
   * itself ran out.
   */
  test('a sync after the sign-in has ended still says to sign in, and keeps the change', async ({
    page,
    context,
    baseURL,
  }) => {
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await expect(page.getByText('All saved')).toBeVisible();

    await endSession(user);
    await logSet(page, 60, 8);

    await expect(page.getByText('Sign in to send 1 change')).toBeVisible({ timeout: 15_000 });
    expect(await queuedChanges(page)).toBe(1);
    expect(await serverSets(user.id)).toEqual([]);
    await expect.poll(() => cookieEnd(context)).toBeNull();
  });
});
