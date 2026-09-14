import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { planEvents, plans, userGroups, users } from '@/lib/db/schema';
import {
  addMember,
  createGroup,
  createPlan,
  deletePlan,
  listGroups,
  planShapeFor,
  plansVisibleTo,
  publishPlan,
  removeMember,
  revokeShare,
  listShares,
  sharePlan,
  updatePlan,
} from './plans';
import type { PlanSlot } from '@athletic/domain';

/**
 * Who can see whose plan.
 *
 * This is the first thing in gymmy where one person's row is read by another,
 * so the interesting assertions are all about the cases that must **not** work.
 * Every table before this one was `primaryKey(userId, id)`, where a leak was
 * structurally impossible; here it is a `WHERE` clause, and a `WHERE` clause is
 * something you can get wrong.
 *
 * Runs against the real database, because the rule is a SQL `EXISTS` over three
 * tables and a mock of it would only ever agree with itself.
 */
describe('plans and who can see them', () => {
  const trainer = randomUUID();
  const athlete = randomUUID();
  const stranger = randomUUID();

  const slot = (over: Partial<PlanSlot> = {}): PlanSlot => ({
    sessionIndex: 0,
    position: 0,
    key: 'main',
    name: 'main',
    requiredRole: 'Any',
    patternKeys: ['push'],
    dayKey: 'push',
    exerciseName: null,
    sets: 3,
    repRange: '5-8',
    ...over,
  });

  const draft = (name: string, slots: PlanSlot[] = [slot()]) => ({
    name,
    description: 'Four hard weeks',
    days: 3,
    where: 'gym' as const,
    slots,
  });

  beforeAll(async () => {
    await db.insert(users).values([
      { id: trainer, name: 'Coach', email: `coach-${trainer.slice(0, 8)}@example.test` },
      { id: athlete, name: 'Athlete', email: `athlete-${athlete.slice(0, 8)}@example.test` },
      { id: stranger, name: 'Stranger', email: `other-${stranger.slice(0, 8)}@example.test` },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [trainer, athlete, stranger]));
    // Audit events outlive their actor by design, so they are cleaned up here.
    await db.delete(planEvents).where(eq(planEvents.actorId, trainer));
  });

  const idsVisibleTo = async (userId: string) => (await plansVisibleTo(userId)).map((p) => p.id);

  it('shows a trainer their own plan before anybody else can see it', async () => {
    const id = await createPlan(trainer, draft('Unpublished block'));

    expect(await idsVisibleTo(trainer)).toContain(id);
    // A draft is somebody thinking out loud. Sharing one should not leak it.
    await sharePlan(trainer, id, { userEmail: `athlete-${athlete.slice(0, 8)}@example.test` });
    expect(await idsVisibleTo(athlete)).not.toContain(id);

    await publishPlan(trainer, id);
    expect(await idsVisibleTo(athlete)).toContain(id);
  });

  it('does not show a plan to somebody it was never shared with', async () => {
    const id = await createPlan(trainer, draft('Private block'));
    await publishPlan(trainer, id);
    expect(await idsVisibleTo(stranger)).not.toContain(id);
  });

  it('reaches everybody in a group, and stops when somebody leaves it', async () => {
    const id = await createPlan(trainer, draft('Group block'));
    await publishPlan(trainer, id);
    const groupId = await createGroup(trainer, 'Tuesday squad');
    await addMember(trainer, groupId, `athlete-${athlete.slice(0, 8)}@example.test`);
    await sharePlan(trainer, id, { groupId });

    expect(await idsVisibleTo(athlete)).toContain(id);
    expect(await idsVisibleTo(stranger)).not.toContain(id);

    /* Membership is read at the moment of asking rather than copied onto the
       plan when it is shared. If it were cached, this is where somebody would
       keep seeing a plan they had been removed from. */
    await removeMember(trainer, groupId, athlete);
    expect(await idsVisibleTo(athlete)).not.toContain(id);
  });

  it('stops at a revoked share without touching anybody’s training', async () => {
    const id = await createPlan(trainer, draft('Revoked block'));
    await publishPlan(trainer, id);
    await sharePlan(trainer, id, { userEmail: `athlete-${athlete.slice(0, 8)}@example.test` });
    expect(await idsVisibleTo(athlete)).toContain(id);

    const [share] = await listShares(trainer, id);
    expect(share).toBeDefined();
    await revokeShare(trainer, id, share!.id);

    expect(await idsVisibleTo(athlete)).not.toContain(id);
    // Revoked, not deleted: the share is gone from the live list, and the fact
    // that it once existed is still on the record.
    expect(await listShares(trainer, id)).toHaveLength(0);
  });

  it('answers the same way for a plan you cannot see and one that is not there', async () => {
    // Otherwise the endpoint becomes a way to find out which plan ids are real.
    const id = await createPlan(trainer, draft('Hidden block'));
    await publishPlan(trainer, id);
    expect(await planShapeFor(stranger, id)).toBeNull();
    expect(await planShapeFor(stranger, randomUUID())).toBeNull();
  });

  it('carries the exercises across by name', async () => {
    /* The crossing this whole design turns on. An exercise id is
       `sha256(userId, …)` and means nothing in another account, so the plan
       stores what a person would say instead. */
    const id = await createPlan(
      trainer,
      draft('Named block', [
        slot({ position: 0, exerciseName: 'Barbell Bench Press', sets: 4, repRange: '3-5' }),
        slot({ position: 1, exerciseName: null }),
      ]),
    );
    await publishPlan(trainer, id);
    await sharePlan(trainer, id, { userEmail: `athlete-${athlete.slice(0, 8)}@example.test` });

    const got = await planShapeFor(athlete, id);
    expect(got?.plan.slots).toHaveLength(2);
    expect(got?.plan.slots[0]?.exerciseName).toBe('Barbell Bench Press');
    expect(got?.plan.slots[0]?.sets).toBe(4);
    expect(got?.plan.slots[0]?.repRange).toBe('3-5');
    expect(got?.plan.slots[1]?.exerciseName).toBeNull();
    expect(got?.ownerName).toBe('Coach');
  });

  it('bumps the version only once somebody could be training on it', async () => {
    const id = await createPlan(trainer, draft('Versioned block'));

    // Editing a draft changes nothing anybody has: no version to bump.
    await updatePlan(trainer, id, draft('Versioned block, take two'));
    let seen = (await plansVisibleTo(trainer)).find((p) => p.id === id);
    expect(seen?.version).toBe(1);

    await publishPlan(trainer, id);
    await updatePlan(trainer, id, draft('Versioned block, take three'));
    seen = (await plansVisibleTo(trainer)).find((p) => p.id === id);
    // Higher than what an athlete applied is the whole update mechanism: it is
    // what lets the app offer a new edition instead of rewriting their week.
    expect(seen?.version).toBe(2);
  });

  it('refuses to edit or share a plan that is not yours', async () => {
    const id = await createPlan(trainer, draft('Not yours'));
    await publishPlan(trainer, id);

    expect(await updatePlan(stranger, id, draft('Hijacked'))).toBe(false);
    expect(await publishPlan(stranger, id)).toBe(false);
    expect(await deletePlan(stranger, id)).toBe(false);
    expect(await sharePlan(stranger, id, { userEmail: 'anyone@example.test' })).toBe(false);

    const still = await plansVisibleTo(trainer);
    expect(still.find((p) => p.id === id)?.name).toBe('Not yours');
  });

  it('says nothing about whether an address has an account', async () => {
    /* Adding a stranger's address to a group must not become a way of asking
       who is on gymmy. Both answers look identical from outside. */
    const groupId = await createGroup(trainer, 'Quiet group');
    expect(await addMember(trainer, groupId, 'nobody-at-all@example.test')).toBe(true);
    const group = (await listGroups(trainer)).find((g) => g.id === groupId);
    expect(group?.members).toHaveLength(0);
  });

  it('needs exactly one target for a share', async () => {
    const id = await createPlan(trainer, draft('Target block'));
    await publishPlan(trainer, id);
    const groupId = await createGroup(trainer, 'Both at once');

    // Neither is a share into the void; both has no meaning anyone could agree
    // on. Both are refused rather than guessed at.
    expect(await sharePlan(trainer, id, {})).toBe(false);
    expect(await sharePlan(trainer, id, { userEmail: 'a@example.test', groupId })).toBe(false);
  });

  it('writes an audit event for everything that happened', async () => {
    // Not decoration: a trail added later only covers the period after it was
    // added, and every question anybody asks of one is about the period before.
    const events = await db.select().from(planEvents).where(eq(planEvents.actorId, trainer));
    const actions = new Set(events.map((e) => e.action));
    expect(actions).toContain('plan.created');
    expect(actions).toContain('plan.published');
    expect(actions).toContain('plan.updated');
    expect(actions).toContain('plan.shared');
    expect(actions).toContain('plan.revoked');
    expect(actions).toContain('group.created');
    expect(actions).toContain('group.member.added');
    expect(actions).toContain('group.member.removed');
    // The name is copied in, so the row still says something once the plan it
    // refers to is gone.
    expect(events.every((e) => e.action.startsWith('group.') || e.planName)).toBe(true);
  });

  it('deleting a plan takes nobody’s week with it', async () => {
    const id = await createPlan(trainer, draft('Doomed block'));
    await publishPlan(trainer, id);
    await sharePlan(trainer, id, { userEmail: `athlete-${athlete.slice(0, 8)}@example.test` });
    expect(await idsVisibleTo(athlete)).toContain(id);

    expect(await deletePlan(trainer, id)).toBe(true);
    expect(await idsVisibleTo(athlete)).not.toContain(id);
    // The athlete's own slots and entries are untouched by any of this — a plan
    // is copied at the moment it is applied, and this file never writes into a
    // replicated table at all.
    const [gone] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    expect(gone).toBeUndefined();
  });

  it('lists a group with everybody in it', async () => {
    const groupId = await createGroup(trainer, 'Listed group');
    await addMember(trainer, groupId, `athlete-${athlete.slice(0, 8)}@example.test`);
    await addMember(trainer, groupId, `other-${stranger.slice(0, 8)}@example.test`);

    const group = (await listGroups(trainer)).find((g) => g.id === groupId);
    expect(group?.members.map((m) => m.id).sort()).toEqual([athlete, stranger].sort());

    // A group belongs to whoever made it; nobody else can list or change it.
    expect(await listGroups(stranger)).toHaveLength(0);
    expect(await removeMember(stranger, groupId, athlete)).toBe(false);
    const [survives] = await db.select().from(userGroups).where(eq(userGroups.id, groupId));
    expect(survives?.name).toBe('Listed group');
  });
});
