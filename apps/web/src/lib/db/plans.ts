/**
 * Plans, groups and who can see what.
 *
 * This is the one part of gymmy where a row is written by one person and read
 * by another, and every rule here exists to keep that contained. Nothing below
 * touches a replicated table: a plan becomes somebody's training only when
 * *they* apply it, on their device, through the same `installSkeleton` a preset
 * goes through. The server never writes into an athlete's account.
 *
 * **Visibility is computed, never stored on the plan.** A plan is visible to
 * you if you own it, or if a live share points at you — directly, or at a group
 * you are in. Caching that as a flag would mean every group membership change
 * had to find and rewrite every plan, and the first time one was missed
 * somebody would keep seeing a plan they had been removed from.
 *
 * Every mutation records an event. That is not decoration: an audit trail added
 * later only ever covers the period after it was added, and the questions
 * people ask of one are always about the period before.
 */

import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  groupMembers,
  planEvents,
  planShares,
  planSlots,
  plans,
  userGroups,
  users,
} from '@/lib/db/schema';
import type { PlanShape, PlanSlot } from '@athletic/domain';

/** What the athlete's list needs to show a plan without opening it. */
export interface SharedPlanSummary {
  id: string;
  name: string;
  description: string;
  days: number;
  where: 'gym' | 'home';
  version: number;
  /** Who wrote it. A plan with no attribution is one nobody trusts. */
  ownerName: string | null;
  /** True when you own it, which is how a trainer sees their own drafts. */
  mine: boolean;
}

/* ------------------------------------------------------------- auditing */

export type PlanAction =
  | 'plan.created'
  | 'plan.updated'
  | 'plan.published'
  | 'plan.deleted'
  | 'plan.shared'
  | 'plan.revoked'
  | 'group.created'
  | 'group.renamed'
  | 'group.deleted'
  | 'group.member.added'
  | 'group.member.removed';

/**
 * Appends to the audit trail.
 *
 * Names are copied in rather than referenced, so the row still says something
 * after the plan or group it describes is gone — which is exactly when somebody
 * comes asking. Best-effort: an audit write must never be the reason a trainer
 * cannot save their work, and a missing event is a smaller problem than a
 * refused edit. It is logged loudly instead.
 */
async function record(event: {
  actorId: string;
  action: PlanAction;
  planId?: string | null;
  planName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(planEvents).values({
      actorId: event.actorId,
      action: event.action,
      planId: event.planId ?? null,
      planName: event.planName ?? null,
      groupId: event.groupId ?? null,
      groupName: event.groupName ?? null,
      detail: event.detail ?? null,
    });
  } catch (err) {
    console.error('[plans] audit write failed', event.action, err);
  }
}

/* ---------------------------------------------------------- visibility */

/**
 * The plans this person may read.
 *
 * One query rather than three round trips, because the answer is a union: mine,
 * shared with me, or shared with a group I am in. A share that has been revoked
 * stops granting sight of the plan but stays as a row — "this was shared and
 * then taken back" is a different fact from "this was never shared", and only
 * one of them can be answered by a missing row.
 *
 * Someone else's plan is only visible once published. A draft is somebody
 * thinking out loud.
 */
export async function plansVisibleTo(userId: string): Promise<SharedPlanSummary[]> {
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      description: plans.description,
      days: plans.days,
      where: plans.where,
      version: plans.version,
      ownerId: plans.ownerId,
      ownerName: users.name,
      publishedAt: plans.publishedAt,
    })
    .from(plans)
    .leftJoin(users, eq(users.id, plans.ownerId))
    .where(
      and(
        isNull(plans.archivedAt),
        or(
          eq(plans.ownerId, userId),
          sql`EXISTS (
            SELECT 1 FROM ${planShares} s
            WHERE s.plan_id = ${plans.id}
              AND s.revoked_at IS NULL
              AND ${plans.publishedAt} IS NOT NULL
              AND (
                s.target_user_id = ${userId}
                OR s.group_id IN (
                  SELECT m.group_id FROM ${groupMembers} m WHERE m.user_id = ${userId}
                )
              )
          )`,
        ),
      ),
    )
    .orderBy(desc(plans.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    days: r.days,
    where: r.where,
    version: r.version,
    ownerName: r.ownerName,
    mine: r.ownerId === userId,
  }));
}

