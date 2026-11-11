export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { rejectChange } from "@/server/services/orderService";

type Ctx = { params: Promise<{ id: string; cid: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const { id: orderId, cid } = await ctx.params;

  try {
    const result = await rejectChange(orderId, cid, userId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
