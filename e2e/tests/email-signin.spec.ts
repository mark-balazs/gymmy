import { randomUUID } from 'node:crypto';
import { codeHash, createUser, seedSignInCode, storedCodes } from '../fixtures/auth';
import { expect, test } from '../fixtures/test';

/**
 * The code-request endpoint takes an address from anyone and sends mail, so its
 * contract is as much about what it refuses to reveal as what it does.
 *
 * The e2e server runs with a fake RESEND_API_KEY, so every request goes through
 * the throttle and a send that fails; the answer must not change either way.
 * Without the key the route returns before any of that, for every input, and
 * comparing two of its answers would compare nothing.
 */

/**
 * Why the field is required rather than a reason to skip. The e2e server is
 * always started with a key, so a missing field is either a broken switch or a
 * stray server on :3000 started without one — and both used to report every
 * code-entry test as skipped, with the suite green.
 */
const REQUIRED = 'email sign-in must be on: the e2e webServer sets RESEND_API_KEY';

test.describe('Requesting a sign-in code', () => {
  /* Each test's own client key and fresh addresses, so no earlier run and no
     test running beside it can have spent the limits on asking. */
  let client = '';
  test.beforeEach(() => {
    client = `ask-${randomUUID()}`;
  });
  const post = (page: import('@playwright/test').Page, email: unknown) =>
    page.request.post('/api/auth/email-code', {
      data: { email },
      headers: { 'x-forwarded-for': client },
    });

  test('answers the same for a known and an unknown address', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/sign-in`);

    /* A known address and an unknown one — the pair the name promises. The
       malformed address this used to compare with returns before the throttle
       and the send, so it could never differ, and an early "you have an
       account" for known addresses passed. It stays, as a third answer. */
    const known = await createUser({ bare: true });
    const knownRes = await post(page, known.email);
    const unknown = await post(page, `nobody-${randomUUID().slice(0, 8)}@example.test`);
    const malformed = await post(page, 'not-an-email');

    // Identical, because any difference is a way to ask "does this person have
    // an account here?" and get an answer.
    expect(knownRes.status()).toBe(200);
    expect(unknown.status()).toBe(200);
    expect(malformed.status()).toBe(200);
    expect(await knownRes.text()).toBe(await unknown.text());
    expect(await unknown.text()).toBe(await malformed.text());
  });

  test('says nothing useful in the body', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/sign-in`);
    const res = await post(page, `someone-${randomUUID().slice(0, 8)}@example.test`);

    /* No code, no address, no provider detail — this response is public. So
       exactly what the contract says it is, and nothing beside it: a body that
       merely avoided a few words let `{ ok: true, sent: false }` through, which
       tells anybody asking that the mail did not go. */
    expect(await res.json()).toEqual({ ok: true });
  });

  test('takes an ask in JSON however its type is capitalised', async ({ page }) => {
    /* Only JSON is taken, so a page elsewhere cannot ask without the
       browser's leave; but a type's case means nothing, and "Application/JSON"
       is JSON. Its own client key and address, so no limit answers first. */
    const res = await page.request.post('/api/auth/email-code', {
      data: JSON.stringify({ email: `ask-${randomUUID().slice(0, 8)}@example.test` }),
      headers: {
        'x-forwarded-for': `ask-${randomUUID()}`,
        'content-type': 'Application/JSON; charset=UTF-8',
      },
    });
    expect(res.status()).toBe(200);
  });

  test('the form never shows the code entry before asking', async ({ page, baseURL }) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': client });
    const email = `someone-${randomUUID().slice(0, 8)}@example.test`;
    await page.goto(`${baseURL}/sign-in`);
    const emailField = page.getByLabel('Email address');
    await expect(emailField, REQUIRED).toBeVisible();

    await expect(page.getByLabel('Sign-in code')).toHaveCount(0);
    await emailField.fill(email);
    await page.getByRole('button', { name: /Email me a code/ }).click();
    await expect(page.getByLabel('Sign-in code')).toBeVisible();
    /* Where to look, with the address to catch a typo — and no "if it has an
       account", which a first-time address read as "this will not work". */
    await expect(
      page.getByText(`Check ${email} for a 10-digit code. It works for 10 minutes.`),
    ).toBeVisible();
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

  // Its own client key, so no other test's code checks spend its budget.
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `otp-${randomUUID()}` });
  });

  test('a correct code signs you in', async ({ page }) => {
    const email = freshEmail();

    await page.goto('/sign-in');
    const emailField = page.getByLabel('Email address');
    await expect(emailField, REQUIRED).toBeVisible();

    await emailField.fill(email);
    await page.getByRole('button', { name: /Email me a code/ }).click();

    // Written once the request is answered, as the email would deliver it: a
    // request replaces any older code.
    await expect(page.getByLabel('Sign-in code')).toBeVisible();
    await seedSignInCode(email, '1234567890');
    await page.getByLabel('Sign-in code').fill('1234567890');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // A brand-new account lands in setup, which means the session is real and
    // the account was created — not merely that the callback did not error.
    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('an address typed with a capital letter still uses its code', async ({ page }) => {
    /* Codes are stored under the trimmed, lower-cased address, and Auth.js
       looks one up under exactly the address the form sends, so the form must
       send it the same way. A capital can be typed, pasted or autofilled, in
       either half of the address, and a pasted one can bring spaces. */
    const email = freshEmail();

    await page.goto('/sign-in');
    const emailField = page.getByLabel('Email address');
    await expect(emailField, REQUIRED).toBeVisible();

    // " Otp-1a2b3c4d@EXAMPLE.TEST ": a capital in each half, and spaces.
    const at = email.indexOf('@');
    await emailField.fill(
      ` ${email.charAt(0).toUpperCase()}${email.slice(1, at)}${email.slice(at).toUpperCase()} `,
    );
    await page.getByRole('button', { name: /Email me a code/ }).click();

    // Stored under the lower-cased address once the request is answered, as
    // the email would deliver it: a request replaces any older code.
    await expect(page.getByLabel('Sign-in code')).toBeVisible();
    await seedSignInCode(email, '1234567890');
    await page.getByLabel('Sign-in code').fill('1234567890');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('a code pasted with a space in it still signs you in', async ({ page }) => {
    /* Ten digits are easier to read in two groups, and a person copying one
       out may keep the space. The field strips it; a field that cut the paste
       at ten characters first would have kept nine digits. */
    const email = freshEmail();

    await page.goto('/sign-in');
    const emailField = page.getByLabel('Email address');
    await expect(emailField, REQUIRED).toBeVisible();
    await emailField.fill(email);
    await page.getByRole('button', { name: /Email me a code/ }).click();

    await expect(page.getByLabel('Sign-in code')).toBeVisible();
    await seedSignInCode(email, '1234567890');
    await page.getByLabel('Sign-in code').fill('12345 67890');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('a wrong code does not, and says so in plain words', async ({ page }) => {
    const email = freshEmail();

    await page.goto('/sign-in');
    const emailField = page.getByLabel('Email address');
    await expect(emailField, REQUIRED).toBeVisible();

    await emailField.fill(email);
    await page.getByRole('button', { name: /Email me a code/ }).click();
    await expect(page.getByLabel('Sign-in code')).toBeVisible();
    await seedSignInCode(email, '1234567890');
    await page.getByLabel('Sign-in code').fill('9999999999');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Auth.js's own wording for a code that is wrong, used or expired. What
    // matters is that it is *not* the "Server error" page, which tells the
    // person nothing they can act on.
    await expect(page.getByText('Unable to sign in')).toBeVisible();
    await expect(page.getByText('There is a problem with the server configuration')).toHaveCount(0);
  });
});

/**
 * Checking a code is limited too (GYM-124). Auth.js checks it in its own
 * callback and limited nothing, so anyone who knew an address could try every
 * code while one lived. These drive the real callback, so what they
 * see is what an attacker would.
 *
 * Each test sends its own client key, so the per-client limit is never spent by
 * another test or an earlier run.
 */
test.describe('Guessing a sign-in code', () => {
  const freshEmail = () => `guess-${randomUUID().slice(0, 8)}@example.test`;
  const callback = (query: string) => `/api/auth/callback/resend?${query}`;
  const codeQuery = (email: string, token: string) =>
    new URLSearchParams({ token, email, callbackUrl: '/' }).toString();

  /* Each test's own client key, sent on every request it makes. A page's extra
     headers do not reach `page.request`, so it is passed by hand. */
  let client = '';
  const as = () => ({ 'x-forwarded-for': client });
  test.beforeEach(() => {
    client = `guess-${randomUUID()}`;
  });

  /** Where Auth.js sends a check, and whether it signed anybody in. */
  const check = async (
    page: import('@playwright/test').Page,
    query: string,
    method: 'get' | 'post' = 'get',
  ) => {
    const res = await page.request[method](callback(query), {
      maxRedirects: 0,
      headers: as(),
    });
    return {
      status: res.status(),
      location: res.headers()['location'] ?? '',
      signedIn: (res.headers()['set-cookie'] ?? '').includes('authjs.session-token='),
    };
  };

  test('after five tries the right code no longer signs in', async ({ page }) => {
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');

    const wrong = await check(page, codeQuery(email, '9999999999'));
    for (let i = 0; i < 4; i++) await check(page, codeQuery(email, '9999999999'));

    // The sixth carries the right code, and is answered exactly like a wrong
    // one: nothing tells a refused check from a mistyped code.
    const refused = await check(page, codeQuery(email, '1234567890'));
    expect(refused).toEqual(wrong);
    expect(wrong).toMatchObject({ status: 302, signedIn: false });
    expect(wrong.location).toContain('error=Verification');
  });

  test('a right code within the tries still signs in', async ({ page }) => {
    // The other half of the line: four typos cost nothing.
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');
    for (let i = 0; i < 4; i++) await check(page, codeQuery(email, '9999999999'));

    const right = await check(page, codeQuery(email, '1234567890'));
    expect(right).toMatchObject({ status: 302, signedIn: true });
    expect(right.location).not.toContain('error=');
  });

  test("a stranger's tries from another connection never shut the owner out", async ({ page }) => {
    /* Tries are counted per address and connection (GYM-154): a stranger who
       spends an address's tries shuts out only their own connection. */
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');
    const stranger = { 'x-forwarded-for': `guess-${randomUUID()}` };
    const asStranger = (token: string) =>
      page.request.get(callback(codeQuery(email, token)), { maxRedirects: 0, headers: stranger });

    for (let i = 0; i < 10; i++) await asStranger('9999999999');
    // The stranger is shut out, right code or not, and the code is left alone.
    const theirs = await asStranger('1234567890');
    expect(theirs.headers()['set-cookie'] ?? '').not.toContain('authjs.session-token=');

    // The owner, from their own connection, signs in with it.
    expect(await check(page, codeQuery(email, '1234567890'))).toMatchObject({
      status: 302,
      signedIn: true,
    });
  });

  test('a check or an ask sent from another site is refused, and never counted', async ({
    page,
  }) => {
    /* A page elsewhere can make a visitor's browser send these (an image tag
       with a wrong code in it, a form posted out of sight), spending the
       visitor's budgets on the visitor's own connection. Refused before
       anything is counted, so the owner's own tries and asks are untouched. */
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');
    const fromElsewhere = (token: string, method: 'get' | 'post' = 'get') =>
      page.request[method](callback(codeQuery(email, token)), {
        maxRedirects: 0,
        headers: { ...as(), 'sec-fetch-site': 'cross-site' },
      });

    for (let i = 0; i < 10; i++) {
      const res = await fromElsewhere('9999999999');
      expect(res.headers()['location']).toContain('error=Verification');
    }
    // A form posted out of sight sends them as POSTs: five, every try there is.
    for (let i = 0; i < 5; i++) {
      const res = await fromElsewhere('9999999999', 'post');
      expect(res.headers()['location']).toContain('error=Verification');
    }
    // Refused even with the right code: nothing from another site is checked.
    const right = await fromElsewhere('1234567890');
    expect(right.headers()['set-cookie'] ?? '').not.toContain('authjs.session-token=');

    // Asks from another site, or not sent as JSON, are refused too.
    const ask = (headers: Record<string, string>, data: unknown) =>
      page.request.post('/api/auth/email-code', { data, headers: { ...as(), ...headers } });
    for (let i = 0; i < 3; i++) {
      expect((await ask({ 'sec-fetch-site': 'cross-site' }, { email })).status()).toBe(403);
      expect(
        (await ask({ 'content-type': 'text/plain' }, JSON.stringify({ email }))).status(),
      ).toBe(403);
    }

    // The owner, on the same connection, still has every ask and every try.
    expect((await ask({}, { email })).status()).toBe(200);
    await seedSignInCode(email, '1234567890');
    expect(await check(page, codeQuery(email, '1234567890'))).toMatchObject({ signedIn: true });
  });

  test('a check sent as a POST is counted like a GET', async ({ page }) => {
    // Auth.js runs the email callback for a POST as well, reading the code off
    // the query string, so a limit on GET alone would leave a side door.
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');
    // A POST is checked at all: a wrong code is answered as one.
    const wrong = await check(page, codeQuery(email, '9999999999'), 'post');
    expect(wrong).toMatchObject({ status: 302, signedIn: false });
    expect(wrong.location).toContain('error=Verification');
    for (let i = 0; i < 4; i++) await check(page, codeQuery(email, '9999999999'), 'post');

    expect(await check(page, codeQuery(email, '1234567890'), 'post')).toMatchObject({
      signedIn: false,
    });
  });

  test('a repeated address is counted against the one Auth.js checks', async ({ page }) => {
    /* Auth.js keeps the last of a repeated query value. Counted against the
       first, each guess could spend a decoy's budget instead of the victim's. */
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');
    for (let i = 0; i < 5; i++) {
      const decoy = freshEmail();
      const res = await check(
        page,
        `token=9999999999&email=${decoy}&email=${email}&callbackUrl=%2F`,
      );
      expect(res.location).toContain('error=Verification');
    }
    expect(
      await check(page, `token=1234567890&email=${freshEmail()}&email=${email}&callbackUrl=%2F`),
    ).toMatchObject({ signedIn: false });
  });

  test('a check with no address is answered like a wrong code', async ({ page }) => {
    const res = await check(page, 'token=1234567890&callbackUrl=%2F');
    expect(res).toMatchObject({ status: 302, signedIn: false });
    expect(res.location).toContain('error=Verification');
  });

  test('one client gets thirty checks, then none', async ({ page }) => {
    // Thirty different addresses, so no address limit can trip first; the
    // thirty-first carries a right code and is refused all the same.
    for (let i = 0; i < 30; i++) await check(page, codeQuery(freshEmail(), '9999999999'));
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');
    expect(await check(page, codeQuery(email, '1234567890'))).toMatchObject({ signedIn: false });
  });

  test('asking for a new code leaves only that one working', async ({ page, baseURL }) => {
    const email = freshEmail();
    await seedSignInCode(email, '1234567890');

    await page.goto(`${baseURL}/sign-in`);
    const ask = await page.request.post('/api/auth/email-code', {
      data: { email },
      headers: as(),
    });
    expect(ask.status()).toBe(200);

    // The new code is never seen here (the email cannot send in this suite),
    // but it is stored, it is the only one, and the old one no longer works.
    const codes = await storedCodes(email);
    expect(codes).toHaveLength(1);
    expect(codes[0]).not.toBe(codeHash('1234567890'));
    expect(await check(page, codeQuery(email, '1234567890'))).toMatchObject({ signedIn: false });
  });

  test('an ask past the limit stores nothing', async ({ page, baseURL }) => {
    /* The limit of two asks in five minutes, and everything said about it,
       holds only if a refused ask never reaches Auth.js: one that still made a
       code would replace the owner's and send another email. */
    const email = freshEmail();
    await page.goto(`${baseURL}/sign-in`);
    const ask = () => page.request.post('/api/auth/email-code', { data: { email }, headers: as() });

    expect((await ask()).status()).toBe(200);
    expect((await ask()).status()).toBe(200);
    const stored = await storedCodes(email);
    expect(stored).toHaveLength(1);

    expect((await ask()).status()).toBe(429);
    expect(await storedCodes(email)).toEqual(stored);
  });

  test("Auth.js's own route for sending codes is closed", async ({ page }) => {
    /* It sends a code to any address for anyone holding a CSRF token, which
       /api/auth/csrf hands to every caller, and it sits beside the limits on
       asking rather than behind them. The app never calls it over HTTP. */
    const email = freshEmail();
    const csrf = await page.request.get('/api/auth/csrf', { headers: as() });
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };

    const res = await page.request.post('/api/auth/signin/resend', {
      form: { csrfToken, email, callbackUrl: '/' },
      maxRedirects: 0,
      headers: as(),
    });
    expect(res.status()).toBe(404);
    expect(await storedCodes(email)).toEqual([]);
  });
});