/** Whether this person may read this plan, by the same rule as the list. */
async function canRead(userId: string, planId: string): Promise<boolean> {
  const visible = await plansVisibleTo(userId);
  return visible.some((p) => p.id === planId);
}

const OWNED = (userId: string, planId: string) =>
  and(eq(plans.id, planId), eq(plans.ownerId, userId));

/**
 * A whole plan, in the portable shape the client applies.
 *
 * Returns null rather than throwing for "not yours": a plan you cannot see and
 * a plan that does not exist should be indistinguishable from outside, or the
 * endpoint becomes a way to discover that a plan id is real.
 */
export async function planShapeFor(
  userId: string,
  planId: string,
): Promise<{ plan: PlanShape; version: number; ownerName: string | null } | null> {
  if (!(await canRead(userId, planId))) return null;

  const [meta] = await db
    .select({
      name: plans.name,
      description: plans.description,
      days: plans.days,
      where: plans.where,
      version: plans.version,
      ownerName: users.name,
    })
    .from(plans)
    .leftJoin(users, eq(users.id, plans.ownerId))
    .where(eq(plans.id, planId))
    .limit(1);
  if (!meta) return null;

  const slotRows = await db
    .select()
    .from(planSlots)
    .where(eq(planSlots.planId, planId))
    .orderBy(planSlots.sessionIndex, planSlots.position);

  const slots: PlanSlot[] = slotRows.map((s) => ({
    sessionIndex: s.sessionIndex,
    position: s.position,
    key: s.key as PlanSlot['key'],
    name: s.name,
    requiredRole: s.requiredRole as PlanSlot['requiredRole'],
    patternKeys: (s.patternKeys as PlanSlot['patternKeys']) ?? null,
    dayKey: s.dayKey as PlanSlot['dayKey'],
    exerciseName: s.exerciseName,
    sets: s.sets,
    repRange: s.repRange,
  }));

  return {
    plan: {
      name: meta.name,
      description: meta.description,
      days: meta.days,
      where: meta.where,
      slots,
    },
    version: meta.version,
    ownerName: meta.ownerName,
  };
}

/* -------------------------------------------------------------- authoring */

export interface PlanInput {
  name: string;
  description: string;
  days: number;
  where: 'gym' | 'home';
  slots: PlanSlot[];
}

export async function createPlan(ownerId: string, input: PlanInput): Promise<string> {
  /* The id is made here rather than read back. `db` is a union of the Neon HTTP
     driver and node-postgres, and a union of the two has no usable overload for
     `.returning()` — but nothing here needs the round trip anyway. */
  const planId = crypto.randomUUID();
  await db.insert(plans).values({
    id: planId,
    ownerId,
    name: input.name,
    description: input.description,
    days: input.days,
    where: input.where,
  });
  await writeSlots(planId, input.slots);
  await record({ actorId: ownerId, action: 'plan.created', planId, planName: input.name });
  return planId;
}

/**
 * Replaces a plan's contents.
 *
 * **Publishing an edit bumps the version**, which is the whole of the update
 * mechanism: an athlete carries the version they applied, so a higher one is
 * how the app knows to offer them a newer edition rather than silently rewrite
 * a week they are standing in. Editing an unpublished draft does not bump it —
 * nobody is training on a draft.
 */
export async function updatePlan(
  ownerId: string,
  planId: string,
  input: PlanInput,
): Promise<boolean> {
  const [existing] = await db.select().from(plans).where(OWNED(ownerId, planId)).limit(1);
  if (!existing) return false;

  const bump = existing.publishedAt ? 1 : 0;
  await db
    .update(plans)
    .set({
      name: input.name,
      description: input.description,
      days: input.days,
      where: input.where,
      version: existing.version + bump,
      updatedAt: new Date(),
    })
    .where(OWNED(ownerId, planId));

  await db.delete(planSlots).where(eq(planSlots.planId, planId));
  await writeSlots(planId, input.slots);

  await record({
    actorId: ownerId,
    action: 'plan.updated',
    planId,
    planName: input.name,
    detail: { version: existing.version + bump, slots: input.slots.length },
  });
  return true;
}

