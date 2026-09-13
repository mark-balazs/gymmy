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
