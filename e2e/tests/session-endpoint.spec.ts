import { createUser, sessionCookie } from '../fixtures/auth';
import { expect, test } from '../fixtures/test';

/**
 * What `/api/auth/session` tells a script on the page (GYM-144).
 *
 * The sign-in cookie is HttpOnly so that no script can read it. This endpoint
 * answered with the whole stored session, that same token included, so any
 * script on the page could carry a 90-day sign-in off to another machine. It
 * must say only who is signed in, their role and the expiry, and never the
 * token.
 */
test.describe('The session endpoint', () => {
  test('says who and what role, never the sign-in token', async ({ context, page, baseURL }) => {
    const user = await createUser({ role: 'trainer' });
    await context.addCookies([sessionCookie(user, baseURL!)]);

    const res = await page.request.get('/api/auth/session');
    expect(res.status()).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as Record<string, unknown> & {
      user?: Record<string, unknown>;
    };

    expect(text).not.toContain(user.sessionToken);
    expect(Object.keys(body).sort()).toEqual(['expires', 'user']);
    // Named field by field, so a column added to the user row never leaks out.
    expect(Object.keys(body.user ?? {}).sort()).toEqual(['email', 'id', 'image', 'name', 'role']);
    expect(body.user?.id).toBe(user.id);
    // Settings reads this to decide whether to offer Coaching.
    expect(body.user?.role).toBe('trainer');
  });

  test('answers null when nobody is signed in', async ({ page }) => {
    const res = await page.request.get('/api/auth/session');
    expect(res.status()).toBe(200);
    expect(await res.json()).toBeNull();
  });
});