async function writeSlots(planId: string, slots: PlanSlot[]): Promise<void> {
  if (!slots.length) return;
  await db.insert(planSlots).values(
    slots.map((s) => ({
      planId,
      sessionIndex: s.sessionIndex,
      position: s.position,
      key: s.key,
      name: s.name,
      requiredRole: s.requiredRole,
      patternKeys: s.patternKeys,
      dayKey: s.dayKey,
      exerciseName: s.exerciseName,
      sets: s.sets,
      repRange: s.repRange,
    })),
  );
}

export async function publishPlan(ownerId: string, planId: string): Promise<boolean> {
  const [existing] = await db.select().from(plans).where(OWNED(ownerId, planId)).limit(1);
  if (!existing) return false;
  if (existing.publishedAt) return true;

  await db
    .update(plans)
    .set({ publishedAt: new Date(), updatedAt: new Date() })
    .where(OWNED(ownerId, planId));
  await record({
    actorId: ownerId,
    action: 'plan.published',
    planId,
    planName: existing.name,
    detail: { version: existing.version },
  });
  return true;
}

/**
 * Removes a plan.
 *
 * Nobody's training changes. A plan that has been applied was copied into that
 * account at the moment it was applied, so deleting the original takes away
 * future editions and nothing else — which is the property that makes deletion
 * safe to offer at all.
 */
export async function deletePlan(ownerId: string, planId: string): Promise<boolean> {
  const [existing] = await db.select().from(plans).where(OWNED(ownerId, planId)).limit(1);
  if (!existing) return false;
  await db.delete(plans).where(OWNED(ownerId, planId));
  await record({ actorId: ownerId, action: 'plan.deleted', planId, planName: existing.name });
  return true;
}

/* ----------------------------------------------------------------- groups */

export interface GroupSummary {
  id: string;
  name: string;
  members: { id: string; name: string | null; email: string | null }[];
}

export async function listGroups(ownerId: string): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      id: userGroups.id,
      name: userGroups.name,
      memberId: users.id,
      memberName: users.name,
      memberEmail: users.email,
    })
    .from(userGroups)
    .leftJoin(groupMembers, eq(groupMembers.groupId, userGroups.id))
    .leftJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(userGroups.ownerId, ownerId))
    .orderBy(userGroups.name);

  const byId = new Map<string, GroupSummary>();
  for (const r of rows) {
    const group = byId.get(r.id) ?? { id: r.id, name: r.name, members: [] };
    if (r.memberId) {
      group.members.push({ id: r.memberId, name: r.memberName, email: r.memberEmail });
    }
    byId.set(r.id, group);
  }
  return [...byId.values()];
}

export async function createGroup(ownerId: string, name: string): Promise<string> {
  const groupId = crypto.randomUUID();
  await db.insert(userGroups).values({ id: groupId, ownerId, name });
  await record({ actorId: ownerId, action: 'group.created', groupId, groupName: name });
  return groupId;
}

export async function renameGroup(
  ownerId: string,
  groupId: string,
  name: string,
): Promise<boolean> {
  // Ownership is checked before the write rather than inferred from it: the
  // driver union rules out reading back which rows a statement touched.
  const [existing] = await db
    .select()
    .from(userGroups)
    .where(and(eq(userGroups.id, groupId), eq(userGroups.ownerId, ownerId)))
    .limit(1);
  if (!existing) return false;

  await db.update(userGroups).set({ name }).where(eq(userGroups.id, groupId));
  await record({ actorId: ownerId, action: 'group.renamed', groupId, groupName: name });
  return true;
}

export async function deleteGroup(ownerId: string, groupId: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(userGroups)
    .where(and(eq(userGroups.id, groupId), eq(userGroups.ownerId, ownerId)))
    .limit(1);
  if (!existing) return false;
  await db.delete(userGroups).where(eq(userGroups.id, groupId));
  await record({
    actorId: ownerId,
    action: 'group.deleted',
    groupId,
    groupName: existing.name,
  });
  return true;
}

/**
 * Adds somebody to a group, by email address.
 *
 * An address is the only handle a trainer has for a client — they know who they
 * coach, not what user id the database gave them.
 *
 * **An unknown address is not an error**, and the caller is told the same thing
 * either way. Answering "no such user" would turn this into a way of asking
 * whether any given person has a gymmy account, which is a fact about somebody
 * who has not agreed to be discoverable.
 */
