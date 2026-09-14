/**
 * One plan: reading it to apply, editing it, or removing it.
 *
 * A plan you cannot see and a plan that does not exist both answer `404`. Any
 * other pair of answers turns this into a way of discovering which plan ids are
 * real, which is a fact about somebody else's work.
 */

import { NextResponse } from 'next/server';
import {
  badRequest,
  bodyOf,
  notFound,
  planInput,
  sessionUser,
  trainerUser,
  unauthorized,
} from '@/lib/api/plans';
import { deletePlan, planShapeFor, updatePlan } from '@/lib/db/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const userId = await sessionUser();
  if (!userId) return unauthorized();

  const { id } = await ctx.params;
  const found = await planShapeFor(userId, id);
  return found ? NextResponse.json(found) : notFound();
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, planInput);
  if (!input) return badRequest();

  const { id } = await ctx.params;
  return (await updatePlan(ownerId, id, input)) ? NextResponse.json({ ok: true }) : notFound();
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const { id } = await ctx.params;
  return (await deletePlan(ownerId, id)) ? NextResponse.json({ ok: true }) : notFound();
}
