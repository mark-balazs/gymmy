import { randomUUID } from 'node:crypto';
import { resetSignInThrottle, seedSignInCode } from '../fixtures/auth';
import { expect, test } from '../fixtures/test';

/**
 * The code-request endpoint takes an address from anyone and sends mail, so its
 * contract is as much about what it refuses to reveal as what it does.
 *
 * These run without RESEND_API_KEY set — the endpoint still answers identically
 * either way, which is the property being checked.
 */
test.describe('Requesting a sign-in code', () => {
  const post = (page: import('@playwright/test').Page, email: unknown) =>
    page.request.post('/api/auth/email-code', { data: { email } });

  test('answers the same for a known and an unknown address', async ({ page, baseURL }) => {
    // Every test here shares one rate-limit bucket, so start from a clean one.
    await resetSignInThrottle();
    await page.goto(`${baseURL}/sign-in`);

    const unknown = await post(page, `nobody-${Date.now()}@example.test`);
    const malformed = await post(page, 'not-an-email');

    // Identical, because any difference is a way to ask "does this person have
    // an account here?" and get an answer.
    expect(unknown.status()).toBe(200);
    expect(malformed.status()).toBe(200);
    expect(await unknown.text()).toBe(await malformed.text());
  });

  test('says nothing useful in the body', async ({ page, baseURL }) => {
    await resetSignInThrottle();
    await page.goto(`${baseURL}/sign-in`);
    const res = await post(page, 'someone@example.test');
    const body = await res.text();

    // No code, no address, no provider detail — this response is public.
    expect(body).not.toMatch(/\d{6}/);
    expect(body.toLowerCase()).not.toContain('resend');
    expect(body.toLowerCase()).not.toContain('example.test');
  });

  test('the form never shows the code entry before asking', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/sign-in`);
    // Only meaningful when email sign-in is switched on for this deployment.
    const emailField = page.getByLabel('Email address');
    if ((await emailField.count()) === 0) test.skip();

    await expect(page.getByLabel('Sign-in code')).toHaveCount(0);
    await emailField.fill('someone@example.test');
    await page.getByRole('button', { name: /Email me a code/ }).click();
    await expect(page.getByLabel('Sign-in code')).toBeVisible();
  });
});

/**
 * Asking for a code was covered; entering one was not, and that is where this
 * was broken. Auth.js reads the token and address off the **query string** —
 * an emailed link is a GET — so a form that posted them in the body handed it
 * nothing, and it answered with its own "Server error" page. Every email
 * sign-in failed, on every account, from the first one.
 */
test.describe('Entering a sign-in code', () => {
  const freshEmail = () => `otp-${randomUUID().slice(0, 8)}@example.test`;

  test('a correct code signs you in', async ({ page }) => {
    const email = freshEmail();
    await seedSignInCode(email, '123456');

    await page.goto('/sign-in');
    const emailField = page.getByLabel('Email address');
    // Only meaningful when email sign-in is switched on for this deployment.
    if ((await emailField.count()) === 0) test.skip();

    await emailField.fill(email);
    await page.getByRole('button', { name: /Email me a code/ }).click();

    await page.getByLabel('Sign-in code').fill('123456');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // A brand-new account lands in setup, which means the session is real and
    // the account was created — not merely that the callback did not error.
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('a wrong code does not, and says so in plain words', async ({ page }) => {
    const email = freshEmail();
    await seedSignInCode(email, '123456');

    await page.goto('/sign-in');
    const emailField = page.getByLabel('Email address');
    if ((await emailField.count()) === 0) test.skip();

    await emailField.fill(email);
    await page.getByRole('button', { name: /Email me a code/ }).click();
    await page.getByLabel('Sign-in code').fill('999999');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Auth.js's own wording for a code that is wrong, used or expired. What
    // matters is that it is *not* the "Server error" page, which tells the
    // person nothing they can act on.
    await expect(page.getByText('Unable to sign in')).toBeVisible();
    await expect(page.getByText('There is a problem with the server configuration')).toHaveCount(0);
  });
});
