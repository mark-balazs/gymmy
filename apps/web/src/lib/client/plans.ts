'use client';

/**
 * Talking to the plan endpoints.
 *
 * Deliberately **not** part of the sync engine. Everything in `sync.ts` is a
 * replica of your own account, reconciled in the background and readable with
 * no signal; plans belong to somebody else and are read over the network, which
 * makes them the one thing in this app that genuinely needs a connection.
 *
 * That asymmetry is the point rather than a gap. A plan is only online until
 * you accept it: applying one copies it into your own tables, and from that
 * moment your week works in a basement like everything else. What needs signal
 * is choosing, which is a thing people do once, sitting down, not mid-set.
 *
 * So every call here fails softly. No connection means an empty list and a line
 * saying so, never a screen that will not load.
 */

import type { PlanShape } from '@athletic/domain';

export interface SharedPlan {
  id: string;
  name: string;
  description: string;
  days: number;
  where: 'gym' | 'home';
  version: number;
  ownerName: string | null;
  mine: boolean;
}

export interface PlanDetail {
  plan: PlanShape;
  version: number;
  ownerName: string | null;
}

export interface Group {
  id: string;
  name: string;
  members: { id: string; name: string | null; email: string | null }[];
}

export interface Share {
  id: string;
  targetUserId: string | null;
  targetName: string | null;
  groupId: string | null;
  groupName: string | null;
}

/** Every response is JSON or a failure; neither is worth a stack trace. */
async function call<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const send = (url: string, method: string, body?: unknown) =>
  call<{ ok?: boolean; id?: string }>(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/* ------------------------------------------------------------- reading */

export async function fetchPlans(): Promise<SharedPlan[]> {
  const got = await call<{ plans: SharedPlan[] }>('/api/plans');
  return got?.plans ?? [];
}

export const fetchPlan = (id: string): Promise<PlanDetail | null> =>
  call<PlanDetail>(`/api/plans/${encodeURIComponent(id)}`);

/* ----------------------------------------------------------- authoring */

export interface PlanDraft {
  name: string;
  description: string;
  days: number;
  where: 'gym' | 'home';
  slots: PlanShape['slots'];
}

export const createPlan = (draft: PlanDraft) => send('/api/plans', 'POST', draft);

export const savePlan = (id: string, draft: PlanDraft) =>
  send(`/api/plans/${encodeURIComponent(id)}`, 'PUT', draft);

export const publishPlan = (id: string) =>
  send(`/api/plans/${encodeURIComponent(id)}/publish`, 'POST');

export const deletePlan = (id: string) => send(`/api/plans/${encodeURIComponent(id)}`, 'DELETE');

/* -------------------------------------------------------------- sharing */

export async function fetchShares(planId: string): Promise<Share[]> {
  const got = await call<{ shares: Share[] }>(`/api/plans/${encodeURIComponent(planId)}/shares`);
  return got?.shares ?? [];
}

export const sharePlan = (planId: string, target: { userEmail?: string; groupId?: string }) =>
  send(`/api/plans/${encodeURIComponent(planId)}/shares`, 'POST', target);

export const revokeShare = (planId: string, shareId: string) =>
  send(`/api/plans/${encodeURIComponent(planId)}/shares`, 'DELETE', { shareId });

/* --------------------------------------------------------------- groups */

export async function fetchGroups(): Promise<Group[]> {
  const got = await call<{ groups: Group[] }>('/api/groups');
  return got?.groups ?? [];
}

export const createGroup = (name: string) => send('/api/groups', 'POST', { name });

export const renameGroup = (id: string, name: string) =>
  send(`/api/groups/${encodeURIComponent(id)}`, 'PUT', { name });

export const deleteGroup = (id: string) => send(`/api/groups/${encodeURIComponent(id)}`, 'DELETE');

export const addMember = (groupId: string, email: string) =>
  send(`/api/groups/${encodeURIComponent(groupId)}/members`, 'POST', { email });

export const removeMember = (groupId: string, userId: string) =>
  send(`/api/groups/${encodeURIComponent(groupId)}/members`, 'DELETE', { userId });
