/**
 * Publishing a plan.
 *
 * Separate from editing, because it is a different act: an edit changes a
 * document, and publishing is the moment it becomes something other people can
 * be given. Editing after this bumps the version, which is how somebody already
 * training on an older edition gets offered the new one instead of having their
 * week rewritten underneath them.
 */

import { NextResponse } from 'next/server';
import { notFound, trainerUser, unauthorized } from '@/lib/api/plans';
import { publishPlan } from '@/lib/db/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const { id } = await ctx.params;
  return (await publishPlan(ownerId, id)) ? NextResponse.json({ ok: true }) : notFound();
}
