import type { DefaultSession } from 'next-auth';

/**
 * The session carries the account's role.
 *
 * A hint for rendering and nothing more: it decides whether the coach area is
 * offered, while every write that depends on the role re-reads the user row.
 * A database session lasts ninety days, and a role that was taken away should
 * not keep working for the rest of them.
 */
declare module 'next-auth' {
  interface Session {
    user: { id: string; role: 'athlete' | 'trainer' } & DefaultSession['user'];
  }
}
