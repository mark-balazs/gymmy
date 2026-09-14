/**
 * Groups a trainer has made.
 *
 * A group is allowed to hold one person, and a person is in as many as they are
 * put in. Nothing distinguishes "a group of one" from a share aimed at an
 * individual except which column the share fills in — which is the point: a
 * trainer who gains a second client should not have to restructure anything.
 */

import { NextResponse } from 'next/server';
import { badRequest, bodyOf, groupInput, trainerUser, unauthorized } from '@/lib/api/plans';
import { createGroup, listGroups } from '@/lib/db/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();
  return NextResponse.json({ groups: await listGroups(ownerId) });
}

export async function POST(req: Request): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, groupInput);
  if (!input) return badRequest();

  const id = await createGroup(ownerId, input.name);
  return NextResponse.json({ id }, { status: 201 });
}
