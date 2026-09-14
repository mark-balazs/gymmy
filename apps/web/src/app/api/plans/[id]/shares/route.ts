/**
 * Who a plan has been given to.
 *
 * Revoking does not reach into anybody's training. A plan that was applied was
 * copied into that account at the moment it was applied; what a revoke takes
 * away is sight of the plan and of every future edition of it.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  badRequest,
  bodyOf,
  notFound,
  shareInput,
  trainerUser,
  unauthorized,
} from '@/lib/api/plans';
import { listShares, revokeShare, sharePlan } from '@/lib/db/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const revokeBody = z.object({ shareId: z.string().min(1).max(64) });

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const { id } = await ctx.params;
  return NextResponse.json({ shares: await listShares(ownerId, id) });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, shareInput);
  if (!input) return badRequest();

  const { id } = await ctx.params;
  /* A true answer here does not mean a person was found. Whether an address has
     a gymmy account is a fact about them, not about this plan, so both outcomes
     look the same from outside. */
  return (await sharePlan(ownerId, id, input)) ? NextResponse.json({ ok: true }) : notFound();
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, revokeBody);
  if (!input) return badRequest();

  const { id } = await ctx.params;
  return (await revokeShare(ownerId, id, input.shareId))
    ? NextResponse.json({ ok: true })
    : notFound();
}
