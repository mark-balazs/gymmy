import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

/**
 * What a request with no session cookie gets back.
 *
 * The distinction this holds is not cosmetic. A person with no session should
 * see the sign-in page; `fetch` should be told it is not signed in. When the
 * API redirected too, the sync followed the redirect, received the sign-in
 * page as a `200` full of HTML, failed to parse it, and reported a sync error
 * — indistinguishable from a bad connection. So a session that had simply
 * expired read as "offline" on full signal, for ever, while the queue grew
 * (GYM-57, cause 15).
 *
 * `docs/openapi.yaml` states the `401` for every route; this is the half a
 * build can check.
 */
describe('middleware', () => {
  const ask = (path: string, cookie?: string) =>
    middleware(
      new NextRequest(`http://localhost${path}`, {
        method: path.startsWith('/api/') ? 'POST' : 'GET',
        headers: cookie ? { cookie } : {},
      }),
    );

  it('answers 401 with JSON for an API request with no session', async () => {
    const res = ask('/api/sync');
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    // The thing that broke the client: nowhere to follow.
    expect(res.headers.get('location')).toBeNull();
  });

  it('answers 401 for every API route, not only sync', () => {
    expect(ask('/api/plans').status).toBe(401);
    expect(ask('/api/plans/shared').status).toBe(401);
  });

  it('still sends a person to the sign-in page, remembering where they were', () => {
    const res = ask('/train');
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/sign-in');
    expect(to.searchParams.get('from')).toBe('/train');
  });

  it('lets sign-in and the auth routes through with no session at all', () => {
    for (const path of ['/sign-in', '/api/auth/session', '/manifest.webmanifest']) {
      expect(ask(path).status, path).toBe(200);
    }
  });

  it('lets a request carrying a session cookie through', () => {
    expect(ask('/api/sync', 'authjs.session-token=abc').status).toBe(200);
    expect(ask('/train', '__Secure-authjs.session-token=abc').status).toBe(200);
  });
});
