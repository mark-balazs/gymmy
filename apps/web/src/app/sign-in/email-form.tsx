'use client';

/**
 * Two steps on one screen: ask for the address, then for the code.
 *
 * Kept as one component with a `sent` flag rather than two routes, so the
 * address survives the transition. Retyping it to correct a typo in the code is
 * the kind of small indignity that makes people give up on signing in.
 */

import { useState } from 'react';
import { buttonClass } from '@/components/ui';
import { CODE_LENGTH, normaliseCode } from '@/lib/email-otp';

const field =
  'min-h-[var(--spacing-tap)] w-full rounded-[12px] border border-[var(--color-line)] ' +
  'bg-[var(--color-surface-2)] px-3.5 text-[17px] text-[var(--color-ink)]';

export function EmailSignIn({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/email-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Deliberately advances even when the address is unknown or throttled:
      // a different answer here would tell a stranger which addresses have
      // accounts, and how to tell when they had been rate limited.
      if (!res.ok && res.status !== 429) throw new Error('send failed');
      setSent(true);
    } catch {
      setError('Could not send the code. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void request();
        }}
      >
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
        <button
          type="submit"
          disabled={busy || !email}
          className={buttonClass('default', 'w-full')}
        >
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
        {error && <p className="text-xs text-[var(--color-bad)]">{error}</p>}
      </form>
    );
  }

  /*
   * GET, not POST, and that is the whole of it.
   *
   * Auth.js's email callback reads the token and the address off the *query
   * string* — the flow it was built for is someone opening a link from their
   * inbox. A POST put them in the body, where it never looked, so it saw no
   * token at all and answered with its own "Server error" page. Every code ever
   * entered failed that way.
   *
   * A GET form puts the same fields in the query string, which is exactly the
   * request a magic link would have made. It needs no CSRF token for the same
   * reason a link does not: the code itself is the secret, it is single-use,
   * and it expires in ten minutes.
   */
  return (
    <form className="flex w-full flex-col gap-2" method="get" action="/api/auth/callback/resend">
      <p className="text-xs text-[var(--color-muted)]">
        If {email} has an account, a code is on its way. It expires in 10 minutes.
      </p>

      {/* Auth.js verifies the pair, so both travel with the form. */}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <input
        name="token"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        placeholder="000000"
        aria-label="Sign-in code"
        value={code}
        onChange={(e) => setCode(normaliseCode(e.target.value).slice(0, CODE_LENGTH))}
        className={`${field} num text-center tracking-[0.4em]`}
      />

      <button
        type="submit"
        disabled={code.length !== CODE_LENGTH}
        className={buttonClass('primary', 'w-full')}
      >
        Sign in
      </button>

      <button
        type="button"
        onClick={() => {
          setSent(false);
          setCode('');
        }}
        className={buttonClass('ghost', 'w-full')}
      >
        Use a different address
      </button>
    </form>
  );
}
