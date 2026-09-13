import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';
import { DEV_AUTH, devSignIn } from '@/lib/dev-auth';
import { env } from '@/env';
import { Logo } from '@/components/logo';
import { EmailSignIn } from './email-form';

export default async function SignIn() {
  const session = await auth();
  if (session?.user) redirect('/train');

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-[360px] flex-col items-center gap-4 text-center">
        <Logo className="h-12 w-auto text-[var(--color-accent)]" />
        <h1 className="text-[22px] font-bold">gymmy</h1>
        <p className="text-sm text-[var(--color-muted)]">Do it for you</p>

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/train' });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="flex min-h-[var(--spacing-tap)] w-full cursor-pointer items-center justify-center gap-2.5 rounded-[11px] bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-ink)]"
          >
            {/* The monochrome mark, in the button's own ink. Google's four
                colours only hold their meaning on white, so on a coloured
                button the choice is a white tile around them or no colour at
                all — and the tile was a sticker. The four paths are disjoint
                pieces of the same G, so filling them all gives the solid one. */}
            <svg viewBox="0 0 48 48" aria-hidden fill="currentColor" className="h-5 w-5 shrink-0">
              <path d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>
        </form>

        {env.RESEND_API_KEY && (
          <>
            <div className="flex w-full items-center gap-3 py-1">
              <span className="h-px flex-1 bg-[var(--color-line)]" />
              <span className="text-xs text-[var(--color-muted)]">or</span>
              <span className="h-px flex-1 bg-[var(--color-line)]" />
            </div>
            <EmailSignIn callbackUrl="/train" />
          </>
        )}

        <p className="text-xs text-[var(--color-muted)]">
          Your training syncs across your devices. Nothing is shared.
        </p>

        {/* Local development only — see lib/dev-auth.ts for why this cannot
            reach a deployed build. Styled as a warning rather than a button so
            it is never mistaken for part of the product. */}
        {DEV_AUTH && (
          <form
            action={async () => {
              'use server';
              await devSignIn();
              redirect('/train');
            }}
            className="w-full border-t border-[var(--color-line)] pt-4"
          >
            <button
              type="submit"
              className="min-h-[var(--spacing-tap)] w-full cursor-pointer rounded-[11px] border border-dashed border-[var(--color-bad)] px-4 text-sm font-semibold text-[var(--color-bad)]"
            >
              Skip sign-in (dev)
            </button>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              AUTH_DEV_BYPASS is on. Signs in as dev@localhost with no password.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
