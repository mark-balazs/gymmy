/** Renaming and removing a group. Deleting one shares nothing new and takes
 *  nobody's training away — it only stops future shares reaching that set of
 *  people, and retires the shares aimed at it. */

import { NextResponse } from 'next/server';
import {
  badRequest,
  bodyOf,
  groupInput,
  notFound,
  trainerUser,
  unauthorized,
} from '@/lib/api/plans';
import { deleteGroup, renameGroup } from '@/lib/db/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, groupInput);
  if (!input) return badRequest();

  const { id } = await ctx.params;
  return (await renameGroup(ownerId, id, input.name))
    ? NextResponse.json({ ok: true })
    : notFound();
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const { id } = await ctx.params;
  return (await deleteGroup(ownerId, id)) ? NextResponse.json({ ok: true }) : notFound();
}
