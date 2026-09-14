/**
 * Who is in a group.
 *
 * People are added by email address, because that is the only handle a trainer
 * has for a client — they know who they coach, not what user id the database
 * handed them.
 *
 * **An address with no account is not an error**, and the response is identical
 * either way. Answering "no such user" would make this a way of asking whether
 * any given person has a gymmy account, which is a fact about somebody who has
 * not agreed to be discoverable.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  badRequest,
  bodyOf,
  memberInput,
  notFound,
  trainerUser,
  unauthorized,
} from '@/lib/api/plans';
import { addMember, removeMember } from '@/lib/db/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const removeBody = z.object({ userId: z.string().min(1).max(64) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, memberInput);
  if (!input) return badRequest();

  const { id } = await ctx.params;
  return (await addMember(ownerId, id, input.email)) ? NextResponse.json({ ok: true }) : notFound();
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, removeBody);
  if (!input) return badRequest();

  const { id } = await ctx.params;
  return (await removeMember(ownerId, id, input.userId))
    ? NextResponse.json({ ok: true })
    : notFound();
}