export async function addMember(ownerId: string, groupId: string, email: string): Promise<boolean> {
  const [group] = await db
    .select()
    .from(userGroups)
    .where(and(eq(userGroups.id, groupId), eq(userGroups.ownerId, ownerId)))
    .limit(1);
  if (!group) return false;

  const address = email.trim().toLowerCase();
  const [person] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  if (!person) return true;

  await db.insert(groupMembers).values({ groupId, userId: person.id }).onConflictDoNothing();
  await record({
    actorId: ownerId,
    action: 'group.member.added',
    groupId,
    groupName: group.name,
    detail: { userId: person.id },
  });
  return true;
}

export async function removeMember(
  ownerId: string,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const [group] = await db
    .select()
    .from(userGroups)
    .where(and(eq(userGroups.id, groupId), eq(userGroups.ownerId, ownerId)))
    .limit(1);
  if (!group) return false;

  await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  await record({
    actorId: ownerId,
    action: 'group.member.removed',
    groupId,
    groupName: group.name,
    detail: { userId },
  });
  return true;
}

/* ----------------------------------------------------------------- shares */

export interface ShareSummary {
  id: string;
  targetUserId: string | null;
  targetName: string | null;
  groupId: string | null;
  groupName: string | null;
}

export async function listShares(ownerId: string, planId: string): Promise<ShareSummary[]> {
  const [owned] = await db.select().from(plans).where(OWNED(ownerId, planId)).limit(1);
  if (!owned) return [];

  const rows = await db
    .select({
      id: planShares.id,
      targetUserId: planShares.targetUserId,
      targetName: users.name,
      groupId: planShares.groupId,
      groupName: userGroups.name,
    })
    .from(planShares)
    .leftJoin(users, eq(users.id, planShares.targetUserId))
    .leftJoin(userGroups, eq(userGroups.id, planShares.groupId))
    .where(and(eq(planShares.planId, planId), isNull(planShares.revokedAt)));
  return rows;
}

/**
 * Gives a plan to one person or one group.
 *
 * Exactly one target, and the caller has to say which. A share row with both
 * filled in has no meaning anyone could agree on, and one with neither is a
 * share into the void.
 */
export async function sharePlan(
  ownerId: string,
  planId: string,
  target: { userEmail?: string; groupId?: string },
): Promise<boolean> {
  const [owned] = await db.select().from(plans).where(OWNED(ownerId, planId)).limit(1);
  if (!owned) return false;
  if (!!target.userEmail === !!target.groupId) return false;

  if (target.groupId) {
    const [group] = await db
      .select()
      .from(userGroups)
      .where(and(eq(userGroups.id, target.groupId), eq(userGroups.ownerId, ownerId)))
      .limit(1);
    if (!group) return false;

    await db.insert(planShares).values({ planId, groupId: target.groupId });
    await record({
      actorId: ownerId,
      action: 'plan.shared',
      planId,
      planName: owned.name,
      groupId: target.groupId,
      groupName: group.name,
    });
    return true;
  }

  const address = target.userEmail!.trim().toLowerCase();
  const [person] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  // Same silence as adding a member: whether an address has an account is not
  // this endpoint's to disclose.
  if (!person) return true;

  await db.insert(planShares).values({ planId, targetUserId: person.id });
  await record({
    actorId: ownerId,
    action: 'plan.shared',
    planId,
    planName: owned.name,
    detail: { userId: person.id },
  });
  return true;
}

/**
 * Takes a share back.
 *
 * Revoked, not deleted, and it reaches nobody's training: a plan already
 * applied was copied at that moment and is theirs. What stops is sight of the
 * plan and of any future edition of it.
 */
export async function revokeShare(
  ownerId: string,
  planId: string,
  shareId: string,
): Promise<boolean> {
  const [owned] = await db.select().from(plans).where(OWNED(ownerId, planId)).limit(1);
  if (!owned) return false;

  const [share] = await db
    .select()
    .from(planShares)
    .where(and(eq(planShares.id, shareId), eq(planShares.planId, planId)))
    .limit(1);
  if (!share) return false;

  await db.update(planShares).set({ revokedAt: new Date() }).where(eq(planShares.id, shareId));

  await record({
    actorId: ownerId,
    action: 'plan.revoked',
    planId,
    planName: owned.name,
    detail: { shareId },
  });
  return true;
}
