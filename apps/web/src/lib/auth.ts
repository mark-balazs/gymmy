/**
 * Auth.js (NextAuth v5) with Google.
 *
 * Sessions are database-backed rather than JWT: this app can revoke access and
 * cascade a full account deletion, which a stateless JWT cannot do until it
 * expires.
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';
import { env } from '@/env';
import { seedNewUser } from '@/lib/db/seed-user';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
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
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    /** Fires once per account, so the default library is created exactly once. */
    async createUser({ user }) {
      if (user.id) await seedNewUser(user.id);
    },
  },
  trustHost: true,
});
