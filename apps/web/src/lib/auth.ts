/**
 * Auth.js (NextAuth v5) with Google.
 *
 * Sessions are database-backed rather than JWT: this app can revoke access and
 * cascade a full account deletion, which a stateless JWT cannot do until it
 * expires.
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';
import { env } from '@/env';
import { seedNewUser } from '@/lib/db/seed-user';
import { CODE_TTL_SECONDS, generateCode, normaliseEmail, sendCode } from '@/lib/email-otp';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    /**
     * Email sign-in, as a six-digit code rather than the magic link this
     * provider sends by default. See lib/email-otp.ts for why.
     *
     * Registered only when a key is present: without one the button is not
     * offered, which is a better failure than a sign-in route that always
     * errors. Auth.js stores the code in `verificationToken` and deletes it on
     * use, so it is single-use and expiring without any extra machinery.
     */
    ...(env.RESEND_API_KEY
      ? [
          Resend({
            apiKey: env.RESEND_API_KEY,
            from: env.EMAIL_FROM,
            maxAge: CODE_TTL_SECONDS,
            generateVerificationToken: generateCode,
            normalizeIdentifier: normaliseEmail,
            async sendVerificationRequest({ identifier, token }) {
              await sendCode({
                apiKey: env.RESEND_API_KEY!,
                from: env.EMAIL_FROM,
                to: identifier,
                code: token,
              });
            },
          }),
        ]
      : []),
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      // Only identity — no Drive, Gmail or anything else.
      authorization: { params: { scope: 'openid email profile', prompt: 'select_account' } },
    }),
  ],
  session: { strategy: 'database', maxAge: 60 * 60 * 24 * 90 },
  pages: { signIn: '/sign-in' },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        /* The role rides along so a server component can decide whether the
           coach area exists for this person without a second query. It is
           only ever a hint for rendering: every write that depends on it
           re-reads the row, because a role is the kind of thing that gets
           revoked and a session can outlive that by three months. */
        session.user.role = (user as { role?: string }).role === 'trainer' ? 'trainer' : 'athlete';
      }
      return session;
    },
  },
  events: {
    /**
     * The earliest moment the default library can exist, but deliberately not
     * the only one.
     *
     * A throw here becomes Auth.js's "Server error" page, and this event fires
     * exactly once per account — so a failure used to be permanent: the user
     * row was already written, the event would never fire again, and the
     * account was left signed in and forever empty, which the app can only
     * render as a loading screen that never resolves.
     *
     * So it is best-effort. `/api/sync` seeds any account that turns up with
     * nothing, and seeding is idempotent, so the worst case is one slow first
     * sync rather than an account nobody can use.
     */
    async createUser({ user }) {
      if (!user.id) return;
      try {
        await seedNewUser(user.id, user.email);
      } catch (err) {
        console.error('[seed] first-run seeding failed; sync will retry', err);
      }
    },
  },
  trustHost: true,
});
