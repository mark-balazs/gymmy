import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { planEvents, planShares, plans, profiles, userGroups, users } from '@/lib/db/schema';
import {
  addMember,
  createGroup,
  createPlan,
  deleteGroup,
  deletePlan,
  listGroups,
  planShapeFor,
  plansVisibleTo,
  publishPlan,
  removeMember,
  renameGroup,
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
  /** Does everything the audit trail records, and nothing else — see the audit test. */
  const auditor = randomUUID();
  const everyone = [trainer, athlete, stranger, auditor];

  const athleteEmail = `athlete-${athlete.slice(0, 8)}@example.test`;
  const strangerEmail = `other-${stranger.slice(0, 8)}@example.test`;

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
      { id: athlete, name: 'Athlete', email: athleteEmail },
      { id: stranger, name: 'Stranger', email: strangerEmail },
      { id: auditor, name: 'Auditor', email: `auditor-${auditor.slice(0, 8)}@example.test` },
    ]);
  });

  afterAll(async () => {
    /* Audit events outlive their actor by design, so they are cleaned up here —
       and first. `actor_id` is ON DELETE SET NULL, so once the users are gone
       there is nothing left to find these rows by; deleting in the other order
       matched nothing and leaked every event this file wrote. Every actor, not
       just the trainer: the stranger and the auditor write events too. */
    await db.delete(planEvents).where(inArray(planEvents.actorId, everyone));
    await db.delete(users).where(inArray(users.id, everyone));
  });

  const idsVisibleTo = async (userId: string) => (await plansVisibleTo(userId)).map((p) => p.id);

  it('shows a trainer their own plan before anybody else can see it', async () => {
    const id = await createPlan(trainer, draft('Unpublished block'));

    expect(await idsVisibleTo(trainer)).toContain(id);
    // A draft is somebody thinking out loud. Sharing one should not leak it.
    await sharePlan(trainer, id, { userEmail: athleteEmail });
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
    await addMember(trainer, groupId, athleteEmail);
    await sharePlan(trainer, id, { groupId });

    expect(await idsVisibleTo(athlete)).toContain(id);
    expect(await idsVisibleTo(stranger)).not.toContain(id);

    /* Membership is read at the moment of asking rather than copied onto the
       plan when it is shared. If it were cached, this is where somebody would
       keep seeing a plan they had been removed from. */
    await removeMember(trainer, groupId, athlete);
    expect(await idsVisibleTo(athlete)).not.toContain(id);
  });

  it('stops at a revoked share, and keeps the share on record', async () => {
    const id = await createPlan(trainer, draft('Revoked block'));
    await publishPlan(trainer, id);
    await sharePlan(trainer, id, { userEmail: athleteEmail });
    expect(await idsVisibleTo(athlete)).toContain(id);

    const [share] = await listShares(trainer, id);
    expect(share).toBeDefined();
    await revokeShare(trainer, id, share!.id);

    expect(await idsVisibleTo(athlete)).not.toContain(id);
    // Revoked, not deleted: the share is gone from the live list, and the fact
    // that it once existed is still on the record. A hard delete passes both
    // of the checks before this one, so the row itself is read back.
    expect(await listShares(trainer, id)).toHaveLength(0);
    const [row] = await db.select().from(planShares).where(eq(planShares.id, share!.id));
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });

  it('answers the same way for a plan you cannot see and one that is not there', async () => {
    // Otherwise the endpoint becomes a way to find out which plan ids are real.
    const id = await createPlan(trainer, draft('Hidden block'));
    await publishPlan(trainer, id);
    expect(await planShapeFor(stranger, id)).toBeNull();
    expect(await planShapeFor(stranger, randomUUID())).toBeNull();
  });

  it('carries the exercises across by name', async () => {
    /* The crossing this whole design turns on. A pre-catalogue exercise id is
       `sha256(userId, …)` and means nothing in another account, so the plan
       stores what a person would say instead.

       The whole shape is compared, not a field or two of it. The athlete's
       week is built from the slot's key, day, patterns and role as much as from
       its exercise, and a mapper that dropped any of them would still carry the
       name across. Written out of order so the read has to put them back. */
    const accessory = slot({
      position: 1,
      key: 'accessory',
      dayKey: 'pull',
      patternKeys: ['pull'],
      requiredRole: 'Upper',
    });
    const bench = slot({
      position: 0,
      exerciseName: 'Barbell Bench Press',
      sets: 4,
      repRange: '3-5',
    });
    const id = await createPlan(trainer, draft('Named block', [accessory, bench]));
    await publishPlan(trainer, id);
    await sharePlan(trainer, id, { userEmail: athleteEmail });

    const got = await planShapeFor(athlete, id);
    expect(got?.plan).toEqual({
      name: 'Named block',
      description: 'Four hard weeks',
      days: 3,
      where: 'gym',
      slots: [bench, accessory],
    });
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
    await sharePlan(trainer, id, { userEmail: athleteEmail });
    const [share] = await listShares(trainer, id);

    expect(await updatePlan(stranger, id, draft('Hijacked'))).toBe(false);
    expect(await publishPlan(stranger, id)).toBe(false);
    expect(await deletePlan(stranger, id)).toBe(false);
    expect(await sharePlan(stranger, id, { userEmail: 'anyone@example.test' })).toBe(false);

    /* The share list and revoking carry their own ownership checks, separate
       from the ones above. Without them anybody could read who a plan was given
       to, and take it away from them. And a share is scoped to its plan, so
       owning *a* plan is not enough to revoke a share on somebody else's. */
    expect(await listShares(stranger, id)).toEqual([]);
    expect(await revokeShare(stranger, id, share!.id)).toBe(false);
    const own = await createPlan(stranger, draft('Strangers own'));
    expect(await revokeShare(stranger, own, share!.id)).toBe(false);
    expect(await idsVisibleTo(athlete)).toContain(id);

    const still = await plansVisibleTo(trainer);
    expect(still.find((p) => p.id === id)?.name).toBe('Not yours');
  });

  it('says nothing about whether an address has an account', async () => {
    /* Adding a stranger's address to a group must not become a way of asking
       who is on gymmy. Both answers look identical from outside — so both are
       asked, an address nobody has and one somebody does, and sharing a plan
       is held to the same silence as adding a member. */
    const groupId = await createGroup(trainer, 'Quiet group');
    expect(await addMember(trainer, groupId, 'nobody-at-all@example.test')).toBe(true);
    const group = (await listGroups(trainer)).find((g) => g.id === groupId);
    expect(group?.members).toHaveLength(0);
    expect(await addMember(trainer, groupId, athleteEmail)).toBe(true);

    const id = await createPlan(trainer, draft('Quiet block'));
    await publishPlan(trainer, id);
    expect(await sharePlan(trainer, id, { userEmail: 'nobody-at-all@example.test' })).toBe(true);
    expect(await listShares(trainer, id)).toHaveLength(0);
    expect(await sharePlan(trainer, id, { userEmail: athleteEmail })).toBe(true);
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
    /* Not decoration: a trail added later only covers the period after it was
       added, and every question anybody asks of one is about the period before.
       Every action is driven here, by an account that does nothing else, rather
       than read off whatever the tests above happened to leave behind — which
       is what this used to do, and run on its own it failed. */
    const plan = await createPlan(auditor, draft('Audited block'));
    await updatePlan(auditor, plan, draft('Audited block'));
    await publishPlan(auditor, plan);
    await sharePlan(auditor, plan, { userEmail: athleteEmail });
    const [share] = await listShares(auditor, plan);
    await revokeShare(auditor, plan, share!.id);
    const group = await createGroup(auditor, 'Audited group');
    await renameGroup(auditor, group, 'Audited group, renamed');
    await addMember(auditor, group, athleteEmail);
    await removeMember(auditor, group, athlete);
    expect(await deletePlan(auditor, plan)).toBe(true);
    expect(await deleteGroup(auditor, group)).toBe(true);

    const events = await db.select().from(planEvents).where(eq(planEvents.actorId, auditor));
    expect([...new Set(events.map((e) => e.action))]).toEqual(
      expect.arrayContaining([
        'plan.created',
        'plan.updated',
        'plan.published',
        'plan.shared',
        'plan.revoked',
        'group.created',
        'group.renamed',
        'group.member.added',
        'group.member.removed',
        'plan.deleted',
        'group.deleted',
      ]),
    );

    // The name is copied in, so the row still says something once the plan it
    // refers to is gone — which it now is, so that is what is read back.
    expect(events.every((e) => e.action.startsWith('group.') || e.planName)).toBe(true);
    const created = events.find((e) => e.action === 'plan.created')!;
    expect(created.planId).toBeNull();
    expect(created.planName).toBe('Audited block');
    const made = events.find((e) => e.action === 'group.created')!;
    expect(made.groupId).toBeNull();
    expect(made.groupName).toBe('Audited group');

    /* The deletions themselves, which are what an audit trail is asked about
       most. Each names what went, by the name it had then, and points at
       nothing: the row is gone. They were missing entirely — written with the
       deleted row's id, refused by the foreign key, and the refusal swallowed. */
    const planGone = events.find((e) => e.action === 'plan.deleted')!;
    expect(planGone.planId).toBeNull();
    expect(planGone.planName).toBe('Audited block');
    const groupGone = events.find((e) => e.action === 'group.deleted')!;
    expect(groupGone.groupId).toBeNull();
    expect(groupGone.groupName).toBe('Audited group, renamed');
  });

  it('deleting a plan takes nobody’s week with it', async () => {
    const id = await createPlan(trainer, draft('Doomed block'));
    await publishPlan(trainer, id);
    await sharePlan(trainer, id, { userEmail: athleteEmail });
    expect(await idsVisibleTo(athlete)).toContain(id);

    /* An athlete training on it, as applying it leaves them: the plan's id and
       version on their profile. That column deliberately has no foreign key —
       a snapshot, never a link (D-011) — and nothing else in the suite would
       notice one being added: a cascade would delete this person's profile with
       the plan, and set-null would quietly take them off it. */
    await db.insert(profiles).values({
      id: athlete,
      userId: athlete,
      updatedAt: new Date(),
      seq: sql`nextval('change_seq')`,
      blockStart: '2026-09-14',
      planId: id,
      planVersion: 1,
    });

    expect(await deletePlan(trainer, id)).toBe(true);
    expect(await idsVisibleTo(athlete)).not.toContain(id);
    const [gone] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    expect(gone).toBeUndefined();

    // The athlete's week is untouched — a plan is copied at the moment it is
    // applied, and this file never writes into a replicated table at all.
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, athlete));
    expect(profile?.planId).toBe(id);
    expect(profile?.planVersion).toBe(1);
  });

  it('lists a group with everybody in it', async () => {
    const groupId = await createGroup(trainer, 'Listed group');
    await addMember(trainer, groupId, athleteEmail);
    await addMember(trainer, groupId, strangerEmail);

    const group = (await listGroups(trainer)).find((g) => g.id === groupId);
    const members = [athlete, stranger].sort();
    expect(group?.members.map((m) => m.id).sort()).toEqual(members);

    // A group belongs to whoever made it; nobody else can list or change it —
    // each write checks that for itself, so each is asked.
    expect(await listGroups(stranger)).toHaveLength(0);
    expect(await removeMember(stranger, groupId, athlete)).toBe(false);
    expect(await addMember(stranger, groupId, strangerEmail)).toBe(false);
    expect(await renameGroup(stranger, groupId, 'Hijacked')).toBe(false);
    expect(await deleteGroup(stranger, groupId)).toBe(false);
    const [survives] = await db.select().from(userGroups).where(eq(userGroups.id, groupId));
    expect(survives?.name).toBe('Listed group');
    const after = (await listGroups(trainer)).find((g) => g.id === groupId);
    expect(after?.members.map((m) => m.id).sort()).toEqual(members);
  });

  it('finds a member however their address was typed', async () => {
    /* The route checks that it is an address and passes it on as typed, so the
       normalising happens here or nowhere. Without it a trainer who types a
       client's address with a capital letter is told "taken" — the same answer
       as for an unknown address, by design — and the client never appears. */
    const groupId = await createGroup(trainer, 'Typed group');
    await addMember(trainer, groupId, ` ${athleteEmail.toUpperCase()} `);
    const group = (await listGroups(trainer)).find((g) => g.id === groupId);
    expect(group?.members.map((m) => m.id)).toEqual([athlete]);
  });
});
