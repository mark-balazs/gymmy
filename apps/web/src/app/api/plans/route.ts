/**
 * The plans you can see, and creating one.
 *
 * Reading needs only a session: anybody can be shared a plan. Writing needs a
 * trainer, which is the one place the role actually does any work.
 */

import { NextResponse } from 'next/server';
import {
  badRequest,
  bodyOf,
  planInput,
  sessionUser,
  trainerUser,
  unauthorized,
} from '@/lib/api/plans';
import { createPlan, plansVisibleTo } from '@/lib/db/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const userId = await sessionUser();
  if (!userId) return unauthorized();
  return NextResponse.json({ plans: await plansVisibleTo(userId) });
}

export async function POST(req: Request): Promise<NextResponse> {
  const ownerId = await trainerUser();
  if (!ownerId) return unauthorized();

  const input = await bodyOf(req, planInput);
  if (!input) return badRequest();

  const id = await createPlan(ownerId, input);
  return NextResponse.json({ id }, { status: 201 });
}
