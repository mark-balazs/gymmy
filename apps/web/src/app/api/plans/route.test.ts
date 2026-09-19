import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { planEvents, plans, users } from '@/lib/db/schema';
import { GET, POST } from './route';
import { DELETE, PUT } from './[id]/route';
import { POST as PUBLISH } from './[id]/publish/route';
import * as shares from './[id]/shares/route';
import * as groups from '../groups/route';
import * as group from '../groups/[id]/route';
import * as members from '../groups/[id]/members/route';

/* Whoever the route believes is signed in. The session is the one thing
   stubbed — Auth.js cannot load outside Next, and what is under test is what a
   route does with a session, not how it got one. The role behind it is read
   from the real database, which is the point. */
const who = vi.hoisted(() => ({ id: '' }));
vi.mock('@/lib/auth', () => ({ auth: async () => (who.id ? { user: { id: who.id } } : null) }));

/**
 * Reading a plan needs a session; writing one needs a trainer.
 *
 * The role is read from the database on every request rather than trusted
 * from the session, because a role is the kind of thing that gets revoked and
 * a session outliving the revocation by a week is exactly what the check is
 * for (openapi.yaml says so). Nothing else sends a request to these routes —
 * the e2e fixtures write plans in SQL — so without this, a route that checked
 * only for a session, or a guard that cached the role, would ship unnoticed.
 */
describe('the plans API', () => {
  const userId = randomUUID();

  const body = {
    name: 'Gated block',
    description: '',
    days: 3,
    where: 'gym',
    slots: [
      {
        sessionIndex: 0,
        position: 0,
        name: 'main',
        requiredRole: 'Any',
        sets: 3,
        repRange: '5-8',
      },
    ],
  };
  const request = (method: string, payload?: unknown) =>
    new Request('http://localhost/api/plans', {
      method,
      headers: { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const setRole = (role: 'athlete' | 'trainer') =>
    db.update(users).set({ role }).where(eq(users.id, userId));

  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      name: 'Gate test',
      email: `gate-${userId.slice(0, 8)}@example.test`,
    });
    who.id = userId;
  });

  afterAll(async () => {
    who.id = '';
    // Events first: their actor is set null with the user, and then nothing
    // is left to find them by.
    await db.delete(planEvents).where(eq(planEvents.actorId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('lets any account read, and only a trainer write', async () => {
    await setRole('athlete');
    expect((await GET()).status).toBe(200);
    expect((await POST(request('POST', body))).status).toBe(401);

    await setRole('trainer');
    const made = await POST(request('POST', body));
    expect(made.status).toBe(201);
    expect(((await made.json()) as { id: string }).id).toBeTruthy();
  });

  it('turns away somebody who is not signed in', async () => {
    who.id = '';
    try {
      expect((await GET()).status).toBe(401);
      expect((await POST(request('POST', body))).status).toBe(401);
    } finally {
      who.id = userId;
    }
  });

  it('locks a trainer out the moment the role is taken away', async () => {
    /* Same session throughout — only the row changes. A guard that read the
       role once, or from the session, would still wave these through. */
    await setRole('trainer');
    const { id } = (await (await POST(request('POST', body))).json()) as { id: string };

    await setRole('athlete');
    expect((await PUT(request('PUT', { ...body, name: 'Rewritten' }), ctx(id))).status).toBe(401);
    expect((await PUBLISH(request('POST'), ctx(id))).status).toBe(401);
    expect((await DELETE(request('DELETE'), ctx(id))).status).toBe(401);

    // And refused before anything was written, not after.
    const [row] = await db.select().from(plans).where(eq(plans.id, id));
    expect(row?.name).toBe('Gated block');
    expect(row?.publishedAt).toBeNull();
  });

  it('holds every other trainer route to the same rule', async () => {
    // The shares and groups routes each call the guard themselves, so each is
    // asked. An athlete gets 401 from all of them, whatever the body says.
    await setRole('athlete');
    const id = randomUUID();
    const answers = {
      'GET shares': await shares.GET(request('GET'), ctx(id)),
      'POST shares': await shares.POST(request('POST', { userEmail: 'a@example.test' }), ctx(id)),
      'DELETE shares': await shares.DELETE(request('DELETE', { shareId: 'x' }), ctx(id)),
      'GET groups': await groups.GET(),
      'POST groups': await groups.POST(request('POST', { name: 'Squad' })),
      'PUT group': await group.PUT(request('PUT', { name: 'Squad' }), ctx(id)),
      'DELETE group': await group.DELETE(request('DELETE'), ctx(id)),
      'POST members': await members.POST(request('POST', { email: 'a@example.test' }), ctx(id)),
      'DELETE members': await members.DELETE(request('DELETE', { userId: 'x' }), ctx(id)),
    };
    for (const [route, res] of Object.entries(answers)) expect(res.status, route).toBe(401);
  });
});
