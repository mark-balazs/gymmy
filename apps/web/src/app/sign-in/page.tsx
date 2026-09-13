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
            className="min-h-[var(--spacing-tap)] w-full cursor-pointer rounded-[11px] bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-ink)]"
          >
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
